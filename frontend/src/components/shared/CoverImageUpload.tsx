import React, { useEffect, useRef, useState } from 'react';
import { Camera, ImageIcon, Loader2 } from 'lucide-react';
import { compressImageIfNeeded } from '../../utils/compressImage';
import { showError, showSuccess } from '../../utils/swal';

interface CoverImageUploadProps {
  uploadUrl?: string;
  coverUrl?: string | null;
  token?: string | null;
  disabled?: boolean;
  className?: string;
  onUploaded?: (url: string) => void;
}

/** Compact cover upload — same hover-camera pattern as ProfileAvatarUpload. */
export const CoverImageUpload: React.FC<CoverImageUploadProps> = ({
  uploadUrl,
  coverUrl,
  token,
  disabled = false,
  className = 'w-24 h-24',
  onUploaded,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(coverUrl ?? null);

  useEffect(() => {
    setCurrentUrl(coverUrl ?? null);
  }, [coverUrl]);

  const openFilePicker = () => {
    if (!disabled && !isUploading && uploadUrl) inputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadUrl) return;

    setIsUploading(true);
    try {
      let uploadFile = file;
      try {
        uploadFile = await compressImageIfNeeded(file, { maxDimension: 2048 });
      } catch (err) {
        showError(
          'Upload Failed',
          err instanceof Error ? err.message : 'Could not prepare the image for upload.'
        );
        return;
      }

      const formData = new FormData();
      formData.append('cover_image', uploadFile);
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token || ''}`,
        },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showError('Upload Failed', err.detail || 'Could not upload cover image.');
        return;
      }
      const data = await res.json();
      const url =
        data.cover_art_url ||
        data.artist_profile?.cover_art_url ||
        null;
      if (url) {
        setCurrentUrl(url);
        onUploaded?.(url);
      }
      showSuccess('Cover Uploaded', 'Cover image saved successfully.');
    } catch {
      showError('Upload Failed', 'Connection failed.');
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className={`group relative flex-shrink-0 ${className} ${disabled ? 'opacity-50' : ''}`}>
      <div className="w-full h-full rounded-2xl bg-slate-800 border-2 border-white/10 flex items-center justify-center overflow-hidden shadow-md">
        {currentUrl ? (
          <img src={currentUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <ImageIcon className="w-10 h-10 text-slate-500" />
        )}
      </div>

      {!disabled && (
        <button
          type="button"
          onClick={openFilePicker}
          disabled={isUploading}
          aria-label="Upload cover image"
          className="absolute inset-0 rounded-2xl flex items-center justify-center bg-black/55 text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-60 transition-opacity cursor-pointer disabled:cursor-wait"
        >
          {isUploading ? (
            <Loader2 className="w-7 h-7 animate-spin" />
          ) : (
            <Camera className="w-7 h-7" />
          )}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        className="hidden"
        disabled={disabled || isUploading}
        onChange={handleFileChange}
      />
    </div>
  );
};
