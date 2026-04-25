import base64
import os
from datetime import datetime
from uuid import uuid4

import cv2
import numpy as np
from flask import jsonify, request


def register_mask_routes(app, deps):
    logger = deps["logger"]
    MASK_UPLOAD_FOLDER = deps["MASK_UPLOAD_FOLDER"]
    detect_masks_core = deps["detect_masks_core"]
    append_mask_log = deps["append_mask_log"]
    read_mask_logs = deps["read_mask_logs"]
    summarize_mask_logs = deps["summarize_mask_logs"]
    _persist_detection_image = deps["_persist_detection_image"]
    _attach_storage_result_to_log = deps["_attach_storage_result_to_log"]
    _should_store_stream_event = deps["_should_store_stream_event"]

    @app.route('/mask-detect', methods=['POST'])
    def mask_detect():
        image = request.files.get('image')
        location = request.form.get('location', 'Unknown Site')
        source = request.form.get('source', 'image')
        camera_id = request.form.get('camera_id', '')

        if image is None or not image.filename:
            return jsonify({"status": "error", "message": "image is required"}), 400

        ext = os.path.splitext(image.filename)[1] or '.jpg'
        temp_name = f"mask_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid4().hex[:8]}{ext}"
        temp_path = os.path.join(MASK_UPLOAD_FOLDER, temp_name)

        try:
            started_at = datetime.utcnow()
            image.save(temp_path)
            detection = detect_masks_core(temp_path, mode='upload')
            processing_ms = (datetime.utcnow() - started_at).total_seconds() * 1000

            log_entry = {
                "id": int(datetime.now().timestamp() * 1000),
                "timestamp": datetime.utcnow().isoformat() + 'Z',
                "location": location,
                "persons": detection["persons"],
                "masked": detection["masked"],
                "without_mask": detection["without_mask"],
                "incorrect": detection["incorrect"],
                "status": detection["status"],
                "confidence": detection["confidence"],
                "file_name": image.filename,
                "source": source,
                "camera_id": camera_id,
                "processing_ms": round(processing_ms, 2),
                "annotated_image": detection["annotated_image"],
            }
            storage_result = _persist_detection_image('mask', camera_id or source, detection["annotated_image"])
            append_mask_log(_attach_storage_result_to_log(log_entry, storage_result))

            return jsonify({
                "status": "success",
                "message": "Mask detection completed",
                "data": {**log_entry, "compliance": detection["compliance"], "detections": detection["detections"]}
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
        data = request.get_json()
        if not data or 'frame' not in data:
            return jsonify({"status": "error", "message": "frame is required"}), 400

        location = data.get('location', 'Unknown Site')
        camera_id = data.get('camera_id', 'cam_01')
        temp_path = None

        try:
            frame_b64 = data['frame']
            if ',' in frame_b64:
                frame_b64 = frame_b64.split(',')[1]

            frame = cv2.imdecode(np.frombuffer(base64.b64decode(frame_b64), dtype=np.uint8), cv2.IMREAD_COLOR)
            if frame is None:
                return jsonify({"status": "error", "message": "Could not decode frame"}), 400

            temp_path = os.path.join(MASK_UPLOAD_FOLDER, f"mask_stream_{uuid4().hex[:8]}.jpg")
            cv2.imwrite(temp_path, frame)

            started_at = datetime.utcnow()
            detection = detect_masks_core(temp_path, mode='stream')
            processing_ms = (datetime.utcnow() - started_at).total_seconds() * 1000

            if detection['status'] == 'Non-Compliant':
                event_signature = f"status:{detection['status']}|persons:{detection['persons']}|without_mask:{detection['without_mask']}|incorrect:{detection['incorrect']}"
                if _should_store_stream_event('mask', camera_id, event_signature):
                    storage_result = _persist_detection_image('mask', camera_id, detection['annotated_image'])
                else:
                    storage_result = None

                log_entry = {
                    "id": int(datetime.now().timestamp() * 1000),
                    "timestamp": datetime.utcnow().isoformat() + 'Z',
                    "location": location,
                    "persons": detection["persons"],
                    "masked": detection["masked"],
                    "without_mask": detection["without_mask"],
                    "incorrect": detection["incorrect"],
                    "status": detection["status"],
                    "confidence": detection["confidence"],
                    "file_name": f"stream_{camera_id}",
                    "source": "stream",
                    "camera_id": camera_id,
                    "processing_ms": round(processing_ms, 2),
                    "annotated_image": detection["annotated_image"],
                }
                append_mask_log(_attach_storage_result_to_log(log_entry, storage_result))

            return jsonify({
                "status": "success",
                "data": {
                    **detection,
                    "processing_ms": round(processing_ms, 2),
                    "camera_id": camera_id,
                    "timestamp": datetime.utcnow().isoformat() + 'Z',
                    "file_name": f"stream_{camera_id}",
                    "source": "stream",
                    "id": int(datetime.now().timestamp() * 1000),
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
        try:
            payload = request.get_json(silent=True) or {}
            persons = int(payload.get('persons', 0) or 0)
            masked = int(payload.get('masked', 0) or 0)
            without_mask = int(payload.get('without_mask', 0) or 0)
            incorrect = int(payload.get('incorrect', 0) or 0)
            status = str(payload.get('status', 'No Persons Detected'))
            confidence = float(payload.get('confidence', 0.0) or 0.0)
            file_name = str(payload.get('file_name', 'unknown.jpg'))
            source = str(payload.get('source', 'image'))
            camera_id = str(payload.get('camera_id', ''))
            processing_ms = float(payload.get('processing_ms', 0.0) or 0.0)

            total_detected = masked + without_mask + incorrect
            if total_detected > persons:
                persons = total_detected

            if status not in ('Compliant', 'Non-Compliant', 'No Persons Detected'):
                status = 'No Persons Detected' if persons == 0 else ('Non-Compliant' if without_mask > 0 or incorrect > 0 else 'Compliant')

            log_entry = {
                "id": int(datetime.now().timestamp() * 1000),
                "timestamp": datetime.utcnow().isoformat() + 'Z',
                "persons": persons,
                "masked": masked,
                "without_mask": without_mask,
                "incorrect": incorrect,
                "status": status,
                "confidence": round(confidence, 2),
                "file_name": file_name,
                "source": source,
                "camera_id": camera_id,
                "processing_ms": round(processing_ms, 2),
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
            status = request.args.get('status', 'all')
            source = request.args.get('source', 'all')
            start_time = request.args.get('start_time')
            end_time = request.args.get('end_time')

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
            total = len(filtered)
            page = max(int(request.args.get('page', 1)), 1)
            page_size = max(int(request.args.get('page_size', 50)), 1)
            start = (page - 1) * page_size

            return jsonify({
                "status": "success",
                "logs": filtered[start:start + page_size],
                "summary": summarize_mask_logs(filtered),
                "pagination": {
                    "page": page,
                    "page_size": page_size,
                    "total": total,
                    "total_pages": (total + page_size - 1) // page_size if total > 0 else 0,
                }
            })
        except Exception as e:
            logger.exception('mask_logs error')
            return jsonify({"status": "error", "message": str(e)}), 500

    @app.route('/mask-stats', methods=['GET'])
    def mask_stats():
        try:
            logs = read_mask_logs()
            summary = summarize_mask_logs(logs)
            today_prefix = datetime.utcnow().date().isoformat()
            violations_today = sum(1 for l in logs if l.get('status') == 'Non-Compliant' and str(l.get('timestamp', '')).startswith(today_prefix))

            return jsonify({
                "status": "success",
                "data": {
                    "total_detections": summary["total_detections"],
                    "compliance_rate": summary["compliance_rate"],
                    "violations_today": violations_today,
                    "compliant": summary["compliant"],
                    "non_compliant": summary["non_compliant"],
                    "no_person": summary["no_person_detections"],
                    "avg_confidence": summary["avg_confidence"],
                }
            })
        except Exception as e:
            logger.exception('mask_stats error')
            return jsonify({"status": "error", "message": str(e)}), 500
