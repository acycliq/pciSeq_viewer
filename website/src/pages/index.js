/**
 * Landing page.
 * Calm and factual: a short intro, what the viewer does, and a quick start.
 * Styling is deliberately restrained (see index.module.css).
 */
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
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

# 2. Open pciSeq Viewer and load ./my_dataset to explore in 3D.`;

export default function Home() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout title={siteConfig.title} description={siteConfig.tagline}>
      <div className={styles.wrap}>
        <Heading as="h1" className={styles.title}>{siteConfig.title}</Heading>
        <p className={styles.tagline}>{siteConfig.tagline}</p>

        <div className={styles.actions}>
          <Link className={styles.primary} to="/docs">Read the docs</Link>
          <Link className={styles.primary} to="/docs/api/python-fit">API reference</Link>
        </div>

        <img className={styles.shot} src={useBaseUrl('/img/demo.gif')} alt="pciSeq Viewer demo" />

        <section className={styles.section}>
          <Heading as="h2" className={styles.h2}>About</Heading>
          <ul className={styles.whatList}>
            <li><strong>Explore your results in space.</strong> Pan and zoom a large tissue image through its z-stack, with every gene spot and cell boundary drawn on top: spots coloured per gene, cells coloured by predicted type, with show/hide filters for both.</li>
            <li><strong>Inspect any cell or spot.</strong> Hover a cell for its gene counts, class probabilities, and a quick chart; with diagnostics data connected, see why a cell or spot was assigned the way it was.</li>
            <li><strong>Drop into 3D.</strong> Select a region and render it as a true 3D volume instead of a stack of planes.</li>
            <li><strong>Built for scale, runs locally.</strong> GPU-rendered with deck.gl so large datasets (millions of spots) stay interactive: a desktop app for Windows, macOS and Linux, with your data staying on your machine.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <Heading as="h2" className={styles.h2}>Loading data from pciSeq</Heading>
          <p className={styles.lead}>
            The viewer reads the output of the pciSeq Python package directly. Run
            your analysis, save the results, then open the folder in the viewer.
          </p>
          <div className={styles.code}>
            <CodeBlock language="python">{QUICK_START_CODE}</CodeBlock>
          </div>
        </section>
      </div>
    </Layout>
  );
}
