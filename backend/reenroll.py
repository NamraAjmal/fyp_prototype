#!/usr/bin/env python3
"""
Re-enrollment script: regenerate face encodings using the current model (ArcFace).
This is needed when upgrading from one model to another.
"""
import os
import numpy as np
import json
from app import (
    BASE_DIR, UPLOAD_FOLDER, MODEL_NAME, ENCODING_DTYPE,
    normalize, get_single_embedding, logger
)

def reenroll_resident(cnic):
    """Re-generate face encodings for a single resident using the current model."""
    resident_folder = os.path.join(UPLOAD_FOLDER, cnic)
    images_folder = os.path.join(resident_folder, 'images')
    profile_path = os.path.join(resident_folder, 'profile_data.json')
    
    if not os.path.exists(profile_path):
        print(f"Resident {cnic} not found")
        return False
    
    if not os.path.exists(images_folder):
        print(f"No images folder for {cnic}")
        return False
    
    print(f"\nRe-enrolling {cnic}...")
    
    # Load profile
    with open(profile_path, 'r') as f:
        profile_data = json.load(f)
    
    # Extract encodings from all images
    face_encodings = []
    image_files = [f for f in os.listdir(images_folder) if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
    
    for img_file in image_files:
        img_path = os.path.join(images_folder, img_file)
        try:
            embedding = get_single_embedding(img_path)
            if embedding is not None:
                normalized_emb = normalize(embedding)
                if normalized_emb is not None:
                    face_encodings.append(normalized_emb.astype(ENCODING_DTYPE))
                    print(f"  ✓ {img_file}: {embedding.shape} -> {normalized_emb.shape}")
                else:
                    print(f"  ✗ {img_file}: normalization failed")
            else:
                print(f"  ✗ {img_file}: no face detected")
        except Exception as e:
            print(f"  ✗ {img_file}: {e}")
    
    if len(face_encodings) == 0:
        print(f"  ERROR: No valid faces found for {cnic}")
        return False
    
    # Save average and individual encodings
    avg_encoding = np.mean(face_encodings, axis=0)
    avg_encoding = normalize(avg_encoding)
    
    np.save(os.path.join(resident_folder, 'face_encodings.npy'), avg_encoding.astype(ENCODING_DTYPE))
    np.save(os.path.join(resident_folder, 'all_encodings.npy'), np.array(face_encodings, dtype=ENCODING_DTYPE))
    
    # Update profile with new model name
    profile_data['model'] = MODEL_NAME
    profile_data['faces_detected'] = len(face_encodings)
    with open(profile_path, 'w') as f:
        json.dump(profile_data, f, indent=2)
    
    print(f"  ✓ Re-enrolled {cnic}: {len(face_encodings)} faces with {MODEL_NAME}")
    print(f"    Average encoding shape: {avg_encoding.shape}")
    return True


def reenroll_all():
    """Re-enroll all existing residents."""
    if not os.path.exists(UPLOAD_FOLDER):
        print("No uploads folder found")
        return
    
    residents = [d for d in os.listdir(UPLOAD_FOLDER) if os.path.isdir(os.path.join(UPLOAD_FOLDER, d)) and not d.startswith('temp')]
    
    if not residents:
        print("No residents to re-enroll")
        return
    
    print(f"\nFound {len(residents)} resident(s)")
    success = 0
    
    for cnic in residents:
        if reenroll_resident(cnic):
            success += 1
    
    print(f"\n✓ Successfully re-enrolled {success}/{len(residents)} residents with {MODEL_NAME}")


if __name__ == '__main__':
    print(f"Re-enrollment tool for {MODEL_NAME}")
    print(f"This will regenerate face encodings for all residents using the current model.\n")
    confirm = input("Proceed? (yes/no): ").strip().lower()
    if confirm == 'yes':
        reenroll_all()
    else:
        print("Cancelled")
