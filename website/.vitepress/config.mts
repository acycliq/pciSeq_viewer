import { defineConfig } from 'vitepress'

// Config for the pciSeq Viewer docs. The site is served from a subpath on GitHub
// Pages, hence base. The landing page owns the root and the docs live under /docs.
export default defineConfig({
  title: 'pciSeq Viewer',
  description: 'The desktop viewer for a pciSeq run: the section plane by plane, a region in 3D, and an agent that explains the calls',
  lang: 'en-US',

  // Project site at https://acycliq.github.io/pciSeq_viewer/
  base: '/pciSeq_viewer/',

  // keep the light/dark toggle. The site always starts light, whatever the reader's
  // operating system says, see the script in head below
  appearance: true,

  // don't die on a bad link while the docs are still being written
  ignoreDeadLinks: true,

  // README.md here is the dev readme for this folder, not a site page
  srcExclude: ['README.md'],

  head: [
    // start on the light theme even when the OS is dark. VitePress reads this key and
    // only falls back to the OS when nothing is stored, so writing 'light' once makes
    // light the default. The toggle still works and still remembers what the reader picks.
    ['script', {}, `try{localStorage.getItem('vitepress-theme-appearance')||localStorage.setItem('vitepress-theme-appearance','light')}catch(e){}`],
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/pciSeq_viewer/img/logo.svg' }],
    ['link', { rel: 'icon', type: 'image/x-icon', href: '/pciSeq_viewer/img/favicon.ico' }],
    ['link', { rel: 'apple-touch-icon', href: '/pciSeq_viewer/img/logo.png' }],
    ['meta', { name: 'theme-color', content: '#10b981' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'pciSeq Viewer' }],
    ['meta', { property: 'og:description', content: 'The desktop viewer for a pciSeq run' }],
    ['meta', { property: 'og:image', content: 'https://acycliq.github.io/pciSeq_viewer/img/map_still.png' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:image', content: 'https://acycliq.github.io/pciSeq_viewer/img/map_still.png' }],
  ],

  themeConfig: {
    logo: '/img/logo.png',

    nav: [
      { text: 'Docs', link: '/docs/' },
      { text: 'The map', link: '/docs/the-map' },
      { text: '3D', link: '/docs/3d-view' },
      { text: 'AI chat', link: '/docs/ai-chat' },
      { text: 'Reference', link: '/docs/reference/data-format' },
      { text: 'pciSeq', link: 'https://acycliq.github.io/pciSeq_3d/' },
      { text: 'Download', link: 'https://github.com/acycliq/pciSeq_viewer/releases/latest' },
    ],

    // one sidebar for everything under /docs
    sidebar: {
      '/docs/': [
        { text: 'Overview', link: '/docs/' },
        { text: 'Installation', link: '/docs/installation' },
        { text: 'Loading the data', link: '/docs/loading-data' },
        {
          text: 'The map',
          link: '/docs/the-map',
          items: [
            { text: 'The window', link: '/docs/the-map' },
            { text: 'The drawer', link: '/docs/the-drawer' },
            { text: 'Annotations', link: '/docs/annotations' },
            { text: 'Keyboard shortcuts', link: '/docs/keyboard-shortcuts' },
          ],
        },
        { text: 'The 3D view', link: '/docs/3d-view' },
        {
          text: 'Explaining the calls',
          items: [
            { text: 'The inspectors', link: '/docs/inspectors' },
            { text: 'AI chat', link: '/docs/ai-chat' },
          ],
        },
        {
          text: 'More',
          items: [
            { text: 'Single cell data', link: '/docs/single-cell' },
            { text: 'Custom colours', link: '/docs/custom-colours' },
            { text: 'Troubleshooting', link: '/docs/troubleshooting' },
          ],
        },
        {
          text: 'Reference',
          items: [
            { text: 'Data format', link: '/docs/reference/data-format' },
            { text: 'Configuration', link: '/docs/reference/configuration' },
          ],
        },
        {
          text: 'Contributing',
          items: [
            { text: 'Architecture', link: '/docs/contributing/architecture' },
            { text: 'Building and releases', link: '/docs/contributing/building-releases' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/acycliq/pciSeq_viewer' },
    ],

    editLink: {
      pattern: 'https://github.com/acycliq/pciSeq_viewer/edit/desktop_app/website/:path',
      text: 'Edit this page on GitHub',
    },

    footer: {
      message: 'Built with VitePress.',
      copyright: 'Copyright © 2026 acycliq',
    },

    search: {
      provider: 'local',
    },
  },
})
