import Swal from 'sweetalert2';
import { showBanner } from './banner';

const isMobileViewport = () =>
  typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;

export const showSuccess = (title: string, text?: string) => {
  showBanner('success', title, text);
};

export const showError = (title: string, text?: string) => {
  showBanner('error', title, text);
};

export const showInfo = (title: string, text?: string) => {
  showBanner('info', title, text);
};

export const showConfirm = async (
  title: string,
  text: string,
  confirmText: string = 'Yes, proceed',
) => {
  const mobile = isMobileViewport();
  const result = await Swal.fire({
    title,
    text,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#e11d48',
    cancelButtonColor: '#334155',
    confirmButtonText: confirmText,
    cancelButtonText: 'Cancel',
    background: '#0f172a',
    color: '#fff',
    width: mobile ? 'min(92vw, 22rem)' : undefined,
    padding: mobile ? '1.25rem' : '1.5rem',
    reverseButtons: mobile,
    customClass: {
      popup: 'verisonic-swal-popup',
      title: 'verisonic-swal-title',
      htmlContainer: 'verisonic-swal-text',
      confirmButton: 'verisonic-swal-confirm',
      cancelButton: 'verisonic-swal-cancel',
      actions: 'verisonic-swal-actions',
    },
  });
  return result.isConfirmed;
};
