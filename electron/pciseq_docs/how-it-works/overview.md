# How it works

pciSeq treats every unknown as a latent variable of one Bayesian model: the cell of
origin of each spot, the class of each cell, the detection efficiency of each gene, and
the per-cell and per-gene scale factors. Each has a prior. The target of inference is
their joint posterior given the spots and the cell type definitions.

The posterior has no closed form. It is approximated by variational inference: the
approximating distribution is restricted to a mean-field family, one factor per group of
latent variables, and the member of the family closest to the posterior in
Kullback-Leibler divergence is selected. This is equivalent to maximising a lower bound
on the model evidence.

The optimal factors depend on one another, so they are fitted by coordinate ascent. Each
factor is updated to its optimum given the current values of the others, and the sweep
repeats until the estimates stop changing. The four steps below are these updates.

## The variational loop

<figure class="diagram">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" role="img" aria-label="The pciSeq variational loop">
  <defs>
    <path id="vlTxtPath1" d="M 400,90 A 160,160 0 0,1 560,250" />
    <path id="vlTxtPath2" d="M 560,250 A 160,160 0 0,1 400,410" />
    <path id="vlTxtPath3" d="M 400,410 A 160,160 0 0,1 240,250" />
    <path id="vlTxtPath4" d="M 240,250 A 160,160 0 0,1 400,90" />
  </defs>
  <text x="400" y="255" text-anchor="middle" class="vl-center-title">THE VARIATIONAL LOOP</text>
  <circle cx="400" cy="250" r="100" fill="none" stroke="currentColor" stroke-width="0.5" stroke-dasharray="2 6" opacity="0.2" />
  <g>
    <path class="vl-arc-band" d="M 416.6,60.7 A 190,190 0 0,1 585.1,207.3 L 598.8,204.1 L 565.0,250.0 L 522.8,221.7 L 536.4,218.5 A 140,140 0 0,0 412.2,110.5 Z" />
    <text class="vl-text-label"><textPath href="#vlTxtPath1" startOffset="50%" text-anchor="middle">Misread Density</textPath></text>
    <path class="vl-arc-band vl-arc-highlight" d="M 589.3,266.6 A 190,190 0 0,1 442.7,435.1 L 445.9,448.8 L 400.0,415.0 L 428.3,372.8 L 431.5,386.4 A 140,140 0 0,0 539.5,262.2 Z" />
    <text class="vl-text-label"><textPath href="#vlTxtPath2" startOffset="50%" text-anchor="middle">Warping Definitions</textPath></text>
    <path class="vl-arc-band" d="M 383.4,439.3 A 190,190 0 0,1 214.9,292.7 L 201.2,295.9 L 235.0,250.0 L 277.2,278.3 L 263.6,281.5 A 140,140 0 0,0 387.8,389.5 Z" />
    <text class="vl-text-label"><textPath href="#vlTxtPath3" startOffset="50%" text-anchor="middle">Cell Typing</textPath></text>
    <path class="vl-arc-band" d="M 210.7,233.4 A 190,190 0 0,1 357.3,64.9 L 354.1,51.2 L 400.0,85.0 L 371.7,127.2 L 368.5,113.6 A 140,140 0 0,0 260.5,237.8 Z" />
    <text class="vl-text-label"><textPath href="#vlTxtPath4" startOffset="50%" text-anchor="middle">Spot Assignment</textPath></text>
  </g>
</svg>
<figcaption>The four updates, in order. The last feeds the first.</figcaption>
</figure>

1. **[Misread density.](misread-density.md)** The rate of background spots per gene,
   estimated from the spots currently assigned to the background.

2. **[Warping the cell type definitions.](warping-the-reference.md)** Per-gene detection
   efficiencies and per-cell and per-cell-gene scale factors that rescale the reference
   expression to this experiment. These are latent, with no observed counterpart, and
   are identified only through the fit between cells and classes.

3. **[Cell to class.](cell-to-celltype.md)** Every cell is scored against every class
   with the warped definitions, and the scores are normalised to probabilities.

4. **[Spots to cells.](spots-to-cells.md)** Every spot is assigned to one of its
   neighbouring cells or to the background, as a probability, given the cell class
   probabilities.

The new spot assignments change the gene counts per cell, which enter step 1 of the next
sweep. A single pass would leave each step conditioned on the initial values of the
others; iterating propagates each update to the rest.

## Convergence

After each sweep the change in the spot-to-cell probabilities is measured as the maximum
absolute change over all spots and candidate cells. The loop stops when this falls below
`CellCallTolerance`, or at `max_iter`. The maximum is a strict criterion: one spot still
moving between two cells keeps the loop running after every other spot has settled,
where a mean would have stopped earlier.
