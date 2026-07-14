FROM python:3.10-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    build-essential \
    libpq-dev \
    libopus-dev \
    libvpx-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1 = install Demucs/faster-whisper stack (worker only; large torch wheel)
ARG INSTALL_LYRICS_DEPS=0

COPY requirements.txt .
COPY requirements-lyrics.txt .

RUN pip install --upgrade pip \
    && pip install --default-timeout=1000 --retries=10 --no-cache-dir -r requirements.txt \
    && if [ "$INSTALL_LYRICS_DEPS" = "1" ]; then \
         pip install --default-timeout=1000 --retries=10 --no-cache-dir -r requirements-lyrics.txt; \
       fi

COPY . .

EXPOSE 8000
