import json
import logging
import os
import smtplib
import ssl
import threading
import time
from datetime import datetime, timezone
from email.message import EmailMessage

EMAIL_STATE_LOCK = threading.Lock()
EMAIL_STATE_PATH = os.path.join(os.path.dirname(__file__), 'uploads', 'email_digest_state.json')
EMAIL_LOCK_PATH = os.environ.get(
    'EMAIL_SCHEDULER_LOCK_PATH',
    os.path.join(os.path.dirname(__file__), 'uploads', 'email_digest_worker.lock')
)
EMAIL_THREAD_STARTED = False
EMAIL_LOCK_HANDLE = None

ROLE_DIGEST_MINUTES_DEFAULTS = {
    'admin': None,
    'owner': 10080,   # weekly
    'manager': 1440,  # daily
    'operator': 1440,
    'viewer': None,   # no emails to viewers by default
}


def _env_flag(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {'1', 'true', 'yes', 'on'}


def _parse_int_env(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except Exception:
        return default


def _normalize_role(role):
    return str(role or 'operator').strip().lower()


def _role_digest_minutes(role):
    role = _normalize_role(role)
    env_name = f'EMAIL_DIGEST_MINUTES_{role.upper()}'
    try:
        value = os.environ.get(env_name)
        if value is not None and str(value).strip():
            return int(value)
    except Exception:
        pass
    return ROLE_DIGEST_MINUTES_DEFAULTS.get(role, 10080)


def _load_state(logger):
    if not os.path.exists(EMAIL_STATE_PATH):
        return {}
    try:
        with open(EMAIL_STATE_PATH, 'r', encoding='utf-8') as handle:
            data = json.load(handle)
        return data if isinstance(data, dict) else {}
    except Exception:
        logger.exception('Failed to read email digest state')
        return {}


def _save_state(logger, state):
    os.makedirs(os.path.dirname(EMAIL_STATE_PATH), exist_ok=True)
    temp_path = f'{EMAIL_STATE_PATH}.tmp'
    try:
        with open(temp_path, 'w', encoding='utf-8') as handle:
            json.dump(state, handle, indent=2)
        os.replace(temp_path, EMAIL_STATE_PATH)
    except Exception:
        logger.exception('Failed to persist email digest state')


def _smtp_enabled():
    return _env_flag('EMAIL_ENABLED', False)


def _smtp_configured():
    return bool(os.environ.get('EMAIL_SMTP_HOST') and os.environ.get('EMAIL_FROM_ADDRESS'))


def _get_smtp_settings():
    return {
        'host': os.environ.get('EMAIL_SMTP_HOST', '').strip(),
        'port': _parse_int_env('EMAIL_SMTP_PORT', 587),
        'username': os.environ.get('EMAIL_SMTP_USERNAME', '').strip(),
        'password': os.environ.get('EMAIL_SMTP_PASSWORD', '').strip(),
        'from_address': os.environ.get('EMAIL_FROM_ADDRESS', '').strip(),
        'from_name': os.environ.get('EMAIL_FROM_NAME', '').strip() or 'FYP Digest',
        'use_tls': _env_flag('EMAIL_SMTP_USE_TLS', True),
        'use_ssl': _env_flag('EMAIL_SMTP_USE_SSL', False),
    }


def _get_users(client, role=None):
    query = client.table(os.environ.get('SUPABASE_ACCESS_USERS_TABLE', 'access_users')).select(
        'id,email,display_name,role,organization_id,organization_name,is_active'
    ).eq('is_active', True)
    if role:
        query = query.eq('role', role)
    result = query.execute()
    return result.data or []


def _collect_recent_activity(face_logs, helmet_logs, mask_logs, limit=5):
    def _format_entry(entry, kind):
        ts = entry.get('timestamp') or entry.get('created_at') or ''
        camera = entry.get('camera_id') or entry.get('camera') or 'N/A'
        status = entry.get('status') or entry.get('result') or ''
        conf = entry.get('confidence')
        parts = [p for p in [ts, f"{kind}", f"Camera: {camera}", (f"Confidence: {int(conf)}%" if isinstance(conf, (int, float)) else None), (f"Status: {status}" if status else None)] if p]
        return ts, ' · '.join(parts)

    items = []
    for entry in face_logs:
        # treat face logs as potential unauthorized/entry logs but avoid PII (no names/cnic)
        ts, text = _format_entry(entry, 'Unauthorized Entry' if 'unauthor' in str(entry.get('status', '')).lower() else 'Face Event')
        items.append((ts, text))
    for entry in helmet_logs:
        ts, text = _format_entry(entry, 'Helmet Violation' if 'viola' in str(entry.get('status', '')).lower() or entry.get('status') == 'no_helmet' else 'Helmet Event')
        items.append((ts, text))
    for entry in mask_logs:
        ts, text = _format_entry(entry, 'Mask Violation' if 'viola' in str(entry.get('status', '')).lower() or entry.get('status') == 'no_mask' else 'Mask Event')
        items.append((ts, text))

    items.sort(key=lambda pair: pair[0] or '', reverse=True)
    return [text for _, text in items[:limit]]


def _build_email_report(user, client, helpers, logger):
    role = _normalize_role(user.get('role'))
    organization_id = user.get('organization_id')
    organization_name = user.get('organization_name') or None
    if organization_id and not organization_name:
        try:
            organization_name = helpers['_fetch_organization_name'](organization_id)
        except Exception:
            organization_name = None

    residents = []
    if role == 'admin':
        try:
            residents = helpers['_read_all_residents_supabase']() or []
        except Exception:
            logger.exception('Failed to load residents for admin email digest')
    elif organization_id:
        try:
            residents = helpers['_read_all_residents_supabase'](
                company_id=organization_id,
                company_name=organization_name,
            ) or []
        except Exception:
            logger.exception('Failed to load residents for scoped email digest')

    # Scope logs to the user's organization to avoid data leakage
    scope_company_id = None if role == 'admin' else organization_id
    scope_company_name = None if role == 'admin' else organization_name
    face_logs = helpers['_read_face_logs'](company_id=scope_company_id, company_name=scope_company_name) or []
    helmet_logs = helpers['_read_helmet_logs'](company_id=scope_company_id, company_name=scope_company_name) or []
    mask_logs = helpers['_read_mask_logs'](company_id=scope_company_id, company_name=scope_company_name) or []

    # Compute non-sensitive aggregates
    helmet_violations = sum(1 for e in helmet_logs if e and str(e.get('status', '')).strip())
    mask_violations = sum(1 for e in mask_logs if e and str(e.get('status', '')).strip())
    # Treat certain face log statuses as unauthorized entries
    unauthorized_entries = 0
    for e in face_logs:
        status = str(e.get('status', '')).lower()
        if 'unauthor' in status or 'intrud' in status or 'unauth' in status or status in {'unauthorized', 'intrusion', 'unknown'}:
            unauthorized_entries += 1
        elif e.get('is_unauthorized'):
            unauthorized_entries += 1

    total_violations = helmet_violations + mask_violations + unauthorized_entries

    recent_items = _collect_recent_activity(face_logs, helmet_logs, mask_logs, limit=10)

    # Build email using the requested template and without PII
    subject = 'Smart City Surveillance Report'
    date_str = datetime.now(timezone.utc).date().isoformat()
    org_display = organization_name or 'N/A'
    lines = [
        "Hello,",
        "",
        "Here is your surveillance summary report:",
        "",
        f"Date: {date_str}",
        f"Organization: {org_display}",
        "",
        "Summary:",
        f"- Total Violations: {total_violations}",
        f"- Helmet Violations: {helmet_violations}",
        f"- Unauthorized Entries: {unauthorized_entries}",
        f"- Mask Violations: {mask_violations}",
        "",
        "Details:",
    ]

    if recent_items:
        lines.extend(recent_items)
    else:
        lines.append('No recent non-sensitive events to report.')

    lines.extend(['', 'Please review the dashboard for full details.', '', 'Regards,', 'Smart City Surveillance System'])
    return subject, '\n'.join(lines)


def _send_email_message(settings, to_address, subject, body, logger):
    msg = EmailMessage()
    msg['From'] = f"{settings['from_name']} <{settings['from_address']}>"
    msg['To'] = to_address
    msg['Subject'] = subject
    msg.set_content(body)

    context = ssl.create_default_context()
    if settings['use_ssl']:
        with smtplib.SMTP_SSL(settings['host'], settings['port'], context=context, timeout=30) as smtp:
            if settings['username'] and settings['password']:
                smtp.login(settings['username'], settings['password'])
            smtp.send_message(msg)
        return True

    with smtplib.SMTP(settings['host'], settings['port'], timeout=30) as smtp:
        if settings['use_tls']:
            smtp.starttls(context=context)
        if settings['username'] and settings['password']:
            smtp.login(settings['username'], settings['password'])
        smtp.send_message(msg)
    return True


def send_account_event_email(*, logger, to_address, event_type, member_role, organization_name=None, display_name=None, actor_name=None, is_active=None):
    if not _smtp_enabled() or not _smtp_configured():
        return False

    clean_email = str(to_address or '').strip().lower()
    role_label = str(member_role or 'member').strip().title()
    org_label = str(organization_name or 'your organization').strip()
    name_label = str(display_name or clean_email or 'there').strip()
    actor_label = str(actor_name or 'an administrator').strip()

    if not clean_email:
        return False

    if event_type == 'created':
        subject = f'{role_label} account created'
        body = "\n".join([
            f"Hello {name_label},",
            "",
            f"Your {role_label.lower()} account has been created for {org_label}.",
            f"This action was completed by {actor_label}.",
            "",
            "You can now use your assigned account to access the system.",
            "",
            "Regards,",
            "Smart City Surveillance System",
        ])
    elif event_type == 'status_changed':
        status_label = 'activated' if is_active else 'deactivated'
        subject = f'{role_label} account {status_label}'
        body = "\n".join([
            f"Hello {name_label},",
            "",
            f"Your {role_label.lower()} account for {org_label} has been {status_label}.",
            f"This change was made by {actor_label}.",
            "",
            "If you believe this was unexpected, please contact your organization administrator.",
            "",
            "Regards,",
            "Smart City Surveillance System",
        ])
    elif event_type == 'deleted':
        subject = f'{role_label} account removed'
        body = "\n".join([
            f"Hello {name_label},",
            "",
            f"Your {role_label.lower()} account for {org_label} has been removed.",
            f"This action was completed by {actor_label}.",
            "",
            "If you need continued access, please contact your organization administrator.",
            "",
            "Regards,",
            "Smart City Surveillance System",
        ])
    else:
        return False

    settings = _get_smtp_settings()
    _send_email_message(settings, clean_email, subject, body, logger)
    return True


def _send_due_digests(helpers):
    logger = helpers['logger']
    if not _smtp_enabled() or not _smtp_configured():
        return

    client = helpers['_get_supabase_client']()
    if client is None:
        logger.warning('Email digest scheduler skipped because Supabase client is unavailable')
        return

    settings = _get_smtp_settings()
    state = _load_state(logger)
    now = time.time()
    sent_any = False

    try:
        users = _get_users(client)
    except Exception:
        logger.exception('Failed to load users for email digests')
        return

    for user in users:
        role = _normalize_role(user.get('role'))
        minutes = _role_digest_minutes(role)
        if minutes is None or minutes <= 0:
            continue

        email_address = str(user.get('email') or '').strip().lower()
        if not email_address:
            continue

        org_key = str(user.get('organization_id') or user.get('organization_name') or 'global').strip() or 'global'
        state_key = f"{email_address}|{role}|{org_key}"
        last_sent_at = float(state.get(state_key, 0) or 0)
        if last_sent_at and (now - last_sent_at) < minutes * 60:
            continue

        try:
            subject, body = _build_email_report(user, client, helpers, logger)
            _send_email_message(settings, email_address, subject, body, logger)
            state[state_key] = now
            sent_any = True
            logger.info('Sent %s digest to %s', role, email_address)
        except Exception:
            logger.exception('Failed to send digest to %s', email_address)

    if sent_any:
        with EMAIL_STATE_LOCK:
            _save_state(logger, state)


def _email_worker(helpers):
    logger = helpers['logger']
    interval_seconds = _parse_int_env('EMAIL_CHECK_INTERVAL_SECONDS', 900)
    while True:
        try:
            _send_due_digests(helpers)
        except Exception:
            logger.exception('Email digest worker crashed during a cycle')
        time.sleep(max(interval_seconds, 60))


def register_email_service(app, helpers):
    global EMAIL_THREAD_STARTED, EMAIL_LOCK_HANDLE
    if EMAIL_THREAD_STARTED:
        return
    if not _smtp_enabled():
        helpers['logger'].info('Email digests disabled; set EMAIL_ENABLED=1 to turn them on')
        return
    if not _smtp_configured():
        helpers['logger'].warning('Email digests enabled but SMTP settings are incomplete')
        return

    try:
        os.makedirs(os.path.dirname(EMAIL_LOCK_PATH), exist_ok=True)
        EMAIL_LOCK_HANDLE = os.open(EMAIL_LOCK_PATH, os.O_CREAT | os.O_EXCL | os.O_RDWR)
    except FileExistsError:
        helpers['logger'].info('Email digest worker already running in another process')
        return
    except Exception:
        helpers['logger'].exception('Failed to acquire email digest worker lock')
        return

    EMAIL_THREAD_STARTED = True
    worker = threading.Thread(target=_email_worker, args=(helpers,), daemon=True, name='email-digest-worker')
    worker.start()
    helpers['logger'].info('Email digest worker started')
