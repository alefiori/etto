/**
 * Where the app is running.
 *
 * Detected at runtime from the global Capacitor injects, rather than from a
 * build flag, so one bundle behaves correctly in both places and the web build
 * needs no native imports to make the decision.
 */

interface CapacitorGlobal {
  isNativePlatform?: () => boolean
  getPlatform?: () => string
}

function capacitor(): CapacitorGlobal | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as { Capacitor?: CapacitorGlobal }).Capacitor
}

/** True inside the iOS or Android shell; false on the web (and in tests). */
export function isNativePlatform(): boolean {
  const cap = capacitor()
  if (!cap) return false
  // Capacitor 3+ exposes isNativePlatform(); fall back to the platform string
  // for safety if that ever changes shape.
  if (typeof cap.isNativePlatform === 'function') return cap.isNativePlatform()
  return typeof cap.getPlatform === 'function' && cap.getPlatform() !== 'web'
}

export function platform(): 'ios' | 'android' | 'web' {
  const cap = capacitor()
  const name = cap?.getPlatform?.()
  return name === 'ios' || name === 'android' ? name : 'web'
}
