import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const MAX_WIDTH_CLASS = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
} as const;

export type AppModalMaxWidth = keyof typeof MAX_WIDTH_CLASS;

export interface AppModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: AppModalMaxWidth;
  variant?: 'default' | 'fullscreen';
  showGradient?: boolean;
  panelClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
  overlayClassName?: string;
  closeOnBackdrop?: boolean;
  hideCloseButton?: boolean;
  hideHeaderSection?: boolean;
  align?: 'center' | 'start';
}

export const AppModal: React.FC<AppModalProps> = ({
  open,
  onClose,
  children,
  header,
  footer,
  maxWidth = 'lg',
  variant = 'default',
  showGradient = true,
  panelClassName = '',
  bodyClassName = 'p-6 space-y-4 font-sans',
  footerClassName = '',
  overlayClassName = '',
  closeOnBackdrop = true,
  hideCloseButton = false,
  hideHeaderSection = false,
  align = 'center',
}) => {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const overlayBaseClass =
    variant === 'fullscreen'
      ? 'fixed inset-0 z-50 flex flex-col bg-slate-950/60 backdrop-blur-lg animate-fade-in overflow-hidden'
      : `fixed inset-0 z-50 flex bg-slate-950/50 backdrop-blur-sm p-4 animate-fade-in overflow-y-auto ${
          align === 'start' ? 'items-start justify-center' : 'items-center justify-center'
        }`;

  const showHeaderRow = !hideHeaderSection && (header || !hideCloseButton);

  return createPortal(
    <div
      className={`${overlayBaseClass} ${overlayClassName}`}
      onClick={closeOnBackdrop ? onClose : undefined}
      role="dialog"
      aria-modal="true"
    >
      {variant === 'fullscreen' ? (
        <div className="relative flex-1 min-h-0 w-full" onClick={(event) => event.stopPropagation()}>
          {children}
        </div>
      ) : (
        <div
          className={`bg-[#0a0d1a]/95 border border-white/10 rounded-3xl w-full ${MAX_WIDTH_CLASS[maxWidth]} relative shadow-2xl overflow-hidden my-auto ${panelClassName}`}
          onClick={(event) => event.stopPropagation()}
        >
          {showGradient && (
            <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-br from-rose-500/15 via-indigo-500/10 to-transparent pointer-events-none" />
          )}

          {showHeaderRow && (
            <div className="relative z-10 flex items-start justify-between gap-4 p-6 pb-0">
              {header ? <div className="min-w-0 flex-1">{header}</div> : <div className="flex-1" />}
              {!hideCloseButton && (
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-xl bg-white/5 border border-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer flex-shrink-0"
                  title="Close"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          <div className={`relative z-10 ${bodyClassName}`}>{children}</div>

          {footer && (
            <div
              className={`relative z-10 flex items-center justify-end gap-3 px-6 py-4 border-t border-white/5 bg-slate-950/30 ${footerClassName}`}
            >
              {footer}
            </div>
          )}
        </div>
      )}
    </div>,
    document.body
  );
};
