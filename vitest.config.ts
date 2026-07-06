import { defineConfig } from 'vitest/config'

// A minimal, dedicated Vitest config (separate from vite.config.ts) so the PWA/React
// plugins don't load during unit tests — these cover pure logic and run in plain Node.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
