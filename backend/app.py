from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from deepface import DeepFace
import os
import numpy as np
from datetime import datetime
import json
import shutil
import logging
import pickle
import threading
from uuid import uuid4
import cv2
from ultralytics import YOLO
import torch
import base64

# App setup
app = Flask(__name__)
CORS(app)

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("face-recog-helmet")

# Paths / config
BASE_DIR = os.path.dirname(__file__)
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Detector backend
DETECTOR_BACKEND = os.environ.get('DETECTOR_BACKEND', 'retinaface')
DETECTION_CONF_THRESHOLD = float(os.environ.get('DETECTION_CONF_THRESHOLD', 0.5))

MODEL_NAME = 'ArcFace'
ENCODING_DTYPE = np.float32

# ── Helmet paths ─────────────────────────────────────────────────────────────
HELMET_UPLOAD_FOLDER = os.path.join(UPLOAD_FOLDER, 'helmet_detections')
os.makedirs(HELMET_UPLOAD_FOLDER, exist_ok=True)
HELMET_LOG_PATH = os.path.join(HELMET_UPLOAD_FOLDER, 'helmet_logs.json')
HELMET_LOG_LOCK = threading.Lock()

HELMET_CONF_THRESHOLD = float(os.environ.get('HELMET_CONF_THRESHOLD', 0.25))
HELMET_MODEL = None

# ── Mask paths ───────────────────────────────────────────────────────────────
MASK_UPLOAD_FOLDER = os.path.join(UPLOAD_FOLDER, 'mask_detections')
os.makedirs(MASK_UPLOAD_FOLDER, exist_ok=True)
MASK_LOG_PATH = os.path.join(MASK_UPLOAD_FOLDER, 'mask_logs.json')
MASK_LOG_LOCK = threading.Lock()


def _env_flag(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {'1', 'true', 'yes', 'on'}


MASK_CONF_THRESHOLD = float(os.environ.get('MASK_CONF_THRESHOLD', 0.35))
MASK_IOU_THRESHOLD = float(os.environ.get('MASK_IOU_THRESHOLD', 0.5))
MASK_UPLOAD_IMGSZ = int(os.environ.get('MASK_UPLOAD_IMGSZ', 960))
MASK_STREAM_IMGSZ = int(os.environ.get('MASK_STREAM_IMGSZ', MASK_UPLOAD_IMGSZ))
MASK_MAX_DET = int(os.environ.get('MASK_MAX_DET', 200))
MASK_UPLOAD_TTA = _env_flag('MASK_UPLOAD_TTA', False)
MASK_STREAM_TTA = _env_flag('MASK_STREAM_TTA', False)
MASK_MODEL_PATH_ENV = os.environ.get('MASK_MODEL_PATH', '').strip()
MASK_MODEL = None

logger.info("Starting Flask server with Face Recognition + Helmet + Mask Detection...")
logger.info(f"Model: {MODEL_NAME}, Detector: {DETECTOR_BACKEND}")


# ==============================================================================
# HELMET LOG UTILITIES  (unchanged)
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


def read_helmet_logs():
    with HELMET_LOG_LOCK:
        return _read_helmet_logs_unlocked()


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


def read_mask_logs():
    with MASK_LOG_LOCK:
        return _read_mask_logs_unlocked()


def summarize_mask_logs(logs):
    total         = len(logs)
    compliant     = sum(1 for l in logs if l.get('status') == 'Compliant')
    non_compliant = sum(1 for l in logs if l.get('status') == 'Non-Compliant')
    no_person     = sum(1 for l in logs if l.get('status') == 'No Persons Detected')
    avg_conf      = round(sum(float(l.get('confidence', 0) or 0) for l in logs) / total, 2) if total > 0 else 0
    compliance_rate = round((compliant / total) * 100, 2) if total > 0 else 0
    return {
        "total_detections":    total,
        "compliant":           compliant,
        "non_compliant":       non_compliant,
        "no_person_detections": no_person,
        "avg_confidence":      avg_conf,
        "compliance_rate":     compliance_rate
    }


# ==============================================================================
# HELMET MODEL LOADING  (unchanged)
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
    for candidate in candidates:
        normalized = os.path.normpath(candidate)
        if normalized not in seen:
            unique_candidates.append(normalized)
            seen.add(normalized)

    for candidate in unique_candidates:
        if os.path.exists(candidate):
            return candidate

    searched = "\n".join(f" - {candidate}" for candidate in unique_candidates)
    raise RuntimeError(
        "Mask model not found.\n"
        "Place your highest-accuracy weights at backend/models/mask_best.pt or set MASK_MODEL_PATH.\n"
        f"Searched:\n{searched}"
    )


def load_mask_model():
    """
    Load the highest-accuracy mask detection weights available.

    Preferred:
        backend/models/mask_best.pt or MASK_MODEL_PATH

    Fallback:
        backend/models/mask.pt

    Expected classes (keremberke/yolov8n-face-mask-detection):
        0 → mask_weared_incorrect
        1 → with_mask
        2 → without_mask

    Run python download_mask_model.py to fetch the legacy fallback model,
    or drop in your own fine-tuned best.pt for the strongest accuracy.
    """
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
    logger.info(
        "Mask inference config: conf=%s iou=%s upload_imgsz=%s stream_imgsz=%s max_det=%s upload_tta=%s stream_tta=%s",
        MASK_CONF_THRESHOLD,
        MASK_IOU_THRESHOLD,
        MASK_UPLOAD_IMGSZ,
        MASK_STREAM_IMGSZ,
        MASK_MAX_DET,
        MASK_UPLOAD_TTA,
        MASK_STREAM_TTA,
    )
    return MASK_MODEL


# ==============================================================================
# HELMET DETECTION CORE  (unchanged)
# ==============================================================================

HELMET_LABELS    = {'hardhat', 'helmet', 'hard hat', 'hard-hat',
                    'safety_helmet', 'safety helmet', 'with_helmet', 'with helmet'}
NO_HELMET_LABELS = {'no-hardhat', 'no_hardhat', 'no hardhat',
                    'head', 'no helmet', 'no-helmet', 'no_helmet',
                    'without_helmet', 'without helmet', 'without-helmet'}

_HELMET_BOX_COLORS = {
    "helmet":    (34, 197, 94),
    "no_helmet": (239, 68, 68),
}
_HELMET_DEFAULT_COLOR = (148, 163, 184)


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
        (tw, th), baseline = cv2.getTextSize(
            label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2
        )
        label_y = max(y1 - 6, th + baseline)
        cv2.rectangle(
            img,
            (x1, label_y - th - baseline),
            (x1 + tw + 4, label_y + baseline),
            color,
            -1,
        )
        cv2.putText(
            img,
            label_text,
            (x1 + 2, label_y),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (255, 255, 255),
            2,
            cv2.LINE_AA,
        )

    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])
    if not ok:
        return ""
    b64 = base64.b64encode(buf).decode("utf-8")
    return f"data:image/jpeg;base64,{b64}"


def detect_helmets_simple(image_path):
    model = load_helmet_model()
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
                detections.append({
                    "label": "Helmet",
                    "confidence": round(conf * 100, 2),
                    "type": "helmet",
                    "bbox": [x1, y1, x2, y2],
                })
            elif label in NO_HELMET_LABELS:
                no_helmet += 1
                detections.append({
                    "label": "No Helmet",
                    "confidence": round(conf * 100, 2),
                    "type": "no_helmet",
                    "bbox": [x1, y1, x2, y2],
                })
            else:
                logger.warning(f"  Unknown label '{label}' — treating as no_helmet")
                no_helmet += 1
                detections.append({
                    "label": f"No Helmet ({label})",
                    "confidence": round(conf * 100, 2),
                    "type": "no_helmet",
                    "bbox": [x1, y1, x2, y2],
                })

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
        "persons":    persons,
        "helmets":    helmets,
        "no_helmet":  no_helmet,
        "status":     status,
        "compliance": compliance,
        "confidence": avg_confidence,
        "detections": detections,
        "annotated_image": annotated_image,
    }


# ==============================================================================
# MASK DETECTION CORE  ← NEW
# ==============================================================================

# Map every raw class name the model may emit to one of three canonical types.
# This keeps the API stable even when you swap in a custom fine-tuned model.
# keremberke/yolov8n-face-mask-detection class names:
#   0 → mask_weared_incorrect   1 → with_mask   2 → without_mask
def _normalize_mask_label(label: str) -> str:
    return "_".join(str(label).lower().replace('-', ' ').split())


_MASK_CLASS_MAP = {
    # wearing mask correctly
    "with_mask": "with_mask",
    "mask": "with_mask",
    "masked": "with_mask",
    "good": "with_mask",
    # wearing mask incorrectly
    "mask_weared_incorrect": "incorrect",
    "incorrect": "incorrect",
    "incorrect_mask": "incorrect",
    "improper_mask": "incorrect",
    "partial_mask": "incorrect",
    "bad": "incorrect",
    # not wearing mask
    "without_mask": "without_mask",
    "no_mask": "without_mask",
    "nomask": "without_mask",
    "none": "without_mask",
}

_MASK_BOX_COLORS = {
    "with_mask":   (34,  197,  94),   # green
    "incorrect":   (234, 179,   8),   # yellow
    "without_mask":(239,  68,  68),   # red
}
_MASK_DEFAULT_COLOR = (148, 163, 184)

_MASK_DISPLAY_LABELS = {
    "with_mask":    "Mask",
    "incorrect":    "Incorrect Mask",
    "without_mask": "No Mask",
}


def _draw_mask_boxes(image_path: str, detections: list) -> str:
    """Draw coloured bounding boxes on the image and return a base64 JPEG string."""
    img = cv2.imread(image_path)
    if img is None:
        return ""

    for det in detections:
        bbox = det.get("bbox")
        if not bbox or len(bbox) != 4:
            continue
        x1, y1, x2, y2 = [int(v) for v in bbox]
        det_type = det.get("type", "without_mask")
        color    = _MASK_BOX_COLORS.get(det_type, _MASK_DEFAULT_COLOR)

        cv2.rectangle(img, (x1, y1), (x2, y2), color, 2)

        label_text = f"{det.get('label', 'Face')} {float(det.get('confidence', 0)):.0f}%"
        (tw, th), baseline = cv2.getTextSize(
            label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2
        )
        label_y = max(y1 - 6, th + baseline)
        cv2.rectangle(
            img,
            (x1, label_y - th - baseline),
            (x1 + tw + 4, label_y + baseline),
            color,
            -1,
        )
        cv2.putText(
            img,
            label_text,
            (x1 + 2, label_y),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (255, 255, 255),
            2,
            cv2.LINE_AA,
        )

    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])
    if not ok:
        return ""
    return "data:image/jpeg;base64," + base64.b64encode(buf).decode("utf-8")


def _mask_inference_kwargs(mode: str) -> dict:
    is_stream = mode == 'stream'
    return {
        "conf": MASK_CONF_THRESHOLD,
        "iou": MASK_IOU_THRESHOLD,
        "imgsz": MASK_STREAM_IMGSZ if is_stream else MASK_UPLOAD_IMGSZ,
        "max_det": MASK_MAX_DET,
        "augment": MASK_STREAM_TTA if is_stream else MASK_UPLOAD_TTA,
        "verbose": False,
    }


def detect_masks_core(image_path: str, mode: str = 'upload') -> dict:
    """
    Run YOLOv8 mask detection on *image_path* and return a structured dict
    whose shape matches what your frontend MaskLog type expects.
    """
    model   = load_mask_model()
    results = model(image_path, **_mask_inference_kwargs(mode))

    masked_count    = 0
    without_mask    = 0
    incorrect_count = 0
    detections      = []

    for result in results:
        if result.boxes is None or len(result.boxes) == 0:
            continue
        for box in result.boxes:
            cls_id = int(box.cls[0].item())
            conf   = float(box.conf[0].item())
            raw_label = str(model.names[cls_id]).strip()
            normalized_label = _normalize_mask_label(raw_label)
            det_type  = _MASK_CLASS_MAP.get(normalized_label, "without_mask")  # safe default
            x1, y1, x2, y2 = [int(v) for v in box.xyxy[0].tolist()]

            logger.info(
                "  Mask detection: cls=%s label='%s' normalized='%s' type='%s' conf=%.2f",
                cls_id,
                raw_label,
                normalized_label,
                det_type,
                conf,
            )

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
        status     = "No Persons Detected"
        compliance = True
    elif without_mask > 0 or incorrect_count > 0:
        status     = "Non-Compliant"
        compliance = False
    else:
        status     = "Compliant"
        compliance = True

    all_confs      = [d["confidence"] for d in detections]
    avg_confidence = round(sum(all_confs) / len(all_confs), 2) if all_confs else 0.0
    annotated_image = _draw_mask_boxes(image_path, detections)

    return {
        "persons":         persons,
        "masked":          masked_count,
        "without_mask":    without_mask,
        "incorrect":       incorrect_count,
        "status":          status,
        "compliance":      compliance,
        "confidence":      avg_confidence,
        "detections":      detections,
        "annotated_image": annotated_image,
    }


# ==============================================================================
# FACE RECOGNITION UTILITIES  (unchanged)
# ==============================================================================

def get_single_embedding(img_path):
    try:
        results = DeepFace.represent(
            img_path=img_path,
            model_name=MODEL_NAME,
            detector_backend=DETECTOR_BACKEND,
            enforce_detection=True,
            align=True
        )
        if results and len(results) > 0:
            embedding = np.array(results[0]['embedding'], dtype=np.float32)
            norm = np.linalg.norm(embedding)
            if norm > 0:
                return embedding / norm
        return None
    except Exception as e:
        logger.debug(f"Face detection failed: {e}")
        return None


# ==============================================================================
# ENROLLMENT ENDPOINTS  (unchanged)
# ==============================================================================

@app.route('/upload-images', methods=['POST'])
def upload_images():
    try:
        cnic    = request.form.get('cnic')
        name    = request.form.get('name')
        email   = request.form.get('email')
        phone   = request.form.get('phone')
        address = request.form.get('address', '')
        city    = request.form.get('city', '')

        files = request.files.getlist('images')
        if not cnic or not files:
            return jsonify({"status": "error", "message": "CNIC and images are required"}), 400

        resident_folder = os.path.join(UPLOAD_FOLDER, cnic)
        images_folder   = os.path.join(resident_folder, 'images')
        os.makedirs(images_folder, exist_ok=True)

        saved_files    = []
        face_encodings = []

        logger.info(f"Enrolling {name} ({cnic}) with {len(files)} image(s)")

        for i, file in enumerate(files):
            if not file or not file.filename:
                continue
            ext          = os.path.splitext(file.filename)[1] or '.jpg'
            new_filename = f"image_{i+1}{ext}"
            filepath     = os.path.join(images_folder, new_filename)
            file.save(filepath)
            saved_files.append(new_filename)

            embedding = get_single_embedding(filepath)
            if embedding is not None:
                face_encodings.append(embedding)
                logger.info(f"  image {i+1}: Face encoding saved")
            else:
                logger.warning(f"  image {i+1}: No face detected")

        if len(face_encodings) == 0:
            shutil.rmtree(resident_folder, ignore_errors=True)
            return jsonify({
                "status":  "error",
                "message": "No valid faces detected. Please upload clear, well-lit photos."
            }), 400

        avg_encoding = np.mean(face_encodings, axis=0)
        avg_encoding = avg_encoding / np.linalg.norm(avg_encoding)
        np.save(os.path.join(resident_folder, 'face_encodings.npy'), avg_encoding.astype(ENCODING_DTYPE))
        np.save(
            os.path.join(resident_folder, 'all_encodings.npy'),
            np.array(face_encodings, dtype=ENCODING_DTYPE)
        )

        profile_data = {
            "cnic":           cnic,
            "name":           name,
            "email":          email,
            "phone":          phone,
            "address":        address,
            "city":           city,
            "enrolled_at":    datetime.now().isoformat(),
            "image_count":    len(saved_files),
            "faces_detected": len(face_encodings),
            "model":          MODEL_NAME,
            "status":         "Active"
        }
        with open(os.path.join(resident_folder, 'profile_data.json'), 'w') as f:
            json.dump(profile_data, f, indent=2)

        return jsonify({
            "status":  "success",
            "message": f"Resident {name} enrolled successfully!",
            "data": {
                "cnic":           cnic,
                "images_saved":   len(saved_files),
                "faces_detected": len(face_encodings)
            }
        })

    except Exception as e:
        logger.exception("Enrollment error")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/get-residents', methods=['GET'])
def get_residents():
    try:
        residents = []
        for folder_name in os.listdir(UPLOAD_FOLDER):
            folder_path  = os.path.join(UPLOAD_FOLDER, folder_name)
            if not os.path.isdir(folder_path) or folder_name.startswith('temp'):
                continue
            profile_path = os.path.join(folder_path, 'profile_data.json')
            if not os.path.exists(profile_path):
                continue
            with open(profile_path, 'r') as f:
                profile_data = json.load(f)
            residents.append({
                "cnic":           profile_data.get('cnic', ''),
                "name":           profile_data.get('name', ''),
                "email":          profile_data.get('email', ''),
                "phone":          profile_data.get('phone', ''),
                "address":        profile_data.get('address', ''),
                "city":           profile_data.get('city', ''),
                "enrolled_at":    profile_data.get('enrolled_at', ''),
                "image_count":    profile_data.get('image_count', 0),
                "faces_detected": profile_data.get('faces_detected', 0),
                "status":         profile_data.get('status', 'Active')
            })
        return jsonify({"status": "success", "residents": residents})
    except Exception as e:
        logger.exception('get_residents error')
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/get-resident/<cnic>', methods=['GET'])
def get_resident(cnic):
    try:
        resident_folder = os.path.join(UPLOAD_FOLDER, cnic)
        profile_path    = os.path.join(resident_folder, 'profile_data.json')
        images_folder   = os.path.join(resident_folder, 'images')
        if not os.path.exists(profile_path):
            return jsonify({"status": "error", "message": "Resident not found"}), 404
        with open(profile_path, 'r') as f:
            profile_data = json.load(f)
        images = []
        if os.path.exists(images_folder):
            images = [f for f in os.listdir(images_folder)
                      if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
        return jsonify({"status": "success", "resident": {**profile_data, "images": images}})
    except Exception as e:
        logger.exception('get_resident error')
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/get-resident-image/<cnic>/<filename>', methods=['GET'])
def get_resident_image(cnic, filename):
    try:
        possible_paths = [
            os.path.join(UPLOAD_FOLDER, cnic, 'images', filename),
            os.path.join(UPLOAD_FOLDER, cnic, 'images', filename.replace('.jpg', '.jpeg')),
            os.path.join(UPLOAD_FOLDER, cnic, 'images', filename.replace('.jpg', '.png')),
        ]
        image_path = None
        for path in possible_paths:
            if os.path.exists(path):
                image_path = path
                break
        if not image_path:
            return "Image not found", 404
        mimetype = 'image/png' if image_path.endswith('.png') else 'image/jpeg'
        return send_file(image_path, mimetype=mimetype)
    except Exception as e:
        logger.exception('get_resident_image error')
        return "Error", 500


@app.route('/delete-resident/<cnic>', methods=['DELETE'])
def delete_resident(cnic):
    try:
        resident_folder = os.path.join(UPLOAD_FOLDER, cnic)
        if not os.path.exists(resident_folder):
            return jsonify({"status": "error", "message": "Resident not found"}), 404
        shutil.rmtree(resident_folder)
        return jsonify({"status": "success", "message": "Resident deleted successfully"})
    except Exception as e:
        logger.exception('delete_resident error')
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/update-resident-status/<cnic>', methods=['POST'])
def update_resident_status(cnic):
    try:
        new_status      = request.json.get('status')
        resident_folder = os.path.join(UPLOAD_FOLDER, cnic)
        profile_path    = os.path.join(resident_folder, 'profile_data.json')
        if not os.path.exists(profile_path):
            return jsonify({"status": "error", "message": "Resident not found"}), 404
        with open(profile_path, 'r') as f:
            profile_data = json.load(f)
        profile_data['status'] = new_status
        with open(profile_path, 'w') as f:
            json.dump(profile_data, f, indent=2)
        return jsonify({"status": "success", "message": "Status updated successfully"})
    except Exception as e:
        logger.exception('update_resident_status error')
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/update-resident/<cnic>', methods=['PUT'])
def update_resident(cnic):
    try:
        data            = request.json
        resident_folder = os.path.join(UPLOAD_FOLDER, cnic)
        profile_path    = os.path.join(resident_folder, 'profile_data.json')
        if not os.path.exists(profile_path):
            return jsonify({"status": "error", "message": "Resident not found"}), 404
        with open(profile_path, 'r') as f:
            profile_data = json.load(f)
        profile_data['name']    = data.get('name',    profile_data.get('name'))
        profile_data['email']   = data.get('email',   profile_data.get('email'))
        profile_data['phone']   = data.get('phone',   profile_data.get('phone'))
        profile_data['address'] = data.get('address', profile_data.get('address', ''))
        profile_data['city']    = data.get('city',    profile_data.get('city', ''))
        with open(profile_path, 'w') as f:
            json.dump(profile_data, f, indent=2)
        return jsonify({"status": "success", "message": "Resident updated successfully"})
    except Exception as e:
        logger.exception('update_resident error')
        return jsonify({"status": "error", "message": str(e)}), 500


# ==============================================================================
# HELMET DETECTION ENDPOINTS  (unchanged)
# ==============================================================================

@app.route('/helmet-detect', methods=['POST'])
def helmet_detect():
    image     = request.files.get('image')
    location  = request.form.get('location', 'Unknown Site')
    source    = request.form.get('source', 'image')
    camera_id = request.form.get('camera_id', '')

    if image is None or not image.filename:
        return jsonify({"status": "error", "message": "image is required"}), 400

    ext       = os.path.splitext(image.filename)[1] or '.jpg'
    temp_name = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid4().hex[:8]}{ext}"
    temp_path = os.path.join(HELMET_UPLOAD_FOLDER, temp_name)

    try:
        started_at = datetime.utcnow()
        image.save(temp_path)

        detection     = detect_helmets_simple(temp_path)
        processing_ms = (datetime.utcnow() - started_at).total_seconds() * 1000

        log_entry = {
            "id":            int(datetime.now().timestamp() * 1000),
            "timestamp":     datetime.utcnow().isoformat() + 'Z',
            "location":      location,
            "persons":       detection["persons"],
            "helmets":       detection["helmets"],
            "no_helmet":     detection["no_helmet"],
            "status":        detection["status"],
            "confidence":    detection["confidence"],
            "file_name":     image.filename,
            "source":        source,
            "camera_id":     camera_id,
            "processing_ms": round(processing_ms, 2),
            "annotated_image": detection["annotated_image"],
        }
        append_helmet_log(log_entry)

        return jsonify({
            "status":  "success",
            "message": "Helmet detection completed",
            "data": {
                **log_entry,
                "compliance": detection["compliance"],
                "detections": detection["detections"]
            }
        })

    except Exception as e:
        logger.exception('helmet_detect error')
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        try:
            if os.path.exists(temp_path):
                os.remove(temp_path)
        except Exception:
            pass


@app.route('/helmet-detect-stream', methods=['POST'])
def helmet_detect_stream():
    data = request.get_json()
    if not data or 'frame' not in data:
        return jsonify({"status": "error", "message": "frame is required"}), 400

    location  = data.get('location', 'Unknown Site')
    camera_id = data.get('camera_id', 'cam_01')
    temp_path = None

    try:
        frame_b64 = data['frame']
        if ',' in frame_b64:
            frame_b64 = frame_b64.split(',')[1]

        img_bytes = base64.b64decode(frame_b64)
        img_array = np.frombuffer(img_bytes, dtype=np.uint8)
        frame     = cv2.imdecode(img_array, cv2.IMREAD_COLOR)

        if frame is None:
            return jsonify({"status": "error", "message": "Could not decode frame"}), 400

        temp_name = f"stream_{uuid4().hex[:8]}.jpg"
        temp_path = os.path.join(HELMET_UPLOAD_FOLDER, temp_name)
        cv2.imwrite(temp_path, frame)

        started_at    = datetime.utcnow()
        detection     = detect_helmets_simple(temp_path)
        processing_ms = (datetime.utcnow() - started_at).total_seconds() * 1000

        if detection['status'] == 'Violation':
            log_entry = {
                "id":            int(datetime.now().timestamp() * 1000),
                "timestamp":     datetime.utcnow().isoformat() + 'Z',
                "location":      location,
                "persons":       detection["persons"],
                "helmets":       detection["helmets"],
                "no_helmet":     detection["no_helmet"],
                "status":        detection["status"],
                "confidence":    detection["confidence"],
                "file_name":     f"stream_{camera_id}",
                "source":        "stream",
                "camera_id":     camera_id,
                "processing_ms": round(processing_ms, 2),
                "annotated_image": detection["annotated_image"],
            }
            append_helmet_log(log_entry)

        return jsonify({
            "status": "success",
            "data":   {**detection, "processing_ms": round(processing_ms, 2), "camera_id": camera_id}
        })

    except Exception as e:
        logger.exception('helmet_detect_stream error')
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        try:
            if temp_path and os.path.exists(temp_path):
                os.remove(temp_path)
        except Exception:
            pass


@app.route('/helmet-logs', methods=['GET'])
def helmet_logs():
    try:
        if not os.path.exists(HELMET_LOG_PATH):
            return jsonify({
                "status": "success",
                "logs":   [],
                "summary": {
                    "total_detections":     0,
                    "compliant":            0,
                    "violations":           0,
                    "no_person_detections": 0,
                    "avg_confidence":       0,
                    "compliance_rate":      0
                },
                "pagination": {"page": 1, "page_size": 50, "total": 0, "total_pages": 0}
            })

        logs = read_helmet_logs()

        location = request.args.get('location', 'all')
        status   = request.args.get('status',   'all')
        source   = request.args.get('source',   'all')

        filtered = logs
        if location != 'all':
            filtered = [l for l in filtered if l.get('location') == location]
        if status != 'all':
            filtered = [l for l in filtered if l.get('status') == status]
        if source != 'all':
            filtered = [l for l in filtered if l.get('source') == source]

        filtered   = sorted(filtered, key=lambda x: x.get('timestamp', ''), reverse=True)
        total      = len(filtered)
        compliant  = sum(1 for l in filtered if l.get('status') == 'Compliant')
        violations = sum(1 for l in filtered if l.get('status') == 'Violation')
        no_person  = sum(1 for l in filtered if l.get('status') == 'No Persons Detected')
        avg_conf   = round(sum(l.get('confidence', 0) for l in filtered) / total, 2) if total > 0 else 0
        compliance_rate = round((compliant / total) * 100, 2) if total > 0 else 0

        page      = max(int(request.args.get('page',      1)),  1)
        page_size = max(int(request.args.get('page_size', 50)), 1)
        start     = (page - 1) * page_size
        end       = start + page_size

        return jsonify({
            "status": "success",
            "logs":   filtered[start:end],
            "summary": {
                "total_detections":     total,
                "compliant":            compliant,
                "violations":           violations,
                "no_person_detections": no_person,
                "avg_confidence":       avg_conf,
                "compliance_rate":      compliance_rate
            },
            "pagination": {
                "page": page, "page_size": page_size, "total": total,
                "total_pages": (total + page_size - 1) // page_size if total > 0 else 0
            }
        })

    except Exception as e:
        logger.exception('helmet_logs error')
        return jsonify({"status": "error", "message": str(e)}), 500


# ==============================================================================
# MASK DETECTION ENDPOINTS  ← REPLACED WITH REAL YOLOV8 INFERENCE
# ==============================================================================

@app.route('/mask-detect', methods=['POST'])
def mask_detect():
    """
    Upload-based mask detection.
    Accepts: multipart/form-data  { image, location?, source?, camera_id? }
    Returns: MaskDetectionResponse shape expected by maskApi.ts
    """
    image     = request.files.get('image')
    location  = request.form.get('location', 'Unknown Site')
    source    = request.form.get('source', 'image')
    camera_id = request.form.get('camera_id', '')

    if image is None or not image.filename:
        return jsonify({"status": "error", "message": "image is required"}), 400

    ext       = os.path.splitext(image.filename)[1] or '.jpg'
    temp_name = f"mask_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid4().hex[:8]}{ext}"
    temp_path = os.path.join(MASK_UPLOAD_FOLDER, temp_name)

    try:
        started_at = datetime.utcnow()
        image.save(temp_path)

        detection     = detect_masks_core(temp_path, mode='upload')
        processing_ms = (datetime.utcnow() - started_at).total_seconds() * 1000

        log_entry = {
            "id":            int(datetime.now().timestamp() * 1000),
            "timestamp":     datetime.utcnow().isoformat() + 'Z',
            "location":      location,
            "persons":       detection["persons"],
            "masked":        detection["masked"],
            "without_mask":  detection["without_mask"],
            "incorrect":     detection["incorrect"],
            "status":        detection["status"],
            "confidence":    detection["confidence"],
            "file_name":     image.filename,
            "source":        source,
            "camera_id":     camera_id,
            "processing_ms": round(processing_ms, 2),
            "annotated_image": detection["annotated_image"],
        }
        append_mask_log(log_entry)

        return jsonify({
            "status":  "success",
            "message": "Mask detection completed",
            "data": {
                **log_entry,
                "compliance": detection["compliance"],
                "detections": detection["detections"],
            }
        })

    except Exception as e:
        logger.exception('mask_detect error')
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        try:
            if os.path.exists(temp_path):
                os.remove(temp_path)
        except Exception:
            pass


@app.route('/mask-detect-stream', methods=['POST'])
def mask_detect_stream():
    """
    Stream-frame mask detection.
    Accepts: application/json { frame: <base64>, camera_id?, location? }
    Returns: { status, data: MaskLog & { compliance, annotated_image } }
    """
    data = request.get_json()
    if not data or 'frame' not in data:
        return jsonify({"status": "error", "message": "frame is required"}), 400

    location  = data.get('location', 'Unknown Site')
    camera_id = data.get('camera_id', 'cam_01')
    temp_path = None

    try:
        frame_b64 = data['frame']
        if ',' in frame_b64:
            frame_b64 = frame_b64.split(',')[1]

        img_bytes = base64.b64decode(frame_b64)
        img_array = np.frombuffer(img_bytes, dtype=np.uint8)
        frame     = cv2.imdecode(img_array, cv2.IMREAD_COLOR)

        if frame is None:
            return jsonify({"status": "error", "message": "Could not decode frame"}), 400

        temp_name = f"mask_stream_{uuid4().hex[:8]}.jpg"
        temp_path = os.path.join(MASK_UPLOAD_FOLDER, temp_name)
        cv2.imwrite(temp_path, frame)

        started_at    = datetime.utcnow()
        detection     = detect_masks_core(temp_path, mode='stream')
        processing_ms = (datetime.utcnow() - started_at).total_seconds() * 1000

        # Only persist non-compliant stream frames to the log
        if detection['status'] == 'Non-Compliant':
            log_entry = {
                "id":            int(datetime.now().timestamp() * 1000),
                "timestamp":     datetime.utcnow().isoformat() + 'Z',
                "location":      location,
                "persons":       detection["persons"],
                "masked":        detection["masked"],
                "without_mask":  detection["without_mask"],
                "incorrect":     detection["incorrect"],
                "status":        detection["status"],
                "confidence":    detection["confidence"],
                "file_name":     f"stream_{camera_id}",
                "source":        "stream",
                "camera_id":     camera_id,
                "processing_ms": round(processing_ms, 2),
                "annotated_image": detection["annotated_image"],
            }
            append_mask_log(log_entry)

        return jsonify({
            "status": "success",
            "data": {
                **detection,
                "processing_ms": round(processing_ms, 2),
                "camera_id":     camera_id,
                "timestamp":     datetime.utcnow().isoformat() + 'Z',
                "file_name":     f"stream_{camera_id}",
                "source":        "stream",
                "id":            int(datetime.now().timestamp() * 1000),
            }
        })

    except Exception as e:
        logger.exception('mask_detect_stream error')
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        try:
            if temp_path and os.path.exists(temp_path):
                os.remove(temp_path)
        except Exception:
            pass


@app.route('/mask-log', methods=['POST'])
def create_mask_log():
    """
    Manual log entry (legacy / frontend-only).
    Backend inference is now live, but this endpoint is kept for compatibility.
    """
    try:
        payload = request.get_json(silent=True) or {}

        persons       = int(payload.get('persons',      0) or 0)
        masked        = int(payload.get('masked',       0) or 0)
        without_mask  = int(payload.get('without_mask', 0) or 0)
        incorrect     = int(payload.get('incorrect',    0) or 0)
        status        = str(payload.get('status', 'No Persons Detected'))
        confidence    = float(payload.get('confidence',    0.0) or 0.0)
        file_name     = str(payload.get('file_name',  'unknown.jpg'))
        source        = str(payload.get('source',     'image'))
        camera_id     = str(payload.get('camera_id',  ''))
        processing_ms = float(payload.get('processing_ms', 0.0) or 0.0)

        if persons < 0 or masked < 0 or without_mask < 0 or incorrect < 0:
            return jsonify({"status": "error", "message": "counts must be non-negative"}), 400

        total_detected = masked + without_mask + incorrect
        if total_detected > persons:
            persons = total_detected

        if status not in ('Compliant', 'Non-Compliant', 'No Persons Detected'):
            if persons == 0:
                status = 'No Persons Detected'
            elif without_mask > 0 or incorrect > 0:
                status = 'Non-Compliant'
            else:
                status = 'Compliant'

        log_entry = {
            "id":            int(datetime.now().timestamp() * 1000),
            "timestamp":     datetime.utcnow().isoformat() + 'Z',
            "persons":       persons,
            "masked":        masked,
            "without_mask":  without_mask,
            "incorrect":     incorrect,
            "status":        status,
            "confidence":    round(confidence, 2),
            "file_name":     file_name,
            "source":        source,
            "camera_id":     camera_id,
            "processing_ms": round(processing_ms, 2)
        }
        append_mask_log(log_entry)

        return jsonify({"status": "success", "message": "Mask log saved", "data": log_entry})

    except Exception as e:
        logger.exception('create_mask_log error')
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/mask-logs', methods=['GET'])
def mask_logs():
    try:
        logs = read_mask_logs()

        status     = request.args.get('status',     'all')
        source     = request.args.get('source',     'all')
        start_time = request.args.get('start_time')
        end_time   = request.args.get('end_time')

        filtered = logs
        if status != 'all':
            filtered = [l for l in filtered if l.get('status') == status]
        if source != 'all':
            filtered = [l for l in filtered if l.get('source') == source]
        if start_time:
            filtered = [l for l in filtered if str(l.get('timestamp', '')) >= str(start_time)]
        if end_time:
            filtered = [l for l in filtered if str(l.get('timestamp', '')) <= str(end_time)]

        filtered = sorted(filtered, key=lambda x: x.get('timestamp', ''), reverse=True)

        page      = max(int(request.args.get('page',      1)),  1)
        page_size = max(int(request.args.get('page_size', 50)), 1)
        start     = (page - 1) * page_size
        end       = start + page_size
        total     = len(filtered)

        return jsonify({
            "status": "success",
            "logs":   filtered[start:end],
            "summary": summarize_mask_logs(filtered),
            "pagination": {
                "page":        page,
                "page_size":   page_size,
                "total":       total,
                "total_pages": (total + page_size - 1) // page_size if total > 0 else 0
            }
        })

    except Exception as e:
        logger.exception('mask_logs error')
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/mask-stats', methods=['GET'])
def mask_stats():
    try:
        logs    = read_mask_logs()
        summary = summarize_mask_logs(logs)

        today_prefix = datetime.utcnow().date().isoformat()
        violations_today = sum(
            1 for l in logs
            if l.get('status') == 'Non-Compliant'
            and str(l.get('timestamp', '')).startswith(today_prefix)
        )

        return jsonify({
            "status": "success",
            "data": {
                "total_detections": summary["total_detections"],
                "compliance_rate":  summary["compliance_rate"],
                "violations_today": violations_today,
                "compliant":        summary["compliant"],
                "non_compliant":    summary["non_compliant"],
                "no_person":        summary["no_person_detections"],
                "avg_confidence":   summary["avg_confidence"]
            }
        })

    except Exception as e:
        logger.exception('mask_stats error')
        return jsonify({"status": "error", "message": str(e)}), 500


# ==============================================================================
# EAGER MODEL LOADING AT STARTUP
# ==============================================================================

def _eager_load():
    # Helmet
    try:
        load_helmet_model()
        logger.info("Helmet model ready.")
    except Exception as e:
        logger.error(f"Helmet model failed to load: {e}")

    # Mask  ← NEW
    try:
        load_mask_model()
        logger.info("Mask model ready.")
    except Exception as e:
        logger.error(f"Mask model failed to load: {e}")


threading.Thread(target=_eager_load, daemon=True).start()


# ==============================================================================
# ENTRY POINT
# ==============================================================================

if __name__ == '__main__':
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "test":
        model = load_helmet_model()
        print("Helmet classes:", model.names)
        mmodel = load_mask_model()
        print("Mask classes:", mmodel.names)
        sys.exit(0)

    app.run(debug=True, host='0.0.0.0', port=5000)
