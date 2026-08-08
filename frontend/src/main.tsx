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
  init = init || {};
  const headers = new Headers(init.headers || {});

  const accessToken = getAccessToken();
  if (accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }
  init.headers = headers;
  if (init.credentials === undefined) {
    init.credentials = 'include';
  }

  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  let response = await originalFetch(input, init);

  if (response.status === 401 && shouldAttemptTokenRefresh(url)) {
    const refreshed = await refreshAccessToken();
    if (refreshed === 'success') {
      const retryHeaders = new Headers(init.headers || {});
      retryHeaders.set('Authorization', `Bearer ${getAccessToken()}`);
      response = await originalFetch(input, { ...init, headers: retryHeaders });
    } else if (refreshed === 'unauthorized') {
      window.dispatchEvent(new CustomEvent('verisonic:session-invalid'));
    }
    // 'unavailable' — leave response as 401; caller can retry later without logout
  }

  return response;
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
