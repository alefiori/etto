/**
 * Native shell start-up.
 *
 * A no-op on the web, and every plugin is behind a dynamic import so none of
 * this reaches the web bundle. Called once from main.tsx before React renders.
 *
 * The Android hardware back button is the important one: every overlay in this
 * app (Modal, ConfirmDialog, BarcodeScanner, the guest upgrade sheet) listens
 * only for Escape, which Android never sends. Without this, back closes the app
 * from inside a modal.
 */

import { isNativePlatform } from './platform'

export async function bootstrapNative(): Promise<void> {
  if (!isNativePlatform()) return

  await Promise.all([configureStatusBar(), configureKeyboard()])
  await registerBackButton()
  await hideSplash()
}

async function configureStatusBar(): Promise<void> {
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    // The PWA manifest's theme_color does not apply natively.
    await StatusBar.setStyle({ style: Style.Light })
    await StatusBar.setBackgroundColor({ color: '#f8f9ff' })
  } catch {
    // iOS ignores setBackgroundColor and older shells may lack the plugin;
    // neither is worth failing start-up over.
  }
}

async function configureKeyboard(): Promise<void> {
  try {
    const { Keyboard, KeyboardResize } = await import('@capacitor/keyboard')
    // Native resize keeps the position:fixed scroll lock in useScrollLock
    // behaving, which `body` resize breaks.
    await Keyboard.setResizeMode({ mode: KeyboardResize.Native })
  } catch {
    // Not available on every platform.
  }
}

/**
 * Hardware back: let anything that has registered a handler close itself
 * first; only exit when nothing is stacked and we are at the root.
 */
async function registerBackButton(): Promise<void> {
  try {
    const { App } = await import('@capacitor/app')
    App.addListener('backButton', ({ canGoBack }) => {
      if (closeTopOverlay()) return
      if (canGoBack) {
        window.history.back()
        return
      }
      App.exitApp()
    })
  } catch {
    // iOS has no hardware back button.
  }
}

async function hideSplash(): Promise<void> {
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen')
    await SplashScreen.hide()
  } catch {
    // Nothing to hide.
  }
}

/**
 * Overlay dismissal, as a small stack.
 *
 * Overlays register a closer while they are open; back pops the most recent
 * one. Keeping this here rather than inside each component means the back
 * button does not have to know what kinds of overlay exist.
 */
const overlayStack: Array<() => void> = []

export function pushOverlay(close: () => void): () => void {
  overlayStack.push(close)
  return () => {
    const i = overlayStack.lastIndexOf(close)
    if (i >= 0) overlayStack.splice(i, 1)
  }
}

function closeTopOverlay(): boolean {
  const close = overlayStack.pop()
  if (!close) return false
  close()
  return true
}
