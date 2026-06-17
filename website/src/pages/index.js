import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import CodeBlock from '@theme/CodeBlock';

import styles from './index.module.css';

const QUICK_START_CODE = `import pciSeq

# 1. Run cell typing and save the results to disk
pciSeq.fit(spots=spots, coo=masks, scRNAseq=sc, opts={
    'save_data': True,
    'output_path': './my_dataset'
})

# 2. Open pciSeq Viewer and load the ./my_dataset
#    folder to explore the results in 3D.`;

const FEATURES = [
  {
    title: 'GPU rendering with deck.gl',
    body: 'Spots, cell boundaries, and the background image are drawn on the GPU. Spots use a lighter representation when zoomed out so large datasets stay interactive.',
  },
  {
    title: 'Volumetric 3D view',
    body: 'Select a region and render it as a 3D volume rather than a stack of 2D planes.',
  },
  {
    title: 'Runs locally',
    body: 'A desktop application for Windows, macOS, and Linux. Data is read from local files and stays on your machine.',
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
            to="/docs/api/python-fit">
            API Reference
          </Link>
        </div>
        <div className={styles.heroMedia}>
          <img src="img/demo.gif" alt="pciSeq Viewer demo" />
        </div>
      </div>
    </header>
  );
}

function QuickStart() {
  return (
    <section className={styles.quickStart}>
      <div className={styles.quickStartInner}>
        <div className={styles.quickStartContent}>
          <Heading as="h2">Loading data from pciSeq</Heading>
          <p>
            The viewer reads the output of the pciSeq Python package directly.
            Run your analysis, save the results, then open the folder in the viewer.
          </p>
          <Link className="button button--outline button--primary" to="/docs/preparing-data">
            Data preparation guide →
          </Link>
        </div>
        <div className={styles.quickStartCode}>
          <CodeBlock language="python">{QUICK_START_CODE}</CodeBlock>
        </div>
      </div>
    </section>
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
        <QuickStart />
        <Features />
      </main>
    </Layout>
  );
}

