import { defineConfig } from 'vitepress'

// Config for the pciSeq Viewer docs. Used to be Docusaurus, moved to VitePress.
// The site is served from a subpath on GitHub Pages, hence base. The landing
// page owns the root and the docs live under /docs, same as before.
export default defineConfig({
  title: 'pciSeq Viewer',
  description: 'Interactive desktop application for exploring 3D spatial transcriptomics results from pciSeq',
  lang: 'en-US',

  // Project site at https://acycliq.github.io/pciSeq_viewer/
  base: '/pciSeq_viewer/',

  // light by default, with the toggle still available (respects the OS too)
  appearance: true,

  // the docs are still being written and some links point at pages that move
  // around, so don't fail the build on a dead link
  ignoreDeadLinks: true,

  // README.md here is the dev readme for this folder, not a site page
  srcExclude: ['README.md'],

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/pciSeq_viewer/img/logo.svg' }],
    ['link', { rel: 'icon', type: 'image/x-icon', href: '/pciSeq_viewer/img/favicon.ico' }],
    ['link', { rel: 'apple-touch-icon', href: '/pciSeq_viewer/img/logo.png' }],
    ['meta', { name: 'theme-color', content: '#10b981' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'pciSeq Viewer' }],
    ['meta', { property: 'og:description', content: 'Interactive desktop application for exploring 3D spatial transcriptomics results from pciSeq' }],
    ['meta', { property: 'og:image', content: 'https://acycliq.github.io/pciSeq_viewer/img/social-card.png' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:image', content: 'https://acycliq.github.io/pciSeq_viewer/img/social-card.png' }],
  ],

  themeConfig: {
    logo: '/img/logo.png',

    nav: [
      { text: 'Docs', link: '/docs/' },
      { text: 'Reference', link: '/docs/reference/data-format' },
      { text: 'Download', link: 'https://github.com/acycliq/pciSeq_viewer/releases/latest' },
    ],

    // Two sidebars, matched by path. The reference pages (the viewer's own data
    // format and config specs) get the reference sidebar, everything else under
    // /docs gets the main docs sidebar. Longest matching prefix wins, so the
    // reference rule comes first.
    sidebar: {
      '/docs/reference/': referenceSidebar(),
      '/docs/': docsSidebar(),
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

function docsSidebar() {
  return [
    { text: 'Getting Started', link: '/docs/' },
    {
      text: 'Preparing Your Data',
      link: '/docs/preparing-data',
      items: [
        { text: 'Overview', link: '/docs/preparing-data' },
        { text: 'pciSeq.fit()', link: '/docs/preparing-data/python-fit' },
        { text: 'pciSeq.stage_image()', link: '/docs/preparing-data/python-stage-image' },
      ],
    },
    { text: 'Loading Data', link: '/docs/loading-data' },
    {
      text: 'Using the Viewer',
      link: '/docs/using-the-viewer/overview',
      items: [
        { text: 'Overview', link: '/docs/using-the-viewer/overview' },
        { text: 'Genes & Cell Classes', link: '/docs/using-the-viewer/genes-and-cells' },
        { text: 'Cell Information Panel', link: '/docs/using-the-viewer/cell-info-panel' },
        { text: 'Layers & Export', link: '/docs/using-the-viewer/layers-and-export' },
        { text: 'Selection & Regions', link: '/docs/using-the-viewer/selection-tool' },
        { text: 'Charts & Misreads', link: '/docs/using-the-viewer/charts-and-misreads' },
        { text: '3D Voxel Viewer', link: '/docs/using-the-viewer/voxel-viewer' },
        { text: 'Diagnostics', link: '/docs/using-the-viewer/diagnostics' },
        { text: 'Single Cell Data', link: '/docs/using-the-viewer/single-cell' },
        { text: 'Custom Colours', link: '/docs/using-the-viewer/color-import' },
        { text: 'Keyboard Shortcuts', link: '/docs/using-the-viewer/keyboard-shortcuts' },
      ],
    },
    { text: 'Troubleshooting', link: '/docs/troubleshooting' },
    {
      text: 'Contributing',
      link: '/docs/contributing/architecture',
      items: [
        { text: 'Architecture', link: '/docs/contributing/architecture' },
        { text: 'Building & Releases', link: '/docs/contributing/building-releases' },
      ],
    },
  ]
}

function referenceSidebar() {
  // The viewer's own reference: the data contract it reads and its settings.
  // The pciSeq data-prep functions are not here, they live under the docs
  // sidebar (Preparing Your Data) since they belong to the pciSeq package.
  return [
    {
      text: 'Specifications',
      items: [
        { text: 'Data Format', link: '/docs/reference/data-format' },
        { text: 'Configuration', link: '/docs/reference/configuration' },
      ],
    },
    { text: 'Back to docs', link: '/docs/' },
  ]
}
