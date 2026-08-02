import type { CapacitorConfig } from '@capacitor/cli'
import { KeyboardResize } from '@capacitor/keyboard'

/**
 * Capacitor wraps the existing Vite build — there is no separate native
 * codebase.
 *
 * `webDir` must be set: Vite emits to dist/, Capacitor defaults to www/.
 */
const config: CapacitorConfig = {
  appId: 'app.macrotrack',
  appName: 'MacroTrack',
  webDir: 'dist',
  // The PWA manifest's orientation/theme are inert natively, so they are
  // re-declared here and via @capacitor/status-bar at runtime.
  backgroundColor: '#f8f9ff',
  ios: {
    // Keeps the WebView from bouncing past the fixed header and bottom nav.
    scrollEnabled: false,
    contentInset: 'always',
  },
  android: {
    // The app talks only to HTTPS, so cleartext stays off.
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false, // hidden from main.tsx once React has painted
      backgroundColor: '#f8f9ff',
    },
    Keyboard: {
      // Resize the WebView rather than the body, which is what the
      // position:fixed scroll lock in useScrollLock expects.
      resize: KeyboardResize.Native,
    },
  },
}

export default config
