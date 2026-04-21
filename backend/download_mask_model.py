"""
download_mask_model.py
----------------------
Run this ONCE before starting Flask to download the legacy
YOLOv8n mask-detection weights from Hugging Face.

For highest accuracy, train or download your own stronger `best.pt`
(typically YOLOv8m/l/x fine-tuned on your mask dataset) and either:
    1. place it at backend/models/mask_best.pt
    2. or set MASK_MODEL_PATH to that file

If you set MASK_MODEL_URL, this script will download that model instead
and save it as the preferred high-accuracy weights file by default.

Usage:
    python download_mask_model.py
"""

import os
import urllib.request

MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
os.makedirs(MODELS_DIR, exist_ok=True)

LEGACY_MASK_MODEL_PATH = os.path.join(MODELS_DIR, "mask.pt")
PREFERRED_MASK_MODEL_PATH = os.path.join(MODELS_DIR, "mask_best.pt")
LEGACY_MODEL_URL = (
    "https://huggingface.co/keremberke/yolov8n-face-mask-detection"
    "/resolve/main/best.pt"
)
CUSTOM_MODEL_URL = os.environ.get("MASK_MODEL_URL", "").strip()
CUSTOM_MODEL_PATH = os.environ.get("MASK_MODEL_PATH", "").strip()


def resolve_output_path() -> str:
    if CUSTOM_MODEL_PATH:
        if os.path.isabs(CUSTOM_MODEL_PATH):
            return CUSTOM_MODEL_PATH
        return os.path.normpath(
            os.path.join(os.path.dirname(__file__), CUSTOM_MODEL_PATH)
        )
    if CUSTOM_MODEL_URL:
        return PREFERRED_MASK_MODEL_PATH
    return LEGACY_MASK_MODEL_PATH


MODEL_URL = CUSTOM_MODEL_URL or LEGACY_MODEL_URL
MASK_MODEL_PATH = resolve_output_path()


def download(url: str, dest: str) -> None:
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    print("Downloading mask model from Hugging Face...")
    print(f"  -> {dest}")

    def _progress(block_num, block_size, total_size):
        downloaded = block_num * block_size
        if total_size > 0:
            pct = min(downloaded / total_size * 100, 100)
            print(
                f"\r  {pct:5.1f}%  {downloaded // 1024} KB / {total_size // 1024} KB",
                end="",
                flush=True,
            )

    urllib.request.urlretrieve(url, dest, reporthook=_progress)
    print("\nDone.")


if __name__ == "__main__":
    if CUSTOM_MODEL_URL:
        print(
            "Custom MASK_MODEL_URL detected. This download will become the preferred mask model."
        )
    else:
        print("Downloading the legacy nano fallback model.")
        print(
            "For best accuracy, place a stronger fine-tuned best.pt at backend/models/mask_best.pt."
        )

    if os.path.exists(MASK_MODEL_PATH):
        size_mb = os.path.getsize(MASK_MODEL_PATH) / 1024 / 1024
        print(f"Mask model already exists ({size_mb:.1f} MB) - skipping download.")
        print(f"  Path: {MASK_MODEL_PATH}")
    else:
        download(MODEL_URL, MASK_MODEL_PATH)
        print(f"\nMask model saved to: {MASK_MODEL_PATH}")
        print("You can now start Flask: python app.py")
