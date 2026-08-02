import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { bootstrapNative } from './lib/nativeBootstrap'
import './index.css'

// No-op on the web; sets up the status bar, keyboard, hardware back button and
// splash screen in the native shell. Not awaited — React should paint as soon
// as it can, and every step inside degrades to nothing on failure.
void bootstrapNative()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
