# 4. Assigning spots to cells

Each spot is assigned to one of its nearest cells or to the background, as a
probability. This is the last step of the sweep: the new assignments change the gene
counts per cell, which are the input to the next sweep.

## The assignment score

For a spot and a candidate cell the score is a sum of five terms. One depends on the
spot's position, four on its gene.

<figure class="diagram">
<svg class="sb-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 940 372" role="img" aria-label="The terms of the spot-to-cell score">
<rect class="sb-root" x="380" y="12" width="180" height="42" rx="11" />
<text class="sb-root-txt" x="470" y="39" text-anchor="middle">spot <tspan font-size="19">&#8594;</tspan> cell score</text>
<path class="sb-link" d="M 470,54 L 470,92" />
<path class="sb-link" d="M 122,92 L 586,92" />
<path class="sb-link" d="M 122,92 L 122,110" />
<path class="sb-link" d="M 586,92 L 586,110" />
<rect class="sb-panel-where" x="24" y="110" width="196" height="250" rx="12" />
<text class="sb-head-where" x="122" y="134" text-anchor="middle">POSITION</text>
<text class="sb-sub" x="122" y="150" text-anchor="middle">1 term</text>
<rect class="sb-panel-what" x="256" y="110" width="660" height="250" rx="12" />
<text class="sb-head-what" x="586" y="134" text-anchor="middle">EXPRESSION</text>
<text class="sb-sub" x="586" y="150" text-anchor="middle">4 terms</text>
<text class="sb-plus" x="238" y="264" text-anchor="middle">+</text>
<text class="sb-plus" x="426" y="264" text-anchor="middle">+</text>
<text class="sb-plus" x="586" y="264" text-anchor="middle">+</text>
<text class="sb-plus" x="746" y="264" text-anchor="middle">+</text>
<rect class="sb-card sb-card-where" x="44" y="174" width="156" height="170" rx="10" />
<circle class="sb-badge-where" cx="122" cy="208" r="21" />
<text class="sb-badge-txt" x="122" y="213" text-anchor="middle" font-size="12">loglik</text>
<text class="sb-name" x="122" y="246" text-anchor="middle">Gaussian fit:</text>
<text class="sb-name" x="122" y="264" text-anchor="middle">Gaussian LogLik</text>
<text class="sb-q" x="122" y="287" text-anchor="middle">distance to</text>
<text class="sb-q" x="122" y="304" text-anchor="middle">the cell</text>
<text class="sb-cap" x="122" y="326" text-anchor="middle">geometry</text>
<rect class="sb-card sb-card-what" x="272" y="174" width="148" height="170" rx="10" />
<circle class="sb-badge-what" cx="346" cy="208" r="21" />
<text class="sb-badge-txt" x="346" y="216" text-anchor="middle" font-size="20">&#956;</text>
<text class="sb-name" x="346" y="252" text-anchor="middle">Class expression</text>
<text class="sb-q" x="346" y="275" text-anchor="middle">expected count</text>
<text class="sb-q" x="346" y="292" text-anchor="middle">of the gene</text>
<text class="sb-cap" x="346" y="326" text-anchor="middle">class <tspan font-size="17">&#8596;</tspan> gene</text>
<rect class="sb-card sb-card-what" x="432" y="174" width="148" height="170" rx="10" />
<circle class="sb-badge-what" cx="506" cy="208" r="21" />
<text class="sb-badge-txt" x="506" y="216" text-anchor="middle" font-size="20">&#952;</text>
<text class="sb-name" x="506" y="252" text-anchor="middle">Cell scale</text>
<text class="sb-q" x="506" y="275" text-anchor="middle">total counts</text>
<text class="sb-q" x="506" y="292" text-anchor="middle">of the cell</text>
<text class="sb-cap" x="506" y="326" text-anchor="middle">cell size</text>
<rect class="sb-card sb-card-what" x="592" y="174" width="148" height="170" rx="10" />
<circle class="sb-badge-what" cx="666" cy="208" r="21" />
<text class="sb-badge-txt" x="666" y="216" text-anchor="middle" font-size="20">&#947;</text>
<text class="sb-name" x="666" y="252" text-anchor="middle">Cell-gene scale</text>
<text class="sb-q" x="666" y="275" text-anchor="middle">this gene in</text>
<text class="sb-q" x="666" y="292" text-anchor="middle">this cell</text>
<text class="sb-cap" x="666" y="326" text-anchor="middle">cell <tspan font-size="17">&#8596;</tspan> gene</text>
<rect class="sb-card sb-card-what" x="752" y="174" width="148" height="170" rx="10" />
<circle class="sb-badge-what" cx="826" cy="208" r="21" />
<text class="sb-badge-txt" x="826" y="216" text-anchor="middle" font-size="20">&#951;</text>
<text class="sb-name" x="826" y="252" text-anchor="middle">Gene efficiency</text>
<text class="sb-q" x="826" y="275" text-anchor="middle">detection rate</text>
<text class="sb-q" x="826" y="292" text-anchor="middle">of the gene</text>
<text class="sb-cap" x="826" y="326" text-anchor="middle">vs background</text>
</svg>
<figcaption>The terms of the score. One depends on the spot's position, four on its gene. They are added.</figcaption>
</figure>

### Gaussian fit

Each cell has a Gaussian footprint centred on its centroid, and the term is the log
density of the spot's position under it. It does not depend on the gene.

### Expression fit

The four expression terms are each a log expected count of the spot's gene in the
candidate cell, taken from the [warped definitions](warping-the-reference.md). The
first three are averaged over the cell's class probabilities from
[cell typing](cell-to-celltype.md), so a confidently typed cell weighs them more. The
fourth depends on the gene alone.

- **Class expression, the alignment.** The expected count of the gene under the cell's
  class. A cell whose likely class expresses the gene scores higher than one whose class
  does not, at the same distance. The term is the dot product of two vectors over the
  classes: the cell's class probabilities and the log expected counts of the gene. A dot
  product is large only when both are large on the same classes, that is when the cell is
  confident of its class and that class expresses the gene. Hence the alignment.
- **Cell scale, the gravity (theta).** The cell's total counts relative to what its class
  predicts. A cell that already holds more transcripts than expected scores higher for
  every gene, so it draws in the spots around it whatever they are. Hence the gravity.
- **Cell-gene scale, the enrichment (gamma).** This gene's count in this cell relative to
  what the class predicts. Two cells of the same class have the same alignment; the one
  already enriched in the gene has the higher term, which is what tells cells of the same
  class apart. Hence the enrichment.
- **Gene efficiency (eta).** The gene's detection rate. It is the same for every
  candidate cell, so it does not choose between cells. It enters the comparison with the
  background, which has no efficiency term, and lowers the score of a poorly detected
  gene against it.

## The background option

The background is scored with the gene's [misread density](misread-density.md), the
same at every position. A spot that no candidate cell explains better than the
background is assigned to the background. This is how misreads are removed.

## Soft assignments

A softmax over the candidates and the background gives the spot a probability for each,
for example 0.9 on one cell and 0.1 on a neighbour. The gene counts for the next sweep
are accumulated with these probabilities, so an ambiguous spot is shared between cells
rather than committed to one.

## Feedback into the next sweep

The updated counts per cell are the input to the [misread density](misread-density.md)
and the [warping](warping-the-reference.md) of the next sweep. The loop stops when the
spot probabilities stop changing, see [convergence](overview.md#convergence).
