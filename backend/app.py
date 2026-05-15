from flask import Flask, jsonify, request
from flask_cors import CORS
import os
import numpy as np
from datetime import datetime, timezone
import json
import logging
import threading
from uuid import uuid4, UUID
import cv2
from ultralytics import YOLO
import torch
import base64
import time
import random
import string
from werkzeug.security import check_password_hash, generate_password_hash
try:
    from dotenv import load_dotenv
except Exception:
    load_dotenv = None
try:
    from supabase import create_client
except Exception:
    create_client = None
try:
    import stripe
except Exception:
    stripe = None

from insightface.app import FaceAnalysis
from face_routes import register_face_routes
from helmet_routes import register_helmet_routes
from mask_routes import register_mask_routes
from email_service import register_email_service, send_account_event_email

app = Flask(__name__)
CORS(app)

if load_dotenv is not None:
    load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("face-recog-helmet")

BASE_DIR = os.path.dirname(__file__)
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# ── Face recognition config ───────────────────────────────────────────────────
ENCODING_DTYPE = np.float32
FACE_DUPLICATE_SIMILARITY_THRESHOLD = float(os.environ.get('FACE_DUPLICATE_SIMILARITY_THRESHOLD', 0.45))
BATCH_DUPLICATE_SIMILARITY_THRESHOLD = float(os.environ.get('BATCH_DUPLICATE_SIMILARITY_THRESHOLD', 0.98))
FACE_DETECT_CONF = float(os.environ.get('FACE_DETECT_CONF', 0.5))

INSIGHT_APP = None

# ── Helmet paths ──────────────────────────────────────────────────────────────
HELMET_UPLOAD_FOLDER = os.path.join(UPLOAD_FOLDER, 'helmet_detections')
os.makedirs(HELMET_UPLOAD_FOLDER, exist_ok=True)
HELMET_LOG_PATH = os.path.join(HELMET_UPLOAD_FOLDER, 'helmet_logs.json')
HELMET_LOG_LOCK = threading.Lock()
HELMET_CONF_THRESHOLD = float(os.environ.get('HELMET_CONF_THRESHOLD', 0.25))
HELMET_MODEL = None

# ── Mask paths ────────────────────────────────────────────────────────────────
MASK_UPLOAD_FOLDER = os.path.join(UPLOAD_FOLDER, 'mask_detections')
os.makedirs(MASK_UPLOAD_FOLDER, exist_ok=True)
MASK_LOG_PATH = os.path.join(MASK_UPLOAD_FOLDER, 'mask_logs.json')
MASK_LOG_LOCK = threading.Lock()

# ── Model loading lock (prevents duplicate cold-loads under concurrency) ──────
_MODEL_LOAD_LOCK = threading.Lock()

def _env_flag(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {'1', 'true', 'yes', 'on'}


# ── Supabase config ───────────────────────────────────────────────────────────
SUPABASE_ENABLED = _env_flag('SUPABASE_ENABLED', False)
SUPABASE_URL = os.environ.get('SUPABASE_URL', '').strip()
SUPABASE_SERVICE_ROLE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '').strip()
SUPABASE_HELMET_TABLE = os.environ.get('SUPABASE_HELMET_TABLE', 'helmet_logs').strip() or 'helmet_logs'
SUPABASE_MASK_TABLE = os.environ.get('SUPABASE_MASK_TABLE', 'mask_logs').strip() or 'mask_logs'
SUPABASE_FACE_TABLE = os.environ.get('SUPABASE_FACE_TABLE', 'face_logs').strip() or 'face_logs'
SUPABASE_STORAGE_BUCKET = os.environ.get('SUPABASE_STORAGE_BUCKET', 'fyp-assets').strip() or 'fyp-assets'
SUPABASE_RESIDENT_IMAGES_PREFIX = os.environ.get('SUPABASE_RESIDENT_IMAGES_PREFIX', 'residents').strip() or 'residents'
SUPABASE_DETECTIONS_PREFIX = os.environ.get('SUPABASE_DETECTIONS_PREFIX', 'detections').strip() or 'detections'

STREAM_EVENT_WINDOW_SECONDS = max(int(os.environ.get('STREAM_EVENT_WINDOW_SECONDS', 5)), 1)

_SUPABASE_CLIENT = None
_SUPABASE_INIT_ATTEMPTED = False
_SUPABASE_CLIENT_LOCK = threading.Lock()
STREAM_EVENT_STATE = {}


def _get_supabase_client():
    global _SUPABASE_CLIENT, _SUPABASE_INIT_ATTEMPTED
    if not SUPABASE_ENABLED:
        return None
    if create_client is None:
        logger.warning('Supabase is enabled but supabase package is not installed')
        return None
    if _SUPABASE_INIT_ATTEMPTED:
        return _SUPABASE_CLIENT
    with _SUPABASE_CLIENT_LOCK:
        if _SUPABASE_INIT_ATTEMPTED:
            return _SUPABASE_CLIENT
        _SUPABASE_INIT_ATTEMPTED = True
        if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
            logger.warning('Supabase is enabled but SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing')
            return None
        try:
            _SUPABASE_CLIENT = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
            logger.info('Supabase client initialized')
        except Exception:
            logger.exception('Failed to initialize Supabase client')
            _SUPABASE_CLIENT = None
        return _SUPABASE_CLIENT


def _supabase_payload_from_log(log_entry):
    payload = dict(log_entry)
    if 'id' in payload:
        payload['local_id'] = payload.pop('id')
    return payload


def _get_request_company_id():
    role = (request.headers.get('X-User-Role') or '').strip().lower()
    company_id = (request.headers.get('X-Company-ID') or '').strip()
    if role and role != 'admin' and company_id:
        return company_id
    return None


def _read_supabase_logs(table_name, limit=5000, company_id=None, company_name=None):
    client = _get_supabase_client()
    if client is None:
        return None
    try:
        response = client.table(table_name).select('*').order('timestamp', desc=True).limit(limit).execute()
        rows = response.data or []
        normalized = []
        for row in rows:
            item = dict(row)
            item_company_id = str(item.get('company_id') or '').strip()
            item_company_name = str(item.get('organization_name') or '').strip()
            # Strict tenancy: when company_id is provided, never fall back to
            # organization_name matching. This prevents stale rows from a deleted
            # org (same name, different id) from leaking into a recreated org.
            if company_id:
                if item_company_id != company_id:
                    continue
            elif company_name:
                if item_company_name != company_name:
                    continue
            if 'id' not in item and 'local_id' in item:
                item['id'] = item.get('local_id')
            normalized.append(item)
        return normalized
    except Exception:
        logger.exception('Supabase read failed for table %s', table_name)
        return None


def _upload_bytes_to_supabase_storage(storage_path, file_bytes, content_type='application/octet-stream'):
    client = _get_supabase_client()
    if client is None or not storage_path or file_bytes is None:
        return None
    try:
        bucket = client.storage.from_(SUPABASE_STORAGE_BUCKET)
        bucket.upload(path=storage_path, file=file_bytes, file_options={"content-type": content_type})
        return {"storage_path": storage_path, "public_url": bucket.get_public_url(storage_path)}
    except Exception:
        logger.exception('Supabase storage upload failed for %s', storage_path)
        return None


def _upload_local_file_to_supabase_storage(storage_path, file_path, content_type='image/jpeg'):
    try:
        with open(file_path, 'rb') as f:
            return _upload_bytes_to_supabase_storage(storage_path, f.read(), content_type=content_type)
    except Exception:
        logger.exception('Failed to read local file for storage upload: %s', file_path)
        return None


def _upload_data_url_to_supabase_storage(storage_path, data_url, content_type='image/jpeg'):
    if not data_url:
        return None
    raw_value = data_url
    if isinstance(raw_value, str) and raw_value.startswith('data:') and ',' in raw_value:
        header, raw_value = raw_value.split(',', 1)
        if ';base64' in header and header.startswith('data:'):
            mime_part = header[5:].split(';', 1)[0]
            if mime_part:
                content_type = mime_part
    try:
        file_bytes = base64.b64decode(raw_value) if isinstance(raw_value, str) else raw_value
        return _upload_bytes_to_supabase_storage(storage_path, file_bytes, content_type=content_type)
    except Exception:
        logger.exception('Failed to decode annotated image for storage upload: %s', storage_path)
        return None


def _delete_storage_paths_from_supabase(storage_paths):
    client = _get_supabase_client()
    if client is None or not storage_paths:
        return
    try:
        client.storage.from_(SUPABASE_STORAGE_BUCKET).remove(storage_paths)
    except Exception:
        logger.exception('Supabase storage delete failed for %s paths', len(storage_paths))


def _should_store_stream_event(module_name, camera_id, event_signature):
    state_key = f'{module_name}:{camera_id or "default"}'
    now = time.monotonic()
    previous = STREAM_EVENT_STATE.get(state_key)
    if previous is None:
        STREAM_EVENT_STATE[state_key] = {"timestamp": now, "signature": event_signature}
        return True
    if previous.get('signature') != event_signature or (now - previous.get('timestamp', now)) >= STREAM_EVENT_WINDOW_SECONDS:
        STREAM_EVENT_STATE[state_key] = {"timestamp": now, "signature": event_signature}
        return True
    return False


def _resident_image_storage_path(cnic, filename):
    return f"{SUPABASE_RESIDENT_IMAGES_PREFIX}/{cnic}/{filename}"


def _detection_image_storage_path(module_name, camera_id, suffix='jpg'):
    camera_part = camera_id or 'default'
    ts = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    return f"{SUPABASE_DETECTIONS_PREFIX}/{module_name}/{camera_part}/{ts}_{uuid4().hex[:8]}.{suffix.lstrip('.')}"


def _persist_detection_image(module_name, camera_id, annotated_image, suffix='jpg'):
    if not annotated_image:
        return None
    storage_path = _detection_image_storage_path(module_name, camera_id, suffix=suffix)
    return _upload_data_url_to_supabase_storage(storage_path, annotated_image, content_type='image/jpeg')


def _attach_storage_result_to_log(log_entry, storage_result):
    if not storage_result:
        return log_entry
    enriched = dict(log_entry)
    enriched['annotated_image_url'] = storage_result.get('public_url')
    enriched['annotated_image_path'] = storage_result.get('storage_path')
    enriched['annotated_image'] = storage_result.get('public_url')
    return enriched


# ==============================================================================
# SUPABASE RESIDENT CRUD
# ==============================================================================

SUPABASE_RESIDENTS_TABLE = os.environ.get('SUPABASE_RESIDENTS_TABLE', 'residents').strip() or 'residents'
SUPABASE_RESIDENT_IMAGES_TABLE = os.environ.get('SUPABASE_RESIDENT_IMAGES_TABLE', 'resident_images').strip() or 'resident_images'
SUPABASE_RESIDENT_ENCODINGS_TABLE = os.environ.get('SUPABASE_RESIDENT_ENCODINGS_TABLE', 'resident_encodings').strip() or 'resident_encodings'
SUPABASE_ORGANIZATIONS_TABLE = os.environ.get('SUPABASE_ORGANIZATIONS_TABLE', 'organizations').strip() or 'organizations'
SUPABASE_ACCESS_USERS_TABLE = os.environ.get('SUPABASE_ACCESS_USERS_TABLE', 'access_users').strip() or 'access_users'
FREE_ORG_MEMBER_LIMIT = max(int(os.environ.get('FREE_ORG_MEMBER_LIMIT', 5)), 1)
STRIPE_SECRET_KEY = os.environ.get('STRIPE_SECRET_KEY', '').strip()
STRIPE_WEBHOOK_SECRET = os.environ.get('STRIPE_WEBHOOK_SECRET', '').strip()
STRIPE_UPGRADE_PRICE_ID = os.environ.get('STRIPE_UPGRADE_PRICE_ID', '').strip()
FRONTEND_BASE_URL = os.environ.get('FRONTEND_BASE_URL', 'http://127.0.0.1:5173').strip().rstrip('/')

if stripe is not None and STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY


def _verify_login_password(stored_hash, candidate_password):
    if not stored_hash or not candidate_password:
        return False

    raw = str(stored_hash)

    try:
        if raw.startswith('pbkdf2:') or raw.startswith('scrypt:'):
            return bool(check_password_hash(raw, candidate_password))

        # Compatibility: some manually pasted hashes miss the "scrypt:" prefix
        # and look like "32768:8:1$...$...".
        if '$' in raw and raw.split('$', 1)[0].count(':') == 2:
            return bool(check_password_hash(f"scrypt:{raw}", candidate_password))
    except Exception:
        pass

    # Legacy/dev fallback where plaintext may be stored.
    return raw == candidate_password


def _fetch_access_users_by_email(identifier, organization_id=None):
    """Fetch users by email, optionally scoped to an organization."""
    client = _get_supabase_client()
    if client is None:
        logger.warning('Supabase client is None in _fetch_access_users_by_email')
        return []

    ident = (identifier or '').strip().lower()
    if not ident:
        logger.warning('Empty identifier passed to _fetch_access_users_by_email')
        return []

    scoped_org_id = None
    if organization_id is not None:
        candidate_org_id = str(organization_id).strip()
        if candidate_org_id and candidate_org_id.lower() != 'global':
            try:
                scoped_org_id = str(UUID(candidate_org_id))
            except ValueError:
                logger.warning('Ignoring invalid organization_id scope for %s: %s', ident, candidate_org_id)

    logger.debug(f'Fetching access users by email: {ident}')
    try:
        query = client.table(SUPABASE_ACCESS_USERS_TABLE).select('*').eq('email', ident)
        if scoped_org_id is not None:
            query = query.eq('organization_id', scoped_org_id)

        by_email = query.limit(2).execute()
        if by_email.data:
            logger.debug(f'Found {len(by_email.data)} user(s) for email: {ident}')
            return by_email.data
        logger.warning(f'No user found for email: {ident}')
    except Exception as e:
        logger.exception(f'Failed to read access user by email {ident}: {str(e)}')

    return []


def _fetch_access_user_by_identifier(identifier, organization_id=None):
    """Fetch a user by email, optionally scoped to an organization."""
    users = _fetch_access_users_by_email(identifier, organization_id=organization_id)
    if not users:
        return None

    if len(users) > 1 and organization_id is None:
        logger.warning(
            "Multiple access users found for email %s without organization scope; using the first match",
            (identifier or '').strip().lower(),
        )

    return users[0]


def _fetch_organization_name(organization_id):
    if not organization_id:
        return None

    client = _get_supabase_client()
    if client is None:
        return None

    try:
        response = client.table(SUPABASE_ORGANIZATIONS_TABLE).select('name').eq('id', organization_id).limit(1).execute()
        if response.data:
            return response.data[0].get('name')
    except Exception:
        logger.exception('Failed to read organization name')

    return None


def _fetch_organization_by_code(code):
    if not code:
        return None

    client = _get_supabase_client()
    if client is None:
        return None

    try:
        response = client.table(SUPABASE_ORGANIZATIONS_TABLE).select('*').eq('code', code).limit(1).execute()
        if response.data:
            return response.data[0]
    except Exception:
        logger.exception('Failed to read organization by code')

    return None


def _fetch_organization(organization_id):
    if not organization_id:
        return None

    client = _get_supabase_client()
    if client is None:
        return None

    try:
        response = client.table(SUPABASE_ORGANIZATIONS_TABLE).select('*').eq('id', organization_id).limit(1).execute()
        if response.data:
            return response.data[0]
    except Exception:
        logger.exception('Failed to read organization')

    return None


def _organization_plan(organization):
    plan = str((organization or {}).get('plan') or 'free').strip().lower()
    return plan if plan in {'free', 'premium'} else 'free'


def _organization_is_upgraded(organization):
    return _organization_plan(organization) == 'premium'


def _organization_billing_payload(organization):
    plan = _organization_plan(organization)
    return {
        "plan": plan,
        "is_upgraded": plan == 'premium',
        "upgraded_at": (organization or {}).get('upgraded_at'),
        "member_limit": None if plan == 'premium' else FREE_ORG_MEMBER_LIMIT,
        "features": {
            "unlimited_members": plan == 'premium',
            "exports": plan == 'premium',
            "periodic_email_reports": plan == 'premium',
        },
    }


def _mark_organization_upgraded(organization_id, stripe_customer_id=None, stripe_checkout_session_id=None):
    client = _get_supabase_client()
    if client is None or not organization_id:
        return False

    payload = {
        "plan": "premium",
        "upgraded_at": datetime.now(timezone.utc).isoformat(),
    }
    if stripe_customer_id:
        payload["stripe_customer_id"] = stripe_customer_id
    if stripe_checkout_session_id:
        payload["stripe_checkout_session_id"] = stripe_checkout_session_id

    try:
        client.table(SUPABASE_ORGANIZATIONS_TABLE).update(payload).eq('id', organization_id).execute()
        return True
    except Exception:
        logger.exception('Failed to mark organization upgraded')
        return False


def _stripe_value(obj, key, default=None):
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(key, default)
    if hasattr(obj, key):
        return getattr(obj, key)
    getter = getattr(obj, 'get', None)
    if callable(getter):
        try:
            return getter(key, default)
        except TypeError:
            try:
                return getter(key)
            except Exception:
                return default
        except Exception:
            return default
    return default


def _should_notify_member_role(role):
    return str(role or '').strip().lower() in {'manager', 'operator', 'viewer'}


def _send_member_account_event(member, event_type, actor_name=None, is_active=None):
    role = str((member or {}).get('role') or '').strip().lower()
    if not _should_notify_member_role(role):
        return False

    try:
        return send_account_event_email(
            logger=logger,
            to_address=(member or {}).get('email'),
            event_type=event_type,
            member_role=role,
            organization_name=(member or {}).get('organization_name'),
            display_name=(member or {}).get('display_name') or (member or {}).get('username'),
            actor_name=actor_name,
            is_active=is_active,
        )
    except Exception:
        logger.exception('Failed to send %s account email to %s', event_type, (member or {}).get('email'))
        return False


def _organization_member_count(organization_id):
    client = _get_supabase_client()
    if client is None or not organization_id:
        return 0

    try:
        result = client.table(SUPABASE_ACCESS_USERS_TABLE).select('id', count='exact').eq('organization_id', organization_id).execute()
        return int(result.count or len(result.data or []))
    except Exception:
        logger.exception('Failed to count organization members')
        return 0


def _count_resident_images_supabase(company_id=None, company_name=None):
    client = _get_supabase_client()
    if client is None:
        return 0

    try:
        query = client.table(SUPABASE_RESIDENT_IMAGES_TABLE).select('id', count='exact')
        if company_id:
            query = query.eq('organization_id', company_id)
        elif company_name:
            query = query.eq('organization_name', company_name)

        result = query.limit(1).execute()
        return int(getattr(result, 'count', 0) or 0)
    except Exception:
        logger.exception('Failed to count resident images')
        return 0

def _generate_unique_org_code():
    """Generate a random 6-character unique organization code."""
    import random
    import string
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))

def _resolve_or_create_organization(name, code=None, owner_email=None):
    """Create a new organization row. Name duplicates are allowed."""
    client = _get_supabase_client()
    if client is None:
        logger.error("Supabase client not available")
        return None
    
    org_name = (name or '').strip()
    if not org_name:
        return None
    base_org_name = org_name
    candidate_org_name = org_name

    # Always create a new organization, even if another org has the same name.
    logger.info(f"Creating NEW organization '{org_name}' for owner {owner_email or 'unknown'}")

    # If caller provided a code, try it once first, then fall back to random codes.
    preferred_code = (code or '').strip() or None
    for attempt in range(10):
        if preferred_code and attempt == 0:
            org_code = preferred_code
        else:
            org_code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
        try:
            created = client.table(SUPABASE_ORGANIZATIONS_TABLE).insert({
                "name": candidate_org_name,
                "code": org_code, 
                "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            }).execute()
            
            if created.data and len(created.data) > 0:
                logger.info(f"✅ Created NEW org '{candidate_org_name}' with code '{org_code}' for owner {owner_email or 'unknown'}")
                return created.data[0]
            else:
                # Insert may have succeeded even if response data is empty - try to fetch it
                try:
                    fetch_result = client.table(SUPABASE_ORGANIZATIONS_TABLE).select('*').eq('code', org_code).limit(1).execute()
                    if fetch_result.data and len(fetch_result.data) > 0:
                        logger.info(f"✅ Created NEW org '{candidate_org_name}' with code '{org_code}' (fetched after empty response)")
                        return fetch_result.data[0]
                except:
                    pass
        except Exception as e:
            error_text = str(e).lower()
            if '23505' in error_text:
                # If DB enforces unique organization names, keep the base visible name but add a suffix.
                if 'organizations_name_key' in error_text or "'name'" in error_text or ' name ' in error_text:
                    suffix = uuid4().hex[:6].upper()
                    candidate_org_name = f"{base_org_name} ({suffix})"
                    logger.warning(
                        f"Duplicate organization name '{base_org_name}', retrying with '{candidate_org_name}'"
                    )
                    continue

                # Unique code collision: retry with a different generated code.
                logger.warning(f"Duplicate code '{org_code}', retrying with new code...")
                continue
            else:
                logger.error(f"Failed to create organization: {e}")
                return None
    
    logger.error(f"Failed to create organization after 10 attempts")
    return None

def _count_access_users():
    client = _get_supabase_client()
    if client is None:
        return 0
    try:
        result = client.table(SUPABASE_ACCESS_USERS_TABLE).select('id', count='exact').limit(1).execute()
        return int(getattr(result, 'count', 0) or 0)
    except Exception:
        logger.exception('Failed to count access users')
        return 0


def _create_access_user(*, email, username, display_name, password, role, organization_id=None, organization_name=None):
    client = _get_supabase_client()
    if client is None:
        return None

    clean_email = (email or '').strip().lower()
    clean_username = (username or '').strip().lower() or None
    clean_display_name = (display_name or '').strip() or None
    clean_role = (role or 'operator').strip().lower()
    if not clean_email or not password:
        return None

    payload = {
        "email": clean_email,
        "username": clean_username,
        "display_name": clean_display_name,
        "password_hash": generate_password_hash(password),
        "role": clean_role,
        "organization_id": organization_id,
        "organization_name": organization_name,
        "is_active": True,
    }

    try:
        result = client.table(SUPABASE_ACCESS_USERS_TABLE).insert(payload).execute()
        if result.data:
            logger.info(f"Access user '{clean_email}' created successfully with role '{clean_role}'")
            return result.data[0]
        else:
            logger.error(f"Insert succeeded but no data returned for user '{clean_email}'")
            # Try to fetch the newly created user
            try:
                query = client.table(SUPABASE_ACCESS_USERS_TABLE).select('*').eq('email', clean_email)
                if organization_id is not None:
                    query = query.eq('organization_id', organization_id)
                fetch_result = query.limit(1).execute()
                if fetch_result.data:
                    return fetch_result.data[0]
            except:
                pass
    except Exception:
        logger.exception('Failed to create access user')
        return None


def _request_actor_user():
    actor_email = (request.headers.get('X-User-Email') or '').strip().lower()
    if not actor_email:
        return None

    actor_org_id_raw = (request.headers.get('X-Company-ID') or '').strip()
    actor_org_id = None
    if actor_org_id_raw and actor_org_id_raw.lower() != 'global':
        try:
            actor_org_id = str(UUID(actor_org_id_raw))
        except ValueError:
            logger.warning('Ignoring invalid X-Company-ID header for actor %s: %s', actor_email, actor_org_id_raw)
    return _fetch_access_user_by_identifier(actor_email, organization_id=actor_org_id)


def _check_enrollment_permission():
    """Check if user is allowed to enroll residents (viewer only is blocked)."""
    actor = _request_actor_user()
    if not actor:
        return False, ("Authentication required", 401)
    
    role = (actor.get('role') or '').lower()
    if role == 'viewer':
        return False, (f"Role '{role}' does not have permission to enroll residents", 403)
    
    return True, None


def _check_directory_permission():
    """Check if user is allowed to view resident directory (viewer only is blocked)."""
    actor = _request_actor_user()
    if not actor:
        return False, ("Authentication required", 401)
    
    role = (actor.get('role') or '').lower()
    if role == 'viewer':
        return False, (f"Role '{role}' does not have permission to view resident directory", 403)
    
    return True, None


def _check_capture_permission():
    """Check if user is allowed to use capture/stream endpoints (viewer is blocked)."""
    actor = _request_actor_user()
    if not actor:
        return False, ("Authentication required", 401)

    role = (actor.get('role') or '').lower()
    if role == 'viewer':
        return False, (f"Role '{role}' does not have permission to use capture features", 403)

    return True, None


def _check_delete_permission():
    """Check if user is allowed to delete residents (only owner/admin)"""
    actor = _request_actor_user()
    if not actor:
        return False, ("Authentication required", 401)
    
    role = (actor.get('role') or '').lower()
    if role not in ('owner', 'admin'):
        return False, (f"Role '{role}' does not have permission to delete residents", 403)
    
    return True, None


def _insert_resident_supabase(resident_data):
    client = _get_supabase_client()
    if client is None:
        logger.error("Supabase client not available")
        return None
    try:
        clean_payload = {k: v for k, v in resident_data.items()
                        if k not in ['encodings_saved', 'faces_detected', 'image_count', 'images']}
        logger.info(f"Inserting resident with payload: {clean_payload}")
        result = client.table(SUPABASE_RESIDENTS_TABLE).insert(clean_payload).execute()
        if result and hasattr(result, 'data') and result.data:
            logger.info(f"Resident {resident_data.get('cnic')} inserted to Supabase")
            return result.data[0]
        else:
            logger.error(f"Insert succeeded but no data returned for {resident_data.get('cnic')}")
            try:
                fetch_result = client.table(SUPABASE_RESIDENTS_TABLE).select("*").eq("cnic", resident_data.get('cnic')).execute()
                if fetch_result and fetch_result.data:
                    return fetch_result.data[0]
            except Exception as fetch_err:
                logger.error(f"Failed to fetch inserted resident: {str(fetch_err)}")
            return None
    except Exception as first_err:
        error_text = str(first_err).lower()
        if 'column' in error_text and ('organization_id' in error_text or 'organization_name' in error_text):
            fallback_payload = {
                k: v
                for k, v in clean_payload.items()
                if k not in {'organization_id', 'organization_name'}
            }
            if fallback_payload != clean_payload:
                try:
                    logger.warning(
                        f"Retrying resident insert without org columns for {resident_data.get('cnic')}"
                    )
                    result = client.table(SUPABASE_RESIDENTS_TABLE).insert(fallback_payload).execute()
                    if result and hasattr(result, 'data') and result.data:
                        return result.data[0]
                    fetch_result = client.table(SUPABASE_RESIDENTS_TABLE).select("*").eq("cnic", resident_data.get('cnic')).execute()
                    if fetch_result and fetch_result.data:
                        return fetch_result.data[0]
                except Exception:
                    logger.exception(f"Supabase fallback insert failed for resident {resident_data.get('cnic')}")
                    return None
        logger.exception(f"Supabase insert failed for resident {resident_data.get('cnic')}")
        return None


def _update_resident_supabase(cnic, updates, company_id=None, company_name=None):
    client = _get_supabase_client()
    if client is None:
        return
    try:
        query = client.table(SUPABASE_RESIDENTS_TABLE).update(updates).eq('cnic', cnic)
        if company_id:
            query = query.eq('organization_id', company_id)
        elif company_name:
            query = query.eq('organization_name', company_name)
        query.execute()
        logger.info(f"Resident {cnic} updated in Supabase")
    except Exception:
        logger.exception(f"Supabase update failed for resident {cnic}")


def _delete_resident_supabase(cnic, company_id=None, company_name=None):
    client = _get_supabase_client()
    if client is None:
        return
    try:
        query = client.table(SUPABASE_RESIDENTS_TABLE).delete().eq('cnic', cnic)
        if company_id:
            query = query.eq('organization_id', company_id)
        elif company_name:
            query = query.eq('organization_name', company_name)
        query.execute()
        logger.info(f"Resident {cnic} deleted from Supabase")
    except Exception:
        logger.exception(f"Supabase delete failed for resident {cnic}")


def _resident_matches_scope(resident, company_id=None, company_name=None):
    if company_id:
        resident_company_id = str(resident.get('organization_id') or '').strip()
        if resident_company_id != company_id:
            return False
    if company_name:
        resident_company_name = str(resident.get('organization_name') or '').strip()
        if resident_company_name != company_name:
            return False
    return True


def _read_resident_supabase(cnic, company_id=None, company_name=None):
    client = _get_supabase_client()
    if client is None:
        return None
    try:
        query = client.table(SUPABASE_RESIDENTS_TABLE).select('*').eq('cnic', cnic)
        if company_id:
            query = query.eq('organization_id', company_id)
        elif company_name:
            query = query.eq('organization_name', company_name)
        response = query.limit(1).execute()
        resident = response.data[0] if response.data else None
        return resident
    except Exception:
        logger.exception(f"Supabase read failed for resident {cnic}")
        return None


def _read_all_residents_supabase(company_id=None, company_name=None):
    client = _get_supabase_client()
    if client is None:
        return None
    try:
        response = client.table(SUPABASE_RESIDENTS_TABLE).select('*').order('enrolled_at', desc=True).execute()
        residents = response.data or [] if response.data is not None else None
        if residents is None:
            return None
        if company_id or company_name:
            residents = [
                resident for resident in residents
                if _resident_matches_scope(resident, company_id=company_id, company_name=company_name)
            ]
        return residents
    except Exception:
        logger.exception("Supabase read failed for all residents")
        return None


def _insert_resident_images_supabase(cnic, images_list):
    client = _get_supabase_client()
    if client is None:
        return
    try:
        payloads = [
            {
                "cnic": cnic,
                "filename": img_info.get("filename"),
                "file_hash": img_info.get("file_hash"),
                "file_size": img_info.get("file_size"),
                "storage_path": img_info.get("storage_path"),
                "public_url": img_info.get("public_url"),
                "organization_id": img_info.get("organization_id"),
                "organization_name": img_info.get("organization_name"),
            }
            for img_info in images_list
        ]
        if payloads:
            try:
                client.table(SUPABASE_RESIDENT_IMAGES_TABLE).insert(payloads).execute()
            except Exception as first_err:
                error_text = str(first_err).lower()
                if 'organization_id' in error_text or 'organization_name' in error_text or 'column' in error_text:
                    fallback_payloads = []
                    for payload in payloads:
                        fallback = dict(payload)
                        fallback.pop('organization_id', None)
                        fallback.pop('organization_name', None)
                        fallback_payloads.append(fallback)
                    client.table(SUPABASE_RESIDENT_IMAGES_TABLE).insert(fallback_payloads).execute()
                else:
                    raise
            logger.info(f"Inserted {len(payloads)} images for resident {cnic}")
    except Exception:
        logger.exception(f"Supabase insert images failed for resident {cnic}")


def _read_resident_images_supabase(cnic, company_id=None, company_name=None):
    client = _get_supabase_client()
    if client is None:
        return None
    try:
        if company_id or company_name:
            resident = _read_resident_supabase(cnic, company_id=company_id, company_name=company_name)
            if resident is None:
                return []
        query = (
            client.table(SUPABASE_RESIDENT_IMAGES_TABLE)
            .select('filename,storage_path,public_url')
            .eq('cnic', cnic)
            .order('created_at', desc=False)
        )
        if company_id:
            query = query.eq('organization_id', company_id)
        elif company_name:
            query = query.eq('organization_name', company_name)

        try:
            response = query.execute()
        except Exception as first_err:
            error_text = str(first_err).lower()
            if (company_id or company_name) and ('organization_id' in error_text or 'organization_name' in error_text or 'column' in error_text):
                response = (
                    client.table(SUPABASE_RESIDENT_IMAGES_TABLE)
                    .select('filename,storage_path,public_url')
                    .eq('cnic', cnic)
                    .order('created_at', desc=False)
                    .execute()
                )
            else:
                raise
        return response.data or []
    except Exception:
        logger.exception(f"Supabase read failed for resident images {cnic}")
        return None


def _insert_resident_encodings_supabase(cnic, encodings_data):
    client = _get_supabase_client()
    if client is None:
        return
    try:
        if isinstance(encodings_data, list) and len(encodings_data) > 0:
            payloads = []
            for idx, enc in enumerate(encodings_data):
                enc_list = enc.tolist() if hasattr(enc, 'tolist') else enc
                payloads.append({
                    "cnic": cnic,
                    "encoding_data": enc_list,
                    "image_filename": f"image_{idx+1}.jpg"
                })
            if payloads:
                client.table(SUPABASE_RESIDENT_ENCODINGS_TABLE).insert(payloads).execute()
                logger.info(f"Inserted {len(payloads)} encodings for resident {cnic}")
    except Exception:
        logger.exception(f"Supabase insert encodings failed for resident {cnic}")


def _read_resident_encodings_supabase(exclude_cnic=None):
    client = _get_supabase_client()
    if client is None:
        return []
    try:
        response = (
            client.table(SUPABASE_RESIDENT_ENCODINGS_TABLE)
            .select('cnic,encoding_data')
            .execute()
        )
        rows = response.data or []
        grouped = {}
        for row in rows:
            cnic = str(row.get('cnic') or '').strip()
            if not cnic:
                continue
            if exclude_cnic and cnic == exclude_cnic:
                continue
            encoding_data = row.get('encoding_data')
            if not isinstance(encoding_data, list) or not encoding_data:
                continue
            try:
                encoding = normalize(np.asarray(encoding_data, dtype=np.float32))
            except Exception:
                continue
            if cnic not in grouped:
                resident_name = cnic
                resident = _read_resident_supabase(cnic)
                if isinstance(resident, dict):
                    resident_name = resident.get('name') or cnic
                grouped[cnic] = {'cnic': cnic, 'name': resident_name, 'encodings': []}
            grouped[cnic]['encodings'].append(encoding)
        return list(grouped.values())
    except Exception:
        logger.exception('Supabase read failed for resident encodings')
        return []


# ── Mask detection config ─────────────────────────────────────────────────────
MASK_CONF_THRESHOLD = float(os.environ.get('MASK_CONF_THRESHOLD', 0.35))
MASK_IOU_THRESHOLD  = float(os.environ.get('MASK_IOU_THRESHOLD', 0.5))
MASK_MAX_DET        = int(os.environ.get('MASK_MAX_DET', 200))
MASK_UPLOAD_TTA     = _env_flag('MASK_UPLOAD_TTA', False)
MASK_STREAM_TTA     = _env_flag('MASK_STREAM_TTA', False)
MASK_MODEL_PATH_ENV = os.environ.get('MASK_MODEL_PATH', '').strip()
MASK_MODEL = None

MASK_UPLOAD_IMGSZ = int(os.environ.get('MASK_UPLOAD_IMGSZ', 640))
MASK_STREAM_IMGSZ = int(os.environ.get('MASK_STREAM_IMGSZ', 320))

logger.info("Starting Flask server — InsightFace + Helmet + Mask …")


# ==============================================================================
# HELMET LOG UTILITIES
# ==============================================================================

def _read_helmet_logs_unlocked():
    if not os.path.exists(HELMET_LOG_PATH):
        return []
    try:
        with open(HELMET_LOG_PATH, 'r') as f:
            logs = json.load(f)
        return logs if isinstance(logs, list) else []
    except Exception:
        logger.exception("Failed reading helmet logs; resetting log store")
        return []

def _write_helmet_logs_unlocked(logs):
    temp_path = f"{HELMET_LOG_PATH}.tmp"
    with open(temp_path, 'w') as f:
        json.dump(logs, f, indent=2)
    os.replace(temp_path, HELMET_LOG_PATH)

def append_helmet_log(log_entry):
    with HELMET_LOG_LOCK:
        logs = _read_helmet_logs_unlocked()
        logs.append(log_entry)
        if len(logs) > 1000:
            logs = logs[-1000:]
        _write_helmet_logs_unlocked(logs)
    _append_supabase_log(SUPABASE_HELMET_TABLE, log_entry)

def read_helmet_logs(company_id=None, company_name=None):
    return _read_supabase_logs(SUPABASE_HELMET_TABLE, company_id=company_id, company_name=company_name) or []


# ==============================================================================
# MASK LOG UTILITIES
# ==============================================================================

def _read_mask_logs_unlocked():
    if not os.path.exists(MASK_LOG_PATH):
        return []
    try:
        with open(MASK_LOG_PATH, 'r') as f:
            logs = json.load(f)
        return logs if isinstance(logs, list) else []
    except Exception:
        logger.exception("Failed reading mask logs; resetting log store")
        return []

def _write_mask_logs_unlocked(logs):
    temp_path = f"{MASK_LOG_PATH}.tmp"
    with open(temp_path, 'w') as f:
        json.dump(logs, f, indent=2)
    os.replace(temp_path, MASK_LOG_PATH)

def append_mask_log(log_entry):
    with MASK_LOG_LOCK:
        logs = _read_mask_logs_unlocked()
        logs.append(log_entry)
        if len(logs) > 1000:
            logs = logs[-1000:]
        _write_mask_logs_unlocked(logs)
    _append_supabase_log(SUPABASE_MASK_TABLE, log_entry)

def read_mask_logs(company_id=None, company_name=None):
    return _read_supabase_logs(SUPABASE_MASK_TABLE, company_id=company_id, company_name=company_name) or []

def summarize_mask_logs(logs):
    total           = len(logs)
    compliant       = sum(1 for l in logs if l.get('status') == 'Compliant')
    non_compliant   = sum(1 for l in logs if l.get('status') == 'Non-Compliant')
    no_person       = sum(1 for l in logs if l.get('status') == 'No Persons Detected')
    avg_conf        = round(sum(float(l.get('confidence', 0) or 0) for l in logs) / total, 2) if total > 0 else 0
    compliance_rate = round((compliant / total) * 100, 2) if total > 0 else 0
    return {
        "total_detections":     total,
        "compliant":            compliant,
        "non_compliant":        non_compliant,
        "no_person_detections": no_person,
        "avg_confidence":       avg_conf,
        "compliance_rate":      compliance_rate,
    }


# ==============================================================================
# HELMET MODEL LOADING
# ==============================================================================

def load_helmet_model():
    global HELMET_MODEL
    if HELMET_MODEL is not None:
        return HELMET_MODEL

    with _MODEL_LOAD_LOCK:
        if HELMET_MODEL is not None:
            return HELMET_MODEL

        model_path = os.path.join(BASE_DIR, 'models', 'helmet.pt')
        if not os.path.exists(model_path):
            raise RuntimeError(
                "Helmet model not found at models/helmet.pt\n"
                "Run: python download_model.py"
            )

        logger.info(f"Loading helmet model from {model_path}")
        original_torch_load = torch.load
        def patched_torch_load(f, *args, **kwargs):
            kwargs['weights_only'] = False
            return original_torch_load(f, *args, **kwargs)
        torch.load = patched_torch_load
        try:
            HELMET_MODEL = YOLO(model_path)
        finally:
            torch.load = original_torch_load

        dummy = np.zeros((320, 320, 3), dtype=np.uint8)
        HELMET_MODEL(dummy, verbose=False)
        logger.info(f"Helmet model ready. Classes: {HELMET_MODEL.names}")

    return HELMET_MODEL


# ==============================================================================
# MASK MODEL LOADING
# ==============================================================================

def _resolve_mask_model_path():
    candidates = []
    if MASK_MODEL_PATH_ENV:
        custom_path = MASK_MODEL_PATH_ENV
        if not os.path.isabs(custom_path):
            custom_path = os.path.join(BASE_DIR, custom_path)
        candidates.append(os.path.normpath(custom_path))

    candidates.extend([
        os.path.join(BASE_DIR, 'models', 'best.pt'),
        os.path.join(BASE_DIR, 'models', 'mask.pt'),
    ])

    seen = set()
    unique_candidates = []
    for c in candidates:
        nc = os.path.normpath(c)
        if nc not in seen:
            unique_candidates.append(nc)
            seen.add(nc)

    for c in unique_candidates:
        if os.path.exists(c):
            return c

    searched = "\n".join(f" - {c}" for c in unique_candidates)
    raise RuntimeError(f"Mask model not found.\nSearched:\n{searched}")


def load_mask_model():
    global MASK_MODEL
    if MASK_MODEL is not None:
        return MASK_MODEL

    with _MODEL_LOAD_LOCK:
        if MASK_MODEL is not None:
            return MASK_MODEL

        model_path = _resolve_mask_model_path()
        logger.info(f"Loading mask model from {model_path}")

        original_torch_load = torch.load
        def patched_torch_load(f, *args, **kwargs):
            kwargs['weights_only'] = False
            return original_torch_load(f, *args, **kwargs)
        torch.load = patched_torch_load
        try:
            MASK_MODEL = YOLO(model_path)
        finally:
            torch.load = original_torch_load

        dummy = np.zeros((320, 320, 3), dtype=np.uint8)
        MASK_MODEL(dummy, imgsz=MASK_STREAM_IMGSZ, verbose=False)
        logger.info(f"Mask model ready. Classes: {MASK_MODEL.names}")

    return MASK_MODEL


# ==============================================================================
# HELMET DETECTION CORE
# ==============================================================================

def _normalize_helmet_label(label: str) -> str:
    return "_".join(str(label).lower().replace('-', ' ').split())

HELMET_LABELS = {
    _normalize_helmet_label(label) for label in (
        'hardhat', 'helmet', 'hard hat', 'hard-hat',
        'safety_helmet', 'safety helmet', 'with_helmet', 'with helmet',
    )
}
NO_HELMET_LABELS = {
    _normalize_helmet_label(label) for label in (
        'no-hardhat', 'no_hardhat', 'no hardhat', 'no helmet',
        'no-helmet', 'no_helmet', 'without_helmet', 'without helmet', 'without-helmet',
    )
}
HEAD_LABELS   = {_normalize_helmet_label(label) for label in ('head',)}
PERSON_LABELS = {_normalize_helmet_label(label) for label in ('person', 'worker', 'human', 'pedestrian', 'people')}

# Green for helmet, red for no-helmet — keys match det_type values set below
_HELMET_BOX_COLORS = {
    "with_helmet":    (34, 197, 94),   # green
    "without_helmet": (239, 68, 68),   # red
}
_HELMET_DEFAULT_COLOR = (148, 163, 184)


def _helmet_box_iou(box_a, box_b) -> float:
    ax1, ay1, ax2, ay2 = box_a
    bx1, by1, bx2, by2 = box_b
    inter_x1, inter_y1 = max(ax1, bx1), max(ay1, by1)
    inter_x2, inter_y2 = min(ax2, bx2), min(ay2, by2)
    inter_area = max(0, inter_x2 - inter_x1) * max(0, inter_y2 - inter_y1)
    if inter_area <= 0:
        return 0.0
    area_a = max(0, ax2 - ax1) * max(0, ay2 - ay1)
    area_b = max(0, bx2 - bx1) * max(0, by2 - by1)
    denom  = area_a + area_b - inter_area
    return inter_area / denom if denom > 0 else 0.0


def _helmet_box_contains(box_a, box_b) -> bool:
    ax1, ay1, ax2, ay2 = box_a
    bx1, by1, bx2, by2 = box_b
    cx, cy = (bx1 + bx2) / 2, (by1 + by2) / 2
    return ax1 <= cx <= ax2 and ay1 <= cy <= ay2


def _helmet_boxes_related(box_a, box_b) -> bool:
    return (
        _helmet_box_iou(box_a, box_b) >= 0.2
        or _helmet_box_contains(box_a, box_b)
        or _helmet_box_contains(box_b, box_a)
    )


def _draw_helmet_boxes(image_path: str, detections: list) -> str:
    img = cv2.imread(image_path)
    if img is None:
        return ""
    for det in detections:
        bbox = det.get("bbox")
        if not bbox or len(bbox) != 4:
            continue
        x1, y1, x2, y2 = [int(v) for v in bbox]
        color = _HELMET_BOX_COLORS.get(det.get("type"), _HELMET_DEFAULT_COLOR)
        cv2.rectangle(img, (x1, y1), (x2, y2), color, 2)
        label_text = f"{det.get('label', 'Detection')} {float(det.get('confidence', 0)):.0f}%"
        (tw, th), baseline = cv2.getTextSize(label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
        label_y = max(y1 - 6, th + baseline)
        cv2.rectangle(img, (x1, label_y - th - baseline), (x1 + tw + 4, label_y + baseline), color, -1)
        cv2.putText(img, label_text, (x1 + 2, label_y), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2, cv2.LINE_AA)
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])
    if not ok:
        return ""
    return f"data:image/jpeg;base64,{base64.b64encode(buf).decode('utf-8')}"


def detect_helmets_simple(image_path, conf_threshold=0.25, iou_threshold=0.3):
    try:
        helmet_model = load_helmet_model()
        results = helmet_model(image_path, conf=conf_threshold, iou=iou_threshold)

        detections = []
        helmets = 0
        no_helmet = 0
        person_count = 0

        for result in results:
            boxes = result.boxes
            if boxes is None or len(boxes) == 0:
                continue
            for box in boxes:
                cls_id = int(box.cls[0])
                conf = float(box.conf[0])
                bbox = box.xyxy[0].tolist()
                label = helmet_model.names[cls_id]
                norm_label = _normalize_helmet_label(label)

                if norm_label in HELMET_LABELS:
                    det_type = "with_helmet"
                    helmets += 1
                elif norm_label in NO_HELMET_LABELS:
                    det_type = "without_helmet"
                    no_helmet += 1
                elif norm_label in PERSON_LABELS:
                    person_count += 1
                    continue  # no bounding box drawn for generic person label
                else:
                    continue  # skip head labels and anything unknown

                detections.append({
                    "label": label,
                    "type": det_type,       # "with_helmet" → green, "without_helmet" → red
                    "confidence": conf,
                    "bbox": [int(x) for x in bbox],
                })

        # Each helmet/no-helmet box represents exactly one head → one person
        persons = helmets + no_helmet
        # Fallback: model only emits PERSON labels with no helmet breakdown
        if persons == 0 and person_count > 0:
            persons = person_count

        avg_conf = (sum(d["confidence"] for d in detections) / len(detections)) * 100 if detections else 0

        if persons == 0:
            status, compliance = "No Persons Detected", False
        elif no_helmet == 0:
            status, compliance = "Compliant", True
        else:
            status, compliance = "Violation", False

        annotated_img = _draw_helmet_boxes(image_path, detections)

        return {
            "persons": persons,
            "helmets": helmets,
            "no_helmet": no_helmet,
            "status": status,
            "compliance": compliance,
            "confidence": round(avg_conf, 2),
            "annotated_image": annotated_img,
            "detections": detections,
        }

    except Exception as e:
        logger.error(f"Helmet detection error: {e}")
        return {
            "persons": 0,
            "helmets": 0,
            "no_helmet": 0,
            "status": "No Persons Detected",
            "compliance": False,
            "confidence": 0,
            "annotated_image": None,
            "detections": [],
        }


# ==============================================================================
# MASK DETECTION CORE
# ==============================================================================

def _normalize_mask_label(label: str) -> str:
    return "_".join(str(label).lower().replace('-', ' ').split())

_MASK_CLASS_MAP = {
    "with_mask": "with_mask", "mask": "with_mask", "masked": "with_mask", "good": "with_mask",
    "mask_weared_incorrect": "incorrect", "incorrect": "incorrect", "incorrect_mask": "incorrect",
    "improper_mask": "incorrect", "partial_mask": "incorrect", "bad": "incorrect",
    "without_mask": "without_mask", "no_mask": "without_mask", "nomask": "without_mask", "none": "without_mask",
}
_MASK_BOX_COLORS = {
    "with_mask":    (34,  197,  94),
    "incorrect":    (234, 179,   8),
    "without_mask": (239,  68,  68),
}
_MASK_DEFAULT_COLOR  = (148, 163, 184)
_MASK_DISPLAY_LABELS = {"with_mask": "Mask", "incorrect": "Incorrect Mask", "without_mask": "No Mask"}


def _draw_mask_boxes(image_path: str, detections: list) -> str:
    img = cv2.imread(image_path)
    if img is None:
        return ""
    for det in detections:
        bbox = det.get("bbox")
        if not bbox or len(bbox) != 4:
            continue
        x1, y1, x2, y2 = [int(v) for v in bbox]
        color = _MASK_BOX_COLORS.get(det.get("type", "without_mask"), _MASK_DEFAULT_COLOR)
        cv2.rectangle(img, (x1, y1), (x2, y2), color, 2)
        label_text = f"{det.get('label', 'Face')} {float(det.get('confidence', 0)):.0f}%"
        (tw, th), baseline = cv2.getTextSize(label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
        label_y = max(y1 - 6, th + baseline)
        cv2.rectangle(img, (x1, label_y - th - baseline), (x1 + tw + 4, label_y + baseline), color, -1)
        cv2.putText(img, label_text, (x1 + 2, label_y), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2, cv2.LINE_AA)
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])
    if not ok:
        return ""
    return "data:image/jpeg;base64," + base64.b64encode(buf).decode("utf-8")


def _mask_inference_kwargs(mode: str) -> dict:
    is_stream = mode == 'stream'
    return {
        "conf":    MASK_CONF_THRESHOLD,
        "iou":     MASK_IOU_THRESHOLD,
        "imgsz":   MASK_STREAM_IMGSZ if is_stream else MASK_UPLOAD_IMGSZ,
        "max_det": MASK_MAX_DET,
        "augment": MASK_STREAM_TTA if is_stream else MASK_UPLOAD_TTA,
        "verbose": False,
    }


def detect_masks_core(image_path: str, mode: str = 'upload') -> dict:
    model   = load_mask_model()
    results = model(image_path, **_mask_inference_kwargs(mode))

    masked_count = without_mask = incorrect_count = 0
    detections = []

    for result in results:
        if result.boxes is None or len(result.boxes) == 0:
            continue
        for box in result.boxes:
            cls_id     = int(box.cls[0].item())
            conf       = float(box.conf[0].item())
            raw_label  = str(model.names[cls_id]).strip()
            norm_label = _normalize_mask_label(raw_label)
            det_type   = _MASK_CLASS_MAP.get(norm_label, "without_mask")
            x1, y1, x2, y2 = [int(v) for v in box.xyxy[0].tolist()]

            if det_type == "with_mask":
                masked_count += 1
            elif det_type == "incorrect":
                incorrect_count += 1
            else:
                without_mask += 1

            detections.append({
                "label":      _MASK_DISPLAY_LABELS.get(det_type, raw_label),
                "confidence": round(conf * 100, 2),
                "type":       det_type,
                "bbox":       [x1, y1, x2, y2],
            })

    persons = masked_count + without_mask + incorrect_count
    if persons == 0:
        status, compliance = "No Persons Detected", True
    elif without_mask > 0 or incorrect_count > 0:
        status, compliance = "Non-Compliant", False
    else:
        status, compliance = "Compliant", True

    all_confs      = [d["confidence"] for d in detections]
    avg_confidence = round(sum(all_confs) / len(all_confs), 2) if all_confs else 0.0
    annotated_image = _draw_mask_boxes(image_path, detections)

    return {
        "persons": persons, "masked": masked_count, "without_mask": without_mask,
        "incorrect": incorrect_count, "status": status, "compliance": compliance,
        "confidence": avg_confidence, "detections": detections,
        "annotated_image": annotated_image,
    }


# ==============================================================================
# INSIGHTFACE LOADING
# ==============================================================================

def load_insight_app():
    global INSIGHT_APP
    if INSIGHT_APP is not None:
        return INSIGHT_APP
    with _MODEL_LOAD_LOCK:
        if INSIGHT_APP is not None:
            return INSIGHT_APP
        logger.info("Loading InsightFace (buffalo_l) …")
        INSIGHT_APP = FaceAnalysis(
            name='buffalo_l',
            providers=['CUDAExecutionProvider', 'CPUExecutionProvider'],
        )
        INSIGHT_APP.prepare(ctx_id=0, det_size=(640, 640))
        logger.info("InsightFace ready.")
    return INSIGHT_APP


# ==============================================================================
# FACE RECOGNITION UTILITIES
# ==============================================================================

def normalize(vector: np.ndarray):
    norm = np.linalg.norm(vector)
    if norm <= 0:
        return None
    return vector / norm


def _detect_faces_insightface(image_path: str) -> list:
    img = cv2.imread(image_path)
    if img is None:
        return []
    insight = load_insight_app()
    rgb     = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    h, w    = img.shape[:2]
    faces   = []
    try:
        detected = insight.get(rgb)
    except Exception as e:
        logger.debug(f"InsightFace detection failed: {e}")
        return []
    for face in detected:
        conf_score = float(getattr(face, 'det_score', 0.0) or 0.0)
        if conf_score < FACE_DETECT_CONF:
            continue
        x1, y1, x2, y2 = [int(v) for v in face.bbox.tolist()]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w, x2), min(h, y2)
        if x2 <= x1 or y2 <= y1:
            continue
        crop      = img[y1:y2, x1:x2]
        embedding = getattr(face, 'embedding', None)
        if embedding is not None:
            embedding = normalize(np.asarray(embedding, dtype=np.float32))
        faces.append({"bbox": [x1, y1, x2, y2], "confidence": round(conf_score * 100, 2), "crop": crop, "embedding": embedding})
    return faces


def _get_embedding_insightface(face_crop: np.ndarray, precomputed_embedding=None):
    if precomputed_embedding is not None:
        return normalize(np.asarray(precomputed_embedding, dtype=np.float32))
    if face_crop is None or face_crop.size == 0:
        return None
    insight = load_insight_app()
    rgb     = cv2.cvtColor(face_crop, cv2.COLOR_BGR2RGB)
    try:
        faces = insight.get(rgb)
    except Exception as e:
        logger.debug(f"InsightFace.get() failed: {e}")
        return None
    if not faces:
        return None
    face      = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
    embedding = face.embedding.astype(np.float32)
    return normalize(embedding)


def get_single_embedding(img_path: str):
    faces = _detect_faces_insightface(img_path)
    if not faces:
        logger.debug(f"InsightFace: no face in {img_path}")
        return None
    best      = max(faces, key=lambda f: f["confidence"])
    embedding = _get_embedding_insightface(best["crop"], best.get("embedding"))
    if embedding is None:
        logger.debug(f"InsightFace: could not embed face from {img_path}")
        return None
    logger.info(f"  Embedding extracted — conf={best['confidence']}%  shape={embedding.shape}")
    return embedding


def _embedding_similarity(left, right) -> float:
    left  = np.asarray(left,  dtype=np.float32)
    right = np.asarray(right, dtype=np.float32)
    if left.shape != right.shape:
        return -1.0
    return float(np.dot(left, right))


def _load_existing_resident_embeddings(exclude_cnic=None):
    return _read_resident_encodings_supabase(exclude_cnic=exclude_cnic)


def _find_duplicate_resident(embedding, exclude_cnic=None):
    best_match      = None
    best_similarity = -1.0
    for resident in _load_existing_resident_embeddings(exclude_cnic=exclude_cnic):
        for existing in resident['encodings']:
            sim = _embedding_similarity(embedding, existing)
            if sim > best_similarity:
                best_similarity = sim
                best_match = {'cnic': resident['cnic'], 'name': resident['name'], 'similarity': round(sim, 4)}
    if best_match and best_match['similarity'] >= FACE_DUPLICATE_SIMILARITY_THRESHOLD:
        return best_match
    return None


# ==============================================================================
# FACE LOG UTILITIES
# ==============================================================================

FACE_LOG_PATH = os.path.join(UPLOAD_FOLDER, 'face_logs.json')
FACE_LOG_LOCK = threading.Lock()

def _read_face_logs_unlocked():
    if not os.path.exists(FACE_LOG_PATH):
        return []
    try:
        with open(FACE_LOG_PATH, 'r') as f:
            logs = json.load(f)
        return logs if isinstance(logs, list) else []
    except Exception:
        return []

def _write_face_logs_unlocked(logs):
    temp = f"{FACE_LOG_PATH}.tmp"
    with open(temp, 'w') as f:
        json.dump(logs, f, indent=2)
    os.replace(temp, FACE_LOG_PATH)


def _append_supabase_log(table_name, log_entry):
    client = _get_supabase_client()
    if client is None:
        logger.warning(f"Cannot save to {table_name}: Supabase client not available")
        return
    try:
        payload = _supabase_payload_from_log(log_entry)
        for field in ['annotated_image_path', 'annotated_image_url', 'local_id']:
            payload.pop(field, None)
        payload = {k: v for k, v in payload.items() if v is not None}
        if table_name == SUPABASE_FACE_TABLE:
            allowed = {'id', 'timestamp', 'name', 'cnic', 'status', 'confidence',
                       'source', 'camera_id', 'file_name', 'annotated_image', 'bbox', 'company_id', 'organization_id', 'organization_name'}
            payload = {k: v for k, v in payload.items() if k in allowed}
        logger.debug(f"Inserting into {table_name}: {list(payload.keys())}")
        client.table(table_name).insert(payload).execute()
        logger.info(f"✅ Successfully saved log to {table_name}")
    except Exception as first_err:
        error_text = str(first_err).lower()
        if ('column' in error_text or 'schema cache' in error_text) and any(field in error_text for field in ('company_id', 'organization_id', 'organization_name')):
            fallback_payload = {
                k: v
                for k, v in payload.items()
                if k != 'company_id'
            }
            if fallback_payload != payload:
                try:
                    logger.warning(f"Retrying log insert into {table_name} without company_id")
                    client.table(table_name).insert(fallback_payload).execute()
                    logger.info(f"✅ Successfully saved fallback log to {table_name}")
                    return
                except Exception as fallback_err:
                    logger.warning(f"company_id fallback insert failed for {table_name}: {str(fallback_err)}")

            fallback_payload = {
                k: v
                for k, v in payload.items()
                if k not in {'company_id', 'organization_id', 'organization_name'}
            }
            if fallback_payload != payload:
                try:
                    logger.warning(f"Retrying log insert into {table_name} without org columns")
                    client.table(table_name).insert(fallback_payload).execute()
                    logger.info(f"✅ Successfully saved fallback log to {table_name}")
                    return
                except Exception as fallback_err:
                    logger.error(f"❌ Supabase fallback insert failed for {table_name}: {str(fallback_err)}")
                    return
        logger.error(f"❌ Supabase insert failed for {table_name}: {str(first_err)}")


def append_face_log(entry):
    with FACE_LOG_LOCK:
        logs = _read_face_logs_unlocked()
        logs.append(entry)
        if len(logs) > 2000:
            logs = logs[-2000:]
        _write_face_logs_unlocked(logs)
    _append_supabase_log(SUPABASE_FACE_TABLE, entry)

def read_face_logs(company_id=None, company_name=None):
    try:
        cloud_logs = _read_supabase_logs(SUPABASE_FACE_TABLE, company_id=company_id, company_name=company_name)
        if cloud_logs:
            logger.info(f"Returning {len(cloud_logs)} logs from Supabase")
            return cloud_logs
    except Exception as e:
        logger.warning(f"Failed to read from Supabase: {e}")
    with FACE_LOG_LOCK:
        local_logs = _read_face_logs_unlocked()
        if company_id:
            local_logs = [
                log for log in local_logs
                if str(log.get('company_id') or '').strip() == company_id
            ]
        logger.info(f"Returning {len(local_logs)} logs from local file")
        return local_logs


# ==============================================================================
# AUTH ENDPOINTS
# ==============================================================================

@app.route('/auth/login', methods=['POST'])
def auth_login():
    try:
        payload = request.get_json(silent=True) or {}
        identifier = (payload.get('identifier') or payload.get('email') or '').strip()
        organization_code = (payload.get('organization_code') or '').strip()
        password = str(payload.get('password') or '')

        logger.debug(f'Login attempt for: {identifier}')
        if not identifier or not password:
            logger.warning(f'Login attempt missing identifier or password')
            return jsonify({"status": "error", "message": "Identifier and password are required"}), 400

        if organization_code:
            organization = _fetch_organization_by_code(organization_code)
            if not organization:
                return jsonify({"status": "error", "message": "Organization code not found"}), 404

            user = _fetch_access_user_by_identifier(identifier, organization_id=organization.get('id'))
        else:
            users = _fetch_access_users_by_email(identifier)
            if len(users) > 1:
                return jsonify({
                    "status": "error",
                    "message": "Multiple accounts use this email. Please enter your organization code to continue.",
                    "code": "organization_required",
                }), 409
            user = users[0] if users else None

        if not user:
            logger.warning(f'User not found or Supabase error: {identifier}')
            return jsonify({"status": "error", "message": "Invalid credentials"}), 401

        if user.get('is_active') is False:
            return jsonify({"status": "error", "message": "This account is inactive"}), 403

        if not _verify_login_password(user.get('password_hash'), password):
            return jsonify({"status": "error", "message": "Invalid credentials"}), 401

        role = str(user.get('role') or 'operator').strip().lower()
        organization_id = user.get('organization_id')
        organization = _fetch_organization(organization_id)
        organization_name = user.get('organization_name') or (organization or {}).get('name') or _fetch_organization_name(organization_id)

        return jsonify({
            "status": "success",
            "message": "Login successful",
            "data": {
                "user": {
                    "id": user.get('id'),
                    "email": user.get('email'),
                    "display_name": user.get('display_name') or user.get('username') or user.get('email'),
                    "role": role,
                    "organization_id": organization_id,
                    "organization_name": organization_name,
                    "is_active": user.get('is_active', True),
                    "billing": _organization_billing_payload(organization),
                }
            }
        })
    except Exception as e:
        logger.exception('auth_login error')
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/auth/bootstrap-owner', methods=['POST'])
def auth_bootstrap_owner():
    try:
        if _count_access_users() > 0:
            return jsonify({"status": "error", "message": "Bootstrap owner is already configured"}), 409

        payload = request.get_json(silent=True) or {}
        organization_name = (payload.get('organization_name') or '').strip()
        organization_code = (payload.get('organization_code') or '').strip() or None
        email = (payload.get('email') or '').strip()
        username = (payload.get('username') or '').strip() or None
        display_name = (payload.get('display_name') or '').strip() or None
        password = str(payload.get('password') or '')

        if not organization_name or not email or not password:
            return jsonify({"status": "error", "message": "organization_name, email and password are required"}), 400

        if _fetch_access_user_by_identifier(email) is not None:
            return jsonify({"status": "error", "message": "An account with this email already exists"}), 409

        org = _resolve_or_create_organization(organization_name, organization_code, owner_email=email)
        if not org:
            return jsonify({"status": "error", "message": "Failed to create organization"}), 500

        created = _create_access_user(
            email=email,
            username=username,
            display_name=display_name,
            password=password,
            role='owner',
            organization_id=org.get('id'),
            organization_name=org.get('name'),
        )
        if not created:
            return jsonify({"status": "error", "message": "Failed to create owner account"}), 500

        return jsonify({
            "status": "success",
            "message": "Organization owner created",
            "data": {
                "organization": {
                    "id": org.get('id'),
                    "name": org.get('name'),
                    "code": org.get('code'),
                },
                "owner": {
                    "id": created.get('id'),
                    "email": created.get('email'),
                    "username": created.get('username'),
                    "display_name": created.get('display_name'),
                    "role": created.get('role'),
                }
            }
        })
    except Exception as e:
        logger.exception('auth_bootstrap_owner error')
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/auth/members', methods=['GET'])
def auth_list_members():
    try:
        actor = _request_actor_user()
        if not actor:
            return jsonify({"status": "error", "message": "Unauthorized"}), 401

        actor_role = str(actor.get('role') or '').strip().lower()
        actor_org = actor.get('organization_id')
        client = _get_supabase_client()
        if client is None:
            return jsonify({"status": "error", "message": "Supabase client not available"}), 500

        query = client.table(SUPABASE_ACCESS_USERS_TABLE).select('id,email,username,display_name,role,organization_id,organization_name,is_active,created_at').order('created_at', desc=True)
        if actor_role != 'admin':
            query = query.eq('organization_id', actor_org)

        result = query.execute()
        return jsonify({"status": "success", "data": {"members": result.data or []}})
    except Exception as e:
        logger.exception('auth_list_members error')
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/auth/organizations', methods=['GET'])
def auth_list_organizations():
    try:
        actor = _request_actor_user()
        if not actor:
            return jsonify({"status": "error", "message": "Unauthorized"}), 401

        actor_role = str(actor.get('role') or '').strip().lower()
        if actor_role != 'admin':
            return jsonify({"status": "error", "message": "Only admin can list all organizations"}), 403

        client = _get_supabase_client()
        if not client:
            return jsonify({"status": "error", "message": "Database unavailable"}), 500

        # Fetch all organizations
        orgs_result = client.table(SUPABASE_ORGANIZATIONS_TABLE).select('*').order('created_at', desc=True).execute()
        organizations = orgs_result.data or []

        # For each organization, fetch the owner info
        orgs_with_owners = []
        for org in organizations:
            org_id = org.get('id')
            # Fetch owner of this organization
            owner_result = client.table(SUPABASE_ACCESS_USERS_TABLE).select('*').eq('organization_id', org_id).eq('role', 'owner').eq('is_active', True).execute()
            owner = owner_result.data[0] if owner_result.data else None

            orgs_with_owners.append({
                "id": org.get('id'),
                "name": org.get('name'),
                "code": org.get('code'),
                "is_active": org.get('is_active', True),
                "created_at": org.get('created_at'),
                "owner_email": owner.get('email') if owner else None,
                "owner_name": owner.get('display_name') if owner else None,
                "billing": _organization_billing_payload(org),
            })

        logger.info(f"Returning {len(orgs_with_owners)} organizations")
        return jsonify({
            "status": "success",
            "data": {
                "organizations": orgs_with_owners
            }
        })
    except Exception as e:
        logger.exception('auth_list_organizations error')
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/auth/organizations/<org_id>', methods=['DELETE'])
def auth_delete_organization(org_id):
    try:
        actor = _request_actor_user()
        if not actor:
            return jsonify({"status": "error", "message": "Unauthorized"}), 401

        actor_role = str(actor.get('role') or '').strip().lower()
        if actor_role != 'admin':
            return jsonify({"status": "error", "message": "Only admin can delete organizations"}), 403

        client = _get_supabase_client()
        if not client:
            return jsonify({"status": "error", "message": "Database unavailable"}), 500

        # Permanent delete: remove organization users and the organization row.
        client.table(SUPABASE_ACCESS_USERS_TABLE).delete().eq('organization_id', org_id).execute()
        client.table(SUPABASE_ORGANIZATIONS_TABLE).delete().eq('id', org_id).execute()

        logger.info(f"Organization {org_id} permanently deleted by {actor.get('email')}")
        return jsonify({"status": "success", "message": "Organization deleted permanently"})
    except Exception as e:
        logger.exception('auth_delete_organization error')
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/auth/organizations/<org_id>/status', methods=['PATCH'])
def auth_update_organization_status(org_id):
    try:
        actor = _request_actor_user()
        if not actor:
            return jsonify({"status": "error", "message": "Unauthorized"}), 401

        actor_role = str(actor.get('role') or '').strip().lower()
        if actor_role != 'admin':
            return jsonify({"status": "error", "message": "Only admin can update organization status"}), 403

        payload = request.get_json(silent=True) or {}
        if 'is_active' not in payload:
            return jsonify({"status": "error", "message": "is_active is required"}), 400

        is_active = bool(payload.get('is_active'))

        client = _get_supabase_client()
        if not client:
            return jsonify({"status": "error", "message": "Database unavailable"}), 500

        client.table(SUPABASE_ORGANIZATIONS_TABLE).update({'is_active': is_active}).eq('id', org_id).execute()
        client.table(SUPABASE_ACCESS_USERS_TABLE).update({'is_active': is_active}).eq('organization_id', org_id).execute()

        action = 'activated' if is_active else 'deactivated'
        logger.info(f"Organization {org_id} {action} by {actor.get('email')}")
        return jsonify({"status": "success", "message": f"Organization {action} successfully"})
    except Exception as e:
        logger.exception('auth_update_organization_status error')
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/auth/organizations/owner', methods=['POST'])
def auth_create_organization_owner():
    try:
        actor = _request_actor_user()
        if not actor:
            return jsonify({"status": "error", "message": "Unauthorized"}), 401

        actor_role = str(actor.get('role') or '').strip().lower()
        if actor_role != 'admin':
            return jsonify({"status": "error", "message": "Only admin can create organization owners"}), 403

        payload = request.get_json(silent=True) or {}
        organization_name = (payload.get('organization_name') or '').strip()
        organization_code = (payload.get('organization_code') or '').strip() or None
        email = (payload.get('email') or '').strip()
        username = (payload.get('username') or '').strip() or None
        display_name = (payload.get('display_name') or '').strip() or None
        password = str(payload.get('password') or '')

        if not organization_name or not email or not password:
            return jsonify({"status": "error", "message": "organization_name, email and password are required"}), 400

        # Create the organization first
        logger.info(f"Creating organization '{organization_name}'...")
        org = _resolve_or_create_organization(organization_name, organization_code, owner_email=email)
        
        if not org:
            logger.error(f"Failed to create organization '{organization_name}'")
            return jsonify({
                "status": "error", 
                "message": "Failed to create organization. The organization code may already exist. Please try again with a different name."
            }), 500
        
        org_id = org.get('id')
        org_name = org.get('name')
        org_code_result = org.get('code')
        
        logger.info(f"Organization created/found: id={org_id}, name={org_name}, code={org_code_result}")
        
        # Now create the owner user
        logger.info(f"Creating owner user '{email}' for organization '{org_name}'...")
        created = _create_access_user(
            email=email,
            username=username,
            display_name=display_name,
            password=password,
            role='owner',
            organization_id=org_id,
            organization_name=org_name,
        )
        
        if not created:
            logger.error(f"Failed to create owner user '{email}'")
            # If user creation fails, we should clean up the organization
            try:
                client = _get_supabase_client()
                if client:
                    client.table(SUPABASE_ORGANIZATIONS_TABLE).delete().eq('id', org_id).execute()
                    logger.info(f"Cleaned up organization '{org_id}' after failed user creation")
            except:
                pass
            return jsonify({
                "status": "error", 
                "message": "Failed to create owner account. Please try again."
            }), 500

        logger.info(f"✅ Successfully created organization '{org_name}' with owner '{email}'")

        return jsonify({
            "status": "success",
            "message": "Organization and owner created successfully",
            "data": {
                "organization": {
                    "id": org_id,
                    "name": org_name,
                    "code": org_code_result,
                    "is_active": org.get('is_active', True),
                    "created_at": org.get('created_at'),
                },
                "owner": {
                    "id": created.get('id'),
                    "email": created.get('email'),
                    "username": created.get('username'),
                    "display_name": created.get('display_name'),
                    "role": created.get('role'),
                    "organization_id": created.get('organization_id'),
                    "organization_name": created.get('organization_name'),
                }
            }
        })
    except Exception as e:
        logger.exception('auth_create_organization_owner error')
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/auth/members', methods=['POST'])
def auth_create_member():
    try:
        actor = _request_actor_user()
        if not actor:
            return jsonify({"status": "error", "message": "Unauthorized"}), 401

        actor_role = str(actor.get('role') or '').strip().lower()
        if actor_role not in ('admin', 'owner'):
            return jsonify({"status": "error", "message": "Only admin or owner can add members"}), 403

        payload = request.get_json(silent=True) or {}
        email = (payload.get('email') or '').strip()
        username = (payload.get('username') or '').strip() or None
        display_name = (payload.get('display_name') or '').strip() or None
        password = str(payload.get('password') or '')
        requested_role = str(payload.get('role') or 'operator').strip().lower()

        if not email or not password:
            return jsonify({"status": "error", "message": "email and password are required"}), 400

        if requested_role not in ('owner', 'manager', 'operator', 'viewer', 'admin'):
            return jsonify({"status": "error", "message": "Invalid role"}), 400

        if actor_role == 'owner' and requested_role in ('owner', 'admin'):
            return jsonify({"status": "error", "message": "Owner can add manager/operator/viewer only"}), 403

        actor_org_id = actor.get('organization_id')
        actor_org_name = actor.get('organization_name') or _fetch_organization_name(actor_org_id)

        organization_id = actor_org_id
        organization_name = actor_org_name

        if actor_role == 'admin':
            organization_id = payload.get('organization_id') or actor_org_id
            organization_name = payload.get('organization_name') or _fetch_organization_name(organization_id)
        elif actor_role == 'owner':
            organization = _fetch_organization(actor_org_id)
            if not _organization_is_upgraded(organization):
                member_count = _organization_member_count(actor_org_id)
                if member_count >= FREE_ORG_MEMBER_LIMIT:
                    return jsonify({
                        "status": "error",
                        "message": f"Free organizations can have up to {FREE_ORG_MEMBER_LIMIT} total members. Inactive accounts still count toward the limit. Upgrade for unlimited members.",
                        "code": "upgrade_required",
                        "data": {"member_limit": FREE_ORG_MEMBER_LIMIT}
                    }), 402

        if _fetch_access_user_by_identifier(email, organization_id=organization_id) is not None:
            return jsonify({"status": "error", "message": "An account with this email already exists in this organization"}), 409

        created = _create_access_user(
            email=email,
            username=username,
            display_name=display_name,
            password=password,
            role=requested_role,
            organization_id=organization_id,
            organization_name=organization_name,
        )
        if not created:
            return jsonify({"status": "error", "message": "Failed to create member"}), 500

        _send_member_account_event(
            created,
            'created',
            actor_name=actor.get('display_name') or actor.get('email'),
            is_active=created.get('is_active', True),
        )

        return jsonify({
            "status": "success",
            "message": "Member created",
            "data": {
                "member": {
                    "id": created.get('id'),
                    "email": created.get('email'),
                    "username": created.get('username'),
                    "display_name": created.get('display_name'),
                    "role": created.get('role'),
                    "organization_id": created.get('organization_id'),
                    "organization_name": created.get('organization_name'),
                    "is_active": created.get('is_active', True),
                }
            }
        })
    except Exception as e:
        logger.exception('auth_create_member error')
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/billing/status', methods=['GET'])
def billing_status():
    try:
        actor = _request_actor_user()
        if not actor:
            return jsonify({"status": "error", "message": "Unauthorized"}), 401

        organization = _fetch_organization(actor.get('organization_id'))
        if not organization:
            return jsonify({"status": "error", "message": "Organization not found"}), 404

        return jsonify({
            "status": "success",
            "data": {"billing": _organization_billing_payload(organization)}
        })
    except Exception as e:
        logger.exception('billing_status error')
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/billing/create-checkout-session', methods=['POST'])
def billing_create_checkout_session():
    try:
        payload = request.get_json(silent=True) or {}
        requested_origin = (payload.get('origin') or '').strip()
        # Normalize/validate origin
        if requested_origin and (requested_origin.startswith('http://') or requested_origin.startswith('https://')):
            frontend_origin = requested_origin.rstrip('/')
        else:
            frontend_origin = FRONTEND_BASE_URL

        logger.info(f'Using frontend origin for checkout: {frontend_origin}')

        actor = _request_actor_user()
        if not actor:
            return jsonify({"status": "error", "message": "Unauthorized"}), 401

        actor_role = str(actor.get('role') or '').strip().lower()
        if actor_role != 'owner':
            return jsonify({"status": "error", "message": "Only organization owners can upgrade"}), 403

        organization_id = actor.get('organization_id')
        organization = _fetch_organization(organization_id)
        if not organization:
            return jsonify({"status": "error", "message": "Organization not found"}), 404

        if _organization_is_upgraded(organization):
            return jsonify({
                "status": "success",
                "message": "Organization is already upgraded",
                "data": {"already_upgraded": True, "billing": _organization_billing_payload(organization)}
            })

        if stripe is None:
            return jsonify({"status": "error", "message": "Stripe package is not installed"}), 500
        if not STRIPE_SECRET_KEY or not STRIPE_UPGRADE_PRICE_ID:
            return jsonify({"status": "error", "message": "Stripe is not configured. Set STRIPE_SECRET_KEY and STRIPE_UPGRADE_PRICE_ID."}), 500

        checkout_session = stripe.checkout.Session.create(
            mode="subscription",
            payment_method_types=["card"],
            line_items=[{"price": STRIPE_UPGRADE_PRICE_ID, "quantity": 1}],
            customer_email=actor.get('email'),
            client_reference_id=str(organization_id),
            metadata={
                "organization_id": str(organization_id),
                "owner_email": str(actor.get('email') or ''),
            },
            subscription_data={
                "metadata": {
                    "organization_id": str(organization_id),
                    "owner_email": str(actor.get('email') or ''),
                }
            },
            success_url=f"{frontend_origin}/dashboard?upgrade=success&session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{frontend_origin}/dashboard?upgrade=cancelled",
        )

        logger.info(f'Checkout session created: id={getattr(checkout_session, "id", None)} url={getattr(checkout_session, "url", None)}')
        return jsonify({
            "status": "success",
            "data": {"checkout_url": checkout_session.url, "checkout_id": getattr(checkout_session, 'id', None)}
        })
    except Exception as e:
        logger.exception('billing_create_checkout_session error')
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/billing/checkout/confirm', methods=['POST'])
def billing_confirm_checkout():
    try:
        actor = _request_actor_user()
        if not actor:
            return jsonify({"status": "error", "message": "Unauthorized"}), 401

        actor_role = str(actor.get('role') or '').strip().lower()
        if actor_role != 'owner':
            return jsonify({"status": "error", "message": "Only organization owners can confirm upgrades"}), 403

        payload = request.get_json(silent=True) or {}
        session_id = str(payload.get('session_id') or '').strip()
        logger.info(f'billing_confirm_checkout called by actor={actor.get("email")}, session_id={session_id}')
        if not session_id:
            return jsonify({"status": "error", "message": "session_id is required"}), 400

        if stripe is None or not STRIPE_SECRET_KEY:
            return jsonify({"status": "error", "message": "Stripe is not configured"}), 500

        checkout_session = stripe.checkout.Session.retrieve(session_id)
        # Convert Stripe metadata object to dict for safe .get() access
        metadata_dict = dict(checkout_session.metadata) if checkout_session.metadata else {}
        session_org_id = str(metadata_dict.get('organization_id') or checkout_session.client_reference_id or '')
        actor_org_id = str(actor.get('organization_id') or '')

        if session_org_id != actor_org_id:
            return jsonify({"status": "error", "message": "Checkout session does not belong to this organization"}), 403

        if checkout_session.payment_status != 'paid' and checkout_session.status != 'complete':
            return jsonify({"status": "error", "message": "Payment is not complete yet"}), 409

        upgraded = _mark_organization_upgraded(
            actor_org_id,
            stripe_customer_id=getattr(checkout_session, 'customer', None),
            stripe_checkout_session_id=checkout_session.id,
        )
        logger.info(f'Organization upgrade marked: org_id={actor_org_id}, success={upgraded}')
        
        # Fetch updated organization; if network fails, still return success since upgrade was marked
        organization = None
        try:
            organization = _fetch_organization(actor_org_id)
        except Exception as e:
            logger.warning(f'Failed to fetch updated organization after upgrade: {str(e)}')
            # Return success anyway since the upgrade was marked in the database
            return jsonify({
                "status": "success",
                "message": "Organization upgraded (fetch failed but upgrade marked)",
                "data": {"billing": {"plan": "premium", "is_upgraded": True}}
            })

        return jsonify({
            "status": "success",
            "message": "Organization upgraded",
            "data": {"billing": _organization_billing_payload(organization)}
        })
    except Exception as e:
        logger.exception('billing_confirm_checkout error')
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/billing/webhook', methods=['POST'])
def billing_webhook():
    try:
        if stripe is None or not STRIPE_WEBHOOK_SECRET:
            return jsonify({"status": "error", "message": "Stripe webhook is not configured"}), 500

        payload = request.get_data()
        signature = request.headers.get('Stripe-Signature', '')

        try:
            event = stripe.Webhook.construct_event(payload, signature, STRIPE_WEBHOOK_SECRET)
        except Exception as e:
            logger.warning('Invalid Stripe webhook: %s', e)
            return jsonify({"status": "error", "message": "Invalid webhook"}), 400

        event_type = _stripe_value(event, 'type')
        if event_type == 'checkout.session.completed':
            event_data = _stripe_value(event, 'data', {})
            checkout_session = _stripe_value(event_data, 'object')
            metadata = _stripe_value(checkout_session, 'metadata', {}) or {}
            organization_id = str(
                _stripe_value(metadata, 'organization_id', '')
                or _stripe_value(checkout_session, 'client_reference_id', '')
                or ''
            )
            if organization_id:
                upgraded = _mark_organization_upgraded(
                    organization_id,
                    stripe_customer_id=_stripe_value(checkout_session, 'customer'),
                    stripe_checkout_session_id=_stripe_value(checkout_session, 'id'),
                )
                if not upgraded:
                    logger.warning('Stripe webhook could not mark organization %s upgraded', organization_id)

        return jsonify({"status": "success"})
    except Exception:
        logger.exception('billing_webhook error')
        return jsonify({"status": "error", "message": "Webhook processing failed"}), 500


@app.route('/auth/members/<member_id>', methods=['DELETE'])
def auth_delete_member(member_id):
    try:
        actor = _request_actor_user()
        if not actor:
            return jsonify({"status": "error", "message": "Unauthorized"}), 401

        actor_role = str(actor.get('role') or '').strip().lower()
        actor_org_id = actor.get('organization_id')

        # Only admins and owners can delete members
        if actor_role not in ('admin', 'owner'):
            return jsonify({"status": "error", "message": "Only admin or owner can delete members"}), 403

        # Get Supabase client
        client = _get_supabase_client()
        if not client:
            return jsonify({"status": "error", "message": "Database unavailable"}), 500

        # Fetch the member to verify they exist and belong to the right org
        result = client.table('access_users').select('*').eq('id', member_id).execute()
        if not result.data or len(result.data) == 0:
            return jsonify({"status": "error", "message": "Member not found"}), 404

        member = result.data[0]
        member_org_id = member.get('organization_id')
        member_role = str(member.get('role') or '').strip().lower()

        # Owner can only delete members in their org
        if actor_role == 'owner' and actor_org_id != member_org_id:
            return jsonify({"status": "error", "message": "Cannot delete member from different organization"}), 403

        # Owner should not be able to delete themselves
        if actor_role == 'owner' and member.get('email') == actor.get('email'):
            return jsonify({"status": "error", "message": "Owner cannot delete their own account"}), 403

        # If an admin removes an owner, pause the whole organization and every account in it.
        if actor_role == 'admin' and member_role == 'owner' and member_org_id:
            client.table(SUPABASE_ORGANIZATIONS_TABLE).update({'is_active': False}).eq('id', member_org_id).execute()
            client.table(SUPABASE_ACCESS_USERS_TABLE).update({'is_active': False}).eq('organization_id', member_org_id).execute()
            logger.info(f"Organization {member_org_id} deactivated because owner {member_id} was removed by {actor.get('email')}")
            return jsonify({
                "status": "success",
                "message": "Organization owner deactivated and organization access revoked"
            })

        # Delete the member
        _send_member_account_event(
            member,
            'deleted',
            actor_name=actor.get('display_name') or actor.get('email'),
            is_active=False,
        )
        client.table('access_users').delete().eq('id', member_id).execute()
        logger.info(f"Member {member_id} deleted by {actor.get('email')}")

        return jsonify({
            "status": "success",
            "message": "Member deleted successfully"
        })
    except Exception as e:
        logger.exception('auth_delete_member error')
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/auth/members/<member_id>/status', methods=['PATCH'])
def auth_update_member_status(member_id):
    try:
        actor = _request_actor_user()
        if not actor:
            return jsonify({"status": "error", "message": "Unauthorized"}), 401

        actor_role = str(actor.get('role') or '').strip().lower()
        actor_org_id = actor.get('organization_id')
        actor_email = str(actor.get('email') or '').strip().lower()

        if actor_role not in ('admin', 'owner'):
            return jsonify({"status": "error", "message": "Only admin or owner can update member status"}), 403

        payload = request.get_json(silent=True) or {}
        if 'is_active' not in payload:
            return jsonify({"status": "error", "message": "is_active is required"}), 400

        is_active = bool(payload.get('is_active'))

        client = _get_supabase_client()
        if not client:
            return jsonify({"status": "error", "message": "Database unavailable"}), 500

        result = client.table(SUPABASE_ACCESS_USERS_TABLE).select('*').eq('id', member_id).limit(1).execute()
        if not result.data:
            return jsonify({"status": "error", "message": "Member not found"}), 404

        member = result.data[0]
        member_org_id = member.get('organization_id')
        member_role = str(member.get('role') or '').strip().lower()
        member_email = str(member.get('email') or '').strip().lower()

        if actor_role == 'owner' and actor_org_id != member_org_id:
            return jsonify({"status": "error", "message": "Cannot update status for a different organization"}), 403

        if actor_role == 'owner' and member_email == actor_email:
            return jsonify({"status": "error", "message": "Owner cannot change their own account status"}), 403

        # Admin pausing/resuming an owner controls the entire organization.
        if actor_role == 'admin' and member_role == 'owner' and member_org_id:
            client.table(SUPABASE_ORGANIZATIONS_TABLE).update({'is_active': is_active}).eq('id', member_org_id).execute()
            client.table(SUPABASE_ACCESS_USERS_TABLE).update({'is_active': is_active}).eq('organization_id', member_org_id).execute()
            action = 'resumed' if is_active else 'paused'
            logger.info(f"Organization {member_org_id} {action} because owner status changed by {actor.get('email')}")
            return jsonify({
                "status": "success",
                "message": f"Organization access {action} successfully"
            })

        client.table(SUPABASE_ACCESS_USERS_TABLE).update({'is_active': is_active}).eq('id', member_id).execute()
        _send_member_account_event(
            {**member, 'is_active': is_active},
            'status_changed',
            actor_name=actor.get('display_name') or actor.get('email'),
            is_active=is_active,
        )
        state_text = 'activated' if is_active else 'deactivated'
        return jsonify({
            "status": "success",
            "message": f"Member {state_text} successfully"
        })
    except Exception as e:
        logger.exception('auth_update_member_status error')
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/dashboard-overview', methods=['GET'])
def dashboard_overview():
    try:
        company_id = _get_request_company_id()
        company_name = (request.headers.get('X-Company-Name') or '').strip() or None
        today_prefix = datetime.now(timezone.utc).date().isoformat()

        # Org-scoped overview comes from Supabase only; local filesystem fallback is disabled.
        residents = []
        total_images = 0
        total_faces = 0
        active_res = 0
        enrollments_today = 0

        if company_id:
            try:
                client = _get_supabase_client()
                if client is not None:
                    residents_result = (
                        client.table(SUPABASE_RESIDENTS_TABLE)
                        .select('*')
                        .eq('organization_id', company_id)
                        .order('enrolled_at', desc=True)
                        .execute()
                    )
                    residents = residents_result.data or []
                    for resident in residents:
                        total_images += int(resident.get('image_count', 0) or 0)
                        total_faces += int(resident.get('faces_detected', 0) or 0)
                        if str(resident.get('status', 'Active')) == 'Active':
                            active_res += 1
                        if str(resident.get('enrolled_at', '')).startswith(today_prefix):
                            enrollments_today += 1

                    if total_images == 0:
                        total_images = _count_resident_images_supabase(company_id=company_id, company_name=company_name)
                    if total_faces == 0:
                        total_faces = _count_resident_images_supabase(company_id=company_id, company_name=company_name)
            except Exception:
                logger.exception("dashboard_overview resident fetch error")

        face_logs_data = read_face_logs(company_id=company_id, company_name=company_name)
        helmet_logs_data = read_helmet_logs(company_id=company_id, company_name=company_name)
        mask_logs_data = read_mask_logs(company_id=company_id, company_name=company_name)

        helmet_today = sum(1 for l in helmet_logs_data if str(l.get('timestamp', '')).startswith(today_prefix))
        mask_today   = sum(1 for l in mask_logs_data   if str(l.get('timestamp', '')).startswith(today_prefix))

        recent_logs = sorted(face_logs_data, key=lambda x: x.get('timestamp', ''), reverse=True)[:10]
        recent = []
        for entry in recent_logs:
            name    = entry.get('name') or 'Unknown'
            cnic    = entry.get('cnic')
            subject = f"{name} ({cnic})" if cnic else name
            recent.append({
                "type":    "Face Recognition",
                "message": f"{entry.get('status', 'Unknown')}: {subject}",
                "time":    entry.get('timestamp', ''),
            })

        return jsonify({
            "status": "success",
            "data": {
                "residentsTotal":        len(residents),
                "activeResidents":       active_res,
                "totalImages":           total_images,
                "totalFacesDetected":    total_faces,
                "enrollmentsToday":      enrollments_today,
                "helmetDetectionsTotal": len(helmet_logs_data),
                "helmetDetectionsToday": helmet_today,
                "maskDetectionsTotal":   len(mask_logs_data),
                "maskDetectionsToday":   mask_today,
                "safetyDetectionsTotal": len(helmet_logs_data) + len(mask_logs_data),
                "safetyDetectionsToday": helmet_today + mask_today,
                "recentActivity":        recent,
            }
        })
    except Exception as e:
        logger.exception("dashboard_overview error")
        return jsonify({"status": "error", "message": str(e)}), 500


# ==============================================================================
# REGISTER ROUTE BLUEPRINTS
# ==============================================================================

register_face_routes(app, {
    "logger": logger,
    "UPLOAD_FOLDER": UPLOAD_FOLDER,
    "SUPABASE_STORAGE_BUCKET": SUPABASE_STORAGE_BUCKET,
    "_detect_faces_insightface": _detect_faces_insightface,
    "_get_embedding_insightface": _get_embedding_insightface,
    "_find_duplicate_resident": _find_duplicate_resident,
    "append_face_log": append_face_log,
    "read_face_logs": read_face_logs,
    "_persist_detection_image": _persist_detection_image,
    "_attach_storage_result_to_log": _attach_storage_result_to_log,
    "_should_store_stream_event": _should_store_stream_event,
    "_insert_resident_supabase": _insert_resident_supabase,
    "_insert_resident_images_supabase": _insert_resident_images_supabase,
    "_read_all_residents_supabase": _read_all_residents_supabase,
    "_read_resident_supabase": _read_resident_supabase,
    "_read_resident_images_supabase": _read_resident_images_supabase,
    "_resident_image_storage_path": _resident_image_storage_path,
    "_get_supabase_client": _get_supabase_client,
    "_delete_resident_supabase": _delete_resident_supabase,
    "_delete_storage_paths_from_supabase": _delete_storage_paths_from_supabase,
    "_update_resident_supabase": _update_resident_supabase,
    "_upload_local_file_to_supabase_storage": _upload_local_file_to_supabase_storage,
    "_check_enrollment_permission": _check_enrollment_permission,
    "_check_directory_permission": _check_directory_permission,
    "_check_capture_permission": _check_capture_permission,
    "_check_delete_permission": _check_delete_permission,
})

register_helmet_routes(app, {
    "logger": logger,
    "HELMET_UPLOAD_FOLDER": HELMET_UPLOAD_FOLDER,
    "detect_helmets_simple": detect_helmets_simple,
    "append_helmet_log": append_helmet_log,
    "read_helmet_logs": read_helmet_logs,
    "_persist_detection_image": _persist_detection_image,
    "_attach_storage_result_to_log": _attach_storage_result_to_log,
    "_should_store_stream_event": _should_store_stream_event,
    "_check_capture_permission": _check_capture_permission,
})

register_mask_routes(app, {
    "logger": logger,
    "MASK_UPLOAD_FOLDER": MASK_UPLOAD_FOLDER,
    "detect_masks_core": detect_masks_core,
    "append_mask_log": append_mask_log,
    "read_mask_logs": read_mask_logs,
    "summarize_mask_logs": summarize_mask_logs,
    "_persist_detection_image": _persist_detection_image,
    "_attach_storage_result_to_log": _attach_storage_result_to_log,
    "_should_store_stream_event": _should_store_stream_event,
    "_check_capture_permission": _check_capture_permission,
})

register_email_service(app, {
    "logger": logger,
    "_get_supabase_client": _get_supabase_client,
    "_fetch_organization_name": _fetch_organization_name,
    "_read_all_residents_supabase": _read_all_residents_supabase,
    "_read_face_logs": read_face_logs,
    "_read_helmet_logs": read_helmet_logs,
    "_read_mask_logs": read_mask_logs,
})


# ==============================================================================
# STARTUP: EAGER MODEL WARM-UP
# ==============================================================================

def _eager_load_blocking():
    """Load and warm up all models synchronously. Called before app.run()."""
    errors = []

    logger.info("=" * 60)
    logger.info("STARTUP: loading models (blocking until complete) …")
    logger.info("=" * 60)

    try:
        load_helmet_model()
        logger.info("✅ Helmet model loaded and warmed up.")
    except Exception as e:
        logger.error(f"❌ Helmet model failed to load: {e}")
        errors.append(f"Helmet: {e}")

    try:
        load_mask_model()
        logger.info("✅ Mask model loaded and warmed up.")
    except Exception as e:
        logger.error(f"❌ Mask model failed to load: {e}")
        errors.append(f"Mask: {e}")

    try:
        load_insight_app()
        logger.info("✅ InsightFace loaded.")
    except Exception as e:
        logger.error(f"❌ InsightFace failed to load: {e}")
        errors.append(f"InsightFace: {e}")

    if errors:
        logger.warning(f"Startup completed with {len(errors)} error(s): {errors}")
    else:
        logger.info("=" * 60)
        logger.info("All models ready — Flask is now accepting requests.")
        logger.info("=" * 60)


# ==============================================================================
# DEBUG ENDPOINT
# ==============================================================================

@app.route('/debug-supabase-status', methods=['GET'])
def debug_supabase_status():
    env_vars = {
        "SUPABASE_ENABLED":          os.environ.get('SUPABASE_ENABLED'),
        "SUPABASE_URL":              (os.environ.get('SUPABASE_URL', '')[:50] + "...") if os.environ.get('SUPABASE_URL') else "NOT SET",
        "SUPABASE_SERVICE_ROLE_KEY": "SET" if os.environ.get('SUPABASE_SERVICE_ROLE_KEY') else "NOT SET",
        "SUPABASE_FACE_TABLE":       os.environ.get('SUPABASE_FACE_TABLE'),
    }
    client = _get_supabase_client()
    manual_client = None
    manual_error  = None
    try:
        if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY:
            manual_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    except Exception as e:
        manual_error = str(e)

    return jsonify({
        "environment_variables":  env_vars,
        "client_from_function":   client is not None,
        "manual_client_created":  manual_client is not None,
        "manual_client_error":    manual_error,
        "SUPABASE_ENABLED_VALUE": SUPABASE_ENABLED,
        "create_client_imported": create_client is not None,
        "model_status": {
            "helmet_loaded":      HELMET_MODEL is not None,
            "mask_loaded":        MASK_MODEL is not None,
            "insightface_loaded": INSIGHT_APP is not None,
        }
    })


@app.route('/health', methods=['GET'])
def health():
    """Quick liveness + model readiness check."""
    return jsonify({
        "status": "ok",
        "models": {
            "helmet":      HELMET_MODEL is not None,
            "mask":        MASK_MODEL is not None,
            "insightface": INSIGHT_APP is not None,
        }
    })


# ==============================================================================
# ENTRY POINT
# ==============================================================================

if __name__ == '__main__':
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "test":
        _eager_load_blocking()
        sys.exit(0)

    _eager_load_blocking()
    app.run(debug=False, host='0.0.0.0', port=5000)