// @ts-check
import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';
import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';
import AstroPWA from '@vite-pwa/astro';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  integrations: [
    svelte(),
    AstroPWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true, // Enable PWA in development mode for testing
      },
      workbox: {
        navigateFallback: '/',
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
      manifest: {
        name: 'YOUtinerary - 那就出发吧！',
        short_name: 'YOUtinerary',
        description: '你的随身行程管家',
        theme_color: '#f0f9ff', // Matches sky-50
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: '/favicon.svg',
            sizes: '192x192 512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],

  vite: {
    plugins: [tailwindcss()]
  }
});
