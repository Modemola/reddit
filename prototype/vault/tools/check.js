// Solves every house vault with and without the pebble.
const { parse, solve } = require('../src/engine.js');
const { LEVELS } = require('../src/levels.js');
const fmt = m => m.map(x => typeof x === 'object' ? `P(${x.pebble})` : x).join('');
LEVELS.forEach((L, i) => {
  const V = parse(L), t0 = Date.now(), a = solve(V), b = solve(V, { usePebbles: false });
  console.log(`${i + 1}. ${L.name.padEnd(15)} best ${a ? a.length : 'UNSOLVABLE'} (no pebble ${b ? b.length : 'UNSOLVABLE'})  ${a ? fmt(a) : ''}  ${Date.now() - t0}ms`);
});
