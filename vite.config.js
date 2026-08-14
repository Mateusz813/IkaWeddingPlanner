import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

const PORT = 5899

export default defineConfig({
  server: { port: PORT, strictPort: true, host: true },
  preview: { port: PORT, strictPort: true, host: true },
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      // rejestrujemy service workera ręcznie w src/lib/updater.js
      injectRegister: null,
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'Iwona & Mateusz — Planer Ślubny',
        short_name: 'I & M Ślub',
        description: 'Planer ślubu i wesela — usługodawcy, koszty, zaliczki i kontakty.',
        lang: 'pl',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FBF5EF',
        theme_color: '#FBF5EF',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: '/index.html',
      },
      devOptions: { enabled: false },
    }),
  ],
})
