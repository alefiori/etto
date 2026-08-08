// Extends Vitest's `expect` with the jest-dom matchers (toBeInTheDocument, etc.)
// and registers automatic RTL cleanup after each test.
import '@testing-library/jest-dom/vitest'
import { beforeEach } from 'vitest'

// Node 22+ (so our Node 26 CI) ships an experimental global `localStorage` that
// throws unless the process was started with --localstorage-file, and it shadows
// the working one jsdom provides — breaking every test that touches storage
// (e.g. the i18n locale persistence). Install a plain in-memory Storage that
// works on any Node version, on both `globalThis` and `window` so bare
// `localStorage` and `window.localStorage` share one store.
class MemoryStorage {
  private store = new Map<string, string>()
  get length(): number {
    return this.store.size
  }
  clear(): void {
    this.store.clear()
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null
  }
  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null
  }
  removeItem(key: string): void {
    this.store.delete(key)
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value))
  }
}

const storage = new MemoryStorage()
for (const target of [globalThis, typeof window !== 'undefined' ? window : undefined]) {
  if (target) Object.defineProperty(target, 'localStorage', { configurable: true, value: storage })
}

// A fresh store per test, so persisted values never leak between them.
beforeEach(() => storage.clear())
