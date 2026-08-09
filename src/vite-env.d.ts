/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  /** Public origin the legal documents are served from. See src/lib/legal.ts. */
  readonly VITE_SITE_URL?: string
  /** Privacy/support contact published in the legal documents and the stores. */
  readonly VITE_SUPPORT_EMAIL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** package.json's version, inlined at build time by vite.config.ts. */
declare const __APP_VERSION__: string
