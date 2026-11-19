const { parse, solve, step, danger, guardAt } = require('../src/engine.js');
const { LEVELS } = require('../src/levels.js');
const show = process.argv[2] != null ? +process.argv[2] : -1;
LEVELS.forEach((L, i) => {
  const V = parse(L), sol = solve(V);
  const manhattan = Math.abs(V.start[0] - V.gem[0]) + Math.abs(V.start[1] - V.gem[1]);
  // how forgiving: count random-ish naive straight runs that get caught
  console.log(`${i + 1}. ${L.name.padEnd(15)} best ${sol ? sol.length : 'UNSOLVABLE'} moves (straight line ${manhattan})  ${sol || ''}`);
  if (i === show && sol) {
    let s = { pos: V.start, t: 0, ko: 0 };
    for (const m of sol) {
      s = step(V, s, m);
      const d = danger(V, s.t, s.ko), rows = [];
      for (let y = 0; y < V.h; y++) { let r = ''; for (let x = 0; x < V.w; x++) {
        const k = x + ',' + y; let c = V.walls.has(k) ? '#' : d.has(k) ? '~' : '.';
        V.guards.forEach(g => { if (!(s.ko & (1 << g.i))) { const [gx, gy, f] = guardAt(g, s.t); if (gx === x && gy === y) c = { U: '^', D: 'v', L: '<', R: '>' }[f]; } });
        if (V.gem[0] === x && V.gem[1] === y) c = 'G'; if (s.pos[0] === x && s.pos[1] === y) c = '@'; r += c; } rows.push(r); }
      console.log(`move ${m} t=${s.t} ${s.status}\n` + rows.join('\n'));
    }
  }
});
