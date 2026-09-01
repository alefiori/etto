import type { CapacitorConfig } from '@capacitor/cli'
import { KeyboardResize } from '@capacitor/keyboard'

/**
 * Capacitor wraps the existing Vite build — there is no separate native
 * codebase.
 *
 * `webDir` must be set: Vite emits to dist/, Capacitor defaults to www/.
 */
const config: CapacitorConfig = {
  appId: 'fitness.etto',
  appName: 'Etto',
  webDir: 'dist',
  // The PWA manifest's orientation/theme are inert natively; the theme is set
  // via @capacitor/status-bar at runtime.
  //
  // Orientation is deliberately *not* locked. The manifest asks for portrait,
  // which is right for a phone, but an iPad app that refuses to rotate cannot
  // support Split View and reads as a blown-up phone app. Capacitor's iOS
  // template already ships all four orientations under
  // UISupportedInterfaceOrientations~ipad and TARGETED_DEVICE_FAMILY = "1,2";
  // scripts/verify-ipad.mjs asserts both, since ios/ is regenerated each build.
  // Grove's light ground, matching CHROME_COLOR in src/lib/theme.ts and the
  // PWA manifest's background_color in vite.config.ts. It is what the OS paints
  // behind the WebView before the first frame; the old violet-white here was
  // left over from the previous palette and flashed on every cold start.
  backgroundColor: '#f4f6ee',
  ios: {
    // Keeps the WebView from bouncing past the fixed header and bottom nav;
    // <main> scrolls internally instead.
    scrollEnabled: false,
    // 'never', not 'always'. index.html sets viewport-fit=cover and the layout
    // pads itself with env(safe-area-inset-*) — letting UIKit also inset the
    // scroll view would apply the notch and home-indicator margins twice.
    contentInset: 'never',
  },
  android: {
    // The app talks only to HTTPS, so cleartext stays off.
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false, // hidden from main.tsx once React has painted
      backgroundColor: '#f4f6ee',
    },
    Keyboard: {
      // Resize the WebView rather than the body, which is what the
      // position:fixed scroll lock in useScrollLock expects.
      resize: KeyboardResize.Native,
    },
    // No BarcodeScanner block, and that is checked rather than assumed:
    // @capacitor-mlkit/barcode-scanning 8.1.1's README says "No configuration
    // required for this plugin", and it registers no `Config` interface. Its
    // options — barcode formats, lens facing, resolution — are per-call
    // arguments to `startScan`, and are passed there from
    // src/components/addfood/barcode/native.ts, which is where the four retail
    // formats the app scans for are defined.
    LocalNotifications: {
      // Android draws the small icon as a *silhouette* — alpha only, colours
      // discarded — so the full-colour launcher icon it falls back to arrives in
      // the status bar as a solid grey blob. `ic_stat_water_drop` is a flat-white
      // vector drawable written into the regenerated android/ project by
      // scripts/patch-android-notification-icon.mjs. iOS ignores both keys.
      smallIcon: 'ic_stat_water_drop',
      iconColor: '#5c8466',
    },
  },
}

export default config
