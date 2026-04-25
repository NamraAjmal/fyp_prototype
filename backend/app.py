# from flask import Flask, jsonify
# from flask_cors import CORS
# import os
# import numpy as np
# from datetime import datetime
# import json
# import logging
# import threading
# from uuid import uuid4
# import cv2
# from ultralytics import YOLO
# import torch
# import base64
# import time
# try:
#     from dotenv import load_dotenv
# except Exception:
#     load_dotenv = None
# try:
#     from supabase import create_client  # type: ignore[import-not-found]
# except Exception:
#     create_client = None

# # ── InsightFace ───────────────────────────────────────────────────────────────
# from insightface.app import FaceAnalysis
# from face_routes import register_face_routes
# from helmet_routes import register_helmet_routes
# from mask_routes import register_mask_routes

# # App setup
# app = Flask(__name__)
# CORS(app)

# if load_dotenv is not None:
#     load_dotenv()

# # Logging
# logging.basicConfig(level=logging.INFO)
# logger = logging.getLogger("face-recog-helmet")

# # Paths / config
# BASE_DIR = os.path.dirname(__file__)
# UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
# os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# # ── Face recognition config ───────────────────────────────────────────────────
# ENCODING_DTYPE = np.float32
# FACE_DUPLICATE_SIMILARITY_THRESHOLD = float(os.environ.get('FACE_DUPLICATE_SIMILARITY_THRESHOLD', 0.45))
# BATCH_DUPLICATE_SIMILARITY_THRESHOLD = float(os.environ.get('BATCH_DUPLICATE_SIMILARITY_THRESHOLD', 0.98))
# FACE_DETECT_CONF = float(os.environ.get('FACE_DETECT_CONF', 0.5))

# # Global model handles (loaded lazily / eagerly at startup)
# INSIGHT_APP   = None        # InsightFace recognition

# # ── Helmet paths ──────────────────────────────────────────────────────────────
# HELMET_UPLOAD_FOLDER = os.path.join(UPLOAD_FOLDER, 'helmet_detections')
# os.makedirs(HELMET_UPLOAD_FOLDER, exist_ok=True)
# HELMET_LOG_PATH  = os.path.join(HELMET_UPLOAD_FOLDER, 'helmet_logs.json')
# HELMET_LOG_LOCK  = threading.Lock()
# HELMET_CONF_THRESHOLD = float(os.environ.get('HELMET_CONF_THRESHOLD', 0.25))
# HELMET_MODEL = None

# # ── Mask paths ────────────────────────────────────────────────────────────────
# MASK_UPLOAD_FOLDER = os.path.join(UPLOAD_FOLDER, 'mask_detections')
# os.makedirs(MASK_UPLOAD_FOLDER, exist_ok=True)
# MASK_LOG_PATH  = os.path.join(MASK_UPLOAD_FOLDER, 'mask_logs.json')
# MASK_LOG_LOCK  = threading.Lock()

# def _env_flag(name: str, default: bool = False) -> bool:
#     value = os.environ.get(name)
#     if value is None:
#         return default
#     return value.strip().lower() in {'1', 'true', 'yes', 'on'}


# # ── Supabase config (optional, backend-only) ─────────────────────────────────
# SUPABASE_ENABLED = _env_flag('SUPABASE_ENABLED', False)
# SUPABASE_URL = os.environ.get('SUPABASE_URL', '').strip()
# SUPABASE_SERVICE_ROLE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '').strip()
# SUPABASE_HELMET_TABLE = os.environ.get('SUPABASE_HELMET_TABLE', 'helmet_logs').strip() or 'helmet_logs'
# SUPABASE_MASK_TABLE = os.environ.get('SUPABASE_MASK_TABLE', 'mask_logs').strip() or 'mask_logs'
# SUPABASE_FACE_TABLE = os.environ.get('SUPABASE_FACE_TABLE', 'face_logs').strip() or 'face_logs'
# SUPABASE_STORAGE_BUCKET = os.environ.get('SUPABASE_STORAGE_BUCKET', 'fyp-assets').strip() or 'fyp-assets'
# SUPABASE_RESIDENT_IMAGES_PREFIX = os.environ.get('SUPABASE_RESIDENT_IMAGES_PREFIX', 'residents').strip() or 'residents'
# SUPABASE_DETECTIONS_PREFIX = os.environ.get('SUPABASE_DETECTIONS_PREFIX', 'detections').strip() or 'detections'
# STREAM_EVENT_WINDOW_SECONDS = max(int(os.environ.get('STREAM_EVENT_WINDOW_SECONDS', 5)), 1)

# _SUPABASE_CLIENT = None
# _SUPABASE_INIT_ATTEMPTED = False
# _SUPABASE_CLIENT_LOCK = threading.Lock()
# STREAM_EVENT_STATE = {}


# def _get_supabase_client():
#     global _SUPABASE_CLIENT
#     global _SUPABASE_INIT_ATTEMPTED

#     if not SUPABASE_ENABLED:
#         return None
#     if create_client is None:
#         logger.warning('Supabase is enabled but supabase package is not installed')
#         return None
#     if _SUPABASE_INIT_ATTEMPTED:
#         return _SUPABASE_CLIENT

#     with _SUPABASE_CLIENT_LOCK:
#         if _SUPABASE_INIT_ATTEMPTED:
#             return _SUPABASE_CLIENT

#         _SUPABASE_INIT_ATTEMPTED = True
#         if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
#             logger.warning('Supabase is enabled but SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing')
#             return None

#         try:
#             _SUPABASE_CLIENT = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
#             logger.info('Supabase client initialized')
#         except Exception:
#             logger.exception('Failed to initialize Supabase client')
#             _SUPABASE_CLIENT = None
#         return _SUPABASE_CLIENT


# def _supabase_payload_from_log(log_entry):
#     payload = dict(log_entry)
#     if 'id' in payload:
#         payload['local_id'] = payload.pop('id')
#     return payload


# def _append_supabase_log(table_name, log_entry):
#     client = _get_supabase_client()
#     if client is None:
#         return

#     try:
#         payload = _supabase_payload_from_log(log_entry)
#         annotated_image_url = payload.get('annotated_image_url')
#         if annotated_image_url:
#             payload['annotated_image'] = annotated_image_url
#         payload.pop('annotated_image_url', None)
#         client.table(table_name).insert(payload).execute()
#     except Exception:
#         logger.exception('Supabase insert failed for table %s', table_name)


# def _read_supabase_logs(table_name, limit=5000):
#     client = _get_supabase_client()
#     if client is None:
#         return None

#     try:
#         response = client.table(table_name).select('*').order('timestamp', desc=True).limit(limit).execute()
#         rows = response.data or []
#         normalized = []
#         for row in rows:
#             item = dict(row)
#             if 'id' not in item and 'local_id' in item:
#                 item['id'] = item.get('local_id')
#             normalized.append(item)
#         return normalized
#     except Exception:
#         logger.exception('Supabase read failed for table %s', table_name)
#         return None


# def _upload_bytes_to_supabase_storage(storage_path, file_bytes, content_type='application/octet-stream'):
#     client = _get_supabase_client()
#     if client is None or not storage_path or file_bytes is None:
#         return None

#     try:
#         bucket = client.storage.from_(SUPABASE_STORAGE_BUCKET)
#         bucket.upload(
#             path=storage_path,
#             file=file_bytes,
#             file_options={"content-type": content_type},
#         )
#         return {
#             "storage_path": storage_path,
#             "public_url": bucket.get_public_url(storage_path),
#         }
#     except Exception:
#         logger.exception('Supabase storage upload failed for %s', storage_path)
#         return None


# def _upload_local_file_to_supabase_storage(storage_path, file_path, content_type='image/jpeg'):
#     try:
#         with open(file_path, 'rb') as f:
#             return _upload_bytes_to_supabase_storage(storage_path, f.read(), content_type=content_type)
#     except Exception:
#         logger.exception('Failed to read local file for storage upload: %s', file_path)
#         return None


# def _upload_data_url_to_supabase_storage(storage_path, data_url, content_type='image/jpeg'):
#     if not data_url:
#         return None

#     raw_value = data_url
#     if isinstance(raw_value, str) and raw_value.startswith('data:') and ',' in raw_value:
#         header, raw_value = raw_value.split(',', 1)
#         if ';base64' in header and header.startswith('data:'):
#             mime_part = header[5:].split(';', 1)[0]
#             if mime_part:
#                 content_type = mime_part

#     try:
#         if isinstance(raw_value, str):
#             file_bytes = base64.b64decode(raw_value)
#         else:
#             file_bytes = raw_value
#         return _upload_bytes_to_supabase_storage(storage_path, file_bytes, content_type=content_type)
#     except Exception:
#         logger.exception('Failed to decode annotated image for storage upload: %s', storage_path)
#         return None


# def _delete_storage_paths_from_supabase(storage_paths):
#     client = _get_supabase_client()
#     if client is None or not storage_paths:
#         return
#     try:
#         client.storage.from_(SUPABASE_STORAGE_BUCKET).remove(storage_paths)
#     except Exception:
#         logger.exception('Supabase storage delete failed for %s paths', len(storage_paths))


# def _should_store_stream_event(module_name, camera_id, event_signature):
#     state_key = f'{module_name}:{camera_id or "default"}'
#     now = time.monotonic()
#     previous = STREAM_EVENT_STATE.get(state_key)
#     if previous is None:
#         STREAM_EVENT_STATE[state_key] = {"timestamp": now, "signature": event_signature}
#         return True

#     if previous.get('signature') != event_signature or (now - previous.get('timestamp', now)) >= STREAM_EVENT_WINDOW_SECONDS:
#         STREAM_EVENT_STATE[state_key] = {"timestamp": now, "signature": event_signature}
#         return True

#     return False


# def _resident_image_storage_path(cnic, filename):
#     return f"{SUPABASE_RESIDENT_IMAGES_PREFIX}/{cnic}/{filename}"


# def _detection_image_storage_path(module_name, camera_id, suffix='jpg'):
#     camera_part = camera_id or 'default'
#     return f"{SUPABASE_DETECTIONS_PREFIX}/{module_name}/{camera_part}/{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{uuid4().hex[:8]}.{suffix.lstrip('.')}"


# def _persist_detection_image(module_name, camera_id, annotated_image, suffix='jpg'):
#     if not annotated_image:
#         return None

#     storage_path = _detection_image_storage_path(module_name, camera_id, suffix=suffix)
#     storage_result = _upload_data_url_to_supabase_storage(storage_path, annotated_image, content_type='image/jpeg')
#     if storage_result is None:
#         return None
#     return storage_result


# def _attach_storage_result_to_log(log_entry, storage_result):
#     if not storage_result:
#         return log_entry

#     enriched = dict(log_entry)
#     enriched['annotated_image_url'] = storage_result.get('public_url')
#     enriched['annotated_image_path'] = storage_result.get('storage_path')
#     enriched['annotated_image'] = storage_result.get('public_url')
#     return enriched


# # ==============================================================================
# # SUPABASE RESIDENT CRUD FUNCTIONS  (optional, backend-only)
# # ==============================================================================

# SUPABASE_RESIDENTS_TABLE = os.environ.get('SUPABASE_RESIDENTS_TABLE', 'residents').strip() or 'residents'
# SUPABASE_RESIDENT_IMAGES_TABLE = os.environ.get('SUPABASE_RESIDENT_IMAGES_TABLE', 'resident_images').strip() or 'resident_images'
# SUPABASE_RESIDENT_ENCODINGS_TABLE = os.environ.get('SUPABASE_RESIDENT_ENCODINGS_TABLE', 'resident_encodings').strip() or 'resident_encodings'


# def _insert_resident_supabase(resident_data):
#     """Insert a resident into Supabase and return the inserted data"""
#     client = _get_supabase_client()
#     if client is None:
#         logger.error("Supabase client not available")
#         return None
    
#     try:
#         # Remove any fields that don't exist in the residents table
#         clean_payload = {k: v for k, v in resident_data.items() 
#                         if k not in ['encodings_saved', 'faces_detected', 'image_count', 'images']}
        
#         logger.info(f"Inserting resident with payload: {clean_payload}")
#         result = client.table(SUPABASE_RESIDENTS_TABLE).insert(clean_payload).execute()
        
#         # Check if result has data
#         if result and hasattr(result, 'data') and result.data:
#             logger.info(f"Resident {resident_data.get('cnic')} inserted to Supabase")
#             return result.data[0]
#         else:
#             logger.error(f"Insert succeeded but no data returned for {resident_data.get('cnic')}")
#             # Try to fetch the inserted record
#             try:
#                 fetch_result = client.table(SUPABASE_RESIDENTS_TABLE).select("*").eq("cnic", resident_data.get('cnic')).execute()
#                 if fetch_result and fetch_result.data:
#                     logger.info(f"Successfully fetched inserted resident: {resident_data.get('cnic')}")
#                     return fetch_result.data[0]
#             except Exception as fetch_err:
#                 logger.error(f"Failed to fetch inserted resident: {str(fetch_err)}")
#             return None
            
#     except Exception as e:
#         logger.exception(f"Supabase insert failed for resident {resident_data.get('cnic')}")
#         return None


# def _update_resident_supabase(cnic, updates):
#     client = _get_supabase_client()
#     if client is None:
#         return
#     try:
#         client.table(SUPABASE_RESIDENTS_TABLE).update(updates).eq('cnic', cnic).execute()
#         logger.info(f"Resident {cnic} updated in Supabase")
#     except Exception:
#         logger.exception(f"Supabase update failed for resident {cnic}")


# def _delete_resident_supabase(cnic):
#     client = _get_supabase_client()
#     if client is None:
#         return
#     try:
#         client.table(SUPABASE_RESIDENTS_TABLE).delete().eq('cnic', cnic).execute()
#         logger.info(f"Resident {cnic} deleted from Supabase")
#     except Exception:
#         logger.exception(f"Supabase delete failed for resident {cnic}")


# def _read_resident_supabase(cnic):
#     client = _get_supabase_client()
#     if client is None:
#         return None
#     try:
#         response = client.table(SUPABASE_RESIDENTS_TABLE).select('*').eq('cnic', cnic).single().execute()
#         return response.data if response.data else None
#     except Exception:
#         logger.exception(f"Supabase read failed for resident {cnic}")
#         return None


# def _read_all_residents_supabase():
#     client = _get_supabase_client()
#     if client is None:
#         return None
#     try:
#         response = client.table(SUPABASE_RESIDENTS_TABLE).select('*').order('enrolled_at', desc=True).execute()
#         return response.data or [] if response.data is not None else None
#     except Exception:
#         logger.exception("Supabase read failed for all residents")
#         return None


# def _insert_resident_images_supabase(cnic, images_list):
#     client = _get_supabase_client()
#     if client is None:
#         return
#     try:
#         payloads = [
#             {
#                 "cnic": cnic,
#                 "filename": img_info.get("filename"),
#                 "file_hash": img_info.get("file_hash"),
#                 "file_size": img_info.get("file_size"),
#                 "storage_path": img_info.get("storage_path"),
#                 "public_url": img_info.get("public_url"),
#             }
#             for img_info in images_list
#         ]
#         if payloads:
#             client.table(SUPABASE_RESIDENT_IMAGES_TABLE).insert(payloads).execute()
#             logger.info(f"Inserted {len(payloads)} images for resident {cnic}")
#     except Exception:
#         logger.exception(f"Supabase insert images failed for resident {cnic}")


# def _read_resident_images_supabase(cnic):
#     client = _get_supabase_client()
#     if client is None:
#         return None
#     try:
#         response = (
#             client.table(SUPABASE_RESIDENT_IMAGES_TABLE)
#             .select('filename,storage_path,public_url')
#             .eq('cnic', cnic)
#             .order('created_at', desc=False)
#             .execute()
#         )
#         return response.data or []
#     except Exception:
#         logger.exception(f"Supabase read failed for resident images {cnic}")
#         return None


# def _insert_resident_encodings_supabase(cnic, encodings_data):
#     client = _get_supabase_client()
#     if client is None:
#         return
#     try:
#         if isinstance(encodings_data, list) and len(encodings_data) > 0:
#             payloads = []
#             for idx, enc in enumerate(encodings_data):
#                 enc_list = enc.tolist() if hasattr(enc, 'tolist') else enc
#                 payloads.append({
#                     "cnic": cnic,
#                     "encoding_data": enc_list,
#                     "image_filename": f"image_{idx+1}.jpg"
#                 })
#             if payloads:
#                 client.table(SUPABASE_RESIDENT_ENCODINGS_TABLE).insert(payloads).execute()
#                 logger.info(f"Inserted {len(payloads)} encodings for resident {cnic}")
#     except Exception:
#         logger.exception(f"Supabase insert encodings failed for resident {cnic}")


# def _read_resident_encodings_supabase(exclude_cnic=None):
#     client = _get_supabase_client()
#     if client is None:
#         return []
#     try:
#         response = (
#             client.table(SUPABASE_RESIDENT_ENCODINGS_TABLE)
#             .select('cnic,encoding_data')
#             .execute()
#         )
#         rows = response.data or []
#         grouped = {}
#         for row in rows:
#             cnic = str(row.get('cnic') or '').strip()
#             if not cnic:
#                 continue
#             if exclude_cnic and cnic == exclude_cnic:
#                 continue

#             encoding_data = row.get('encoding_data')
#             if not isinstance(encoding_data, list) or not encoding_data:
#                 continue

#             try:
#                 encoding = normalize(np.asarray(encoding_data, dtype=np.float32))
#             except Exception:
#                 continue

#             if cnic not in grouped:
#                 resident_name = cnic
#                 resident = _read_resident_supabase(cnic)
#                 if isinstance(resident, dict):
#                     resident_name = resident.get('name') or cnic
#                 grouped[cnic] = {
#                     'cnic': cnic,
#                     'name': resident_name,
#                     'encodings': [],
#                 }

#             grouped[cnic]['encodings'].append(encoding)

#         return list(grouped.values())
#     except Exception:
#         logger.exception('Supabase read failed for resident encodings')
#         return []


# MASK_CONF_THRESHOLD  = float(os.environ.get('MASK_CONF_THRESHOLD', 0.35))
# MASK_IOU_THRESHOLD   = float(os.environ.get('MASK_IOU_THRESHOLD', 0.5))
# MASK_UPLOAD_IMGSZ    = int(os.environ.get('MASK_UPLOAD_IMGSZ', 960))
# MASK_STREAM_IMGSZ    = int(os.environ.get('MASK_STREAM_IMGSZ', MASK_UPLOAD_IMGSZ))
# MASK_MAX_DET         = int(os.environ.get('MASK_MAX_DET', 200))
# MASK_UPLOAD_TTA      = _env_flag('MASK_UPLOAD_TTA', False)
# MASK_STREAM_TTA      = _env_flag('MASK_STREAM_TTA', False)
# MASK_MODEL_PATH_ENV  = os.environ.get('MASK_MODEL_PATH', '').strip()
# MASK_MODEL = None

# logger.info("Starting Flask server — InsightFace + Helmet + Mask …")


# # ==============================================================================
# # HELMET LOG UTILITIES  (unchanged)
# # ==============================================================================

# def _read_helmet_logs_unlocked():
#     if not os.path.exists(HELMET_LOG_PATH):
#         return []
#     try:
#         with open(HELMET_LOG_PATH, 'r') as f:
#             logs = json.load(f)
#         return logs if isinstance(logs, list) else []
#     except Exception:
#         logger.exception("Failed reading helmet logs; resetting log store")
#         return []

# def _write_helmet_logs_unlocked(logs):
#     temp_path = f"{HELMET_LOG_PATH}.tmp"
#     with open(temp_path, 'w') as f:
#         json.dump(logs, f, indent=2)
#     os.replace(temp_path, HELMET_LOG_PATH)

# def append_helmet_log(log_entry):
#     with HELMET_LOG_LOCK:
#         logs = _read_helmet_logs_unlocked()
#         logs.append(log_entry)
#         if len(logs) > 1000:
#             logs = logs[-1000:]
#         _write_helmet_logs_unlocked(logs)
#     _append_supabase_log(SUPABASE_HELMET_TABLE, log_entry)

# def read_helmet_logs():
#     cloud_logs = _read_supabase_logs(SUPABASE_HELMET_TABLE)
#     return cloud_logs or []


# # ==============================================================================
# # MASK LOG UTILITIES  (unchanged)
# # ==============================================================================

# def _read_mask_logs_unlocked():
#     if not os.path.exists(MASK_LOG_PATH):
#         return []
#     try:
#         with open(MASK_LOG_PATH, 'r') as f:
#             logs = json.load(f)
#         return logs if isinstance(logs, list) else []
#     except Exception:
#         logger.exception("Failed reading mask logs; resetting log store")
#         return []

# def _write_mask_logs_unlocked(logs):
#     temp_path = f"{MASK_LOG_PATH}.tmp"
#     with open(temp_path, 'w') as f:
#         json.dump(logs, f, indent=2)
#     os.replace(temp_path, MASK_LOG_PATH)

# def append_mask_log(log_entry):
#     with MASK_LOG_LOCK:
#         logs = _read_mask_logs_unlocked()
#         logs.append(log_entry)
#         if len(logs) > 1000:
#             logs = logs[-1000:]
#         _write_mask_logs_unlocked(logs)
#     _append_supabase_log(SUPABASE_MASK_TABLE, log_entry)

# def read_mask_logs():
#     cloud_logs = _read_supabase_logs(SUPABASE_MASK_TABLE)
#     return cloud_logs or []

# def summarize_mask_logs(logs):
#     total         = len(logs)
#     compliant     = sum(1 for l in logs if l.get('status') == 'Compliant')
#     non_compliant = sum(1 for l in logs if l.get('status') == 'Non-Compliant')
#     no_person     = sum(1 for l in logs if l.get('status') == 'No Persons Detected')
#     avg_conf      = round(sum(float(l.get('confidence', 0) or 0) for l in logs) / total, 2) if total > 0 else 0
#     compliance_rate = round((compliant / total) * 100, 2) if total > 0 else 0
#     return {
#         "total_detections":     total,
#         "compliant":            compliant,
#         "non_compliant":        non_compliant,
#         "no_person_detections": no_person,
#         "avg_confidence":       avg_conf,
#         "compliance_rate":      compliance_rate,
#     }


# # ==============================================================================
# # HELMET MODEL LOADING  (unchanged)
# # ==============================================================================

# def load_helmet_model():
#     global HELMET_MODEL
#     if HELMET_MODEL is not None:
#         return HELMET_MODEL

#     model_path = os.path.join(BASE_DIR, 'models', 'helmet.pt')
#     if not os.path.exists(model_path):
#         raise RuntimeError(
#             "Helmet model not found at models/helmet.pt\n"
#             "Run: python download_model.py"
#         )

#     logger.info(f"Loading helmet model from {model_path}")

#     original_torch_load = torch.load
#     def patched_torch_load(f, *args, **kwargs):
#         kwargs['weights_only'] = False
#         return original_torch_load(f, *args, **kwargs)
#     torch.load = patched_torch_load

#     try:
#         HELMET_MODEL = YOLO(model_path)
#     finally:
#         torch.load = original_torch_load

#     logger.info(f"Helmet model classes: {HELMET_MODEL.names}")
#     return HELMET_MODEL


# # ==============================================================================
# # MASK MODEL LOADING  (unchanged)
# # ==============================================================================

# def _resolve_mask_model_path():
#     candidates = []
#     if MASK_MODEL_PATH_ENV:
#         custom_path = MASK_MODEL_PATH_ENV
#         if not os.path.isabs(custom_path):
#             custom_path = os.path.join(BASE_DIR, custom_path)
#         candidates.append(os.path.normpath(custom_path))

#     candidates.extend([
#         os.path.join(BASE_DIR, 'models', 'best.pt'),
#         os.path.join(BASE_DIR, 'models', 'mask.pt'),
#     ])

#     seen = set()
#     unique_candidates = []
#     for c in candidates:
#         nc = os.path.normpath(c)
#         if nc not in seen:
#             unique_candidates.append(nc)
#             seen.add(nc)

#     for c in unique_candidates:
#         if os.path.exists(c):
#             return c

#     searched = "\n".join(f" - {c}" for c in unique_candidates)
#     raise RuntimeError(
#         "Mask model not found.\n"
#         f"Searched:\n{searched}"
#     )

# def load_mask_model():
#     global MASK_MODEL
#     if MASK_MODEL is not None:
#         return MASK_MODEL

#     model_path = _resolve_mask_model_path()
#     logger.info(f"Loading mask model from {model_path}")

#     original_torch_load = torch.load
#     def patched_torch_load(f, *args, **kwargs):
#         kwargs['weights_only'] = False
#         return original_torch_load(f, *args, **kwargs)
#     torch.load = patched_torch_load

#     try:
#         MASK_MODEL = YOLO(model_path)
#     finally:
#         torch.load = original_torch_load

#     logger.info(f"Mask model classes: {MASK_MODEL.names}")
#     return MASK_MODEL


# # ==============================================================================
# # HELMET DETECTION CORE  (unchanged)
# # ==============================================================================

# def _normalize_helmet_label(label: str) -> str:
#     return "_".join(str(label).lower().replace('-', ' ').split())


# HELMET_LABELS = {
#     _normalize_helmet_label(label)
#     for label in (
#         'hardhat',
#         'helmet',
#         'hard hat',
#         'hard-hat',
#         'safety_helmet',
#         'safety helmet',
#         'with_helmet',
#         'with helmet',
#     )
# }
# NO_HELMET_LABELS = {
#     _normalize_helmet_label(label)
#     for label in (
#         'no-hardhat',
#         'no_hardhat',
#         'no hardhat',
#         'no helmet',
#         'no-helmet',
#         'no_helmet',
#         'without_helmet',
#         'without helmet',
#         'without-helmet',
#     )
# }
# HEAD_LABELS = {
#     _normalize_helmet_label(label)
#     for label in ('head',)
# }
# PERSON_LABELS = {
#     _normalize_helmet_label(label)
#     for label in ('person', 'worker', 'human', 'pedestrian', 'people')
# }

# _HELMET_BOX_COLORS = {
#     "helmet":    (34, 197, 94),
#     "no_helmet": (239, 68, 68),
# }
# _HELMET_DEFAULT_COLOR = (148, 163, 184)


# def _helmet_box_iou(box_a, box_b) -> float:
#     ax1, ay1, ax2, ay2 = box_a
#     bx1, by1, bx2, by2 = box_b

#     inter_x1 = max(ax1, bx1)
#     inter_y1 = max(ay1, by1)
#     inter_x2 = min(ax2, bx2)
#     inter_y2 = min(ay2, by2)

#     inter_w = max(0, inter_x2 - inter_x1)
#     inter_h = max(0, inter_y2 - inter_y1)
#     inter_area = inter_w * inter_h
#     if inter_area <= 0:
#         return 0.0

#     area_a = max(0, ax2 - ax1) * max(0, ay2 - ay1)
#     area_b = max(0, bx2 - bx1) * max(0, by2 - by1)
#     denom = area_a + area_b - inter_area
#     if denom <= 0:
#         return 0.0
#     return inter_area / denom


# def _helmet_box_contains(box_a, box_b) -> bool:
#     ax1, ay1, ax2, ay2 = box_a
#     bx1, by1, bx2, by2 = box_b
#     cx = (bx1 + bx2) / 2
#     cy = (by1 + by2) / 2
#     return ax1 <= cx <= ax2 and ay1 <= cy <= ay2


# def _helmet_boxes_related(box_a, box_b) -> bool:
#     return (
#         _helmet_box_iou(box_a, box_b) >= 0.2
#         or _helmet_box_contains(box_a, box_b)
#         or _helmet_box_contains(box_b, box_a)
#     )


# def _draw_helmet_boxes(image_path: str, detections: list) -> str:
#     img = cv2.imread(image_path)
#     if img is None:
#         return ""

#     for det in detections:
#         bbox = det.get("bbox")
#         if not bbox or len(bbox) != 4:
#             continue
#         x1, y1, x2, y2 = [int(v) for v in bbox]
#         color = _HELMET_BOX_COLORS.get(det.get("type"), _HELMET_DEFAULT_COLOR)
#         cv2.rectangle(img, (x1, y1), (x2, y2), color, 2)

#         label_text = f"{det.get('label', 'Detection')} {float(det.get('confidence', 0)):.0f}%"
#         (tw, th), baseline = cv2.getTextSize(label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
#         label_y = max(y1 - 6, th + baseline)
#         cv2.rectangle(img, (x1, label_y - th - baseline), (x1 + tw + 4, label_y + baseline), color, -1)
#         cv2.putText(img, label_text, (x1 + 2, label_y), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2, cv2.LINE_AA)

#     ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])
#     if not ok:
#         return ""
#     return f"data:image/jpeg;base64,{base64.b64encode(buf).decode('utf-8')}"


# def detect_helmets_simple(image_path):
#     model   = load_helmet_model()
#     results = model(image_path, conf=HELMET_CONF_THRESHOLD, verbose=False)

#     helmets = no_helmet = 0
#     detections = []

#     for result in results:
#         if result.boxes is None or len(result.boxes) == 0:
#             logger.info("No boxes detected in this frame.")
#             continue
#         logger.info(f"Total boxes detected: {len(result.boxes)}")
#         for box in result.boxes:
#             cls_id = int(box.cls[0].item())
#             conf   = float(box.conf[0].item())
#             label  = model.names[cls_id].lower().strip()
#             x1, y1, x2, y2 = [int(v) for v in box.xyxy[0].tolist()]
#             logger.info(f"  Detected: cls_id={cls_id}, label='{label}', conf={conf:.2f}")

#             if label in HELMET_LABELS:
#                 helmets += 1
#                 detections.append({"label": "Helmet",           "confidence": round(conf * 100, 2), "type": "helmet",    "bbox": [x1, y1, x2, y2]})
#             elif label in NO_HELMET_LABELS:
#                 no_helmet += 1
#                 detections.append({"label": "No Helmet",        "confidence": round(conf * 100, 2), "type": "no_helmet", "bbox": [x1, y1, x2, y2]})
#             else:
#                 logger.warning(f"  Unknown label '{label}' — treating as no_helmet")
#                 no_helmet += 1
#                 detections.append({"label": f"No Helmet ({label})", "confidence": round(conf * 100, 2), "type": "no_helmet", "bbox": [x1, y1, x2, y2]})

#     persons = helmets + no_helmet
#     if persons == 0:
#         status, compliance = "No Persons Detected", True
#     elif no_helmet > 0:
#         status, compliance = "Violation", False
#     else:
#         status, compliance = "Compliant", True

#     all_confs      = [d["confidence"] for d in detections]
#     avg_confidence = round(sum(all_confs) / len(all_confs), 2) if all_confs else 0.0
#     annotated_image = _draw_helmet_boxes(image_path, detections)

#     return {
#         "persons": persons, "helmets": helmets, "no_helmet": no_helmet,
#         "status": status, "compliance": compliance, "confidence": avg_confidence,
#         "detections": detections, "annotated_image": annotated_image,
#     }


# # ==============================================================================
# # MASK DETECTION CORE  (unchanged)
# # ==============================================================================

# def _normalize_mask_label(label: str) -> str:
#     return "_".join(str(label).lower().replace('-', ' ').split())

# _MASK_CLASS_MAP = {
#     "with_mask": "with_mask", "mask": "with_mask", "masked": "with_mask", "good": "with_mask",
#     "mask_weared_incorrect": "incorrect", "incorrect": "incorrect", "incorrect_mask": "incorrect",
#     "improper_mask": "incorrect", "partial_mask": "incorrect", "bad": "incorrect",
#     "without_mask": "without_mask", "no_mask": "without_mask", "nomask": "without_mask", "none": "without_mask",
# }
# _MASK_BOX_COLORS = {
#     "with_mask":    (34,  197,  94),
#     "incorrect":    (234, 179,   8),
#     "without_mask": (239,  68,  68),
# }
# _MASK_DEFAULT_COLOR   = (148, 163, 184)
# _MASK_DISPLAY_LABELS  = {"with_mask": "Mask", "incorrect": "Incorrect Mask", "without_mask": "No Mask"}


# def _draw_mask_boxes(image_path: str, detections: list) -> str:
#     img = cv2.imread(image_path)
#     if img is None:
#         return ""

#     for det in detections:
#         bbox = det.get("bbox")
#         if not bbox or len(bbox) != 4:
#             continue
#         x1, y1, x2, y2 = [int(v) for v in bbox]
#         color = _MASK_BOX_COLORS.get(det.get("type", "without_mask"), _MASK_DEFAULT_COLOR)
#         cv2.rectangle(img, (x1, y1), (x2, y2), color, 2)
#         label_text = f"{det.get('label', 'Face')} {float(det.get('confidence', 0)):.0f}%"
#         (tw, th), baseline = cv2.getTextSize(label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
#         label_y = max(y1 - 6, th + baseline)
#         cv2.rectangle(img, (x1, label_y - th - baseline), (x1 + tw + 4, label_y + baseline), color, -1)
#         cv2.putText(img, label_text, (x1 + 2, label_y), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2, cv2.LINE_AA)

#     ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])
#     if not ok:
#         return ""
#     return "data:image/jpeg;base64," + base64.b64encode(buf).decode("utf-8")

# def _mask_inference_kwargs(mode: str) -> dict:
#     is_stream = mode == 'stream'
#     return {
#         "conf": MASK_CONF_THRESHOLD, "iou": MASK_IOU_THRESHOLD,
#         "imgsz": MASK_STREAM_IMGSZ if is_stream else MASK_UPLOAD_IMGSZ,
#         "max_det": MASK_MAX_DET,
#         "augment": MASK_STREAM_TTA if is_stream else MASK_UPLOAD_TTA,
#         "verbose": False,
#     }

# def detect_masks_core(image_path: str, mode: str = 'upload') -> dict:
#     model   = load_mask_model()
#     results = model(image_path, **_mask_inference_kwargs(mode))

#     masked_count = without_mask = incorrect_count = 0
#     detections = []

#     for result in results:
#         if result.boxes is None or len(result.boxes) == 0:
#             continue
#         for box in result.boxes:
#             cls_id       = int(box.cls[0].item())
#             conf         = float(box.conf[0].item())
#             raw_label    = str(model.names[cls_id]).strip()
#             norm_label   = _normalize_mask_label(raw_label)
#             det_type     = _MASK_CLASS_MAP.get(norm_label, "without_mask")
#             x1, y1, x2, y2 = [int(v) for v in box.xyxy[0].tolist()]

#             if det_type == "with_mask":
#                 masked_count += 1
#             elif det_type == "incorrect":
#                 incorrect_count += 1
#             else:
#                 without_mask += 1

#             detections.append({
#                 "label": _MASK_DISPLAY_LABELS.get(det_type, raw_label),
#                 "confidence": round(conf * 100, 2),
#                 "type": det_type, "bbox": [x1, y1, x2, y2],
#             })

#     persons = masked_count + without_mask + incorrect_count
#     if persons == 0:
#         status, compliance = "No Persons Detected", True
#     elif without_mask > 0 or incorrect_count > 0:
#         status, compliance = "Non-Compliant", False
#     else:
#         status, compliance = "Compliant", True

#     all_confs      = [d["confidence"] for d in detections]
#     avg_confidence = round(sum(all_confs) / len(all_confs), 2) if all_confs else 0.0
#     annotated_image = _draw_mask_boxes(image_path, detections)

#     return {
#         "persons": persons, "masked": masked_count, "without_mask": without_mask,
#         "incorrect": incorrect_count, "status": status, "compliance": compliance,
#         "confidence": avg_confidence, "detections": detections, "annotated_image": annotated_image,
#     }


# # ==============================================================================
# # INSIGHTFACE RECOGNITION LOADING
# # ==============================================================================

# def load_insight_app():
#     """Load InsightFace buffalo_l model pack (downloads on first use ~300 MB)."""
#     global INSIGHT_APP
#     if INSIGHT_APP is not None:
#         return INSIGHT_APP

#     logger.info("Loading InsightFace (buffalo_l) …")
#     INSIGHT_APP = FaceAnalysis(
#         name='buffalo_l',
#         providers=['CUDAExecutionProvider', 'CPUExecutionProvider'],
#     )
#     INSIGHT_APP.prepare(ctx_id=0, det_size=(640, 640))
#     logger.info("InsightFace ready.")
#     return INSIGHT_APP


# # ==============================================================================
# # FACE RECOGNITION UTILITIES
# # ==============================================================================

# def normalize(vector: np.ndarray):
#     norm = np.linalg.norm(vector)
#     if norm <= 0:
#         return None
#     return vector / norm


# def _detect_faces_insightface(image_path: str) -> list:
#     """
#     Run InsightFace detection on *image_path*.
#     Returns a list of dicts: { bbox:[x1,y1,x2,y2], confidence:float, crop:ndarray, embedding:ndarray|None }
#     """
#     img = cv2.imread(image_path)
#     if img is None:
#         return []

#     insight = load_insight_app()
#     rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
#     h, w = img.shape[:2]
#     faces = []

#     try:
#         detected = insight.get(rgb)
#     except Exception as e:
#         logger.debug(f"InsightFace detection failed: {e}")
#         return []

#     for face in detected:
#         conf_score = float(getattr(face, 'det_score', 0.0) or 0.0)
#         if conf_score < FACE_DETECT_CONF:
#             continue

#         x1, y1, x2, y2 = [int(v) for v in face.bbox.tolist()]
#         x1, y1 = max(0, x1), max(0, y1)
#         x2, y2 = min(w, x2), min(h, y2)
#         if x2 <= x1 or y2 <= y1:
#             continue

#         crop = img[y1:y2, x1:x2]
#         embedding = getattr(face, 'embedding', None)
#         if embedding is not None:
#             embedding = normalize(np.asarray(embedding, dtype=np.float32))

#         faces.append({
#             "bbox": [x1, y1, x2, y2],
#             "confidence": round(conf_score * 100, 2),
#             "crop": crop,
#             "embedding": embedding,
#         })

#     return faces


# def _get_embedding_insightface(face_crop: np.ndarray, precomputed_embedding=None):
#     """
#     Extract a 512-dim L2-normalised embedding from a BGR face crop.
#     Returns ndarray or None.
#     """
#     if precomputed_embedding is not None:
#         return normalize(np.asarray(precomputed_embedding, dtype=np.float32))

#     if face_crop is None or face_crop.size == 0:
#         return None

#     insight = load_insight_app()
#     rgb     = cv2.cvtColor(face_crop, cv2.COLOR_BGR2RGB)

#     try:
#         faces = insight.get(rgb)
#     except Exception as e:
#         logger.debug(f"InsightFace.get() failed: {e}")
#         return None

#     if not faces:
#         return None

#     # Pick the largest detected face (should be the only one in a tight crop)
#     face      = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
#     embedding = face.embedding.astype(np.float32)
#     return normalize(embedding)


# def get_single_embedding(img_path: str):
#     """
#     Full pipeline: InsightFace detect → embedding.
#     Drop-in replacement for the old DeepFace-based version.
#     """
#     faces = _detect_faces_insightface(img_path)
#     if not faces:
#         logger.debug(f"InsightFace: no face in {img_path}")
#         return None

#     best      = max(faces, key=lambda f: f["confidence"])
#     embedding = _get_embedding_insightface(best["crop"], best.get("embedding"))
#     if embedding is None:
#         logger.debug(f"InsightFace: could not embed face from {img_path}")
#         return None

#     logger.info(f"  Embedding extracted — conf={best['confidence']}%  shape={embedding.shape}")
#     return embedding


# def _embedding_similarity(left, right) -> float:
#     left  = np.asarray(left,  dtype=np.float32)
#     right = np.asarray(right, dtype=np.float32)
#     if left.shape != right.shape:
#         return -1.0
#     return float(np.dot(left, right))


# def _load_existing_resident_embeddings(exclude_cnic=None):
#     return _read_resident_encodings_supabase(exclude_cnic=exclude_cnic)


# def _find_duplicate_resident(embedding, exclude_cnic=None):
#     best_match      = None
#     best_similarity = -1.0

#     for resident in _load_existing_resident_embeddings(exclude_cnic=exclude_cnic):
#         for existing in resident['encodings']:
#             sim = _embedding_similarity(embedding, existing)
#             if sim > best_similarity:
#                 best_similarity = sim
#                 best_match = {
#                     'cnic':       resident['cnic'],
#                     'name':       resident['name'],
#                     'similarity': round(sim, 4),
#                 }

#     if best_match and best_match['similarity'] >= FACE_DUPLICATE_SIMILARITY_THRESHOLD:
#         return best_match
#     return None


# # ==============================================================================
# # FACE DETECTION LOGS ENDPOINT
# # ==============================================================================

# FACE_LOG_PATH = os.path.join(UPLOAD_FOLDER, 'face_logs.json')
# FACE_LOG_LOCK = threading.Lock()

# def _read_face_logs_unlocked():
#     if not os.path.exists(FACE_LOG_PATH):
#         return []
#     try:
#         with open(FACE_LOG_PATH, 'r') as f:
#             logs = json.load(f)
#         return logs if isinstance(logs, list) else []
#     except Exception:
#         return []

# def _write_face_logs_unlocked(logs):
#     temp = f"{FACE_LOG_PATH}.tmp"
#     with open(temp, 'w') as f:
#         json.dump(logs, f, indent=2)
#     os.replace(temp, FACE_LOG_PATH)

# def append_face_log(entry):
#     with FACE_LOG_LOCK:
#         logs = _read_face_logs_unlocked()
#         logs.append(entry)
#         if len(logs) > 2000:
#             logs = logs[-2000:]
#         _write_face_logs_unlocked(logs)
#     _append_supabase_log(SUPABASE_FACE_TABLE, entry)

# def read_face_logs():
#     # First try to get from Supabase
#     try:
#         cloud_logs = _read_supabase_logs(SUPABASE_FACE_TABLE)
#         if cloud_logs and len(cloud_logs) > 0:
#             logger.info(f"Returning {len(cloud_logs)} logs from Supabase")
#             return cloud_logs
#     except Exception as e:
#         logger.warning(f"Failed to read from Supabase: {e}")
    
#     # Fall back to local logs
#     with FACE_LOG_LOCK:
#         local_logs = _read_face_logs_unlocked()
#         logger.info(f"Returning {len(local_logs)} logs from local file")
#         return local_logs

# def _append_supabase_log(table_name, log_entry):
#     client = _get_supabase_client()
#     if client is None:
#         logger.error(f"❌ Cannot save to {table_name}: Supabase client not available")
#         return

#     try:
#         payload = _supabase_payload_from_log(log_entry)
#         # Remove None values to avoid SQL errors
#         payload = {k: v for k, v in payload.items() if v is not None}
        
#         logger.info(f"Attempting to insert into {table_name}: {payload.get('name')}")
#         result = client.table(table_name).insert(payload).execute()
#         logger.info(f"✅ Successfully saved log to {table_name}")
#     except Exception as e:
#         logger.error(f"❌ Supabase insert failed for {table_name}: {str(e)}")
# # ==============================================================================
# # DASHBOARD OVERVIEW ENDPOINT
# # ==============================================================================

# @app.route('/dashboard-overview', methods=['GET'])
# def dashboard_overview():
#     """Aggregate stats for the FaceDetectionPage dashboard cards."""
#     try:
#         # Residents
#         residents      = []
#         residents_dir  = UPLOAD_FOLDER
#         total_images   = 0
#         total_faces    = 0
#         active_res     = 0

#         today_prefix   = datetime.utcnow().date().isoformat()
#         enrollments_today = 0

#         for folder_name in os.listdir(residents_dir):
#             folder_path  = os.path.join(residents_dir, folder_name)
#             if not os.path.isdir(folder_path) or folder_name.startswith('temp'):
#                 continue
#             profile_path = os.path.join(folder_path, 'profile_data.json')
#             if not os.path.exists(profile_path):
#                 continue
#             try:
#                 with open(profile_path, 'r') as f:
#                     pd = json.load(f)
#                 residents.append(pd)
#                 total_images += int(pd.get('image_count', 0))
#                 total_faces  += int(pd.get('faces_detected', 0))
#                 if pd.get('status', 'Active') == 'Active':
#                     active_res += 1
#                 if str(pd.get('enrolled_at', '')).startswith(today_prefix):
#                     enrollments_today += 1
#             except Exception:
#                 pass

#         # Logs
#         face_logs_data   = read_face_logs()
#         helmet_logs_data = read_helmet_logs()
#         mask_logs_data   = read_mask_logs()

#         helmet_today = sum(1 for l in helmet_logs_data if str(l.get('timestamp', '')).startswith(today_prefix))
#         mask_today   = sum(1 for l in mask_logs_data   if str(l.get('timestamp', '')).startswith(today_prefix))

#         # Normalize recent activity
#         recent = []
#         recent_logs = sorted(
#             face_logs_data,
#             key=lambda x: x.get('timestamp', ''),
#             reverse=True,
#         )[:10]
#         for entry in recent_logs:
#             name = entry.get('name') or 'Unknown'
#             cnic = entry.get('cnic')
#             subject = f"{name} ({cnic})" if cnic else name
#             recent.append({
#                 "type": "Face Recognition",
#                 "message": f"{entry.get('status', 'Unknown')}: {subject}",
#                 "time": entry.get('timestamp', ''),
#             })

#         return jsonify({
#             "status": "success",
#             "data": {
#                 "residentsTotal":        len(residents),
#                 "activeResidents":       active_res,
#                 "totalImages":           total_images,
#                 "totalFacesDetected":    total_faces,
#                 "enrollmentsToday":      enrollments_today,
#                 "helmetDetectionsTotal": len(helmet_logs_data),
#                 "helmetDetectionsToday": helmet_today,
#                 "maskDetectionsTotal":   len(mask_logs_data),
#                 "maskDetectionsToday":   mask_today,
#                 "safetyDetectionsTotal": len(helmet_logs_data) + len(mask_logs_data),
#                 "safetyDetectionsToday": helmet_today + mask_today,
#                 "recentActivity":        recent,
#             }
#         })

#     except Exception as e:
#         logger.exception("dashboard_overview error")
#         return jsonify({"status": "error", "message": str(e)}), 500


# # Register split route modules
# register_face_routes(app, {
#     "logger": logger,
#     "UPLOAD_FOLDER": UPLOAD_FOLDER,
#     "SUPABASE_STORAGE_BUCKET": SUPABASE_STORAGE_BUCKET,
#     "_detect_faces_insightface": _detect_faces_insightface,
#     "_get_embedding_insightface": _get_embedding_insightface,
#     "_find_duplicate_resident": _find_duplicate_resident,
#     "append_face_log": append_face_log,
#     "read_face_logs": read_face_logs,
#     "_persist_detection_image": _persist_detection_image,
#     "_attach_storage_result_to_log": _attach_storage_result_to_log,
#     "_should_store_stream_event": _should_store_stream_event,
#     "_insert_resident_supabase": _insert_resident_supabase,
#     "_insert_resident_images_supabase": _insert_resident_images_supabase,
#     "_read_all_residents_supabase": _read_all_residents_supabase,
#     "_read_resident_supabase": _read_resident_supabase,
#     "_read_resident_images_supabase": _read_resident_images_supabase,
#     "_resident_image_storage_path": _resident_image_storage_path,
#     "_get_supabase_client": _get_supabase_client,
#     "_delete_resident_supabase": _delete_resident_supabase,
#     "_delete_storage_paths_from_supabase": _delete_storage_paths_from_supabase,
#     "_update_resident_supabase": _update_resident_supabase,
#     "_upload_local_file_to_supabase_storage": _upload_local_file_to_supabase_storage,
# })

# register_helmet_routes(app, {
#     "logger": logger,
#     "HELMET_UPLOAD_FOLDER": HELMET_UPLOAD_FOLDER,
#     "detect_helmets_simple": detect_helmets_simple,
#     "append_helmet_log": append_helmet_log,
#     "read_helmet_logs": read_helmet_logs,
#     "_persist_detection_image": _persist_detection_image,
#     "_attach_storage_result_to_log": _attach_storage_result_to_log,
#     "_should_store_stream_event": _should_store_stream_event,
# })

# register_mask_routes(app, {
#     "logger": logger,
#     "MASK_UPLOAD_FOLDER": MASK_UPLOAD_FOLDER,
#     "detect_masks_core": detect_masks_core,
#     "append_mask_log": append_mask_log,
#     "read_mask_logs": read_mask_logs,
#     "summarize_mask_logs": summarize_mask_logs,
#     "_persist_detection_image": _persist_detection_image,
#     "_attach_storage_result_to_log": _attach_storage_result_to_log,
#     "_should_store_stream_event": _should_store_stream_event,
# })

# # ==============================================================================
# # EAGER MODEL LOADING AT STARTUP
# # ==============================================================================

# def _eager_load():
#     try:
#         load_helmet_model()
#         logger.info("Helmet model ready.")
#     except Exception as e:
#         logger.error(f"Helmet model failed: {e}")

#     try:
#         load_mask_model()
#         logger.info("Mask model ready.")
#     except Exception as e:
#         logger.error(f"Mask model failed: {e}")

#     try:
#         load_insight_app()
#         logger.info("InsightFace ready.")
#     except Exception as e:
#         logger.error(f"InsightFace failed: {e}")


# threading.Thread(target=_eager_load, daemon=True).start()


# # ==============================================================================
# # ENTRY POINT
# # ==============================================================================

# if __name__ == '__main__':
#     import sys
#     if len(sys.argv) > 1 and sys.argv[1] == "test":
#         load_insight_app()
#         load_helmet_model()
#         load_mask_model()
#         sys.exit(0)

#     app.run(debug=True, host='0.0.0.0', port=5000)

from flask import Flask, jsonify
from flask_cors import CORS
import os
import numpy as np
from datetime import datetime
import json
import logging
import threading
from uuid import uuid4
import cv2
from ultralytics import YOLO
import torch
import base64
import time
try:
    from dotenv import load_dotenv
except Exception:
    load_dotenv = None
try:
    from supabase import create_client
except Exception:
    create_client = None

# ── InsightFace ───────────────────────────────────────────────────────────────
from insightface.app import FaceAnalysis
from face_routes import register_face_routes
from helmet_routes import register_helmet_routes
from mask_routes import register_mask_routes

# App setup
app = Flask(__name__)
CORS(app)

if load_dotenv is not None:
    load_dotenv()

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("face-recog-helmet")

# Paths / config
BASE_DIR = os.path.dirname(__file__)
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# ── Face recognition config ───────────────────────────────────────────────────
ENCODING_DTYPE = np.float32
FACE_DUPLICATE_SIMILARITY_THRESHOLD = float(os.environ.get('FACE_DUPLICATE_SIMILARITY_THRESHOLD', 0.45))
BATCH_DUPLICATE_SIMILARITY_THRESHOLD = float(os.environ.get('BATCH_DUPLICATE_SIMILARITY_THRESHOLD', 0.98))
FACE_DETECT_CONF = float(os.environ.get('FACE_DETECT_CONF', 0.5))

# Global model handles (loaded lazily / eagerly at startup)
INSIGHT_APP   = None

# ── Helmet paths ──────────────────────────────────────────────────────────────
HELMET_UPLOAD_FOLDER = os.path.join(UPLOAD_FOLDER, 'helmet_detections')
os.makedirs(HELMET_UPLOAD_FOLDER, exist_ok=True)
HELMET_LOG_PATH  = os.path.join(HELMET_UPLOAD_FOLDER, 'helmet_logs.json')
HELMET_LOG_LOCK  = threading.Lock()
HELMET_CONF_THRESHOLD = float(os.environ.get('HELMET_CONF_THRESHOLD', 0.25))
HELMET_MODEL = None

# ── Mask paths ────────────────────────────────────────────────────────────────
MASK_UPLOAD_FOLDER = os.path.join(UPLOAD_FOLDER, 'mask_detections')
os.makedirs(MASK_UPLOAD_FOLDER, exist_ok=True)
MASK_LOG_PATH  = os.path.join(MASK_UPLOAD_FOLDER, 'mask_logs.json')
MASK_LOG_LOCK  = threading.Lock()

def _env_flag(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {'1', 'true', 'yes', 'on'}


# ── Supabase config (optional, backend-only) ─────────────────────────────────
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
    global _SUPABASE_CLIENT
    global _SUPABASE_INIT_ATTEMPTED

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


def _read_supabase_logs(table_name, limit=5000):
    client = _get_supabase_client()
    if client is None:
        return None

    try:
        response = client.table(table_name).select('*').order('timestamp', desc=True).limit(limit).execute()
        rows = response.data or []
        normalized = []
        for row in rows:
            item = dict(row)
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
        bucket.upload(
            path=storage_path,
            file=file_bytes,
            file_options={"content-type": content_type},
        )
        return {
            "storage_path": storage_path,
            "public_url": bucket.get_public_url(storage_path),
        }
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
        if isinstance(raw_value, str):
            file_bytes = base64.b64decode(raw_value)
        else:
            file_bytes = raw_value
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
    return f"{SUPABASE_DETECTIONS_PREFIX}/{module_name}/{camera_part}/{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{uuid4().hex[:8]}.{suffix.lstrip('.')}"


def _persist_detection_image(module_name, camera_id, annotated_image, suffix='jpg'):
    if not annotated_image:
        return None

    storage_path = _detection_image_storage_path(module_name, camera_id, suffix=suffix)
    storage_result = _upload_data_url_to_supabase_storage(storage_path, annotated_image, content_type='image/jpeg')
    if storage_result is None:
        return None
    return storage_result


def _attach_storage_result_to_log(log_entry, storage_result):
    if not storage_result:
        return log_entry

    enriched = dict(log_entry)
    enriched['annotated_image_url'] = storage_result.get('public_url')
    enriched['annotated_image_path'] = storage_result.get('storage_path')
    enriched['annotated_image'] = storage_result.get('public_url')
    return enriched


# ==============================================================================
# SUPABASE RESIDENT CRUD FUNCTIONS
# ==============================================================================

SUPABASE_RESIDENTS_TABLE = os.environ.get('SUPABASE_RESIDENTS_TABLE', 'residents').strip() or 'residents'
SUPABASE_RESIDENT_IMAGES_TABLE = os.environ.get('SUPABASE_RESIDENT_IMAGES_TABLE', 'resident_images').strip() or 'resident_images'
SUPABASE_RESIDENT_ENCODINGS_TABLE = os.environ.get('SUPABASE_RESIDENT_ENCODINGS_TABLE', 'resident_encodings').strip() or 'resident_encodings'


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
                    logger.info(f"Successfully fetched inserted resident: {resident_data.get('cnic')}")
                    return fetch_result.data[0]
            except Exception as fetch_err:
                logger.error(f"Failed to fetch inserted resident: {str(fetch_err)}")
            return None
            
    except Exception as e:
        logger.exception(f"Supabase insert failed for resident {resident_data.get('cnic')}")
        return None


def _update_resident_supabase(cnic, updates):
    client = _get_supabase_client()
    if client is None:
        return
    try:
        client.table(SUPABASE_RESIDENTS_TABLE).update(updates).eq('cnic', cnic).execute()
        logger.info(f"Resident {cnic} updated in Supabase")
    except Exception:
        logger.exception(f"Supabase update failed for resident {cnic}")


def _delete_resident_supabase(cnic):
    client = _get_supabase_client()
    if client is None:
        return
    try:
        client.table(SUPABASE_RESIDENTS_TABLE).delete().eq('cnic', cnic).execute()
        logger.info(f"Resident {cnic} deleted from Supabase")
    except Exception:
        logger.exception(f"Supabase delete failed for resident {cnic}")


def _read_resident_supabase(cnic):
    client = _get_supabase_client()
    if client is None:
        return None
    try:
        response = client.table(SUPABASE_RESIDENTS_TABLE).select('*').eq('cnic', cnic).single().execute()
        return response.data if response.data else None
    except Exception:
        logger.exception(f"Supabase read failed for resident {cnic}")
        return None


def _read_all_residents_supabase():
    client = _get_supabase_client()
    if client is None:
        return None
    try:
        response = client.table(SUPABASE_RESIDENTS_TABLE).select('*').order('enrolled_at', desc=True).execute()
        return response.data or [] if response.data is not None else None
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
            }
            for img_info in images_list
        ]
        if payloads:
            client.table(SUPABASE_RESIDENT_IMAGES_TABLE).insert(payloads).execute()
            logger.info(f"Inserted {len(payloads)} images for resident {cnic}")
    except Exception:
        logger.exception(f"Supabase insert images failed for resident {cnic}")


def _read_resident_images_supabase(cnic):
    client = _get_supabase_client()
    if client is None:
        return None
    try:
        response = (
            client.table(SUPABASE_RESIDENT_IMAGES_TABLE)
            .select('filename,storage_path,public_url')
            .eq('cnic', cnic)
            .order('created_at', desc=False)
            .execute()
        )
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
                grouped[cnic] = {
                    'cnic': cnic,
                    'name': resident_name,
                    'encodings': [],
                }

            grouped[cnic]['encodings'].append(encoding)

        return list(grouped.values())
    except Exception:
        logger.exception('Supabase read failed for resident encodings')
        return []


MASK_CONF_THRESHOLD  = float(os.environ.get('MASK_CONF_THRESHOLD', 0.35))
MASK_IOU_THRESHOLD   = float(os.environ.get('MASK_IOU_THRESHOLD', 0.5))
MASK_UPLOAD_IMGSZ    = int(os.environ.get('MASK_UPLOAD_IMGSZ', 960))
MASK_STREAM_IMGSZ    = int(os.environ.get('MASK_STREAM_IMGSZ', MASK_UPLOAD_IMGSZ))
MASK_MAX_DET         = int(os.environ.get('MASK_MAX_DET', 200))
MASK_UPLOAD_TTA      = _env_flag('MASK_UPLOAD_TTA', False)
MASK_STREAM_TTA      = _env_flag('MASK_STREAM_TTA', False)
MASK_MODEL_PATH_ENV  = os.environ.get('MASK_MODEL_PATH', '').strip()
MASK_MODEL = None

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

def read_helmet_logs():
    cloud_logs = _read_supabase_logs(SUPABASE_HELMET_TABLE)
    return cloud_logs or []


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

def read_mask_logs():
    cloud_logs = _read_supabase_logs(SUPABASE_MASK_TABLE)
    return cloud_logs or []

def summarize_mask_logs(logs):
    total         = len(logs)
    compliant     = sum(1 for l in logs if l.get('status') == 'Compliant')
    non_compliant = sum(1 for l in logs if l.get('status') == 'Non-Compliant')
    no_person     = sum(1 for l in logs if l.get('status') == 'No Persons Detected')
    avg_conf      = round(sum(float(l.get('confidence', 0) or 0) for l in logs) / total, 2) if total > 0 else 0
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

    logger.info(f"Helmet model classes: {HELMET_MODEL.names}")
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
    raise RuntimeError(
        "Mask model not found.\n"
        f"Searched:\n{searched}"
    )

def load_mask_model():
    global MASK_MODEL
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

    logger.info(f"Mask model classes: {MASK_MODEL.names}")
    return MASK_MODEL


# ==============================================================================
# HELMET DETECTION CORE
# ==============================================================================

def _normalize_helmet_label(label: str) -> str:
    return "_".join(str(label).lower().replace('-', ' ').split())


HELMET_LABELS = {
    _normalize_helmet_label(label)
    for label in (
        'hardhat',
        'helmet',
        'hard hat',
        'hard-hat',
        'safety_helmet',
        'safety helmet',
        'with_helmet',
        'with helmet',
    )
}
NO_HELMET_LABELS = {
    _normalize_helmet_label(label)
    for label in (
        'no-hardhat',
        'no_hardhat',
        'no hardhat',
        'no helmet',
        'no-helmet',
        'no_helmet',
        'without_helmet',
        'without helmet',
        'without-helmet',
    )
}
HEAD_LABELS = {
    _normalize_helmet_label(label)
    for label in ('head',)
}
PERSON_LABELS = {
    _normalize_helmet_label(label)
    for label in ('person', 'worker', 'human', 'pedestrian', 'people')
}

_HELMET_BOX_COLORS = {
    "helmet":    (34, 197, 94),
    "no_helmet": (239, 68, 68),
}
_HELMET_DEFAULT_COLOR = (148, 163, 184)


def _helmet_box_iou(box_a, box_b) -> float:
    ax1, ay1, ax2, ay2 = box_a
    bx1, by1, bx2, by2 = box_b

    inter_x1 = max(ax1, bx1)
    inter_y1 = max(ay1, by1)
    inter_x2 = min(ax2, bx2)
    inter_y2 = min(ay2, by2)

    inter_w = max(0, inter_x2 - inter_x1)
    inter_h = max(0, inter_y2 - inter_y1)
    inter_area = inter_w * inter_h
    if inter_area <= 0:
        return 0.0

    area_a = max(0, ax2 - ax1) * max(0, ay2 - ay1)
    area_b = max(0, bx2 - bx1) * max(0, by2 - by1)
    denom = area_a + area_b - inter_area
    if denom <= 0:
        return 0.0
    return inter_area / denom


def _helmet_box_contains(box_a, box_b) -> bool:
    ax1, ay1, ax2, ay2 = box_a
    bx1, by1, bx2, by2 = box_b
    cx = (bx1 + bx2) / 2
    cy = (by1 + by2) / 2
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


def detect_helmets_simple(image_path):
    model   = load_helmet_model()
    results = model(image_path, conf=HELMET_CONF_THRESHOLD, verbose=False)

    helmets = no_helmet = 0
    detections = []

    for result in results:
        if result.boxes is None or len(result.boxes) == 0:
            logger.info("No boxes detected in this frame.")
            continue
        logger.info(f"Total boxes detected: {len(result.boxes)}")
        for box in result.boxes:
            cls_id = int(box.cls[0].item())
            conf   = float(box.conf[0].item())
            label  = model.names[cls_id].lower().strip()
            x1, y1, x2, y2 = [int(v) for v in box.xyxy[0].tolist()]
            logger.info(f"  Detected: cls_id={cls_id}, label='{label}', conf={conf:.2f}")

            if label in HELMET_LABELS:
                helmets += 1
                detections.append({"label": "Helmet",           "confidence": round(conf * 100, 2), "type": "helmet",    "bbox": [x1, y1, x2, y2]})
            elif label in NO_HELMET_LABELS:
                no_helmet += 1
                detections.append({"label": "No Helmet",        "confidence": round(conf * 100, 2), "type": "no_helmet", "bbox": [x1, y1, x2, y2]})
            else:
                logger.warning(f"  Unknown label '{label}' — treating as no_helmet")
                no_helmet += 1
                detections.append({"label": f"No Helmet ({label})", "confidence": round(conf * 100, 2), "type": "no_helmet", "bbox": [x1, y1, x2, y2]})

    persons = helmets + no_helmet
    if persons == 0:
        status, compliance = "No Persons Detected", True
    elif no_helmet > 0:
        status, compliance = "Violation", False
    else:
        status, compliance = "Compliant", True

    all_confs      = [d["confidence"] for d in detections]
    avg_confidence = round(sum(all_confs) / len(all_confs), 2) if all_confs else 0.0
    annotated_image = _draw_helmet_boxes(image_path, detections)

    return {
        "persons": persons, "helmets": helmets, "no_helmet": no_helmet,
        "status": status, "compliance": compliance, "confidence": avg_confidence,
        "detections": detections, "annotated_image": annotated_image,
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
_MASK_DEFAULT_COLOR   = (148, 163, 184)
_MASK_DISPLAY_LABELS  = {"with_mask": "Mask", "incorrect": "Incorrect Mask", "without_mask": "No Mask"}


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
        "conf": MASK_CONF_THRESHOLD, "iou": MASK_IOU_THRESHOLD,
        "imgsz": MASK_STREAM_IMGSZ if is_stream else MASK_UPLOAD_IMGSZ,
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
            cls_id       = int(box.cls[0].item())
            conf         = float(box.conf[0].item())
            raw_label    = str(model.names[cls_id]).strip()
            norm_label   = _normalize_mask_label(raw_label)
            det_type     = _MASK_CLASS_MAP.get(norm_label, "without_mask")
            x1, y1, x2, y2 = [int(v) for v in box.xyxy[0].tolist()]

            if det_type == "with_mask":
                masked_count += 1
            elif det_type == "incorrect":
                incorrect_count += 1
            else:
                without_mask += 1

            detections.append({
                "label": _MASK_DISPLAY_LABELS.get(det_type, raw_label),
                "confidence": round(conf * 100, 2),
                "type": det_type, "bbox": [x1, y1, x2, y2],
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
        "confidence": avg_confidence, "detections": detections, "annotated_image": annotated_image,
    }


# ==============================================================================
# INSIGHTFACE RECOGNITION LOADING
# ==============================================================================

def load_insight_app():
    global INSIGHT_APP
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
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    h, w = img.shape[:2]
    faces = []

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

        crop = img[y1:y2, x1:x2]
        embedding = getattr(face, 'embedding', None)
        if embedding is not None:
            embedding = normalize(np.asarray(embedding, dtype=np.float32))

        faces.append({
            "bbox": [x1, y1, x2, y2],
            "confidence": round(conf_score * 100, 2),
            "crop": crop,
            "embedding": embedding,
        })

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
                best_match = {
                    'cnic':       resident['cnic'],
                    'name':       resident['name'],
                    'similarity': round(sim, 4),
                }

    if best_match and best_match['similarity'] >= FACE_DUPLICATE_SIMILARITY_THRESHOLD:
        return best_match
    return None


# ==============================================================================
# FACE DETECTION LOGS
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
    """Append a log entry to Supabase"""
    client = _get_supabase_client()
    if client is None:
        logger.warning(f"Cannot save to {table_name}: Supabase client not available")
        return

    try:
        payload = _supabase_payload_from_log(log_entry)
        
        # Remove fields that don't exist in your table schema
        fields_to_remove = ['annotated_image_path', 'annotated_image_url', 'local_id']
        for field in fields_to_remove:
            payload.pop(field, None)
        
        # Remove None values to avoid SQL errors
        payload = {k: v for k, v in payload.items() if v is not None}
        
        # Keep only the fields that exist in your table
        allowed_fields = ['id', 'timestamp', 'name', 'cnic', 'status', 'confidence', 
                         'source', 'camera_id', 'file_name', 'annotated_image', 'bbox']
        payload = {k: v for k, v in payload.items() if k in allowed_fields}
        
        logger.debug(f"Inserting into {table_name}: {list(payload.keys())}")
        result = client.table(table_name).insert(payload).execute()
        logger.info(f"✅ Successfully saved log to {table_name}")
    except Exception as e:
        logger.error(f"❌ Supabase insert failed for {table_name}: {str(e)}")

def append_face_log(entry):
    with FACE_LOG_LOCK:
        logs = _read_face_logs_unlocked()
        logs.append(entry)
        if len(logs) > 2000:
            logs = logs[-2000:]
        _write_face_logs_unlocked(logs)
    _append_supabase_log(SUPABASE_FACE_TABLE, entry)

def read_face_logs():
    # First try to get from Supabase
    try:
        cloud_logs = _read_supabase_logs(SUPABASE_FACE_TABLE)
        if cloud_logs and len(cloud_logs) > 0:
            logger.info(f"Returning {len(cloud_logs)} logs from Supabase")
            return cloud_logs
    except Exception as e:
        logger.warning(f"Failed to read from Supabase: {e}")
    
    # Fall back to local logs
    with FACE_LOG_LOCK:
        local_logs = _read_face_logs_unlocked()
        logger.info(f"Returning {len(local_logs)} logs from local file")
        return local_logs


# ==============================================================================
# DASHBOARD OVERVIEW ENDPOINT
# ==============================================================================

@app.route('/dashboard-overview', methods=['GET'])
def dashboard_overview():
    try:
        residents      = []
        residents_dir  = UPLOAD_FOLDER
        total_images   = 0
        total_faces    = 0
        active_res     = 0

        today_prefix   = datetime.utcnow().date().isoformat()
        enrollments_today = 0

        for folder_name in os.listdir(residents_dir):
            folder_path  = os.path.join(residents_dir, folder_name)
            if not os.path.isdir(folder_path) or folder_name.startswith('temp'):
                continue
            profile_path = os.path.join(folder_path, 'profile_data.json')
            if not os.path.exists(profile_path):
                continue
            try:
                with open(profile_path, 'r') as f:
                    pd = json.load(f)
                residents.append(pd)
                total_images += int(pd.get('image_count', 0))
                total_faces  += int(pd.get('faces_detected', 0))
                if pd.get('status', 'Active') == 'Active':
                    active_res += 1
                if str(pd.get('enrolled_at', '')).startswith(today_prefix):
                    enrollments_today += 1
            except Exception:
                pass

        face_logs_data   = read_face_logs()
        helmet_logs_data = read_helmet_logs()
        mask_logs_data   = read_mask_logs()

        helmet_today = sum(1 for l in helmet_logs_data if str(l.get('timestamp', '')).startswith(today_prefix))
        mask_today   = sum(1 for l in mask_logs_data if str(l.get('timestamp', '')).startswith(today_prefix))

        recent = []
        recent_logs = sorted(
            face_logs_data,
            key=lambda x: x.get('timestamp', ''),
            reverse=True,
        )[:10]
        for entry in recent_logs:
            name = entry.get('name') or 'Unknown'
            cnic = entry.get('cnic')
            subject = f"{name} ({cnic})" if cnic else name
            recent.append({
                "type": "Face Recognition",
                "message": f"{entry.get('status', 'Unknown')}: {subject}",
                "time": entry.get('timestamp', ''),
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
# REGISTER ROUTES
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
})


# ==============================================================================
# EAGER MODEL LOADING AT STARTUP
# ==============================================================================

def _eager_load():
    try:
        load_helmet_model()
        logger.info("Helmet model ready.")
    except Exception as e:
        logger.error(f"Helmet model failed: {e}")

    try:
        load_mask_model()
        logger.info("Mask model ready.")
    except Exception as e:
        logger.error(f"Mask model failed: {e}")

    try:
        load_insight_app()
        logger.info("InsightFace ready.")
    except Exception as e:
        logger.error(f"InsightFace failed: {e}")


threading.Thread(target=_eager_load, daemon=True).start()


# ==============================================================================
# ENTRY POINT
# ==============================================================================
@app.route('/debug-supabase-status', methods=['GET'])
def debug_supabase_status():
    """Debug Supabase connection status"""
    import os
    
    # Check environment variables
    env_vars = {
        "SUPABASE_ENABLED": os.environ.get('SUPABASE_ENABLED'),
        "SUPABASE_URL": os.environ.get('SUPABASE_URL', '')[:50] + "...",
        "SUPABASE_SERVICE_ROLE_KEY": "SET" if os.environ.get('SUPABASE_SERVICE_ROLE_KEY') else "NOT SET",
        "SUPABASE_FACE_TABLE": os.environ.get('SUPABASE_FACE_TABLE'),
    }
    
    # Check client
    client = _get_supabase_client()
    
    # Try to manually create client
    manual_client = None
    manual_error = None
    try:
        if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY:
            manual_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    except Exception as e:
        manual_error = str(e)
    
    return jsonify({
        "environment_variables": env_vars,
        "client_from_function": client is not None,
        "manual_client_created": manual_client is not None,
        "manual_client_error": manual_error,
        "SUPABASE_ENABLED_VALUE": SUPABASE_ENABLED,
        "create_client_imported": create_client is not None
    })


if __name__ == '__main__':
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "test":
        load_insight_app()
        load_helmet_model()
        load_mask_model()
        sys.exit(0)

    app.run(debug=True, host='0.0.0.0', port=5000)