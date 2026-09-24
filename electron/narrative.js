// The stories behind a cell call and a spot call, in plain words.
//
// A port of narrate_cell and narrate_spot from pciSeq/src/mcp/tools.py, kept word
// for word so that the viewer's agent and the Python one tell the same story for
// the same numbers. narrative.check.js diffs the two on fixed inputs; if you change
// a sentence here, change it there too and rerun the check.
//
// The input is the Python-shaped dict, not the raw query result: tools.js adapts
// the querySpot / queryCell output into that shape first. No units in the output,
// a score difference comes out as odds ("about 60 to one") or as a word.

// Python's round(): half to even, which Math.round is not. It matters for the
// odds, "about 12 to one" against "about 13 to one" on a .5.
function pyRound(x) {
  const f = Math.floor(x);
  const diff = x - f;
  if (diff > 0.5) return f + 1;
  if (diff < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

function strength(d) {
  // A log-likelihood difference as something a reader can picture: the odds,
  // e**d to one, in round numbers while the number still means anything, and a
  // word once it does not. Meant to close a sentence.
  if (d < 0.4) return 'only just';
  const odds = Math.exp(d);
  if (odds < 3) return 'slightly';
  if (odds < 20) return `about ${pyRound(odds)} to one`;
  if (odds < 100) return `about ${pyRound(odds / 5) * 5} to one`;
  if (odds < 20000) return `about ${(pyRound(odds / 100) * 100).toLocaleString('en-US')} to one`;
  return 'overwhelmingly, beyond any doubt';
}

function mostly(d) {
  return d > 8 ? 'overwhelmingly' : d > 2 ? 'mostly' : 'somewhat more';
}

function prob(x) {
  return x < 0.005 ? 'less than 0.01' : x.toFixed(2);
}

function names(gs, n = 3) {
  gs = gs.slice(0, n);
  if (gs.length === 1) return gs[0];
  return gs.slice(0, -1).join(', ') + ' and ' + gs[gs.length - 1];
}

function narrateCell(e) {
  const a = e.assigned, o = e.compared_with;
  const s = e.score;
  const d = {
    genes: s.gene_loglik.assigned - s.gene_loglik.compared,
    prior: s.log_prior.assigned - s.log_prior.compared,
    neighbours: s.spatial.assigned - s.spatial.compared,
  };
  const margin = d.genes + d.prior + d.neighbours;
  const decider = Object.keys(d).reduce((best, k) => Math.abs(d[k]) > Math.abs(d[best]) ? k : best, 'genes');
  const forA = e.genes_favouring_assigned.map(g => g.gene);
  const forO = e.genes_favouring_compared.map(g => g.gene);

  const out = [];
  out.push(`Cell ${e.cell} was called ${a}, with probability ${prob(e.prob_assigned)}. The closest ` +
           `alternative was ${o}, at ${prob(e.prob_compared)}.`);
  out.push("pciSeq decides a cell's class from three things: how well its gene counts " +
           'match what each class typically expresses (the gene log-likelihood), how ' +
           'common each class is to begin with (the prior), and what the neighbouring ' +
           'cells were called (the spatial term). The class that comes out best ' +
           'overall wins.');

  // the genes, ranked, no numbers
  if (d.genes > 0) {
    out.push(`The genes point to ${a}, ${strength(d.genes)}. The strongest evidence comes from ${names(forA)}: the ` +
             `cell holds these in the amounts a ${a} cell typically does and a ${o} cell ` +
             'does not.');
    if (forO.length) {
      out.push(`A few genes, ${names(forO)}, look more like ${o}, but they are outweighed.`);
    }
  } else {
    out.push(`On its genes alone the cell looks more like ${o}, ${strength(-d.genes)}, mostly because of ` +
             `${names(forO)}.`);
    if (forA.length) {
      out.push(`The genes arguing for ${a} are ${names(forA)}.`);
    }
  }

  // the prior
  if (Math.abs(d.prior) < 0.05) {
    out.push('The prior treats the two classes alike.');
  } else {
    const who = d.prior > 0 ? a : o;
    out.push(`The prior favours ${who}, because that class is more common to begin with.`);
  }

  // the neighbourhood
  if (Math.abs(d.neighbours) < 0.4) {
    out.push('The neighbouring cells make no real difference either way.');
  } else if (d.neighbours > 0) {
    out.push(`The neighbouring cells are ${mostly(d.neighbours)} ${a}, which ` +
             `${d.genes > 0 ? 'strengthens' : 'is what carries'} the call.`);
  } else {
    out.push(`The neighbouring cells lean towards ${o}, which counts against the call.`);
  }

  // what settled it
  if (decider === 'genes') {
    out.push(`So the genes settled it${d.neighbours > 0.4 ? ', and the neighbourhood agreed' : ''}.`);
  } else if (decider === 'neighbours' && d.genes <= 0) {
    out.push('So this call is the neighbourhood overruling the genes: on its genes ' +
             `alone the cell would have been called ${o}, but surrounded by ${a} cells ` +
             `the balance comes out for ${a}, ${strength(margin)}.`);
  } else if (decider === 'neighbours') {
    out.push('So the neighbourhood settled it. The genes agreed, but only mildly; the ' +
             'surrounding cells made the difference.');
  } else {
    out.push('So the prior settled it.');
  }
  return out.join(' ');
}

function narrateSpot(e) {
  const gene = e.gene, spot = e.spot;
  const cells = e.candidates.filter(c => c.cell !== 'background');
  const bg = e.candidates.find(c => c.cell === 'background');
  const byProb = [...cells].sort((x, y) => y.prob - x.prob);
  const winner = byProb[0];
  const toBg = e.assigned_to === 'background';

  const expr = c => c['class expression'] + c['cell scale'] + c['cell-gene scale'];
  const sure = x => x > 0.9 ? 'confidently' : x > 0.6 ? 'fairly confidently'
                  : x > 0.4 ? 'narrowly' : 'with no clear winner';

  const out = [];
  if (toBg) {
    out.push(`Spot ${spot} is a ${gene} spot. It was assigned to the background, with probability ` +
             `${prob(bg.prob)}, meaning the model takes it for a misread rather than a read from any ` +
             `cell. The nearest cell, ${winner.cell}, gets ${prob(winner.prob)}.`);
  } else {
    const others = byProb.slice(1, 3).map(c => `cell ${c.cell} (${prob(c.prob)})`).join(', ');
    out.push(`Spot ${spot} is a ${gene} spot. It was assigned to cell ${winner.cell}, ${sure(winner.prob)}, with probability ${prob(winner.prob)}. ` +
             `The next candidates are ${others}, and the chance it is a misread is ${prob(bg.prob)}.`);
  }

  out.push('pciSeq weighs each nearby cell on two things: how close the spot is to the ' +
           `cell's centre (the Gaussian fit), and how well a ${gene} spot fits that cell, ` +
           `which combines whether the cell's class expresses ${gene} (class expression), ` +
           'whether the cell holds more reads overall than its class predicts (cell ' +
           `scale), and whether it already holds more ${gene} than its class predicts ` +
           `(cell-gene scale). The background is scored on how often ${gene} spots turn out ` +
           'to be misreads. The best total wins.');

  if (toBg) {
    out.push(`Here no cell scores well enough: cell ${winner.cell} is the nearest, and its class ` +
             `is ${winner.class}, but ${gene} does not fit it well, and ${gene} misreads are common enough in ` +
             'this run for the background to win.');
    return out.join(' ');
  }

  // position
  const byDist = [...cells].sort((x, y) => y['Gaussian fit'] - x['Gaussian fit']);
  const nearest = byDist[0];
  if (nearest.cell === winner.cell) {
    const rivals = byDist.slice(1, 3);
    out.push(`Cell ${winner.cell} is the nearest candidate: ` +
             rivals.map(c => `${strength(winner['Gaussian fit'] - c['Gaussian fit'])} over cell ${c.cell}`).join(' and ') +
             ' on position alone.');
  } else {
    out.push(`Cell ${winner.cell} is not the nearest: cell ${nearest.cell} is closer, ` +
             `${strength(nearest['Gaussian fit'] - winner['Gaussian fit'])} on position alone.`);
  }

  // expression
  const runner = byProb.length > 1 ? byProb[1] : null;
  const classes = new Set(cells.map(c => c.class));
  if (classes.size === 1) {
    out.push(`Every candidate is a ${winner.class} cell, so on class alone ${gene} fits them all equally; ` +
             'what separates them is how much each already holds.');
  } else {
    out.push(`Cell ${winner.cell} is a ${winner.class} cell, and that class ` +
             `${winner['class expression'] > 0 ? 'expresses' : 'barely expresses'} ${gene}.`);
    if (runner && runner.class !== winner.class) {
      out.push(`Cell ${runner.cell} is a ${runner.class} cell, which ` +
               `${runner['class expression'] > 0 ? 'does too' : 'does not'}.`);
    } else if (runner) {
      out.push(`Cell ${runner.cell} is a ${runner.class} cell too.`);
    }
  }
  if (runner) {
    const pieces = [];
    const dSc = winner['cell scale'] - runner['cell scale'];
    const dCg = winner['cell-gene scale'] - runner['cell-gene scale'];
    if (Math.abs(dSc) > 0.2) {
      pieces.push(`cell ${dSc > 0 ? winner.cell : runner.cell} holds more reads overall than its class predicts`);
    }
    if (Math.abs(dCg) > 0.2) {
      pieces.push(`cell ${dCg > 0 ? winner.cell : runner.cell} already holds more ${gene} than its class predicts`);
    }
    if (pieces.length) out.push(`Between the top two, ${pieces.join(' and ')}.`);
  }

  // the inside cell bonus, when it is switched on
  const bonus = cells.filter(c => c.bonus);
  if (bonus.length) {
    out.push(`The spot's pixel lies inside the mask of cell ${bonus[0].cell}, which adds a bonus for ` +
             'it.');
  }

  // verdict, winner against the runner up
  if (runner) {
    const dPos = winner['Gaussian fit'] - runner['Gaussian fit'];
    const dExp = expr(winner) - expr(runner);
    if (dPos > 0.4 && dExp > 0.4) {
      out.push(`So cell ${winner.cell} is both the nearer and the better fit for the gene, and ` +
               'the call is clear.');
    } else if (dPos > 0.4) {
      out.push(`So cell ${runner.cell} is the better fit for the gene, ${dExp < -0.4 ? strength(-dExp) : 'slightly'}, but cell ${winner.cell} is closer, ` +
               `${strength(dPos)}, and distance carries the call.`);
    } else if (dExp > 0.4) {
      out.push(`So cell ${runner.cell} is closer, ${dPos < -0.4 ? strength(-dPos) : 'slightly'}, but cell ${winner.cell} fits the gene better, ${strength(dExp)}, and ` +
               'expression carries the call.');
    } else {
      out.push('So the two are close on both counts, and the call is a narrow one.');
    }
  }
  if (bg.prob > 0.1) {
    out.push(`There is a real chance, ${prob(bg.prob)}, that the spot is a misread.`);
  }
  return out.join(' ');
}

module.exports = { narrateCell, narrateSpot, strength, mostly, pyRound };
