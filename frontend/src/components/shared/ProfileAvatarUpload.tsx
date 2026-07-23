import React, { useEffect, useRef, useState } from 'react';
import { Camera, Loader2, User } from 'lucide-react';
import { getUserInitials } from './UserAvatar';
import { compressImageIfNeeded } from '../../utils/compressImage';
import { showError, showSuccess } from '../../utils/swal';

interface ProfileAvatarUploadProps {
  fullName?: string | null;
  email?: string;
  imageUrl?: string | null;
  uploadUrl?: string;
  token?: string | null;
  className?: string;
  fallbackIconClassName?: string;
  initialsClassName?: string;
  onUploaded?: (url: string) => void;
}

export const ProfileAvatarUpload: React.FC<ProfileAvatarUploadProps> = ({
  fullName,
  email,
  imageUrl,
  uploadUrl = '/api/auth/profile/avatar',
  token,
  className = 'w-24 h-24',
  fallbackIconClassName = 'w-12 h-12',
  initialsClassName = 'text-2xl',
  onUploaded,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [currentUrl, setCurrentUrl] = useState(imageUrl ?? null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    setCurrentUrl(imageUrl ?? null);
  }, [imageUrl]);

  const initials = getUserInitials(fullName, email);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      let uploadFile = file;
      try {
        uploadFile = await compressImageIfNeeded(file, { maxDimension: 1024 });
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
        showError('Upload Failed', err.detail || 'Could not upload display picture.');
        return;
      }
      const data = await res.json();
      const url = data.profile_image_url || null;
      if (url) {
        setCurrentUrl(url);
        onUploaded?.(url);
      }
      showSuccess('Display Picture Updated', 'Your profile photo was saved.');
    } catch {
      showError('Upload Failed', 'Connection failed.');
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const openFilePicker = () => {
    if (!isUploading) inputRef.current?.click();
  };

  return (
    <div className={`group relative flex-shrink-0 ${className}`}>
      <div
        className={`w-full h-full rounded-full bg-slate-800 border-2 border-white/10 flex items-center justify-center text-slate-300 font-bold overflow-hidden shadow-md`}
      >
        {currentUrl ? (
          <img src={currentUrl} alt="" className="w-full h-full object-cover" />
        ) : initials ? (
          <span className={initialsClassName}>{initials}</span>
        ) : (
          <User className={fallbackIconClassName} />
        )}
      </div>

      <button
        type="button"
        onClick={openFilePicker}
        disabled={isUploading}
        aria-label="Upload display picture"
        className="absolute inset-0 rounded-full flex items-center justify-center bg-black/55 text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-60 transition-opacity cursor-pointer disabled:cursor-wait"
      >
        {isUploading ? (
          <Loader2 className="w-7 h-7 animate-spin" />
        ) : (
          <Camera className="w-7 h-7" />
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        className="hidden"
        disabled={isUploading}
        onChange={handleFileChange}
      />
    </div>
  );
};
