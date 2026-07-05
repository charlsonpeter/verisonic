import Swal from 'sweetalert2';

export const showSuccess = (title: string, text?: string) => {
  return Swal.fire({
    icon: 'success',
    title,
    text,
    background: '#0f172a',
    color: '#fff',
    confirmButtonColor: '#e11d48'
  });
};

export const showError = (title: string, text?: string) => {
  return Swal.fire({
    icon: 'error',
    title,
    text,
    background: '#0f172a',
    color: '#fff',
    confirmButtonColor: '#e11d48'
  });
};

export const showInfo = (title: string, text?: string) => {
  return Swal.fire({
    icon: 'info',
    title,
    text,
    background: '#0f172a',
    color: '#fff',
    confirmButtonColor: '#e11d48'
  });
};

export const showConfirm = async (title: string, text: string, confirmText: string = "Yes, proceed") => {
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
    color: '#fff'
  });
  return result.isConfirmed;
};
