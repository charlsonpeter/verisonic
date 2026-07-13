import React, { useEffect, useRef, useState } from 'react';
import { FileText, Upload, ExternalLink, Loader2 } from 'lucide-react';
import { showError, showSuccess } from '../../utils/swal';

interface LicenceDocumentUploadProps {
  uploadUrl: string;
  documentUrl?: string | null;
  token?: string | null;
  disabled?: boolean;
  onUploaded?: (url: string) => void;
}

export const LicenceDocumentUpload: React.FC<LicenceDocumentUploadProps> = ({
  uploadUrl,
  documentUrl,
  token,
  disabled = false,
  onUploaded,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(documentUrl ?? null);

  useEffect(() => {
    setCurrentUrl(documentUrl ?? null);
  }, [documentUrl]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token || ''}`,
        },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showError('Upload Failed', err.detail || 'Could not upload licence document.');
        return;
      }
      const data = await res.json();
      const url =
        data.licence_document_url ||
        data.artist_profile?.licence_document_url ||
        null;
      if (url) {
        setCurrentUrl(url);
        onUploaded?.(url);
      }
      showSuccess('Document Uploaded', 'Licence document saved successfully.');
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
        Licence Document
      </label>
      <p className="text-[10px] text-slate-500">
        PDF or image (JPG, PNG, WEBP), max 10 MB.
      </p>
      {currentUrl && (
        <a
          href={currentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[10px] font-bold text-rose-400 hover:text-rose-300"
        >
          <FileText className="w-3.5 h-3.5" />
          View current document
          <ExternalLink className="w-3 h-3" />
        </a>
      )}
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
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
          {currentUrl ? 'Replace document' : 'Upload document'}
        </button>
      </div>
    </div>
  );
};

export const LicenceDocumentLink: React.FC<{ url?: string | null; className?: string }> = ({
  url,
  className = '',
}) => {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-1 text-[9px] font-bold text-rose-400 hover:text-rose-300 uppercase tracking-wide mt-1 ${className}`}
      title="View licence document"
    >
      <FileText className="w-3 h-3" />
      Doc
    </a>
  );
};
