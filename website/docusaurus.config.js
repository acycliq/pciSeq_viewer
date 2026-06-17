// @ts-check
import {themes as prismThemes} from 'prism-react-renderer';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'pciSeq Viewer',
  tagline: 'Interactive desktop application for exploring 3D spatial transcriptomics results from pciSeq',
  favicon: 'img/favicon.ico',

  future: {v4: true},

  // --- Where the site is served ---------------------------------------
  // Project site at https://acycliq.github.io/pciSeq_viewer/
  url: 'https://acycliq.github.io',
  baseUrl: '/pciSeq_viewer/',

  organizationName: 'acycliq',      // GitHub org/user
  projectName: 'pciSeq_viewer',     // repo name

  onBrokenLinks: 'warn',
  markdown: {hooks: {onBrokenMarkdownLinks: 'warn'}},

  i18n: {defaultLocale: 'en', locales: ['en']},

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          routeBasePath: '/docs',      // docs live under /docs; landing page owns the root
          sidebarPath: './sidebars.js',
          // Point the "Edit this page" links at the docs source in the repo.
          // NOTE: branch is set to desktop_app to match the current default branch.
          editUrl: 'https://github.com/acycliq/pciSeq_viewer/tree/desktop_app/website/',
        },
        blog: false,                   // no blog for a tool's docs
        theme: {customCss: './src/css/custom.css'},
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      image: 'img/social-card.png',
      colorMode: {defaultMode: 'dark', respectPrefersColorScheme: false},
      announcementBar: {
        id: 'under-construction',
        content: 'Work in progress: these docs are still being written.',
        backgroundColor: '#10b981',
        textColor: '#ffffff',
        isCloseable: true,
      },
      navbar: {
        title: 'pciSeq Viewer',
        logo: {alt: 'pciSeq Viewer', src: 'img/logo.png'},
        hideOnScroll: true,
        items: [
          {type: 'docSidebar', sidebarId: 'docsSidebar', position: 'left', label: 'Docs'},
          {type: 'docSidebar', sidebarId: 'apiSidebar', position: 'left', label: 'API'},
          {
            href: 'https://github.com/acycliq/pciSeq_viewer/releases/latest',
            label: 'Download',
            position: 'right',
          },
          {
            href: 'https://github.com/acycliq/pciSeq_viewer',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'light',
        links: [
          {
            title: 'Docs',
            items: [
              {label: 'Getting Started', to: '/docs'},
              {label: 'Preparing Your Data', to: '/docs/preparing-data'},
              {label: 'Troubleshooting', to: '/docs/troubleshooting'},
            ],
          },
          {
            title: 'Project',
            items: [
              {label: 'pciSeq', href: 'https://github.com/acycliq/pciSeq'},
              {label: 'Releases', href: 'https://github.com/acycliq/pciSeq_viewer/releases'},
              {label: 'Issues', href: 'https://github.com/acycliq/pciSeq_viewer/issues'},
            ],
          },
        ],
        copyright: `© ${new Date().getFullYear()} acycliq.`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.vsDark,
        additionalLanguages: ['python', 'bash', 'json'],
      },
    }),
};

export default config;
