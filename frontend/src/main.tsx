import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Global fetch interceptor to automatically inject X-User-Mode header
const originalFetch = window.fetch;
window.fetch = async (input, init) => {
  const mode = localStorage.getItem('userMode') || 'admin';
  init = init || {};
  const headers = new Headers(init.headers || {});
  if (!headers.has('x-user-mode')) {
    headers.set('x-user-mode', mode);
  }
  init.headers = headers;
  return originalFetch(input, init);
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
