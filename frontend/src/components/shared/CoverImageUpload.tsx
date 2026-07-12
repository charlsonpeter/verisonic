import React, { useEffect, useRef, useState } from 'react';
import { ImageIcon, Upload, Loader2 } from 'lucide-react';
import { showError, showSuccess } from '../../utils/swal';

interface CoverImageUploadProps {
  uploadUrl: string;
  coverUrl?: string | null;
  token?: string | null;
  disabled?: boolean;
  label?: string;
  hint?: string;
  previewClassName?: string;
  onUploaded?: (url: string) => void;
}

export const CoverImageUpload: React.FC<CoverImageUploadProps> = ({
  uploadUrl,
  coverUrl,
  token,
  disabled = false,
  label = 'Cover Image',
  hint = 'JPG, PNG, or WEBP, max 10 MB. Shown in radio listings and search.',
  previewClassName = 'rounded-xl',
  onUploaded,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(coverUrl ?? null);

  useEffect(() => {
    setCurrentUrl(coverUrl ?? null);
  }, [coverUrl]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('cover_image', file);
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token || localStorage.getItem('token') || ''}`,
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
    <div className="space-y-2 sm:col-span-2">
      <label className="font-bold text-slate-400 uppercase tracking-wider block text-xs">
        {label}
      </label>
      <p className="text-[10px] text-slate-500">
        {hint}
      </p>
      <div className="flex items-start gap-4">
        <div className={`w-20 h-20 overflow-hidden bg-slate-950 border border-white/5 flex-shrink-0 flex items-center justify-center ${previewClassName}`}>
          {currentUrl ? (
            <img src={currentUrl} alt="Cover preview" className="w-full h-full object-cover" />
          ) : (
            <ImageIcon className="w-8 h-8 text-slate-600" />
          )}
        </div>
        <div className="flex items-center gap-2 pt-1">
          <input
            ref={inputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            className="hidden"
            disabled={disabled || isUploading}
            onChange={handleFileChange}
          />
          <button
            type="button"
            disabled={disabled || isUploading}
            onClick={() => inputRef.current?.click()}
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
