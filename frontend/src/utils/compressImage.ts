const DEFAULT_MAX_BYTES = 1024 * 1024; // 1 MB
const MIN_QUALITY = 0.6;
const START_QUALITY = 0.92;

export type CompressImageOptions = {
  maxBytes?: number;
  /** Longest side in pixels. Avatar: ~1024, cover: ~2048. */
  maxDimension?: number;
};

/**
 * If the file is larger than maxBytes, re-encode as JPEG under the limit
 * while preserving clarity (resize only when quality alone is not enough).
 * Files already under the limit are returned unchanged.
 */
export async function compressImageIfNeeded(
  file: File,
  options: CompressImageOptions = {}
): Promise<File> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxDimension = options.maxDimension ?? 2048;

  if (!file.type.startsWith('image/')) {
    throw new Error('Selected file is not an image.');
  }

  if (file.size <= maxBytes) {
    return file;
  }

  const bitmap = await createImageBitmap(file);
  try {
    let width = bitmap.width;
    let height = bitmap.height;
    const scale = Math.min(1, maxDimension / Math.max(width, height));
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));

    let quality = START_QUALITY;
    let blob: Blob | null = null;

    for (let attempt = 0; attempt < 14; attempt++) {
      blob = await encodeJpeg(bitmap, width, height, quality);
      if (blob.size <= maxBytes) {
        break;
      }

      if (quality > MIN_QUALITY) {
        quality = Math.max(MIN_QUALITY, quality - 0.08);
      } else {
        width = Math.max(1, Math.round(width * 0.85));
        height = Math.max(1, Math.round(height * 0.85));
        quality = 0.85;
      }
    }

    if (!blob || blob.size > maxBytes) {
      throw new Error('Could not compress image under 1 MB while keeping good quality.');
    }

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'image';
    return new File([blob], `${baseName}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } finally {
    bitmap.close();
  }
}

function encodeJpeg(
  source: ImageBitmap,
  width: number,
  height: number,
  quality: number
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return Promise.reject(new Error('Could not prepare image for compression.'));
  }

  // Opaque white backdrop so PNG transparency does not become black in JPEG.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to encode image.'));
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      quality
    );
  });
}
