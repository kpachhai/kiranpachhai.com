import { defineConfig } from 'astro/config'
import sitemap from '@astrojs/sitemap'

// Moved pages redirect to home sections and 404 is not a page; none belong in the sitemap.
const EXCLUDED = ['/about/', '/portfolio/', '/contact/', '/404.html']

export default defineConfig({
  site: 'https://kiranpachhai.com',
  output: 'static',
  trailingSlash: 'always',
  integrations: [sitemap({ filter: (page) => !EXCLUDED.some((path) => page.endsWith(path)) })],
})
