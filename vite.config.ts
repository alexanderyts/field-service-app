import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Field Service App',
        short_name: 'FieldService',
        description: 'Track ministry time, contacts, and territory visits',
        theme_color: '#1f2937',
        background_color: '#1f2937',
        display: 'standalone',
        icons: [],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
      },
    }),
  ],
})
