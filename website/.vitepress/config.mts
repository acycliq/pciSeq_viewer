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
    ['meta', { name: 'theme-color', content: '#047857' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'pciSeq Viewer' }],
    ['meta', { property: 'og:description', content: 'The desktop viewer for a pciSeq run' }],
    ['meta', { property: 'og:image', content: 'https://acycliq.github.io/pciSeq_viewer/img/map_still.png' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:image', content: 'https://acycliq.github.io/pciSeq_viewer/img/map_still.png' }],
  ],

  themeConfig: {
    logo: '/img/logo.png',

    // three plain links and one action. The pages themselves are in the sidebar
    nav: [
      { text: 'Docs', link: '/docs/', activeMatch: '^/docs/(?!reference/)' },
      { text: 'Reference', link: '/docs/reference/data-format', activeMatch: '^/docs/reference/' },
      { text: 'pciSeq', link: 'https://acycliq.github.io/pciSeq_3d/' },
      { text: 'Download', link: 'https://github.com/acycliq/pciSeq_viewer/releases/latest' },
    ],

    // one sidebar for everything under /docs, in the order a new user needs it
    sidebar: {
      '/docs/': [
        {
          text: 'Introduction',
          items: [
            { text: 'Overview', link: '/docs/' },
            { text: 'Installation', link: '/docs/installation' },
            { text: 'Loading the data', link: '/docs/loading-data' },
          ],
        },
        {
          text: 'The viewer',
          items: [
            { text: 'The map', link: '/docs/the-map' },
            { text: 'The drawer', link: '/docs/the-drawer' },
            { text: 'The 3D view', link: '/docs/3d-view' },
            { text: 'Annotations', link: '/docs/annotations' },
            { text: 'Keyboard shortcuts', link: '/docs/keyboard-shortcuts' },
          ],
        },
        {
          text: 'Explaining the calls',
          items: [
            { text: 'Diagnostics', link: '/docs/diagnostics' },
            { text: 'Cell diagnostics', link: '/docs/diagnostics#cell-diagnostics' },
            { text: 'Spot diagnostics', link: '/docs/diagnostics#spot-diagnostics' },
          ],
        },
        {
          // the same shape as the AI agent group of the pciSeq site
          text: 'AI agent',
          items: [
            { text: 'Overview', link: '/docs/ai-agent' },
            { text: 'Requirements', link: '/docs/ai-agent#requirements' },
            { text: 'Chat panel', link: '/docs/ai-agent#chat-panel' },
            { text: 'AI assistant', link: '/docs/ai-agent#ai-assistant' },
            { text: 'Tools', link: '/docs/ai-agent#tools' },
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
          collapsed: true,
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

    // shown on the landing page only, the docs pages have the sidebar instead
    footer: {
      message: 'MIT licence. <a href="https://github.com/acycliq/pciSeq_viewer/releases">Release notes</a> · <a href="https://github.com/acycliq/pciSeq_viewer">Source</a> · <a href="https://acycliq.github.io/pciSeq_3d/">pciSeq</a>',
      copyright: '© 2026 acycliq',
    },

    outline: { level: [2, 3], label: 'On this page' },
    docFooter: { prev: 'Previous', next: 'Next' },

    search: {
      provider: 'local',
    },
  },
})
