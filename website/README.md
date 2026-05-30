# pciSeq Viewer — Documentation site

Docusaurus 3 site for the pciSeq Viewer docs.

## Where it goes

Drop the `website/` folder at the repo root, and the
`.github/workflows/deploy-docs.yml` file into `.github/workflows/`.

## Local development

```bash
cd website
npm install
npm start          # live-reload dev server at http://localhost:3000
npm run build      # production build into website/build/
npm run serve      # preview the production build
```

## Deploy (GitHub Pages)

One-time: in the repo, go to **Settings → Pages → Build and deployment →
Source** and choose **GitHub Actions**.

After that, every push to the `desktop_app` branch that touches `website/**`
builds and publishes the site to:

    https://acycliq.github.io/pciSeq_viewer/

(Adjust the branch name in `deploy-docs.yml` and the `baseUrl`/`url` in
`docusaurus.config.js` if needed.)

## Editing

- Pages live in `docs/` as Markdown. The sidebar order is in `sidebars.js`.
- Admonitions in this Docusaurus version use bracket titles:
  `:::tip[My title]` … `:::` (the inline `:::tip My title` form does NOT render).
- Heading anchors: don't use `{#custom-id}` — this setup mis-parses them. Rely
  on auto-generated slugs from the heading text.
- Put screenshots/GIFs in `static/img/` and reference them as `/img/name.png`.
- Pages marked with a `:::info[TODO]` / `:::note[Scaffold]` box need real
  content + screenshots — that's the work left for you or Claude Code.

## Theme

Brand colours are in `src/css/custom.css` (`--ifm-color-primary*`). Replace the
placeholder images in `static/img/` (`logo.png`, `demo.gif`, `social-card.png`,
the per-feature screenshots) with the real assets from the repo.
