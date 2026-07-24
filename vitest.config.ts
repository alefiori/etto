import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// Dedicated Vitest config — intentionally NOT reusing vite.config.ts so the PWA
// / Workbox plugin doesn't run during tests. Mirrors only the `@` alias.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // supabase.ts throws at import when these are unset (see src/lib/supabase.ts);
    // foodApi.ts / foods.ts pull it in transitively, so give the tests dummy values.
    env: {
      VITE_SUPABASE_URL: 'https://test.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**'],
      exclude: ['src/**/*.test.*', 'src/test/**', 'src/**/*.d.ts', 'src/main.tsx'],
    },
  },
})
