import React, { useEffect, useRef, useState } from 'react';
import { Camera, ImageIcon, Loader2, Upload } from 'lucide-react';
import { compressImageIfNeeded } from '../../utils/compressImage';
import { showError, showSuccess } from '../../utils/swal';

interface CoverImageUploadProps {
  uploadUrl?: string;
  coverUrl?: string | null;
  token?: string | null;
  disabled?: boolean;
  label?: string;
  hint?: string;
  /** thumbnail = compact form control; hero = banner with hover camera overlay (user-profile style) */
  variant?: 'thumbnail' | 'hero';
  previewClassName?: string;
  onUploaded?: (url: string) => void;
}

export const CoverImageUpload: React.FC<CoverImageUploadProps> = ({
  uploadUrl,
  coverUrl,
  token,
  disabled = false,
  label = 'Cover Image',
  hint = 'JPG, PNG, or WEBP. Recommended 16:9. HD allowed; stored at 1 MB max.',
  variant = 'thumbnail',
  previewClassName = 'rounded-xl',
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

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
      className="hidden"
      disabled={disabled || isUploading}
      onChange={handleFileChange}
    />
  );

  if (variant === 'hero') {
    return (
      <div className="space-y-2">
        <div className="flex items-end justify-between gap-3">
          <div>
            <label className="font-bold text-slate-400 uppercase tracking-wider block text-xs">
              {label}
            </label>
            <p className="text-[10px] text-slate-500 mt-0.5">{hint}</p>
          </div>
          {!disabled && (
            <button
              type="button"
              disabled={isUploading}
              onClick={openFilePicker}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-white/5 rounded-xl text-[10px] font-bold text-slate-300 hover:text-white uppercase tracking-wider transition disabled:opacity-40"
            >
              {isUploading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Camera className="w-3.5 h-3.5" />
              )}
              {currentUrl ? 'Change' : 'Upload'}
            </button>
          )}
        </div>

        <div className="group relative w-full aspect-[16/9] max-h-56 overflow-hidden rounded-2xl bg-slate-950 border border-white/5 shadow-inner">
          {currentUrl ? (
            <img src={currentUrl} alt="Cover preview" className="w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900">
              <div className="w-14 h-14 rounded-2xl bg-slate-800/80 border border-white/5 flex items-center justify-center">
                <ImageIcon className="w-7 h-7 text-slate-500" />
              </div>
              <span className="text-[11px] font-semibold text-slate-500">
                {disabled ? 'Cover unavailable until saved' : 'Add a cover image'}
              </span>
            </div>
          )}

          {!disabled && (
            <button
              type="button"
              onClick={openFilePicker}
              disabled={isUploading}
              aria-label={currentUrl ? 'Replace cover image' : 'Upload cover image'}
              className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-60 transition-opacity cursor-pointer disabled:cursor-wait"
            >
              {isUploading ? (
                <Loader2 className="w-8 h-8 animate-spin" />
              ) : (
                <>
                  <Camera className="w-8 h-8" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">
                    {currentUrl ? 'Replace cover' : 'Upload cover'}
                  </span>
                </>
              )}
            </button>
          )}

          {disabled && (
            <div className="absolute inset-0 bg-slate-950/40 pointer-events-none" />
          )}
        </div>
        {fileInput}
      </div>
    );
  }

  return (
    <div className="space-y-2 sm:col-span-2">
      <label className="font-bold text-slate-400 uppercase tracking-wider block text-xs">
        {label}
      </label>
      <p className="text-[10px] text-slate-500">{hint}</p>
      <div className="flex items-start gap-4">
        <div
          className={`w-20 h-20 overflow-hidden bg-slate-950 border border-white/5 flex-shrink-0 flex items-center justify-center ${previewClassName}`}
        >
          {currentUrl ? (
            <img src={currentUrl} alt="Cover preview" className="w-full h-full object-cover" />
          ) : (
            <ImageIcon className="w-8 h-8 text-slate-600" />
          )}
        </div>
        <div className="flex items-center gap-2 pt-1">
          {fileInput}
          <button
            type="button"
            disabled={disabled || isUploading}
            onClick={openFilePicker}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-white/5 rounded-xl text-[10px] font-bold text-slate-300 hover:text-white uppercase tracking-wider transition disabled:opacity-40"
          >
            {isUploading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            {currentUrl ? 'Replace cover' : 'Upload cover'}
          </button>
        </div>
      </div>
    </div>
  );
};
