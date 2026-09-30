// Pictures from the Allen Mouse Brain Atlas, for the chat's allen_gene_image tool:
// where a gene is expressed in the adult mouse brain, from Allen's in situ
// hybridisation (ISH). Nothing to install and no key; the public API is called
// only when the tool is, so it needs the internet, the rest of the viewer does not.
//
// The steps: the gene's experiments (one brain each, cut coronal or sagittal), one
// picked the way the design in bead cz1.14 says, one section of it (the centre of
// a region, or a section number), and that section as a jpeg. Every answer says
// what was picked and links Allen's own pages, so the user can look further there.

const API = 'https://api.brain-map.org/api/v2/';
const SITE = 'https://mouse.brain-map.org/';
const MOUSE_BRAIN_ATLAS = 1;   // Allen's product id for the adult mouse ISH atlas
const ANTISENSE = 2;           // probe orientation; 1 is sense, the negative control
const DOWNSAMPLE = 3;          // about 1300 px wide, sharp enough to see cells

let fetchImpl = null;          // a check can pass a fake; the global fetch otherwise

function init(d) {
  fetchImpl = (d && d.fetch) || null;
}

async function get(url) {
  const f = fetchImpl || globalThis.fetch;
  let r;
  try {
    r = await f(url);
  } catch (e) {
    throw new Error('the Allen Brain Atlas could not be reached (no internet?): ' + e.message);
  }
  if (!r.ok) throw new Error(`the Allen Brain Atlas answered ${r.status} for ${url}`);
  return r;
}

async function query(criteria) {
  const d = await (await get(API + 'data/query.json?num_rows=200&criteria=' + encodeURIComponent(criteria))).json();
  if (!d.success) throw new Error('the Allen Brain Atlas refused the query: ' + JSON.stringify(d.msg));
  return d.msg;
}

// ---------------------------------------------------------------- experiments

// every ISH experiment of a gene in the adult mouse brain, the failed ones left out
async function experiments(gene) {
  const rows = await query(
    `model::SectionDataSet,rma::criteria,[failed$eqfalse],products[id$eq${MOUSE_BRAIN_ATLAS}],` +
    `genes[acronym$eq'${gene.replace(/'/g, '')}'],rma::include,plane_of_section,probes`);
  return rows.map(r => {
    const probe = (r.probes || [])[0] || {};
    return {
      id: r.id,
      plane: r.plane_of_section ? r.plane_of_section.name : null,
      probe: probe.name || null,
      control: probe.orientation_id !== ANTISENSE,
      delegate: !!r.delegate,
    };
  });
}

// The experiment to show: the one named, or the default. The default is in the
// plane asked for (coronal when none is asked and the gene has one), never a sense
// probe, and Allen's own representative pick (its 'delegate') when it qualifies.
function pick(all, plane, experimentId) {
  if (experimentId != null) {
    const named = all.find(e => e.id === Number(experimentId));
    if (!named) throw new Error(`experiment ${experimentId} is not one of this gene's`);
    return { chosen: named, note: 'the experiment you asked for' };
  }
  const usable = all.filter(e => !e.control);
  if (!usable.length) throw new Error('this gene has no antisense experiment in the atlas');
  const planes = [...new Set(usable.map(e => e.plane))];
  const wanted = plane || (planes.includes('coronal') ? 'coronal' : 'sagittal');
  let pool = usable.filter(e => e.plane === wanted);
  let note = plane ? `the ${wanted} experiment` : `${wanted}, as no plane was asked for`;
  if (!pool.length) {
    pool = usable;
    note = `the atlas has no ${wanted} experiment for this gene, so a ${pool[0].plane} one`;
  }
  const chosen = pool.find(e => e.delegate) || pool[0];
  return { chosen, note };
}

// ---------------------------------------------------------------- sections

// the sections of one experiment, numbered from 1 exactly as Allen's viewer counts
// them ('image N of total'). The viewer goes by DESCENDING section_number, so for
// coronal that is front to back; ascending would count from the other end
// (checked 2026-09-30 on experiments 71250310 and 79556704).
async function sections(experimentId) {
  const rows = await query(`model::SectionImage,rma::criteria,[data_set_id$eq${experimentId}]`);
  return rows.sort((a, b) => b.section_number - a.section_number)
             .map((r, i) => ({ index: i + 1, imageId: r.id }));
}

// an Allen structure (region) by acronym or name, e.g. 'CA1' or 'hippocampal formation'
async function structure(region) {
  const r = region.replace(/'/g, '');
  const byAcronym = await query(`model::Structure,rma::criteria,[graph_id$eq1],[acronym$eq'${r}']`);
  if (byAcronym.length) return byAcronym[0];
  const byName = await query(`model::Structure,rma::criteria,[graph_id$eq1],[name$il'*${r}*']`);
  if (!byName.length) throw new Error(`the atlas has no region called ${region}`);
  return byName.sort((a, b) => a.name.length - b.name.length)[0];   // the closest name
}

// the image at the centre of a region in one experiment, from Allen's image sync
async function imageAtRegion(experimentId, structureId) {
  const d = await (await get(`${API}structure_to_image/${experimentId}.json?structure_ids=${structureId}`)).json();
  const sync = d.msg && d.msg[0] && d.msg[0].image_sync;
  if (!sync) throw new Error('the atlas could not place that region in this experiment');
  return sync.section_image_id;
}

// ---------------------------------------------------------------- the tool

async function geneImage({ gene, plane, region, section, experiment, view }) {
  if (!gene) throw new Error('which gene?');
  const all = await experiments(gene);
  if (!all.length) throw new Error(`the Allen Mouse Brain Atlas has no ISH experiment for ${gene}`);
  const { chosen, note } = pick(all, plane ? String(plane).toLowerCase() : null, experiment);
  const secs = await sections(chosen.id);

  let at, why;
  if (section != null) {
    at = secs.find(s => s.index === Number(section));
    if (!at) throw new Error(`section ${section} does not exist, this experiment has 1 to ${secs.length}`);
    why = 'the section asked for';
  } else if (region) {
    const s = await structure(region);
    const imageId = await imageAtRegion(chosen.id, s.id);
    at = secs.find(x => x.imageId === imageId);
    why = `the section at the centre of ${s.name} (${s.acronym})`;
  } else {
    at = secs[Math.floor(secs.length / 2)];
    why = 'the middle section, as no region was asked for';
  }

  const expression = view === 'expression';
  const jpeg = Buffer.from(await (await get(
    `${API}image_download/${at.imageId}?downsample=${DOWNSAMPLE}${expression ? '&view=expression' : ''}`)).arrayBuffer());

  const info = {
    source: 'the Allen Mouse Brain Atlas (in situ hybridisation, adult mouse), not this run',
    gene,
    experiment: chosen.id,
    plane: chosen.plane,
    probe: chosen.probe,
    experiment_is: note + (chosen.control ? '; a SENSE probe, a negative control, no real signal expected' : ''),
    section: at.index,
    sections: secs.length,
    section_is: why + '; numbered as Allen\'s viewer counts them (image N of total)' +
                `${chosen.plane === 'coronal' ? ', front to back' : ', one hemisphere'}, ` +
                'about 200 um apart; ask for another section number to step',
    view: expression ? 'expression (Allen\'s heat map of the signal)' : 'ISH (the stained section)',
    other_experiments: all.filter(e => e.id !== chosen.id)
      .map(e => `${e.id} ${e.plane}${e.control ? ' (sense, control)' : ''}`),
    allen_viewer: `${SITE}experiment/siv?id=${chosen.id}&imageId=${at.imageId}&initImage=${expression ? 'expression' : 'ish'}`,
    all_experiments: `${SITE}search/show?page_num=0&page_size=100&no_paging=false&exact_match=true&search_term=${encodeURIComponent(gene)}&search_type=gene`,
  };
  return { __image: { media_type: 'image/jpeg', data: jpeg.toString('base64') }, info };
}

module.exports = { init, geneImage, pick };
