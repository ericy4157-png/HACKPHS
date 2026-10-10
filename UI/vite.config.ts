import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The Skyward backend (repo root, `npm run dev`) serves the /api contract on :3000.
const API_TARGET = process.env.SKYWARD_API_URL ?? 'http://localhost:3000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': API_TARGET,
    },
  },
})
