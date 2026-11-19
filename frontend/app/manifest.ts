import type { MetadataRoute } from 'next'

export const dynamic = "force-static"

export default function manifest(): MetadataRoute.Manifest {

  return {
    id: '/',
    name: 'THALOS — One Intelligence. Every Device.',
    short_name: 'THALOS',
    description: 'Your handheld AI command environment.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'landscape',
    background_color: '#07111b',
    theme_color: '#50D9D0',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/thalos-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/thalos-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/thalos-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/thalos-app-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  }
}
