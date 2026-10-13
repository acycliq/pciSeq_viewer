# pciSeq Viewer documentation site

VitePress site for the pciSeq Viewer docs.

## Layout

- `index.md` is the landing page: the moving picture with the three stills under it (`DemoSwap.vue`), and the three doors.
- `docs/` holds the actual documentation, served under `/docs`.
- `.vitepress/config.mts` has the nav, the sidebar and the theme settings.
- `public/img/` holds the screenshots and the logo. The screenshots are taken by `dev_notes/demo_clip/shots.py` from the running viewer, so they can be shot again when the viewer changes. The gifs on the landing page are the README's, served by GitHub, not kept here.

## Local development

```bash
cd website
npm install
npm run docs:dev       # live-reload dev server
npm run docs:build     # production build into .vitepress/dist
npm run docs:preview   # preview the production build
```

## Deploy (GitHub Pages)

One-time: in the repo, go to Settings -> Pages -> Build and deployment -> Source
and choose "GitHub Actions".

`.github/workflows/deploy-docs.yml` builds this site and the web viewer together
and publishes them to GitHub Pages on pushes to `desktop_app` that touch
`website/`. It can also be run by hand from the Actions tab.

The main viewer is hosted at https://acycliq.github.io/pciSeq_viewer/ and the
docs at https://acycliq.github.io/pciSeq_viewer/docs/.

## Editing

- Pages live in `docs/` as Markdown. The sidebar order is in `.vitepress/config.mts`.
- Admonitions use the VitePress form: `::: tip My title` ... `:::` (also `info`,
  `warning`, `danger`). There is no `note` type, use `info` instead.
- Put screenshots and gifs in `public/img/` and reference them as `/img/name.png`.

## Theme

`.vitepress/theme/custom.css` is the same theme as the pciSeq docs: the emerald
`--vp-c-brand-*` vars, IBM Plex (sans body, serif headings, mono code), the 68ch
measure on prose, and `figure.shot` for a screenshot with a caption.
