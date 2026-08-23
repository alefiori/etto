import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { bootstrapNative } from './lib/nativeBootstrap'
import { initTextScale } from './lib/textScale'
import './index.css'

// Before the first render, so the app lays out at the reader's text size rather
// than laying out at 1× and reflowing. Synchronous and cheap — it measures one
// throwaway span. A no-op anywhere but iOS, where it is the only way a WebView
// can learn the Dynamic Type setting. See lib/textScale.ts.
initTextScale()

// No-op on the web; sets up the status bar, keyboard, hardware back button and
// splash screen in the native shell. Not awaited — React should paint as soon
// as it can, and every step inside degrades to nothing on failure.
void bootstrapNative()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
