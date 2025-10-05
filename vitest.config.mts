import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    server: {
      deps: {
        inline: ['next-auth']
      }
    },
    alias: {
      "auth": resolve("./mocks/auth.mock.ts")
    },
    environment: 'jsdom',
  },
})