// @ts-check

/**
 * Sidebar for the pciSeq Viewer documentation.
 * Manually curated so the order mirrors the natural user journey:
 * install -> prepare data -> load -> use -> troubleshoot -> contribute.
 *
 * @type {import('@docusaurus/plugin-content-docs').SidebarsConfig}
 */
const sidebars = {
  docsSidebar: [
    'intro',
    'preparing-data',
    'loading-data',
    {
      type: 'category',
      label: 'Using the Viewer',
      link: {type: 'doc', id: 'using-the-viewer/overview'},
      items: [
        'using-the-viewer/voxel-viewer',
        'using-the-viewer/selection-tool',
        'using-the-viewer/genes-and-cells',
        'using-the-viewer/diagnostics',
      ],
    },
    'troubleshooting',
    {
      type: 'category',
      label: 'Contributing',
      link: {type: 'doc', id: 'contributing/architecture'},
      items: [
        'contributing/architecture',
        'contributing/building-releases',
      ],
    },
  ],
};

export default sidebars;
