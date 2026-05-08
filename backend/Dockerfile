FROM python:3.11-slim

# Install runtime libraries AND g++/gcc for insightface compilation
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libgomp1 \
    g++ \
    gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements
COPY requirements.txt .

# Install CPU-only PyTorch first
RUN pip install --no-cache-dir \
    --default-timeout=600 \
    --retries=10 \
    --index-url https://download.pytorch.org/whl/cpu \
    torch torchvision

# Install everything else
RUN pip install --no-cache-dir \
    --default-timeout=600 \
    --retries=10 \
    -r requirements.txt

COPY . .

EXPOSE 5000

ENV PYTHONUNBUFFERED=1

CMD ["python", "app.py"]
