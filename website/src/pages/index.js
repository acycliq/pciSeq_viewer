import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import styles from './index.module.css';

/**
 * Landing page for the pciSeq Viewer docs site.
 *
 * Layout mirrors a typical product landing page:
 *   hero (title + tagline + CTAs + demo) -> feature cards -> platform row.
 * It links into the docs, which now live under /docs.
 *
 * This is a presentation-only page; all content text lives here so the
 * docs themselves stay focused on instructions.
 */

// Feature cards shown below the hero. Edit this list to change the grid.
const FEATURES = [
  {
    title: 'Built for big datasets',
    body: 'Explore up to 20 million spots across 100+ stacked planes without the browser breaking a sweat.',
  },
  {
    title: 'Fast, fluid 3D',
    body: 'Zoom, pan and move through the z-stack with no perceptible lag. Background tiles and cell masks stay in sync.',
  },
  {
    title: 'Genes and cell types',
    body: 'Every spot is coloured by gene, every cell by predicted type. Show or hide either with a click.',
  },
  {
    title: 'Aligned by design',
    body: 'Spots, segmentation boundaries and background tiles line up perfectly on every plane.',
  },
  {
    title: 'Selection and export',
    body: 'Draw a region of interest, inspect the cells inside it, and export what you select.',
  },
  {
    title: 'Runs on your desktop',
    body: 'A native app for Windows, macOS and Linux. Your data never leaves your machine.',
  },
];

function Hero() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={styles.hero}>
      <div className={styles.heroInner}>
        <Heading as="h1" className={styles.heroTitle}>
          {siteConfig.title}
        </Heading>
        <p className={styles.heroTagline}>{siteConfig.tagline}</p>
        <div className={styles.heroButtons}>
          <Link className={clsx('button button--primary button--lg', styles.heroButton)} to="/docs">
            Get Started
          </Link>
          <Link
            className={clsx('button button--secondary button--lg', styles.heroButton)}
            href="https://github.com/acycliq/pciSeq_viewer/releases/latest">
            Download
          </Link>
        </div>
        <div className={styles.heroMedia}>
          <img src="img/demo.gif" alt="pciSeq Viewer in action" loading="lazy" />
        </div>
      </div>
    </header>
  );
}

function Features() {
  return (
    <section className={styles.features}>
      <div className={styles.featuresGrid}>
        {FEATURES.map((feature) => (
          <div key={feature.title} className={styles.featureCard}>
            <Heading as="h3" className={styles.featureTitle}>
              {feature.title}
            </Heading>
            <p className={styles.featureBody}>{feature.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout title={siteConfig.title} description={siteConfig.tagline}>
      <Hero />
      <main>
        <Features />
      </main>
    </Layout>
  );
}
