import base64
import os
from datetime import datetime
from uuid import uuid4

import cv2
import numpy as np
from flask import jsonify, request


def register_helmet_routes(app, deps):
    logger = deps["logger"]
    HELMET_UPLOAD_FOLDER = deps["HELMET_UPLOAD_FOLDER"]
    detect_helmets_simple = deps["detect_helmets_simple"]
    append_helmet_log = deps["append_helmet_log"]
    read_helmet_logs = deps["read_helmet_logs"]
    _persist_detection_image = deps["_persist_detection_image"]
    _attach_storage_result_to_log = deps["_attach_storage_result_to_log"]
    _should_store_stream_event = deps["_should_store_stream_event"]
    _check_capture_permission = deps["_check_capture_permission"]

    @app.route('/helmet-detect', methods=['POST'])
    def helmet_detect():
        is_allowed, error_info = _check_capture_permission()
        if not is_allowed:
            error_msg, status_code = error_info
            return jsonify({"status": "error", "message": error_msg}), status_code

        image = request.files.get('image')
        location = request.form.get('location', 'Unknown Site')
        source = request.form.get('source', 'image')
        camera_id = request.form.get('camera_id', '')
        company_id = (request.form.get('company_id') or request.headers.get('X-Company-ID') or '').strip() or None
        company_name = (request.form.get('company_name') or request.headers.get('X-Company-Name') or '').strip() or None

        if image is None or not image.filename:
            return jsonify({"status": "error", "message": "image is required"}), 400

        ext = os.path.splitext(image.filename)[1] or '.jpg'
        temp_name = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid4().hex[:8]}{ext}"
        temp_path = os.path.join(HELMET_UPLOAD_FOLDER, temp_name)

        try:
            started_at = datetime.utcnow()
            image.save(temp_path)
            detection = detect_helmets_simple(temp_path)
            processing_ms = (datetime.utcnow() - started_at).total_seconds() * 1000

            log_entry = {
                "id": int(datetime.now().timestamp() * 1000),
                "timestamp": datetime.utcnow().isoformat() + 'Z',
                "location": location,
                "persons": detection["persons"],
                "helmets": detection["helmets"],
                "no_helmet": detection["no_helmet"],
                "status": detection["status"],
                "confidence": detection["confidence"],
                "file_name": image.filename,
                "source": source,
                "camera_id": camera_id,
                "company_id": company_id,
                "organization_name": company_name,
                "processing_ms": round(processing_ms, 2),
                "annotated_image": detection["annotated_image"],
            }
            storage_result = _persist_detection_image('helmet', camera_id or source, detection["annotated_image"])
            append_helmet_log(_attach_storage_result_to_log(log_entry, storage_result))

            return jsonify({
                "status": "success",
                "message": "Helmet detection completed",
                "data": {**log_entry, "compliance": detection["compliance"], "detections": detection["detections"]}
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
        is_allowed, error_info = _check_capture_permission()
        if not is_allowed:
            error_msg, status_code = error_info
            return jsonify({"status": "error", "message": error_msg}), status_code

        data = request.get_json()
        if not data or 'frame' not in data:
            return jsonify({"status": "error", "message": "frame is required"}), 400

        location = data.get('location', 'Unknown Site')
        camera_id = data.get('camera_id', 'cam_01')
        company_id = (request.headers.get('X-Company-ID') or data.get('company_id') or '').strip() or None
        company_name = (request.headers.get('X-Company-Name') or data.get('company_name') or '').strip() or None
        temp_path = None

        try:
            frame_b64 = data['frame']
            if ',' in frame_b64:
                frame_b64 = frame_b64.split(',')[1]

            img_bytes = base64.b64decode(frame_b64)
            frame = cv2.imdecode(np.frombuffer(img_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
            if frame is None:
                return jsonify({"status": "error", "message": "Could not decode frame"}), 400

            temp_path = os.path.join(HELMET_UPLOAD_FOLDER, f"stream_{uuid4().hex[:8]}.jpg")
            cv2.imwrite(temp_path, frame)

            started_at = datetime.utcnow()
            detection = detect_helmets_simple(temp_path)
            processing_ms = (datetime.utcnow() - started_at).total_seconds() * 1000

            if detection['status'] == 'Violation':
                event_signature = f"status:{detection['status']}|persons:{detection['persons']}|no_helmet:{detection['no_helmet']}|helmets:{detection['helmets']}"
                if _should_store_stream_event('helmet', camera_id, event_signature):
                    storage_result = _persist_detection_image('helmet', camera_id, detection['annotated_image'])
                else:
                    storage_result = None

                log_entry = {
                    "id": int(datetime.now().timestamp() * 1000),
                    "timestamp": datetime.utcnow().isoformat() + 'Z',
                    "location": location,
                    "persons": detection["persons"],
                    "helmets": detection["helmets"],
                    "no_helmet": detection["no_helmet"],
                    "status": detection["status"],
                    "confidence": detection["confidence"],
                    "file_name": f"stream_{camera_id}",
                    "source": "stream",
                    "camera_id": camera_id,
                    "company_id": company_id,
                    "organization_name": company_name,
                    "processing_ms": round(processing_ms, 2),
                    "annotated_image": detection["annotated_image"],
                }
                append_helmet_log(_attach_storage_result_to_log(log_entry, storage_result))

            return jsonify({"status": "success", "data": {**detection, "processing_ms": round(processing_ms, 2), "camera_id": camera_id}})
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
            company_id = (request.headers.get('X-Company-ID') or '').strip() or None
            company_name = (request.headers.get('X-Company-Name') or '').strip() or None
            logs = read_helmet_logs(company_id=company_id, company_name=company_name)
            location = request.args.get('location', 'all')
            status = request.args.get('status', 'all')
            source = request.args.get('source', 'all')
            start_time = request.args.get('start_time')
            end_time = request.args.get('end_time')

            filtered = logs
            if location != 'all':
                filtered = [l for l in filtered if l.get('location') == location]
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
            compliant = sum(1 for l in filtered if l.get('status') == 'Compliant')
            violations = sum(1 for l in filtered if l.get('status') == 'Violation')
            no_person = sum(1 for l in filtered if l.get('status') == 'No Persons Detected')
            avg_conf = round(sum(l.get('confidence', 0) for l in filtered) / total, 2) if total > 0 else 0

            page = max(int(request.args.get('page', 1)), 1)
            page_size = max(int(request.args.get('page_size', 50)), 1)
            start = (page - 1) * page_size

            return jsonify({
                "status": "success",
                "logs": filtered[start:start + page_size],
                "summary": {
                    "total_detections": total,
                    "compliant": compliant,
                    "violations": violations,
                    "no_person_detections": no_person,
                    "avg_confidence": avg_conf,
                    "compliance_rate": round((compliant / total) * 100, 2) if total > 0 else 0,
                },
                "pagination": {
                    "page": page,
                    "page_size": page_size,
                    "total": total,
                    "total_pages": (total + page_size - 1) // page_size if total > 0 else 0,
                }
            })
        except Exception as e:
            logger.exception('helmet_logs error')
            return jsonify({"status": "error", "message": str(e)}), 500