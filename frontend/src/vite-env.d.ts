/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BROADCASTER_DOWNLOAD_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
