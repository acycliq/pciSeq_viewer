---
# standard column, margins and reading measure. Only the demo runs wide.
pageClass: demo-wide
---

# 2a. Demo: the scaling factors

<DemoFrame src="/cells-demo.html?narrow=1&amp;fold=1" wide
           title="Interactive demo of the scaling factors" />

**Simplifications.**

**Eta** is held at 1 throughout, so the demo shows three factors rather than four. Eta is one
factor per gene, shared by every cell, and it absorbs the difference in how well each
probe is detected: the gene's observed count over the count the model expects for it,
above 1 where the gene is picked up better than the panel rate and below 1 where it is
picked up worse. Its granularity puts it between the Inefficiency, which moves the whole
panel, and theta, which moves one cell. It is estimated section-wide, over every cell at
once, so the five cells here carry nowhere near enough counts to identify it. `rGene`,
20 by default, sets how firmly the prior holds it at 1.

The class prior and the neighbourhood term are both left out, which means the
probabilities come from the likelihood alone; the
[cell-class assignment](../the-model/cell-class.md) page gives the full expression.
