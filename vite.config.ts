import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import APP from './app.meta.json' with { type: 'json' };

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'icons/mark.svg',
        'icons/apple-touch-icon.png',
        'icons/favicon-32.png',
      ],
      manifest: {
        name: APP.name,
        short_name: APP.shortName,
        description: APP.description,
        start_url: APP.startUrl,
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: APP.themeColor,
        background_color: APP.backgroundColor,
        categories: ['music', 'lifestyle'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // The shell, code and icons are precached so a stored library stays
        // browsable offline. Third-party music APIs are deliberately absent:
        // analysis caching belongs in the app data layer, not the SW.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // The analyzer library is only needed once an analysis actually runs,
        // so it is fetched on demand rather than at install time.
        globIgnores: ['**/transformers*.js', '**/*.wasm'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        // The embedding model weights are large and cached by the browser and
        // by transformers.js itself; precaching them would bloat installs.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        // Keeps the heavy, rarely-changing libraries out of the app chunk.
        manualChunks(id: string) {
          const path = id.replaceAll('\\', '/');
          if (path.includes('/node_modules/react')) return 'vendor';
          if (path.includes('/node_modules/motion')) return 'motion';
          return undefined;
        },
      },
    },
  },
});
