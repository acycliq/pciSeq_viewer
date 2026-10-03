// The tools the chat panel's model can call, and what they do.
//
// Same idea as pciSeq/src/mcp/tools.py on the Python side: the model gets a list
// of tools with descriptions, decides which to call, and gets an object back.
// Most numbers come from run.js, which reads diagnostics.db. The spot tools, and
// explain_cell on old runs, go through querySpot and queryCell in diagnostics.js,
// the same ones the diagnostics panels use; this file reshapes their result into
// the dict the narrators expect and adds the story. Some tools only exist here:
// the ones that act on the screen (moving the map, opening the diagnostics panels,
// choosing which classes and genes are drawn), the Allen lookups and pictures, and
// export_table.
//
// Dependencies come in through init() rather than require(), so the adapters can
// be run in plain node with fake query results (tools.check.js).

const { narrateCell, narrateSpot } = require('./narrative');
const run = require('./run');
const docs = require('./docs');
const docsAtCommit = require('./docsAtCommit');
const allen = require('./allen');
const { exportTable, EXPORTABLE } = require('./exportTable');
const allenTaxonomy = require('./allenTaxonomy');

// docsRoot: the folder of documentation pages, see docs.js. fetch: for reading the
// pciSeq source from GitHub, the global one unless a check passes a fake.
let deps = { querySpot: null, queryCell: null, getMeta: null, send: null, docsRoot: null, fetch: null,
             saveDialog: null, writeFile: null, getTilesInfo: null, getAnnotations: () => [] };

// where the source is read from: the pciSeq_3d repo at the commit that made the
// run, so the code matches the numbers, falling back to the dev_3d branch when the
// run does not record one
const GITHUB_REPO = 'acycliq/pciSeq_3d';
const RAW = 'https://raw.githubusercontent.com/' + GITHUB_REPO + '/';
const CONTENTS = 'https://api.github.com/repos/' + GITHUB_REPO + '/contents/';
const MAX_SOURCE_LINES = 400;

function init(d) {
  deps = { ...deps, ...d };
}

// ------------------------------------------------------------------ annotations

const MAX_OUTLINED = 5000;

const CHART_NAMES = ['class_distribution', 'classes_by_z', 'class_gene_counts', 'gene_distribution',
                     'misread_rho', 'assigned_vs_misread', 'misread_per_plane'];
const REGION_CHARTS = ['class_distribution', 'classes_by_z'];

// open_chart: check the names here, where the errors can go back to the model,
// then the viewer opens the chart (src/chatCharts.js)
function openChart({ chart, region = null, gene = null }) {
  if (!CHART_NAMES.includes(chart)) return { error: `chart must be one of ${CHART_NAMES.join(', ')}` };
  if (region != null) {
    if (!REGION_CHARTS.includes(chart)) return { error: `${chart} has no region choice; ${REGION_CHARTS.join(' and ')} do` };
    withRegion({ region });   // throws, naming the regions there are, for an unknown one
  }
  if (gene != null) {
    if (chart !== 'gene_distribution') return { error: 'only gene_distribution takes a gene' };
    if (!(deps.getMeta()?.gene_panel || []).includes(gene)) return { error: `${gene} is not a gene of this run` };
  }
  deps.send('chat-open-chart', { chart, region, gene });
  return { done: true, chart, region, gene, note: 'the chart is open on the user\'s screen' };
}

// find_cells and outline_cells take a region by name; run.findCells wants its points
function withRegion(input) {
  if (input.region == null) return input;
  const r = deps.getAnnotations().find(a => a.name === input.region);
  if (!r || r.kind === 'cells') {
    const names = deps.getAnnotations().filter(a => a.kind !== 'cells').map(a => a.name);
    throw new Error(`no region called ${input.region}; the regions are: ${names.join(', ') || 'none'}`);
  }
  const { region, ...rest } = input;
  return { ...rest, polygon: r.boundaries };
}

function listAnnotations() {
  return {
    annotations: deps.getAnnotations().map(a => a.kind === 'cells'
      ? { name: a.name, kind: 'cells', cells: a.labels.length, by: a.by, visible: a.visible }
      : { name: a.name, kind: 'region', points: a.boundaries.length,
          x_range: [Math.min(...a.boundaries.map(p => p[0])), Math.max(...a.boundaries.map(p => p[0]))],
          y_range: [Math.min(...a.boundaries.map(p => p[1])), Math.max(...a.boundaries.map(p => p[1]))],
          by: a.by, visible: a.visible }),
    are: 'by is who made it, the user (you) or the chat; ranges in image pixels',
  };
}

function outlineCells(input) {
  const { name, labels, ...filters } = input;
  const cells = labels && labels.length
    ? labels.map(Number)
    : run.findCells({ ...withRegion(filters), n: Infinity }).cells.map(c => c.cell);
  if (!cells.length) return { done: false, note: 'no cells match, nothing outlined' };
  if (cells.length > MAX_OUTLINED) {
    throw new Error(`${cells.length} cells match, more than the ${MAX_OUTLINED} the map outlines at once; narrow it down`);
  }
  deps.send('chat-add-cell-annotation', { name, labels: cells });
  return {
    done: true, name, cells: cells.length,
    shown: 'the outlines from every plane drawn together, so all the cells show whichever ' +
           'plane the user is on',
    note: 'added to the Annotations list in the drawer, marked as made by the chat; the ' +
          'user can hide, rename, delete or save it there',
  };
}

// What the model reads. Anthropic tool schema shape.
const TOOLS = [
  {
    name: 'explain_spot',
    description:
      'Why a spot was assigned to the cell it was. One row per candidate cell plus the ' +
      'background, with the Gaussian fit to the cell centre, the class expression term, ' +
      'the cell scale, the cell-gene scale, the gene efficiency and the resulting ' +
      'probability, and a narrative that tells the story in plain words with the ' +
      'evidence as odds. A spot can sit outside every cell and still go to one, because ' +
      'position is scored against the centroid, not the mask. spot_id is the id shown in ' +
      'the viewer.',
    input_schema: {
      type: 'object',
      properties: { spot_id: { type: 'integer', description: 'The spot id.' } },
      required: ['spot_id'],
    },
  },
  {
    name: 'explain_cell',
    description:
      'Why a cell was given its class, gene by gene. Compares the assigned class ' +
      'against another, the runner up unless vs_class is given: the gene ' +
      'log-likelihood, the class prior and the spatial term for each, the genes that ' +
      'pushed hardest for each side with the cell\'s count and the average count of ' +
      'that gene over the cells this run called each class (mean_in_assigned, ' +
      'mean_in_compared), the shared genes (the cell\'s biggest counts that both ' +
      'classes fit about equally, why these two were the finalists), and a narrative ' +
      'in plain words. A gene the cell lacks can ' +
      'count against the class that expresses it. Counts are soft, weighted by ' +
      'assignment probability. label is the cell number shown in the viewer.',
    input_schema: {
      type: 'object',
      properties: {
        label: { type: 'integer', description: 'The cell label, as in the segmentation.' },
        vs_class: { type: 'string', description: 'Class to compare against. Defaults to the runner up.' },
      },
      required: ['label'],
    },
  },
  {
    name: 'open_cell_diagnostics',
    description:
      'Open the cell diagnostics panel on a cell, compared against the runner up (or ' +
      'vs_class), so the user sees the charts and tables behind the call. Returns the ' +
      'same numbers as explain_cell. Use it when the user asks to see the diagnostics; ' +
      'after explaining a cell, offer it rather than opening it unasked. The runner up ' +
      'is the second most likely class however small its probability, the same one ' +
      'explain_cell compares against. Only when no other class has any probability ' +
      'does it return an error asking for vs_class; then ask the user which class to ' +
      'compare against instead of guessing.',
    input_schema: {
      type: 'object',
      properties: {
        label: { type: 'integer', description: 'The cell label, as in the segmentation.' },
        vs_class: { type: 'string', description: 'Class to compare against. Defaults to the runner up.' },
      },
      required: ['label'],
    },
  },
  {
    name: 'open_spot_diagnostics',
    description:
      'Open the spot diagnostics panel on a spot, so the user sees the charts and the ' +
      'table behind where it went: the probability of each candidate cell and the ' +
      'background, and the score of each broken into its terms. Returns the same ' +
      'numbers as explain_spot. Use it when the user asks to see the diagnostics of a ' +
      'spot; after explaining a spot, offer it rather than opening it unasked. spot_id ' +
      'is the id shown in the viewer.',
    input_schema: {
      type: 'object',
      properties: { spot_id: { type: 'integer', description: 'The spot id.' } },
      required: ['spot_id'],
    },
  },
  {
    name: 'docs',
    description:
      'Search the pciSeq documentation. Returns the paragraphs that match the query ' +
      'words, best first, each with its page and heading. Use it before answering ' +
      'any question about how pciSeq works, a term, or a setting such as rTheta, ' +
      'mrf_beta or Inefficiency, and quote the page you took the answer from. Try ' +
      'the docs before the source.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'A few words, for example "rTheta" or "spatial term".' },
        n: { type: 'integer', description: 'How many paragraphs, default 5.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'run_info',
    description:
      'What produced this run and how it ended: the pciSeq version, commit and its ' +
      'date, when the run was made (run_date), python and package versions, the ' +
      'settings it used (rTheta, mrf_beta, Inefficiency, nNeighbors, voxel_size and ' +
      'the rest), the mean cell radius, the number of iterations and whether the ' +
      'loop converged, and what the background images say about themselves (name, ' +
      'description, size, planes). Use it for "when was this run made", "what is the ' +
      'mean cell radius", "what settings did it use", "did it converge" and, with ' +
      'class_counts, "what am I looking at". Older runs carry only the provenance and ' +
      'the answer says so.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'list_source',
    description:
      'List a folder of the pciSeq source code on GitHub, at the commit that made ' +
      'this run. Use it to find the file a question is about; the model code is ' +
      'under pciSeq/src/core. Needs internet.',
    input_schema: {
      type: 'object',
      properties: { dir: { type: 'string', description: 'Folder path in the repo, "" for the root.' } },
    },
  },
  {
    name: 'read_source',
    description:
      'Read a file of the pciSeq source code on GitHub, at the commit that made this ' +
      'run, with line numbers. Reach for it only when a question needs the actual ' +
      'code, after the docs; never claim to run it. Long files come back in slices ' +
      'of up to 400 lines, give start_line to read on. When you cite it, give the ' +
      'file and the line. Needs internet.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path in the repo, for example pciSeq/src/core/main.py.' },
        start_line: { type: 'integer', description: 'First line to return, default 1.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'cell',
    description:
      'The headline facts about one cell: its class probabilities, its top genes, its ' +
      'total counts, the scale factor theta_bar of its assigned class, the ' +
      'neighbours its spatial term listens to, and the colour its class is drawn ' +
      'in on the map. label is the cell number in the segmentation, the one shown in the ' +
      'viewer. Counts are soft, each spot contributes its probability of belonging to ' +
      'the cell.',
    input_schema: {
      type: 'object',
      properties: { label: { type: 'integer', description: 'The cell label, as in the segmentation.' } },
      required: ['label'],
    },
  },
  {
    name: 'cell_counts',
    description:
      'How many reads a cell holds, in total or for one gene. These are SOFT counts: ' +
      'each spot contributes its probability of belonging to the cell, so they are ' +
      'estimates and not whole numbers.',
    input_schema: {
      type: 'object',
      properties: {
        label: { type: 'integer', description: 'The cell label, as in the segmentation.' },
        gene: { type: 'string', description: 'Only this gene, optional.' },
      },
      required: ['label'],
    },
  },
  {
    name: 'theta',
    description:
      'The cell scale factor theta_bar of one cell under one class: the assigned ' +
      'class unless class_name is given, with that class\'s probability. Theta ' +
      "scales a class's expected counts to the cell's total, with a Gamma(rTheta, " +
      'rTheta) prior of mean 1; rTheta is returned too. label is the segmentation ' +
      'label.',
    input_schema: {
      type: 'object',
      properties: {
        label: { type: 'integer', description: 'The cell label, as in the segmentation.' },
        class_name: { type: 'string', description: 'The class, the assigned one if left out.' },
      },
      required: ['label'],
    },
  },
  {
    name: 'gamma',
    description:
      'The cell-gene scale factors gamma_bar of one cell under its assigned class, ' +
      "for every gene or for one, each with the cell's count of the gene. Gamma is the " +
      'per cell, per gene factor absorbing overdispersion. Only the assigned class is ' +
      'kept in diagnostics.db, and the answer says so. label is the segmentation label.',
    input_schema: {
      type: 'object',
      properties: {
        label: { type: 'integer', description: 'The cell label, as in the segmentation.' },
        gene: { type: 'string', description: 'Only this gene, optional.' },
      },
      required: ['label'],
    },
  },
  {
    name: 'spot',
    description:
      'One spot: its gene and how that gene is drawn on the map (colour and marker ' +
      'shape), position and plane, the cell it was assigned to with the ' +
      'probability, and every candidate cell with its class and probability. Lighter ' +
      'than explain_spot, which gives the terms behind each probability. Use it for ' +
      '"which cell is spot 1642419 in", "what gene is spot 1642419", "which cells was ' +
      'spot 1642419 scored against".',
    input_schema: {
      type: 'object',
      properties: { spot_id: { type: 'integer', description: 'The spot id.' } },
      required: ['spot_id'],
    },
  },
  {
    name: 'gene',
    description:
      'One gene across the run: its efficiency eta and inefficiency, its misread ' +
      'density, how many spots it has and how many were called misreads, its soft ' +
      'counts in cells split by class (soft, and summed over the cells called each ' +
      'class), the ten cells holding most of it, and the colour and marker shape ' +
      'its spots are drawn with on the map. Use it for "what is the ' +
      'efficiency of Plp1", "which classes express Plp1 in this run", "which cells ' +
      'hold most Plp1". Counts are soft.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'The gene name, as in the panel.' } },
      required: ['name'],
    },
  },
  {
    name: 'neighbours',
    description:
      'The cells whose classes enter the spatial (mrf) term of one cell, nearest ' +
      'first, each with its class and probability and, when the run carries the ' +
      'centroids, the centroid distance in xy pixels and the plane offset. mrf_beta ' +
      'is returned too. label is the segmentation label.',
    input_schema: {
      type: 'object',
      properties: { label: { type: 'integer', description: 'The cell label, as in the segmentation.' } },
      required: ['label'],
    },
  },
  {
    name: 'class_counts',
    description:
      'How many cells each class has: hard (the number of cells whose most probable ' +
      'class it is) and soft (the class probability summed over the cells). Zero is ' +
      'listed first, the rest by size. min_counts leaves out cells with fewer soft ' +
      'counts in total. Use it for "how many cells per class", "how many cells are ' +
      'Zero", "how many CA1 cells with more than 40 reads".',
    input_schema: {
      type: 'object',
      properties: { min_counts: { type: 'number', description: 'Leave out cells below this total, optional.' } },
    },
  },
  {
    name: 'find_cells',
    description:
      'The cells matching the filters given: class, position, plane, minimum total ' +
      'counts, and top_two_within, the largest gap allowed between the probabilities ' +
      'of the top two classes (small values pick the uncertain cells). Position is ' +
      'the centroid: x and y in image pixels, depth as a plane range, for "the Pvalb ' +
      'Gaba cells in x 2000 to 3000, y 1500 to 2500, planes 20 to 40". The class is ' +
      'a probability: the list keeps cells assigned the class (class_rule assigned, ' +
      'the default) or with a probability above min_class_prob (class_rule above), ' +
      'and expected_count is the soft number, the class probability summed over ' +
      'every cell in the area; give both and say which rule the list used. Returns ' +
      'the number matching and the first n by probability. Labels are segmentation labels.',
    input_schema: {
      type: 'object',
      properties: {
        class_name: { type: 'string', description: 'The class.' },
        class_rule: { type: 'string', enum: ['assigned', 'above'], description: 'How the list decides the class, assigned by default.' },
        min_class_prob: { type: 'number', description: 'For class_rule above.' },
        x_from: { type: 'number', description: 'Image pixels.' },
        x_to: { type: 'number', description: 'Image pixels.' },
        y_from: { type: 'number', description: 'Image pixels.' },
        y_to: { type: 'number', description: 'Image pixels.' },
        plane_from: { type: 'integer', description: 'First plane of the range.' },
        plane_to: { type: 'integer', description: 'Last plane of the range.' },
        plane: { type: 'integer', description: 'One plane only.' },
        region: { type: 'string', description: 'Only cells whose centroid is inside this region, a name from annotations.' },
        min_counts: { type: 'number', description: 'Only cells with at least this many soft counts.' },
        top_two_within: { type: 'number', description: 'Only cells whose top two classes are within this.' },
        n: { type: 'integer', description: 'How many to return, default 50.' },
      },
    },
  },
  {
    name: 'annotations',
    description:
      'The annotations on the map now: regions (outlines the user drew, imported or ' +
      'opened from a file, in image pixels) and cell annotations (a set of cells ' +
      'drawn with their own outlines), with who made each, the user or the chat. Use ' +
      'it when the user names a region, "my CA1", "the region I drew", then ' +
      'find_cells with region for the cells inside it; a cell is inside when its ' +
      'centroid is.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'open_chart',
    description:
      'Open one of the viewer\'s own charts, the same ones the drawer buttons open, ' +
      'for a picture of the numbers: "bar chart of the classes in my CA1", "how is ' +
      'Plp1 spread over the planes". The charts: class_distribution, a bar per class ' +
      'with its number and share of cells, for the whole section or one region; ' +
      'classes_by_z, the classes plane by plane, whole section or one region; ' +
      'class_gene_counts, the spread of total gene counts per cell in each class; ' +
      'gene_distribution, one gene\'s spots plane by plane; misread_rho, the misread ' +
      'level learned for each gene; assigned_vs_misread, each gene\'s spots split ' +
      'into assigned to cells and misread; misread_per_plane, misreads plane by ' +
      'plane. The class charts count each cell once, by its most likely class, and ' +
      'a cell is in a region when its centroid is. region is a name from annotations, ' +
      'for class_distribution and classes_by_z; gene for gene_distribution. The chart ' +
      'opens on the user\'s screen; say what it shows, you do not see it.',
    input_schema: {
      type: 'object',
      properties: {
        chart: { type: 'string', enum: CHART_NAMES },
        region: { type: 'string', description: 'A region, for class_distribution and classes_by_z.' },
        gene: { type: 'string', description: 'A gene, for gene_distribution.' },
      },
      required: ['chart'],
    },
  },
  {
    name: 'outline_cells',
    description:
      'Outline some cells on the map, with their own outlines, as an annotation the ' +
      'user can hide, rename, delete or save. For "outline the Sncg cells near the top ' +
      'of CA1", "mark these cells". Give the cells either as labels, or as the same ' +
      'filters find_cells takes (class_name, region, x and y ranges, ...), which then ' +
      'picks every matching cell, not just the first n. The outlines from every plane ' +
      'are drawn together, so the cells show whichever plane the user is on; one ' +
      'plane only is not possible, say so if asked. name: a short name for the list. ' +
      'Says how many cells it outlined.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name for the annotation, e.g. "Sncg near CA1".' },
        labels: { type: 'array', items: { type: 'integer' }, description: 'The cells, by label.' },
        class_name: { type: 'string', description: 'As in find_cells.' },
        class_rule: { type: 'string', enum: ['assigned', 'above'], description: 'As in find_cells.' },
        min_class_prob: { type: 'number', description: 'As in find_cells.' },
        region: { type: 'string', description: 'As in find_cells.' },
        x_from: { type: 'number' }, x_to: { type: 'number' },
        y_from: { type: 'number' }, y_to: { type: 'number' },
        plane_from: { type: 'integer' }, plane_to: { type: 'integer' },
        min_counts: { type: 'number' },
      },
      required: ['name'],
    },
  },
  {
    name: 'metadata',
    description:
      'The metadata table of diagnostics.db. Without a key: every key with the kind ' +
      'of value it holds. With a key: its value, parsed. Covers what has no tool of ' +
      'its own: sc_mean_expression (the reference expression, gene by class), ' +
      'log_prior, rho_bar, hard_misread_counts, gene_total_spots, config, run, ' +
      'label_map.',
    input_schema: {
      type: 'object',
      properties: { key: { type: 'string', description: 'One key, optional.' } },
    },
  },
  {
    name: 'calculate',
    description:
      'Do arithmetic instead of doing it in your head. Numbers, + - * / ** and ' +
      'brackets, and exp, log (natural), log10, sqrt, abs and round. Use it for a ' +
      'number the tools do not give, for example adding up a few gene differences, ' +
      'or exp(d) to turn a log-likelihood difference d into odds. Quote the result ' +
      'as calculate returned it. It makes a sum right, not meaningful: never use it ' +
      'to build a quantity the tools do not define, such as a ratio of two sums of ' +
      'log-likelihood differences, which is not odds.',
    input_schema: {
      type: 'object',
      properties: { expression: { type: 'string', description: 'Arithmetic, for example "15.29 + 9.8 + 3.1" or "exp(3.2)".' } },
      required: ['expression'],
    },
  },
  {
    name: 'spots_in_cell',
    description:
      'How many spots physically sit inside a cell\'s segmentation mask. This is a ' +
      'HARD count with no probabilities: a spot either falls inside the mask or it ' +
      'does not. It is a different number from cell_counts, because the model can ' +
      'assign a spot to a cell it is not inside, and vice versa. Needs a run made ' +
      'after September 2026; older runs raise with a clear message.',
    input_schema: {
      type: 'object',
      properties: {
        label: { type: 'integer', description: 'The cell label, as in the segmentation.' },
        gene: { type: 'string', description: 'Only this gene, optional.' },
      },
      required: ['label'],
    },
  },
  {
    name: 'spots_of_cell',
    description:
      'Which spots belong to a cell, with their probabilities, sorted highest first. ' +
      'Two definitions, and the answer says which it used. Without min_prob: the ' +
      'spots whose MOST LIKELY parent is this cell, the argmax. That is not a hard ' +
      'assignment, the lowest probability in the list can be well under 0.5. With ' +
      'min_prob, say 0.0001: EVERY spot with probability above it on this cell, ' +
      'whose probabilities add up to the cell\'s soft counts. The second list is ' +
      'usually many times longer than the first. Use this for "which spots are ' +
      'assigned to cell 18223" or "list the spots of cell 18223 with their ' +
      'probabilities". With gene, only that gene\'s spots, so "how many Plp1 spots ' +
      'are assigned to cell 18223" is answered by n_spots.',
    input_schema: {
      type: 'object',
      properties: {
        label: { type: 'integer', description: 'The cell label, as in the segmentation.' },
        min_prob: { type: 'number', description: 'Keep every spot above this probability, optional.' },
        gene: { type: 'string', description: 'Only this gene, optional.' },
      },
      required: ['label'],
    },
  },
  {
    name: 'cell_row',
    description:
      'The cellData.tsv row of one cell, value for value: Cell_Num, X, Y, Z, ' +
      'Genenames, CellGeneCount, spot_id, ClassName, Prob. Use this when the ' +
      'question is about what the saved file says for a cell. The counts are soft.',
    input_schema: {
      type: 'object',
      properties: { label: { type: 'integer', description: 'The cell label, as in the segmentation.' } },
      required: ['label'],
    },
  },
  {
    name: 'spot_row',
    description:
      'The geneData.tsv row of one spot, value for value: gene, position, plane, ' +
      'neighbour, neighbour_array, neighbour_prob, omp_score, omp_intensity, ' +
      'is_hard_misread and, on runs from September 2026 on, inside_cell.',
    input_schema: {
      type: 'object',
      properties: { spot_id: { type: 'integer', description: 'The spot id.' } },
      required: ['spot_id'],
    },
  },
  {
    name: 'cell_image',
    description:
      'A picture of a cell on the background image (DAPI or another stain), drawn ' +
      'here in the chat, for "a picture of cell 18223", "what does cell 18223 look ' +
      'like on the DAPI" or "where is cell 18223 in the section". Not for "show me ' +
      'cell X" or "take me to it": that is fly_to_cell, which moves the map. ' +
      'context=false gives a close-up: the cell outlined in ' +
      'red, every other cell on that plane in blue, the nuclei underneath. ' +
      'context=true gives the whole section with a ring round the cell. A picture ' +
      'of cell X, with nothing more specific, means BOTH pictures: call the tool ' +
      'twice, the close-up first and then context=true, the pair the docs use. ' +
      'neighbours=true outlines only the ' +
      'cells the spatial term of the model listened to, which is what "why did its ' +
      'neighbours make it this class" needs; the answer lists them and says which ' +
      'sit on another plane. One plane at a time; the plane is the centroid\'s when ' +
      'the run knows its voxel size, else the one where the cell is biggest; pass ' +
      'plane to choose. A run can have more than one background image; channel ' +
      'picks one by name, and with several and no channel the tool refuses and ' +
      'lists them, so ask the user. With only one image it is always used and ' +
      'background_note says so; pass that on to the user.',
    input_schema: {
      type: 'object',
      properties: {
        label: { type: 'integer', description: 'The cell label, as in the segmentation.' },
        context: { type: 'boolean', description: 'true for the whole section with a ring.' },
        plane: { type: 'integer', description: 'Which plane, optional.' },
        width: { type: 'integer', description: 'Output width in pixels, default 1200.' },
        channel: { type: 'string', description: 'Which background image, by name.' },
        neighbours: { type: 'boolean', description: 'Outline only the mrf neighbours.' },
        save_as: { type: 'string', description: 'Also write the png to this path, so a user in a terminal can open it.' },
      },
      required: ['label'],
    },
  },
  {
    name: 'plane_image',
    description:
      'The background image (DAPI or another stain) of one plane with nothing drawn ' +
      'on it, for "show me the whole image", "show me the DAPI of plane 54" or ' +
      '"show me the region around x 5000 to 6000, y 500 to 1200". With no bbox it ' +
      'is the whole plane, untrimmed; bbox is [x0, y0, x1, y1] in image pixels, the ' +
      'same coordinates as the cells and spots. The plane defaults to the middle of ' +
      'the stack. For a picture about one cell use cell_image instead. The answer ' +
      'says the scale, so a point of the image can be placed on the picture. ' +
      'channel works as in cell_image.',
    input_schema: {
      type: 'object',
      properties: {
        plane: { type: 'integer', description: 'Which plane, optional.' },
        bbox: { type: 'array', items: { type: 'number' }, description: '[x0, y0, x1, y1] in image pixels.' },
        width: { type: 'integer', description: 'Output width in pixels, default 1200.' },
        channel: { type: 'string', description: 'Which background image, by name.' },
        save_as: { type: 'string', description: 'Also write the png to this path, so a user in a terminal can open it.' },
      },
    },
  },
  {
    name: 'allen_gene_image',
    description:
      'A picture of where a gene is expressed in the adult mouse brain, from the ' +
      'Allen Mouse Brain Atlas (in situ hybridisation), NOT from this run: for "show ' +
      'me Plp1 in the Allen atlas", "is Pcp4 really in CA2", "Plp1, coronal, ' +
      'hippocampus". The gene can have several experiments; without experiment the ' +
      'tool picks one (the plane asked for, coronal if none, never a sense probe) ' +
      'and says which. region picks the section at the centre of an atlas region, ' +
      'by acronym (CA1, DG, HPF) or name; section picks one by number, which is how ' +
      'to step forward or back; with neither, when the user does not say, pass the ' +
      'region their own data comes from if you know it. view "expression" gives ' +
      'Allen\'s heat map of the signal instead of the stained section. Needs the ' +
      'internet.',
    input_schema: {
      type: 'object',
      properties: {
        gene: { type: 'string', description: 'The gene symbol, e.g. Plp1.' },
        plane: { type: 'string', enum: ['coronal', 'sagittal'], description: 'The plane of section, optional.' },
        region: { type: 'string', description: 'An atlas region, acronym or name, optional.' },
        section: { type: 'integer', description: 'A section number, from 1, optional.' },
        experiment: { type: 'integer', description: 'An Allen experiment id, optional.' },
        view: { type: 'string', enum: ['ish', 'expression'], description: 'ish (default) or expression.' },
      },
      required: ['gene'],
    },
  },
  {
    name: 'spots_of_class',
    description:
      'The spots of one gene in cells of one class, for "the Plp1 spots assigned to ' +
      'Pvalb Gaba cells". Both links are probabilities, so the question has several ' +
      'readings. Default, soft on both: every spot weighted by P(spot -> cell) x P(cell ' +
      'is the class), pciSeq\'s own count. spot_rule most_likely keeps only spots ' +
      'whose most likely parent is the cell, above keeps those over min_spot_prob; ' +
      'class_rule assigned keeps only cells assigned the class, above those over ' +
      'min_class_prob. Every answer also gives soft_count and strict_count (most ' +
      'likely parent, assigned that class); quote the rules used, and when the ' +
      'question is ambiguous give both numbers and offer the other reading.',
    input_schema: {
      type: 'object',
      properties: {
        gene: { type: 'string', description: 'The gene, e.g. Plp1.' },
        class_name: { type: 'string', description: 'The class, as named in the run.' },
        spot_rule: { type: 'string', enum: ['soft', 'most_likely', 'above'], description: 'Spot to cell, soft by default.' },
        class_rule: { type: 'string', enum: ['soft', 'assigned', 'above'], description: 'Cell to class, soft by default.' },
        min_spot_prob: { type: 'number', description: 'For spot_rule above.' },
        min_class_prob: { type: 'number', description: 'For class_rule above.' },
      },
      required: ['gene', 'class_name'],
    },
  },
  {
    name: 'allen_cell_type',
    description:
      'Allen\'s record for a cell type, from the Allen whole mouse brain taxonomy: ' +
      'its place in the hierarchy (class, subclass, supertype, cluster), ' +
      'neurotransmitter, how many clusters and cells Allen found, Allen\'s colour, ' +
      'its subdivisions, its markers in Allen\'s single-cell data and those among ' +
      'this run\'s genes, where Allen\'s MERFISH map puts it, and types elsewhere ' +
      'whose names share a gene with it. For ' +
      '"tell me about Vip Gaba", "what is 037 DG Glut". A name with the same words as ' +
      'an Allen term (Vip-Gaba) is matched to it and the answer says so; a name not ' +
      'in the taxonomy (Vip-Reln) gets suggestions of what Allen would call such a ' +
      'cell. When the class is also in this run, its cells here are added.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'The cell type name, e.g. 046 Vip Gaba.' } },
      required: ['name'],
    },
  },
  {
    name: 'export_table',
    description:
      'Save the rows of a data tool to a CSV file, when the user wants a file ("export ' +
      'the spots of cell 16609", "save that list"). Give the tool and the same ' +
      'arguments that produced the rows; the tool is run again and every row is ' +
      'written by the viewer, nothing is copied by you, and lists the chat shows cut ' +
      'short are written whole. The user picks where in a Save dialog. Tools: ' +
      'spots_of_cell, spots_in_cell, cell_counts, class_counts, find_cells, ' +
      'spots_of_class.',
    input_schema: {
      type: 'object',
      properties: {
        tool: { type: 'string', enum: ['spots_of_cell', 'spots_in_cell', 'cell_counts', 'class_counts', 'find_cells', 'spots_of_class'], description: 'The data tool whose rows to save.' },
        args: { type: 'object', description: 'Its arguments, as for calling it.' },
        suggested_name: { type: 'string', description: 'A file name to suggest, e.g. cell_16609_spots.' },
      },
      required: ['tool'],
    },
  },
  {
    name: 'open_3d_view',
    description:
      'Open the 3D viewer around a cell: the cell and its immediate neighbours, with ' +
      'their spots, over all planes, in a window the user can turn. The same as ' +
      'drawing a rectangle with the selection tool round the cell. After explaining ' +
      'a cell, offer it rather than opening it unasked. label is the cell number ' +
      'shown in the viewer.',
    input_schema: {
      type: 'object',
      properties: { label: { type: 'integer', description: 'The cell label.' } },
      required: ['label'],
    },
  },
  {
    name: 'fly_to_cell',
    description:
      'Move the map to a cell and flash its outline, so the user can see the cell ' +
      'being talked about. Use it for "show me cell X", "take me to it", "go to ' +
      'cell X"; a picture in the chat is cell_image. After ' +
      'explaining one, offer it rather than calling it unasked. label is the cell ' +
      'number shown in the viewer.',
    input_schema: {
      type: 'object',
      properties: { label: { type: 'integer', description: 'The cell label.' } },
      required: ['label'],
    },
  },
  {
    name: 'show_classes',
    description:
      'Choose which cell classes are drawn on the map, like the eye icons in the Cell ' +
      'Classes drawer. Use it when the user asks to show or hide classes. mode only: ' +
      'show just these and hide the rest; add: show these as well; hide: hide these; ' +
      'all: show every class; none: hide every class. Names must match the run\'s ' +
      'classes exactly; names that do not are returned as unknown and left out.',
    input_schema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['only', 'add', 'hide', 'all', 'none'], description: 'What to do with the names.' },
        names: { type: 'array', items: { type: 'string' }, description: 'The class names. Not needed for all and none.' },
      },
      required: ['mode'],
    },
  },
  {
    name: 'show_genes',
    description:
      'Choose which genes have their spots drawn on the map, like the eye icons in the ' +
      'Genes drawer. Use it when the user asks to show or hide genes. mode only: show ' +
      'just these and hide the rest; add: show these as well; hide: hide these; all: ' +
      'show every gene; none: hide every gene. Names must match the gene panel exactly; ' +
      'names that do not are returned as unknown and left out.',
    input_schema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['only', 'add', 'hide', 'all', 'none'], description: 'What to do with the names.' },
        names: { type: 'array', items: { type: 'string' }, description: 'The gene names. Not needed for all and none.' },
      },
      required: ['mode'],
    },
  },
];

// ---------------------------------------------------------------- adapters

// querySpot result -> the dict narrateSpot expects, the same shape as the Python
// explain_spot returns.
function spotToDict(res) {
  const n = res.mvn.length;
  const rows = [];
  for (let i = 0; i < n; i++) {
    rows.push({
      cell: res.neighborIds[i],
      class: res.neighborClasses ? res.neighborClasses[i] : null,
      'Gaussian fit': res.mvn[i],
      'class expression': res.attention[i],
      'cell scale': res.cellInefficiency ? res.cellInefficiency[i] : 0,
      'cell-gene scale': res.exprFluct[i],
      'gene efficiency': res.geneInefficiency ? res.geneInefficiency[i] : 0,
      bonus: res.bonus ? res.bonus[i] : 0,
      sum: res.scores[i],
      prob: res.probabilities[i],
    });
  }
  rows.push({ cell: 'background', misread: res.misread, sum: res.scores[n], prob: res.probabilities[n] });
  let best = 0;
  for (let i = 1; i <= n; i++) if (res.probabilities[i] > res.probabilities[best]) best = i;
  const out = {
    spot: res.spotId,
    gene: res.geneName,
    position: run.planeOf(res.z) !== null
      ? { x: res.x, y: res.y, z: res.z, plane: run.planeOf(res.z),
          z_is: 'the anisotropy scaled z the model works in; plane is the plane index it sits on' }
      : { x: res.x, y: res.y, z: res.z,
          z_is: 'the anisotropy scaled z the model works in, not the plane index. This run ' +
                'carries no voxel_size, so the plane cannot be given' },
    candidates: rows,
    assigned_to: best === n ? 'background' : res.neighborIds[best],
  };
  out.narrative = narrateSpot(out);
  return out;
}

// one gene of the top or bottom list. The two means are the average count over the
// cells this run called each class, the Gene Expression table of the diagnostics.
const geneRow = g => ({ gene: g.gene, counts: g.geneCount, mean_in_assigned: g.meanAssigned,
                        mean_in_compared: g.meanUser, diff: g.diff });

// queryCell result -> the dict narrateCell expects, the same shape as the Python
// explain_cell returns.
function cellToDict(res, label) {
  const names = res.classNames;
  const a = names.indexOf(res.assignedClass);
  const o = names.indexOf(res.userClass);
  const c = res.components;
  const forA = res.topData.filter(g => g.diff > 0).map(geneRow);
  const forO = res.bottomData.filter(g => g.diff < 0).map(geneRow);
  const out = {
    cell: label,
    assigned: res.assignedClass,
    compared_with: res.userClass,
    prob_assigned: res.classProb[a],
    prob_compared: res.classProb[o],
    score: {
      gene_loglik: { assigned: c.geneLoglikAssigned, compared: c.geneLoglikUser },
      log_prior: { assigned: c.logPriorAssigned ?? 0, compared: c.logPriorUser ?? 0 },
      spatial: { assigned: c.mrfAssigned ?? 0, compared: c.mrfUser ?? 0 },
    },
    genes_favouring_assigned: forA,
    genes_favouring_compared: forO,
    // the totals of the two lists, the sums in the chart titles of the cell
    // diagnostics. Given so the model quotes them rather than adds up the diffs
    // itself, which it does badly.
    sum_favouring_assigned: forA.reduce((s, g) => s + g.diff, 0),
    sum_favouring_compared: forO.reduce((s, g) => s + g.diff, 0),
    counts_are: 'soft, weighted by the spot assignment probabilities',
    means_are: 'the average count over the cells of this run, each weighted by its probability of ' +
      'being that class. An after the fact summary of the run, not the scRNAseq profile the ' +
      'likelihood scores against',
  };
  if (c.mrfAssigned == null) {
    out.note = 'this run carries no spatial term in diagnostics.db, so it is taken as zero';
  }
  out.narrative = narrateCell(out);
  return out;
}

// The runner up: the class with the second largest stored probability, however
// small. null when there is no second class with any probability at all, only then
// is there nothing to compare against and the user has to pick. (It used to give up
// below 0.0005, which refused cells like 2413 whose runner up is tiny but real,
// while explain_cell compared against it happily.)
function runnerUp(res) {
  const a = res.classNames.indexOf(res.assignedClass);
  let best = -1;
  for (let k = 0; k < res.classProb.length; k++) {
    if (k === a) continue;
    if (best === -1 || res.classProb[k] > res.classProb[best]) best = k;
  }
  return best === -1 || !(res.classProb[best] > 0) ? null : res.classNames[best];
}

// The query behind explain_cell and open_cell_diagnostics: the cell against the
// runner up, or against vs_class. queryCell needs a class to compare against, and
// the runner up is not known until a first query hands back the probabilities. So
// query once with any class, pick the runner up from the result, and query again
// if it differs. Resolves to { res } or { error }. Both tools refuse only when there
// is no second class at all, see runnerUp.
async function cellQuery(label, vsClass) {
  const meta = deps.getMeta();
  let res = await deps.queryCell(label, vsClass || meta.class_names[0]);
  if (!res.success) return { error: res.error };
  if (vsClass) {
    if (vsClass === res.assignedClass) {
      return { error: `cell ${label} is already ${res.assignedClass}, pick another class to compare` };
    }
    return { res };
  }
  const other = runnerUp(res);
  if (other === null) {
    return { error: `cell ${label} is ${res.assignedClass} and no other class has any ` +
                    'probability, so there is no runner up to compare against. Ask the user ' +
                    'which class to compare against and call again with vs_class' };
  }
  if (other !== res.userClass) {
    res = await deps.queryCell(label, other);
    if (!res.success) return { error: res.error };
  }
  return { res };
}

// ---------------------------------------------------------------- what is drawn

// show_classes and show_genes. The names are checked here against the run's own
// lists, so the model hears about a typo; the renderer holds which ones are shown
// and does the rest (the chat-show-visibility handler in app.js).
const VISIBILITY_MODES = ['only', 'add', 'hide', 'all', 'none'];

function setVisibility(kind, input) {
  const meta = deps.getMeta();
  if (!meta) return { error: 'no diagnostics.db is open' };
  const known = kind === 'classes' ? meta.class_names : meta.gene_panel;
  const what = kind === 'classes' ? 'class' : 'gene';
  const mode = input.mode;
  if (!VISIBILITY_MODES.includes(mode)) {
    return { error: `mode must be one of ${VISIBILITY_MODES.join(', ')}` };
  }
  const needsNames = mode === 'only' || mode === 'add' || mode === 'hide';
  const names = Array.isArray(input.names) ? input.names.map(String) : [];
  if (needsNames && !names.length) return { error: `mode ${mode} needs the ${what} names` };
  const knownSet = new Set(known);
  const found = names.filter(n => knownSet.has(n));
  const unknown = names.filter(n => !knownSet.has(n));
  if (needsNames && !found.length) {
    return { error: `none of ${names.join(', ')} is a ${what} of this run, nothing changed` };
  }
  deps.send('chat-show-visibility', { kind, mode, names: needsNames ? found : [] });
  const out = { done: true, mode };
  if (needsNames) out[kind] = found;
  // the count is only known here when the tool sets the whole list
  if (mode === 'only') out.shown = found.length;
  if (mode === 'all') out.shown = known.length;
  if (mode === 'none') out.shown = 0;
  if (unknown.length) {
    out.unknown = unknown;
    out.unknown_is = `not a ${what} of this run, left out`;
  }
  return out;
}

// ---------------------------------------------------------------- the run

// a port of Run.run_info in pciSeq/src/mcp/tools.py, from the metadata table
function runInfo(meta) {
  const prov = meta.pciSeq_provenance || {};
  const out = {
    pciSeq_version: prov.version ?? null,
    commit: prov.commit ?? null,
    commit_date: prov.commit_date ?? null,
    branch: prov.branch ?? null,
    run_date: prov.created_at ?? null,
    python_version: prov.python_version ?? null,
    os: prov.os ?? null,
    package_versions: prov.package_versions ?? null,
    cells: meta.nC - 1, spots: meta.nS, genes: meta.nG, classes: meta.nK,
    // written to the metadata since September 2026; null on older runs, where it
    // survives only as cellData's sphere_scale / 3
    mean_cell_radius: meta.mcr != null ? Number(meta.mcr) : null,
    mean_cell_radius_is: 'in pixels of the xy plane, the mean over the segmented ' +
                         'cells of sqrt(area / pi), halved; the Gaussian of every ' +
                         'cell has this radius',
    format_version: meta.format_version != null ? Number(meta.format_version) : 0,
  };
  const cfg = meta.config;
  if (!cfg || typeof cfg !== 'object') {
    out.settings = null;
    out.note = 'this run was written before pciSeq exported its settings and convergence ' +
               'record to diagnostics.db, so only the provenance above is known. ' +
               'Rerunning with the current pciSeq records them.';
    return out;
  }
  out.settings = cfg;
  out.is3D = cfg.is3D;
  out.voxel_size = cfg.voxel_size;
  const rec = meta.run;
  if (rec && typeof rec === 'object') {
    out.iterations = rec.iterations;
    out.converged = rec.converged;
    const delta = rec.delta || [];
    out.final_delta = delta.length ? delta[delta.length - 1] : null;
    out.tolerance = cfg.CellCallTolerance;
    out.ended = rec.converged
      ? `converged after ${rec.iterations} iterations, the largest change in a spot ` +
        `assignment fell below ${out.tolerance}`
      : `stopped at max_iter, ${rec.iterations} iterations, without converging: the ` +
        `largest change was still ${out.final_delta == null ? 'unknown' : out.final_delta.toFixed(4)} ` +
        `against a tolerance of ${out.tolerance}`;
  }
  return out;
}

// ---------------------------------------------------------------- the source

function sourceRef() {
  const meta = deps.getMeta ? deps.getMeta() : null;
  const prov = (meta && meta.pciSeq_provenance) || {};
  return prov.commit || 'dev_3d';
}

// no leading slash, no .. anywhere: it is a path inside the repo
function cleanRepoPath(p) {
  const s = String(p || '').replace(/^\/+/, '');
  if (s.split('/').includes('..')) throw new Error('not a path inside the repo: ' + p);
  return s;
}

async function fetchText(url) {
  const f = deps.fetch || globalThis.fetch;
  const r = await f(url, { headers: { 'User-Agent': 'pciSeq_viewer' } });
  if (r.status === 404) throw new Error('not found on GitHub: ' + url);
  if (!r.ok) throw new Error(`GitHub answered ${r.status} for ${url}`);
  return r.text();
}

async function listSource(dir) {
  const ref = sourceRef();
  const d = cleanRepoPath(dir);
  const items = JSON.parse(await fetchText(CONTENTS + d + '?ref=' + ref));
  if (!Array.isArray(items)) throw new Error(d + ' is a file, use read_source');
  return {
    dir: d || '/', commit: ref,
    entries: items.map(i => ({ name: i.name, type: i.type === 'dir' ? 'dir' : 'file', size: i.size })),
  };
}

async function readSource(p, startLine) {
  const ref = sourceRef();
  const file = cleanRepoPath(p);
  const lines = (await fetchText(RAW + ref + '/' + file)).split('\n');
  const start = Math.max(1, Number(startLine) || 1);
  const end = Math.min(lines.length, start + MAX_SOURCE_LINES - 1);
  const width = String(lines.length).length;
  const text = lines.slice(start - 1, end)
    .map((l, i) => String(start + i).padStart(width) + '  ' + l).join('\n');
  const out = { path: file, commit: ref, lines: lines.length, start, end, text };
  if (end < lines.length) out.next = `the file goes on, call again with start_line=${end + 1}`;
  return out;
}

// ---------------------------------------------------------------- dispatch

// Returns the tool's answer as an object. Errors come back as { error } so the
// model can read them and tell the user, rather than as exceptions.
async function call(name, input) {
  try {
    if (name === 'explain_spot') {
      const res = await deps.querySpot(Number(input.spot_id));
      if (!res.success) return { error: res.error };
      return spotToDict(res);
    }
    if (name === 'explain_cell') {
      const label = Number(input.label);
      // format version 1 runs saved their class score at fit time; read it, so the
      // story is the run's own whatever pciSeq looks like when it is asked. The
      // queryCell path below recomputes and only stands while pre-1 runs are
      // tolerated (grace period, bead cz1.9.1).
      if (run.hasSavedScore()) {
        return run.explainCell(label, input.vs_class ?? null);
      }
      const { res, error } = await cellQuery(label, input.vs_class);
      if (error) return { error };
      return cellToDict(res, label);
    }
    if (name === 'open_cell_diagnostics') {
      const label = Number(input.label);
      const { res, error } = await cellQuery(label, input.vs_class);
      if (error) return { error };
      deps.send('chat-open-cell-diagnostics', { label, vs_class: res.userClass });
      const out = cellToDict(res, label);
      out.diagnostics = `open on cell ${label}, ${res.assignedClass} against ${res.userClass}, ` +
                        'Genes tab first';
      return out;
    }
    if (name === 'open_spot_diagnostics') {
      // no class to pick here, the panel shows every candidate cell at once
      const spotId = Number(input.spot_id);
      const res = await deps.querySpot(spotId);
      if (!res.success) return { error: res.error };
      deps.send('chat-open-spot-diagnostics', { spot_id: spotId });
      const out = spotToDict(res);
      out.diagnostics = `open on spot ${spotId}, probabilities chart first`;
      return out;
    }
    if (name === 'open_3d_view') {
      const label = Number(input.label);
      run.toInternal(label);   // throws for a label the run does not have
      deps.send('chat-open-3d-view', { label });
      return { done: true, cell: label, note: 'the 3D viewer is opening in its own window, around the cell and its neighbours' };
    }
    if (name === 'fly_to_cell') {
      const label = Number(input.label);
      deps.send('chat-fly-to-cell', { label });
      return { done: true, cell: label, note: 'the map is moving to the cell' };
    }
    if (name === 'show_classes') return setVisibility('classes', input);
    if (name === 'show_genes') return setVisibility('genes', input);
    if (name === 'docs') {
      // the pages saved inside the run at fit time first; runs from before that have
      // none, then the pages of the run's own commit from GitHub, as the source tools
      // do; the copy shipped with the viewer only when those cannot be fetched
      let inRun = null;
      try { inRun = run.docsFromRun(); } catch { inRun = null; }
      const atCommit = inRun ? null
        : await docsAtCommit.docsAt(sourceRef() === 'dev_3d' ? null : sourceRef(), deps.fetch);
      const corpus = inRun || atCommit || deps.docsRoot;
      if (!corpus) return { error: 'this build of the viewer carries no documentation pages' };
      const hits = docs.searchDocs(corpus, input.query, input.n || 5);
      return {
        query: input.query,
        hits,
        pages: hits.length ? undefined : docs.listPages(corpus),
        docs_are: inRun
          ? 'the documentation saved inside this run when it was fitted, so it describes ' +
            'the pciSeq that produced these numbers'
          : atCommit
          ? `the documentation at the commit that made this run (${sourceRef()}), so it ` +
            'describes the pciSeq that produced these numbers'
          : 'the documentation shipped with this viewer, not the run\'s own commit ' +
            '(it could not be fetched from GitHub), so a page may describe a newer ' +
            'pciSeq than the run',
      };
    }
    if (name === 'run_info') {
      const meta = deps.getMeta();
      if (!meta) return { error: 'no diagnostics.db is open' };
      const out = runInfo(meta);
      out.background = deps.getTilesInfo ? deps.getTilesInfo() : [];
      // whether the class names are Allen's, evidence for 'what am I looking at'
      try { out.allen_taxonomy = await allenTaxonomy.matchRun(meta.class_names || []); }
      catch (e) { out.allen_taxonomy = { error: e.message }; }
      out.background_is = 'what each background image (.mbtiles) says about itself, as ' +
                          'written by whoever made it: name, description, width and ' +
                          'height in pixels, number of planes. May be empty or vague';
      return out;
    }
    if (name === 'cell') return run.cell(input.label);
    if (name === 'cell_counts') return run.cellCounts(input.label, input.gene ?? null);
    if (name === 'theta') return run.theta(input.label, input.class_name ?? null);
    if (name === 'gamma') return run.gamma(input.label, input.gene ?? null);
    if (name === 'spot') return await run.spot(input.spot_id);
    if (name === 'gene') return run.gene(input.name);
    if (name === 'neighbours') return run.neighbours(input.label);
    if (name === 'class_counts') return run.classCounts(input.min_counts ?? null);
    if (name === 'find_cells') return run.findCells(withRegion(input));
    if (name === 'annotations') return listAnnotations();
    if (name === 'outline_cells') return outlineCells(input);
    if (name === 'open_chart') return openChart(input);
    if (name === 'metadata') return run.metadataTool(input.key ?? null);
    if (name === 'calculate') return run.calculate(input.expression);
    if (name === 'spots_in_cell') return await run.spotsInCell(input.label, input.gene ?? null);
    if (name === 'spots_of_cell') return await run.spotsOfCell(input.label, input.min_prob ?? null, input.gene ?? null);
    if (name === 'cell_row') return await run.cellRow(input.label);
    if (name === 'spot_row') return await run.spotRow(input.spot_id);
    if (name === 'spots_of_class') return await run.spotsOfClass(input);
    if (name === 'allen_cell_type') {
      const meta = deps.getMeta ? deps.getMeta() : null;
      const out = await allenTaxonomy.cellType(input.name, meta && meta.gene_panel);
      if (out.found && meta && (meta.class_names || []).includes(out.name)) {
        const row = run.classCounts(null).classes.find(c => c.class === out.name);
        out.in_this_run = { cells: row.cells, expected: row.soft,
                            are: 'cells of this run assigned the class, and the expected number counting partial probabilities' };
      }
      return out;
    }
    if (name === 'export_table') {
      return await exportTable(input, { call, saveDialog: deps.saveDialog, writeFile: deps.writeFile });
    }
    if (name === 'cell_image') return await run.cellImage(input.label, input);
    if (name === 'allen_gene_image') return await allen.geneImage(input);
    if (name === 'plane_image') return await run.planeImage(input);
    if (name === 'list_source') return await listSource(input.dir || '');
    if (name === 'read_source') return await readSource(input.path, input.start_line);
    return { error: `unknown tool ${name}` };
  } catch (e) {
    return { error: e.message };
  }
}

module.exports = { init, TOOLS, call, spotToDict, cellToDict, runnerUp, runInfo };
