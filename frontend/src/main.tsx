import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import {
  getAccessToken,
  refreshAccessToken,
  shouldAttemptTokenRefresh,
} from './utils/authTokens'

const originalFetch = window.fetch;
window.fetch = async (input, init) => {
  const mode = localStorage.getItem('userMode') || 'admin';
  init = init || {};
  const headers = new Headers(init.headers || {});
  if (!headers.has('x-user-mode')) {
    headers.set('x-user-mode', mode);
  }

  const accessToken = getAccessToken();
  if (accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }
  init.headers = headers;

  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  let response = await originalFetch(input, init);

  if (response.status === 401 && shouldAttemptTokenRefresh(url)) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      const retryHeaders = new Headers(init.headers || {});
      retryHeaders.set('Authorization', `Bearer ${getAccessToken()}`);
      response = await originalFetch(input, { ...init, headers: retryHeaders });
    }
  }

  return response;
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
