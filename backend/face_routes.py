from datetime import datetime
import base64
import hashlib
import io
import json
import os
import shutil
from uuid import uuid4

import cv2
import numpy as np
from flask import jsonify, request, send_file
from PIL import Image


def register_face_routes(app, deps):
    logger = deps["logger"]
    UPLOAD_FOLDER = deps["UPLOAD_FOLDER"]
    SUPABASE_STORAGE_BUCKET = deps["SUPABASE_STORAGE_BUCKET"]

    _detect_faces_insightface = deps["_detect_faces_insightface"]
    _get_embedding_insightface = deps["_get_embedding_insightface"]
    append_face_log = deps["append_face_log"]
    read_face_logs = deps["read_face_logs"]

    _persist_detection_image = deps["_persist_detection_image"]
    _attach_storage_result_to_log = deps["_attach_storage_result_to_log"]
    _should_store_stream_event = deps["_should_store_stream_event"]

    _insert_resident_supabase = deps["_insert_resident_supabase"]
    _insert_resident_images_supabase = deps["_insert_resident_images_supabase"]
    _read_all_residents_supabase = deps["_read_all_residents_supabase"]
    _read_resident_supabase = deps["_read_resident_supabase"]
    _read_resident_images_supabase = deps["_read_resident_images_supabase"]
    _resident_image_storage_path = deps["_resident_image_storage_path"]
    _get_supabase_client = deps["_get_supabase_client"]
    _delete_resident_supabase = deps["_delete_resident_supabase"]
    _delete_storage_paths_from_supabase = deps["_delete_storage_paths_from_supabase"]
    _update_resident_supabase = deps["_update_resident_supabase"]
    _upload_local_file_to_supabase_storage = deps["_upload_local_file_to_supabase_storage"]
    _check_enrollment_permission = deps["_check_enrollment_permission"]
    _check_directory_permission = deps["_check_directory_permission"]
    _check_delete_permission = deps["_check_delete_permission"]
    _check_capture_permission = deps["_check_capture_permission"]

    # Encoding cache for better performance
    encoding_cache = {
        "data": [],
        "last_refresh": None,
        "cache_duration_seconds": 300  # 5 minutes
    }

    def _insert_resident_encoding_supabase(cnic: str, encoding_data: list, image_filename: str = None):
        """Insert face encoding for a resident into Supabase"""
        try:
            client = _get_supabase_client()
            if client is None:
                logger.error("Supabase client not available")
                return None
            
            # Convert numpy array to list if needed
            if hasattr(encoding_data, 'tolist'):
                encoding_data = encoding_data.tolist()
            
            data = {
                "cnic": cnic,
                "encoding_data": encoding_data,
                "image_filename": image_filename,
                "created_at": datetime.utcnow().isoformat() + 'Z'
            }
            
            result = client.table("resident_encodings").insert(data).execute()
            logger.info(f"Successfully inserted encoding for {cnic} from {image_filename}")
            return result.data[0] if result.data else None
        except Exception as e:
            logger.exception(f"Failed to insert encoding for CNIC {cnic}: {str(e)}")
            return None

    def _get_resident_encodings_supabase(cnic: str = None):
        """Get face encodings from Supabase, optionally filtered by CNIC"""
        try:
            client = _get_supabase_client()
            if client is None:
                logger.error("Supabase client not available")
                return []
            
            query = client.table("resident_encodings").select("*")
            if cnic:
                query = query.eq("cnic", cnic)
            
            result = query.execute()
            encodings = result.data if result.data else []
            logger.info(f"Retrieved {len(encodings)} encodings from database" + (f" for CNIC {cnic}" if cnic else ""))
            return encodings
        except Exception as e:
            logger.exception("Failed to fetch resident encodings")
            return []

    def _get_cached_encodings(force_refresh=False):
        """Get encodings with caching for better performance"""
        nonlocal encoding_cache
        now = datetime.now()
        
        if (force_refresh or 
            encoding_cache["last_refresh"] is None or 
            (now - encoding_cache["last_refresh"]).seconds > encoding_cache["cache_duration_seconds"]):
            
            encoding_cache["data"] = _get_resident_encodings_supabase()
            encoding_cache["last_refresh"] = now
            logger.info(f"Refreshed encoding cache with {len(encoding_cache['data'])} encodings")
        
        return encoding_cache["data"]

    def _delete_resident_encodings_supabase(cnic: str):
        """Delete all encodings for a resident"""
        try:
            client = _get_supabase_client()
            if client is None:
                logger.error("Supabase client not available")
                return False
            
            client.table("resident_encodings").delete().eq("cnic", cnic).execute()
            logger.info(f"Deleted encodings for CNIC {cnic}")
            # Refresh cache after deletion
            _get_cached_encodings(force_refresh=True)
            return True
        except Exception as e:
            logger.exception(f"Failed to delete encodings for CNIC {cnic}")
            return False

    def _get_resident_name_from_cnic(cnic):
        """Helper function to get resident name from CNIC"""
        try:
            resident = _read_resident_supabase(cnic)
            return resident.get('name', 'Unknown') if resident else 'Unknown'
        except Exception as e:
            logger.exception(f"Error getting resident name for CNIC {cnic}")
            return 'Unknown'

    def _find_duplicate_resident(embedding, threshold=0.6):
        """Find matching resident by comparing with stored encodings"""
        try:
            # Get cached encodings from database
            stored_encodings = _get_cached_encodings()
            
            if not stored_encodings:
                logger.info("No stored encodings found in database")
                return None
            
            best_match = None
            best_similarity = 0
            
            # Convert embedding to numpy array if needed
            if isinstance(embedding, list):
                embedding = np.array(embedding)
            
            for stored in stored_encodings:
                stored_embedding = stored.get('encoding_data')
                cnic = stored.get('cnic')
                
                # Skip if no embedding data
                if not stored_embedding:
                    continue
                    
                # Convert stored embedding to numpy array
                if isinstance(stored_embedding, list):
                    stored_embedding = np.array(stored_embedding)
                
                # Calculate cosine similarity
                if embedding.shape == stored_embedding.shape:
                    similarity = np.dot(embedding, stored_embedding) / (np.linalg.norm(embedding) * np.linalg.norm(stored_embedding))
                    
                    if similarity > best_similarity and similarity >= threshold:
                        best_similarity = similarity
                        best_match = {
                            "cnic": cnic,
                            "similarity": similarity,
                            "name": _get_resident_name_from_cnic(cnic)
                        }
            
            if best_match:
                logger.info(f"Found match: {best_match['name']} with similarity {best_similarity}")
            else:
                logger.info("No match found")
            
            return best_match
        except Exception as e:
            logger.exception("Error finding duplicate resident")
            return None

    def _draw_recognition_boxes(image_path: str, face_results: list) -> str:
        img = cv2.imread(image_path)
        if img is None:
            return ""

        for fr in face_results:
            bbox = fr.get("bbox", [])
            if len(bbox) != 4:
                continue
            x1, y1, x2, y2 = [int(v) for v in bbox]
            matched = fr.get("matched", False)
            color = (34, 197, 94) if matched else (239, 68, 68)
            cv2.rectangle(img, (x1, y1), (x2, y2), color, 2)

            label = fr.get("name", "Unknown")
            similarity = fr.get("similarity")
            if similarity is not None:
                label += f" {similarity * 100:.0f}%"

            (tw, th), baseline = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
            label_y = max(y1 - 6, th + baseline)
            cv2.rectangle(img, (x1, label_y - th - baseline), (x1 + tw + 4, label_y + baseline), color, -1)
            cv2.putText(img, label, (x1 + 2, label_y), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2, cv2.LINE_AA)

        ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])
        if not ok:
            return ""
        return "data:image/jpeg;base64," + base64.b64encode(buf).decode("utf-8")

    def _normalize_embedding_vector(embedding):
        if embedding is None:
            return None
        vec = np.asarray(embedding, dtype=np.float32).reshape(-1)
        norm = np.linalg.norm(vec)
        if norm <= 1e-12:
            return None
        return vec / norm

    def _cosine_similarity(vec_a, vec_b):
        if vec_a is None or vec_b is None:
            return -1.0
        return float(np.dot(vec_a, vec_b))

    def _average_hash_from_rgb(image_rgb, hash_size=8):
        gray = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2GRAY)
        resized = cv2.resize(gray, (hash_size, hash_size), interpolation=cv2.INTER_AREA)
        mean_val = resized.mean()
        return (resized >= mean_val).astype(np.uint8).flatten()

    def _hamming_distance(hash_a, hash_b):
        return int(np.count_nonzero(hash_a != hash_b))

    def _company_scope_from_request():
        role = (request.headers.get('X-User-Role') or '').strip().lower()
        company_id = (request.headers.get('X-Company-ID') or '').strip()
        if role and role != 'admin' and company_id:
            return company_id
        return None

    # ========== ROUTES ==========
    
    @app.route('/recognize-face', methods=['POST'])
    def recognize_face():
        is_allowed, error_info = _check_capture_permission()
        if not is_allowed:
            error_msg, status_code = error_info
            return jsonify({"status": "error", "message": error_msg}), status_code

        image = request.files.get('image')
        source = request.form.get('source', 'image')
        camera_id = request.form.get('camera_id', '')
        company_id = _company_scope_from_request()
        if image is None or not image.filename:
            return jsonify({"status": "error", "message": "image is required"}), 400

        ext = os.path.splitext(image.filename)[1] or '.jpg'
        temp_name = f"recog_{uuid4().hex[:8]}{ext}"
        temp_path = os.path.join(UPLOAD_FOLDER, temp_name)

        try:
            image.save(temp_path)
            faces_detected = _detect_faces_insightface(temp_path)

            if not faces_detected:
                append_face_log({
                    "id": int(datetime.now().timestamp() * 1000),
                    "timestamp": datetime.utcnow().isoformat() + 'Z',
                    "name": "Unknown",
                    "cnic": None,
                    "status": "Failed",
                    "confidence": 0,
                    "source": source,
                    "camera_id": camera_id,
                    "file_name": image.filename,
                    "company_id": company_id,
                    "annotated_image": "",
                })
                return jsonify({
                    "status": "success",
                    "data": {
                        "faces": [], "annotated_image": "", "total_faces": 0,
                        "matched": 0, "unmatched": 0, "message": "No faces detected",
                    }
                })

            face_results = []
            matched_count = unmatched_count = 0

            for face in faces_detected:
                embedding = face.get("embedding")
                if embedding is None:
                    embedding = _get_embedding_insightface(face["crop"])
                if embedding is None:
                    face_results.append({
                        "bbox": face["bbox"], "confidence": face["confidence"],
                        "matched": False, "name": "Unknown", "cnic": None, "similarity": None,
                    })
                    unmatched_count += 1
                    continue

                match = _find_duplicate_resident(embedding)
                if match:
                    face_results.append({
                        "bbox": face["bbox"], "confidence": face["confidence"],
                        "matched": True, "name": match["name"], "cnic": match["cnic"], "similarity": match["similarity"],
                    })
                    matched_count += 1
                else:
                    face_results.append({
                        "bbox": face["bbox"], "confidence": face["confidence"],
                        "matched": False, "name": "Unknown", "cnic": None, "similarity": None,
                    })
                    unmatched_count += 1

            annotated = _draw_recognition_boxes(temp_path, face_results)
            storage_result = _persist_detection_image('face', camera_id or source, annotated)
            organization_name = (request.headers.get('X-Company-Name') or '').strip() or None

            log_timestamp = datetime.utcnow().isoformat() + 'Z'
            for fr in face_results:
                status = "Matched" if fr.get("matched") else "Unknown"
                similarity = fr.get("similarity")
                confidence = round(float(similarity) * 100, 2) if similarity is not None else float(fr.get("confidence", 0) or 0)
                append_face_log(_attach_storage_result_to_log({
                    "id": int(datetime.now().timestamp() * 1000),
                    "timestamp": log_timestamp,
                    "name": fr.get("name") or "Unknown",
                    "cnic": fr.get("cnic"),
                    "status": status,
                    "confidence": confidence,
                    "source": source,
                    "camera_id": camera_id,
                    "file_name": image.filename,
                    "company_id": company_id,
                    "organization_name": (request.headers.get('X-Company-Name') or '').strip() or None,
                    "annotated_image": annotated,
                    "bbox": fr.get("bbox"),
                }, storage_result))

            return jsonify({
                "status": "success",
                "data": {
                    "faces": face_results,
                    "annotated_image": annotated,
                    "total_faces": len(face_results),
                    "matched": matched_count,
                    "unmatched": unmatched_count,
                }
            })

        except Exception as e:
            logger.exception("recognize_face error")
            return jsonify({"status": "error", "message": str(e)}), 500
        finally:
            try:
                if os.path.exists(temp_path):
                    os.remove(temp_path)
            except Exception:
                pass

    @app.route('/recognize-face-stream', methods=['POST'])
    def recognize_face_stream():
        is_allowed, error_info = _check_capture_permission()
        if not is_allowed:
            error_msg, status_code = error_info
            return jsonify({"status": "error", "message": error_msg}), status_code

        data = request.get_json()
        if not data or 'frame' not in data:
            return jsonify({"status": "error", "message": "frame is required"}), 400

        camera_id = data.get('camera_id', 'cam_01')
        source = data.get('source', 'stream')
        company_id = _company_scope_from_request()
        temp_path = None
        try:
            frame_b64 = data['frame']
            if ',' in frame_b64:
                frame_b64 = frame_b64.split(',')[1]

            img_bytes = base64.b64decode(frame_b64)
            img_array = np.frombuffer(img_bytes, dtype=np.uint8)
            frame = cv2.imdecode(img_array, cv2.IMREAD_COLOR)

            if frame is None:
                return jsonify({"status": "error", "message": "Could not decode frame"}), 400

            temp_name = f"recog_stream_{uuid4().hex[:8]}.jpg"
            temp_path = os.path.join(UPLOAD_FOLDER, temp_name)
            cv2.imwrite(temp_path, frame)

            faces_detected = _detect_faces_insightface(temp_path)
            face_results = []
            matched_count = unmatched_count = 0

            for face in faces_detected:
                embedding = face.get("embedding")
                if embedding is None:
                    embedding = _get_embedding_insightface(face["crop"])
                if embedding is None:
                    face_results.append({"bbox": face["bbox"], "confidence": face["confidence"], "matched": False, "name": "Unknown", "cnic": None, "similarity": None})
                    unmatched_count += 1
                    continue

                match = _find_duplicate_resident(embedding)
                if match:
                    face_results.append({"bbox": face["bbox"], "confidence": face["confidence"], "matched": True, "name": match["name"], "cnic": match["cnic"], "similarity": match["similarity"]})
                    matched_count += 1
                else:
                    face_results.append({"bbox": face["bbox"], "confidence": face["confidence"], "matched": False, "name": "Unknown", "cnic": None, "similarity": None})
                    unmatched_count += 1

            annotated = _draw_recognition_boxes(temp_path, face_results)
            event_signature = f"faces:{len(face_results)}|matched:{matched_count}|unmatched:{unmatched_count}"
            should_store_event = bool(face_results) and _should_store_stream_event('face', camera_id, event_signature)
            storage_result = _persist_detection_image('face', camera_id, annotated) if should_store_event else None
            organization_name = (request.headers.get('X-Company-Name') or '').strip() or None

            log_timestamp = datetime.utcnow().isoformat() + 'Z'
            if should_store_event:
                for fr in face_results:
                    status = "Matched" if fr.get("matched") else "Unknown"
                    similarity = fr.get("similarity")
                    confidence = round(float(similarity) * 100, 2) if similarity is not None else float(fr.get("confidence", 0) or 0)
                    append_face_log(_attach_storage_result_to_log({
                        "id": int(datetime.now().timestamp() * 1000),
                        "timestamp": log_timestamp,
                        "name": fr.get("name") or "Unknown",
                        "cnic": fr.get("cnic"),
                        "status": status,
                        "confidence": confidence,
                        "source": source,
                        "camera_id": camera_id,
                        "file_name": f"stream_{camera_id}",
                        "company_id": company_id,
                        "organization_name": organization_name,
                        "annotated_image": annotated,
                        "bbox": fr.get("bbox"),
                    }, storage_result))

            return jsonify({
                "status": "success",
                "data": {
                    "faces": face_results, "annotated_image": annotated,
                    "total_faces": len(face_results),
                    "matched": matched_count, "unmatched": unmatched_count,
                }
            })

        except Exception as e:
            logger.exception("recognize_face_stream error")
            return jsonify({"status": "error", "message": str(e)}), 500
        finally:
            try:
                if temp_path and os.path.exists(temp_path):
                    os.remove(temp_path)
            except Exception:
                pass

    @app.route('/face-logs', methods=['GET'])
    def face_logs():
        try:
            logs = read_face_logs(
                company_id=_company_scope_from_request(),
                company_name=(request.headers.get('X-Company-Name') or '').strip() or None,
            )

            status_filter = request.args.get('status', 'all')

            filtered = logs
            if status_filter != 'all':
                filtered = [l for l in filtered if l.get('status') == status_filter]

            filtered = sorted(filtered, key=lambda x: x.get('timestamp', ''), reverse=True)
            total = len(filtered)

            matched = sum(1 for l in filtered if l.get('status') == 'Matched')
            unknown = sum(1 for l in filtered if l.get('status') == 'Unknown')
            failed = sum(1 for l in filtered if l.get('status') == 'Failed')
            avg_conf = round(sum(float(l.get('confidence', 0) or 0) for l in filtered) / total, 2) if total > 0 else 0
            success_rate = round((matched / total) * 100, 2) if total > 0 else 0

            page = max(int(request.args.get('page', 1)), 1)
            page_size = max(int(request.args.get('page_size', 50)), 1)
            start = (page - 1) * page_size
            end = start + page_size

            today_prefix = datetime.utcnow().date().isoformat()
            enrollments_today = sum(1 for l in logs if str(l.get('timestamp', '')).startswith(today_prefix))

            return jsonify({
                "status": "success",
                "logs": filtered[start:end],
                "summary": {
                    "total_detections": total,
                    "matched": matched,
                    "unknown": unknown,
                    "failed": failed,
                    "avg_confidence": avg_conf,
                    "success_rate": success_rate,
                    "enrollments_today": enrollments_today,
                },
                "pagination": {
                    "page": page, "page_size": page_size, "total": total,
                    "total_pages": (total + page_size - 1) // page_size if total > 0 else 0,
                }
            })

        except Exception as e:
            logger.exception("face_logs error")
            return jsonify({"status": "error", "message": str(e)}), 500

    @app.route('/test-upload-simple', methods=['POST'])
    def test_upload_simple():
        """Simple test endpoint to debug upload issues"""
        try:
            logger.info("=== TEST ENDPOINT HIT ===")
            
            cnic = request.form.get('cnic')
            name = request.form.get('name')
            files = request.files.getlist('images')
            
            logger.info(f"CNIC: {cnic}")
            logger.info(f"Name: {name}")
            logger.info(f"Number of files: {len(files)}")
            
            for i, file in enumerate(files):
                logger.info(f"File {i}: {file.filename}, content-type: {file.content_type}")
            
            return jsonify({
                "status": "success",
                "message": "Test endpoint working",
                "cnic": cnic,
                "name": name,
                "files_count": len(files)
            })
        except Exception as e:
            logger.exception("Test endpoint error")
            return jsonify({"status": "error", "message": str(e)}), 500

    @app.route('/upload-images', methods=['POST'])
    def upload_images():
        cnic = None
        try:
            # Permission check: viewers cannot enroll residents
            is_allowed, error_info = _check_enrollment_permission()
            if not is_allowed:
                error_msg, status_code = error_info
                return jsonify({"status": "error", "message": error_msg}), status_code
            
            logger.info("=" * 50)
            logger.info("UPLOAD-IMAGES ENDPOINT HIT")
            logger.info("=" * 50)

            organization_id = (request.headers.get('X-Company-ID') or '').strip() or None
            organization_name = (request.headers.get('X-Company-Name') or '').strip() or None
            
            cnic = request.form.get('cnic')
            name = request.form.get('name')
            email = request.form.get('email')
            phone = request.form.get('phone')
            address = request.form.get('address', '')
            city = request.form.get('city', '')

            files = request.files.getlist('images')
            
            logger.info(f"CNIC: {cnic}")
            logger.info(f"Name: {name}")
            logger.info(f"Files count: {len(files)}")

            # Basic validation
            if not cnic:
                logger.error("CNIC is missing")
                return jsonify({"status": "error", "message": "CNIC is required"}), 400
                
            if not files or len(files) == 0:
                logger.error("No files uploaded")
                return jsonify({"status": "error", "message": "Images are required"}), 400

            if len(files) < 3:
                logger.error(f"Only {len(files)} files uploaded, need 3")
                return jsonify({"status": "error", "message": "Please upload at least 3 images"}), 400

            resident_folder = os.path.join(UPLOAD_FOLDER, cnic)
            images_folder = os.path.join(resident_folder, 'images')

            # Supabase is the source of truth for enrollment existence checks.
            existing_resident = _read_resident_supabase(cnic)
            if existing_resident:
                logger.error(f"CNIC already exists in Supabase: {cnic}")
                return jsonify({"status": "error", "message": "This CNIC is already enrolled"}), 409

            # Keep writing files locally, but do not block enrollment on stale local folders.
            if os.path.exists(resident_folder):
                logger.warning(
                    f"Stale local folder found without Supabase resident. Removing: {resident_folder}"
                )
                shutil.rmtree(resident_folder, ignore_errors=True)

            # Create directories
            os.makedirs(images_folder, exist_ok=True)
            logger.info(f"Created folders: {resident_folder}")

            uploaded_storage_paths = []

            def cleanup_and_rollback(message, status_code=400):
                logger.error(message)
                shutil.rmtree(resident_folder, ignore_errors=True)
                if uploaded_storage_paths:
                    try:
                        _delete_storage_paths_from_supabase(uploaded_storage_paths)
                    except Exception as storage_cleanup_err:
                        logger.warning(f"Failed storage cleanup: {str(storage_cleanup_err)}")
                _delete_resident_supabase(cnic)
                return jsonify({"status": "error", "message": message}), status_code

            # Create resident record in Supabase
            profile_data = {
                "cnic": cnic,
                "name": name,
                "email": email,
                "phone": phone,
                "address": address,
                "city": city,
                "organization_id": organization_id,
                "organization_name": organization_name,
                "enrolled_at": datetime.utcnow().isoformat() + 'Z',
                "status": "Active"
            }
            
            logger.info(f"Inserting resident into Supabase: {profile_data}")
            resident_result = _insert_resident_supabase(profile_data)
            
            # IMPORTANT: Check for None specifically, not falsy
            if resident_result is None:
                logger.error("Failed to create resident record - result is None")
                shutil.rmtree(resident_folder, ignore_errors=True)
                return jsonify({"status": "error", "message": "Failed to create resident record"}), 500
            
            logger.info(f"✅ Resident created successfully: {cnic}")

            saved_files = []
            saved_images_metadata = []
            saved_encodings = []
            file_hashes = set()

            # Process each file
            for i, file in enumerate(files):
                logger.info(f"Processing file {i+1}/{len(files)}")
                
                if not file or not file.filename:
                    logger.warning(f"Skipping empty file at index {i}")
                    continue

                if not (file.mimetype or "").startswith("image/"):
                    return cleanup_and_rollback(f"File '{file.filename}' is not a valid image", 400)

                filename = f"image_{i+1}.jpg"
                filepath = os.path.join(images_folder, filename)
                logger.info(f"Saving to: {filepath}")

                try:
                    # Save image locally (handle webp and other formats)
                    image = Image.open(file.stream)
                    image.verify()
                    file.stream.seek(0)
                    image = Image.open(file.stream)
                    # Convert RGBA to RGB if needed
                    if image.mode in ('RGBA', 'LA', 'P'):
                        image = image.convert("RGB")
                    else:
                        image = image.convert("RGB")
                    image.save(filepath, "JPEG", quality=85)
                    logger.info(f"✅ Image saved: {filename}")
                except Exception as img_err:
                    logger.error(f"Failed to save image {filename}: {str(img_err)}")
                    return cleanup_and_rollback(f"Failed to save image '{file.filename}': {str(img_err)}", 500)

                # Calculate file hash
                with open(filepath, 'rb') as f:
                    file_hash = hashlib.sha256(f.read()).hexdigest()
                logger.info(f"File hash: {file_hash[:16]}...")

                if file_hash in file_hashes:
                    return cleanup_and_rollback("Duplicate images detected. Please upload unique photos only.", 400)

                file_hashes.add(file_hash)

                saved_files.append(filename)

                # Validate that every image has exactly one face.
                try:
                    logger.info(f"Processing face detection for {filename}")
                    faces = _detect_faces_insightface(filepath)
                    face_count = len(faces) if faces else 0
                    logger.info(f"Faces found: {face_count}")

                    if face_count == 0:
                        return cleanup_and_rollback(
                            f"No face detected in '{file.filename}'. Upload a clear photo of a person.",
                            400,
                        )

                    if face_count > 1:
                        return cleanup_and_rollback(
                            f"Multiple faces detected in '{file.filename}'. Each image must contain exactly one person.",
                            400,
                        )

                    face = faces[0]
                    embedding = face.get("embedding")
                    if embedding is None:
                        embedding = _get_embedding_insightface(face.get("crop"))

                    normalized_embedding = _normalize_embedding_vector(embedding)
                    if normalized_embedding is None:
                        return cleanup_and_rollback(
                            f"Could not extract a reliable face embedding from '{file.filename}'.",
                            400,
                        )

                    encoding_result = _insert_resident_encoding_supabase(
                        cnic=cnic,
                        encoding_data=normalized_embedding,
                        image_filename=filename
                    )
                    if encoding_result:
                        saved_encodings.append(encoding_result)
                        logger.info(f"✅ Saved encoding for {filename}")
                    else:
                        logger.warning(f"❌ Failed to save encoding for {filename}")
                except Exception as enc_err:
                    return cleanup_and_rollback(f"Face validation failed for '{file.filename}': {str(enc_err)}", 400)

                # Upload to Supabase Storage
                try:
                    storage_path = _resident_image_storage_path(cnic, filename)
                    logger.info(f"Uploading to storage: {storage_path}")
                    storage_result = _upload_local_file_to_supabase_storage(storage_path, filepath, content_type='image/jpeg')
                    uploaded_storage_paths.append(storage_path)
                    
                    image_metadata = {
                        "filename": filename,
                        "file_hash": file_hash,
                        "file_size": os.path.getsize(filepath),
                        "storage_path": storage_result.get('storage_path') if storage_result else storage_path,
                        "public_url": storage_result.get('public_url') if storage_result else None,
                        "cnic": cnic
                    }
                    saved_images_metadata.append(image_metadata)
                    logger.info(f"✅ Uploaded {filename} to storage")
                except Exception as storage_err:
                    logger.error(f"Failed to upload {filename} to storage: {str(storage_err)}")
                    return cleanup_and_rollback(f"Failed to upload image '{file.filename}' to storage: {str(storage_err)}", 500)

            if len(saved_files) == 0:
                return cleanup_and_rollback("No valid images uploaded", 400)

            if len(saved_encodings) != len(saved_files):
                return cleanup_and_rollback(
                    "Could not generate face encodings for all images. Please re-upload clearer images.",
                    400,
                )

            # Insert image metadata
            if saved_images_metadata:
                try:
                    logger.info(f"Inserting {len(saved_images_metadata)} image metadata records")
                    _insert_resident_images_supabase(cnic, saved_images_metadata)
                    logger.info("✅ Inserted image metadata")
                except Exception as img_meta_err:
                    logger.error(f"Failed to insert image metadata: {str(img_meta_err)}")

            # Save local profile data
            profile_data_local = {
                "cnic": cnic,
                "name": name,
                "email": email,
                "phone": phone,
                "address": address,
                "city": city,
                "organization_id": organization_id,
                "organization_name": organization_name,
                "enrolled_at": datetime.now().isoformat(),
                "image_count": len(saved_files),
                "faces_detected": len(saved_files),
                "encodings_saved": len(saved_encodings),
                "status": "Active"
            }
            
            with open(os.path.join(resident_folder, 'profile_data.json'), 'w') as f:
                json.dump(profile_data_local, f, indent=2)
            logger.info(f"✅ Saved local profile data")

            # Refresh encoding cache
            _get_cached_encodings(force_refresh=True)

            logger.info(f"✅ Enrollment completed successfully. Encodings saved: {len(saved_encodings)}")

            return jsonify({
                "status": "success",
                "message": f"{name} enrolled successfully",
                "data": {
                    "cnic": cnic,
                    "images_saved": len(saved_files),
                    "faces_detected": len(saved_files),
                    "encodings_saved": len(saved_encodings)
                }
            })

        except Exception as e:
            error_msg = str(e)
            logger.exception(f"upload_images error for CNIC {cnic if cnic else 'unknown'}: {error_msg}")
            try:
                if cnic:
                    resident_folder = os.path.join(UPLOAD_FOLDER, cnic)
                    if os.path.exists(resident_folder):
                        shutil.rmtree(resident_folder, ignore_errors=True)
                    _delete_resident_supabase(cnic)
            except Exception as cleanup_err:
                logger.error(f"Cleanup error: {str(cleanup_err)}")
            return jsonify({"status": "error", "message": error_msg}), 500
    
    @app.route('/get-residents', methods=['GET'])
    def get_residents():
        try:
            # Permission check: viewers cannot view the resident directory
            is_allowed, error_info = _check_directory_permission()
            if not is_allowed:
                error_msg, status_code = error_info
                return jsonify({"status": "error", "message": error_msg}), status_code

            company_id = (request.headers.get('X-Company-ID') or '').strip() or None
            company_name = (request.headers.get('X-Company-Name') or '').strip() or None
            
            residents = []

            cloud_residents = _read_all_residents_supabase(company_id=company_id, company_name=company_name)
            if cloud_residents is not None:
                for resident in cloud_residents:
                    cnic = resident.get('cnic')
                    images = []
                    cloud_images = _read_resident_images_supabase(cnic, company_id=company_id, company_name=company_name)
                    if cloud_images:
                        images = [img.get('filename') for img in cloud_images if img.get('filename')]

                    if not images:
                        images_folder = os.path.join(UPLOAD_FOLDER, cnic, 'images')
                        if os.path.exists(images_folder):
                            images = [
                                f for f in os.listdir(images_folder)
                                if f.lower().endswith(('.jpg', '.jpeg', '.png'))
                            ]
                    
                    # Get encoding count for this resident
                    resident_encodings = _get_resident_encodings_supabase(cnic)
                    resident['encodings_count'] = len(resident_encodings)
                    resident['images'] = images
                    resident['image_count'] = len(images)
                    residents.append(resident)
                return jsonify({"status": "success", "residents": residents})

            for folder_name in os.listdir(UPLOAD_FOLDER):
                folder_path = os.path.join(UPLOAD_FOLDER, folder_name)
                if not os.path.isdir(folder_path):
                    continue

                profile_path = os.path.join(folder_path, 'profile_data.json')
                images_folder = os.path.join(folder_path, 'images')
                if not os.path.exists(profile_path):
                    continue

                with open(profile_path, 'r') as f:
                    pd = json.load(f)

                resident_company_id = str(pd.get('organization_id') or '').strip()
                resident_company_name = str(pd.get('organization_name') or '').strip()
                if company_id and resident_company_id != company_id:
                    continue
                if company_name and resident_company_name != company_name:
                    continue

                images = []
                if os.path.exists(images_folder):
                    images = [
                        f for f in os.listdir(images_folder)
                        if f.lower().endswith(('.jpg', '.jpeg', '.png'))
                    ]

                residents.append({
                    "cnic": pd.get('cnic', ''),
                    "name": pd.get('name', ''),
                    "email": pd.get('email', ''),
                    "phone": pd.get('phone', ''),
                    "address": pd.get('address', ''),
                    "city": pd.get('city', ''),
                    "enrolled_at": pd.get('enrolled_at', ''),
                    "image_count": len(images),
                    "faces_detected": pd.get('faces_detected', 0),
                    "encodings_saved": pd.get('encodings_saved', 0),
                    "status": pd.get('status', 'Active'),
                    "images": images
                })

            return jsonify({"status": "success", "residents": residents})

        except Exception as e:
            logger.exception("get_residents error")
            return jsonify({"status": "error", "message": str(e)}), 500

    @app.route('/get-resident/<cnic>', methods=['GET'])
    def get_resident(cnic):
        try:
            company_id = (request.headers.get('X-Company-ID') or '').strip() or None
            company_name = (request.headers.get('X-Company-Name') or '').strip() or None

            cloud_resident = _read_resident_supabase(cnic, company_id=company_id, company_name=company_name)
            if cloud_resident is not None:
                pd = cloud_resident
            else:
                resident_folder = os.path.join(UPLOAD_FOLDER, cnic)
                profile_path = os.path.join(resident_folder, 'profile_data.json')
                if not os.path.exists(profile_path):
                    return jsonify({"status": "error", "message": "Resident not found"}), 404
                with open(profile_path, 'r') as f:
                    pd = json.load(f)
                resident_company_id = str(pd.get('organization_id') or '').strip()
                resident_company_name = str(pd.get('organization_name') or '').strip()
                if company_id and resident_company_id != company_id:
                    return jsonify({"status": "error", "message": "Resident not found"}), 404
                if company_name and resident_company_name != company_name:
                    return jsonify({"status": "error", "message": "Resident not found"}), 404

            images = []
            cloud_images = _read_resident_images_supabase(cnic, company_id=company_id, company_name=company_name)
            if cloud_images:
                images = [img.get('filename') for img in cloud_images if img.get('filename')]

            if not images:
                images_folder = os.path.join(UPLOAD_FOLDER, cnic, 'images')
                if os.path.exists(images_folder):
                    images = [
                        f for f in os.listdir(images_folder)
                        if f.lower().endswith(('.jpg', '.jpeg', '.png'))
                    ]

            # Get encodings count for this resident
            resident_encodings = _get_resident_encodings_supabase(cnic)

            return jsonify({
                "status": "success",
                "resident": {
                    **pd,
                    "images": images,
                    "image_count": len(images),
                    "encodings_count": len(resident_encodings)
                }
            })

        except Exception as e:
            logger.exception("get_resident error")
            return jsonify({"status": "error", "message": str(e)}), 500

    @app.route('/get-resident-image/<cnic>/<filename>', methods=['GET'])
    def get_resident_image(cnic, filename):
        try:
            company_id = (request.headers.get('X-Company-ID') or '').strip() or None
            company_name = (request.headers.get('X-Company-Name') or '').strip() or None
            image_path = os.path.join(UPLOAD_FOLDER, cnic, 'images', filename)
            resident_folder = os.path.join(UPLOAD_FOLDER, cnic)
            profile_path = os.path.join(resident_folder, 'profile_data.json')
            cloud_resident = _read_resident_supabase(cnic, company_id=company_id, company_name=company_name)
            if (company_id or company_name) and cloud_resident is None and not os.path.exists(profile_path):
                return jsonify({"error": "Image not found"}), 404
            if os.path.exists(profile_path):
                with open(profile_path, 'r') as f:
                    pd = json.load(f)
                resident_company_id = str(pd.get('organization_id') or '').strip()
                resident_company_name = str(pd.get('organization_name') or '').strip()
                if company_id and resident_company_id != company_id:
                    return jsonify({"error": "Image not found"}), 404
                if company_name and resident_company_name != company_name:
                    return jsonify({"error": "Image not found"}), 404

            if not os.path.exists(image_path):
                cloud_images = _read_resident_images_supabase(cnic, company_id=company_id, company_name=company_name)
                storage_path = None
                if cloud_images:
                    match = next((img for img in cloud_images if img.get('filename') == filename), None)
                    if match:
                        storage_path = match.get('storage_path') or _resident_image_storage_path(cnic, filename)
                if storage_path is None:
                    storage_path = _resident_image_storage_path(cnic, filename)

                client = _get_supabase_client()
                if client is None:
                    return jsonify({"error": "Image not found"}), 404

                try:
                    file_bytes = client.storage.from_(SUPABASE_STORAGE_BUCKET).download(storage_path)
                    if file_bytes is None:
                        return jsonify({"error": "Image not found"}), 404
                    return send_file(io.BytesIO(file_bytes), mimetype='image/jpeg')
                except Exception:
                    logger.exception('Failed to fetch resident image from Supabase storage')
                    return jsonify({"error": "Image not found"}), 404

            return send_file(image_path)

        except Exception as e:
            logger.exception("get_resident_image error")
            return jsonify({"error": str(e)}), 500

    @app.route('/delete-resident/<cnic>', methods=['DELETE'])
    def delete_resident(cnic):
        try:
            # Permission check: only owners/admins can delete
            is_allowed, error_info = _check_delete_permission()
            if not is_allowed:
                error_msg, status_code = error_info
                return jsonify({"status": "error", "message": error_msg}), status_code

            company_id = (request.headers.get('X-Company-ID') or '').strip() or None
            company_name = (request.headers.get('X-Company-Name') or '').strip() or None

            resident = _read_resident_supabase(cnic, company_id=company_id, company_name=company_name)
            if resident is None:
                return jsonify({"status": "error", "message": "Resident not found"}), 404
            
            resident_folder = os.path.join(UPLOAD_FOLDER, cnic)
            if not os.path.exists(resident_folder):
                return jsonify({"status": "error", "message": "Resident not found"}), 404

            cloud_images = _read_resident_images_supabase(cnic, company_id=company_id, company_name=company_name) or []
            storage_paths = [img.get('storage_path') or _resident_image_storage_path(cnic, img.get('filename', '')) for img in cloud_images if img.get('filename')]

            shutil.rmtree(resident_folder)
            _delete_resident_supabase(cnic)
            _delete_resident_encodings_supabase(cnic)
            _delete_storage_paths_from_supabase(storage_paths)

            return jsonify({"status": "success", "message": "Resident deleted successfully"})
        except Exception as e:
            logger.exception('delete_resident error')
            return jsonify({"status": "error", "message": str(e)}), 500

    @app.route('/update-resident-status/<cnic>', methods=['POST'])
    def update_resident_status(cnic):
        try:
            company_id = (request.headers.get('X-Company-ID') or '').strip() or None
            company_name = (request.headers.get('X-Company-Name') or '').strip() or None
            new_status = request.json.get('status')
            resident = _read_resident_supabase(cnic, company_id=company_id, company_name=company_name)
            if resident is None:
                return jsonify({"status": "error", "message": "Resident not found"}), 404
            profile_path = os.path.join(UPLOAD_FOLDER, cnic, 'profile_data.json')
            if not os.path.exists(profile_path):
                return jsonify({"status": "error", "message": "Resident not found"}), 404
            with open(profile_path, 'r') as f:
                pd = json.load(f)
            pd['status'] = new_status
            with open(profile_path, 'w') as f:
                json.dump(pd, f, indent=2)

            _update_resident_supabase(cnic, {"status": new_status, "updated_at": datetime.utcnow().isoformat() + 'Z'})
            return jsonify({"status": "success", "message": "Status updated successfully"})
        except Exception as e:
            logger.exception('update_resident_status error')
            return jsonify({"status": "error", "message": str(e)}), 500

    @app.route('/update-resident/<cnic>', methods=['PUT'])
    def update_resident(cnic):
        try:
            data = request.json
            company_id = (request.headers.get('X-Company-ID') or '').strip() or None
            company_name = (request.headers.get('X-Company-Name') or '').strip() or None
            resident = _read_resident_supabase(cnic, company_id=company_id, company_name=company_name)
            if resident is None:
                return jsonify({"status": "error", "message": "Resident not found"}), 404
            profile_path = os.path.join(UPLOAD_FOLDER, cnic, 'profile_data.json')
            if not os.path.exists(profile_path):
                return jsonify({"status": "error", "message": "Resident not found"}), 404
            with open(profile_path, 'r') as f:
                pd = json.load(f)
            pd['name'] = data.get('name', pd.get('name'))
            pd['email'] = data.get('email', pd.get('email'))
            pd['phone'] = data.get('phone', pd.get('phone'))
            pd['address'] = data.get('address', pd.get('address', ''))
            pd['city'] = data.get('city', pd.get('city', ''))
            pd['updated_at'] = datetime.utcnow().isoformat() + 'Z'
            with open(profile_path, 'w') as f:
                json.dump(pd, f, indent=2)

            updates = {
                "name": pd['name'],
                "email": pd['email'],
                "phone": pd['phone'],
                "address": pd['address'],
                "city": pd['city'],
                "updated_at": pd['updated_at']
            }
            _update_resident_supabase(cnic, updates)

            return jsonify({"status": "success", "message": "Resident updated successfully"})
        except Exception as e:
            logger.exception('update_resident error')
            return jsonify({"status": "error", "message": str(e)}), 500

    @app.route('/debug-encodings', methods=['GET'])
    def debug_encodings():
        """Debug endpoint to check encodings in the database"""
        try:
            cnic = request.args.get('cnic')
            
            if cnic:
                encodings = _get_resident_encodings_supabase(cnic)
                return jsonify({
                    "status": "success",
                    "cnic": cnic,
                    "encodings_count": len(encodings),
                    "encodings": [
                        {
                            "id": e.get('id'),
                            "image_filename": e.get('image_filename'),
                            "created_at": e.get('created_at'),
                            "encoding_length": len(e.get('encoding_data', []))
                        }
                        for e in encodings
                    ]
                })
            else:
                all_encodings = _get_resident_encodings_supabase()
                residents_with_encodings = list(set([e.get('cnic') for e in all_encodings if e.get('cnic')]))
                return jsonify({
                    "status": "success",
                    "total_encodings": len(all_encodings),
                    "residents_with_encodings": residents_with_encodings
                })
        except Exception as e:
            logger.exception("debug_encodings error")
            return jsonify({"status": "error", "message": str(e)}), 500

    @app.route('/debug-test-log', methods=['GET'])
    def debug_test_log():
     try:
        test_log = {
            "id": int(datetime.now().timestamp() * 1000),
            "timestamp": datetime.utcnow().isoformat() + 'Z',
            "name": "DEBUG_TEST",
            "cnic": "TEST123",
            "status": "Test",
            "confidence": 100.0,
            "source": "debug",
            "camera_id": "debug_cam",
            "file_name": "test.jpg",
            "annotated_image": "",
        }
        
        # Try to append the log
        append_face_log(test_log)
        
        # Check if it was saved by reading logs
        logs = read_face_logs()
        
        return jsonify({
            "status": "success",
            "message": "Test log attempted",
            "total_logs_now": len(logs),
            "test_log": test_log
        })
     except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

    @app.route('/face-health', methods=['GET'])
    def face_health():
        """Health check endpoint for face detection system"""
        try:
            client = _get_supabase_client()
            supabase_status = "connected" if client else "disconnected"
            
            cache_status = {
                "encodings_cached": len(encoding_cache["data"]),
                "last_refresh": encoding_cache["last_refresh"].isoformat() if encoding_cache["last_refresh"] else None
            }
            
            return jsonify({
                "status": "healthy",
                "supabase": supabase_status,
                "cache": cache_status
            })
        except Exception as e:
            return jsonify({"status": "unhealthy", "error": str(e)}), 500