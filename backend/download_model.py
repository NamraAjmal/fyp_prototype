# download_model.py  — run this ONCE to download the model
from huggingface_hub import hf_hub_download
import os, shutil

os.makedirs("models", exist_ok=True)

print("Downloading keremberke helmet model...")
path = hf_hub_download(
    repo_id="keremberke/yolov8m-hard-hat-detection",
    filename="best.pt"
)
shutil.copy(path, "models/helmet.pt")
print(f"Saved to models/helmet.pt")