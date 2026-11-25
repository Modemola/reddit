// Builds shapes.json from Natural Earth (public domain) GeoJSON.
// Usage: node tools/build-shapes.mjs data-src out/shapes.json
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const [srcDir, outFile] = process.argv.slice(2);

// [label, source, property value, kind]
const PICKS = [
  ['Italy', 'countries', 'Italy', 'Country'],
  ['Australia', 'countries', 'Australia', 'Country'],
  ['India', 'countries', 'India', 'Country'],
  ['Madagascar', 'countries', 'Madagascar', 'Island'],
  ['Iceland', 'countries', 'Iceland', 'Island'],
  ['Sri Lanka', 'countries', 'Sri Lanka', 'Island'],
  ['Great Britain', 'countries', 'United Kingdom', 'Island'],
  ['Ireland', 'countries', 'Ireland', 'Island'],
  ['Mexico', 'countries', 'Mexico', 'Country'],
  ['France', 'countries', 'France', 'Country'],
  ['Spain', 'countries', 'Spain', 'Country'],
  ['Germany', 'countries', 'Germany', 'Country'],
  ['Turkey', 'countries', 'Turkey', 'Country'],
  ['Egypt', 'countries', 'Egypt', 'Country'],
  ['South Africa', 'countries', 'South Africa', 'Country'],
  ['Brazil', 'countries', 'Brazil', 'Country'],
  ['Cuba', 'countries', 'Cuba', 'Island'],
  ['Ukraine', 'countries', 'Ukraine', 'Country'],
  ['Poland', 'countries', 'Poland', 'Country'],
  ['China', 'countries', 'China', 'Country'],
  ['Saudi Arabia', 'countries', 'Saudi Arabia', 'Country'],
  ['Nigeria', 'countries', 'Nigeria', 'Country'],
  ['Thailand', 'countries', 'Thailand', 'Country'],
  ['Vietnam', 'countries', 'Vietnam', 'Country'],
  ['Argentina', 'countries', 'Argentina', 'Country'],
  ['Mongolia', 'countries', 'Mongolia', 'Country'],
  ['Portugal', 'countries', 'Portugal', 'Country'],
  ['Kenya', 'countries', 'Kenya', 'Country'],
  ['Lake Michigan', 'lakes', 'Lake Michigan', 'Lake'],
  ['Lake Victoria', 'lakes', 'Lake Victoria', 'Lake'],
  ['Lake Superior', 'lakes', 'Lake Superior', 'Lake'],
  ['Lake Baikal', 'lakes', 'Lake Baikal', 'Lake'],
];

const load = (n) => JSON.parse(readFileSync(join(srcDir, n), 'utf8')).features;
const SRC = {
  countries: load('ne_50m_admin_0_countries.geojson'),
  lakes: load('ne_50m_lakes.geojson'),
};
const nameOf = (f) => f.properties.ADMIN || f.properties.NAME || f.properties.name;

const ringArea = (r) => { let a = 0; for (let i = 0; i < r.length; i++) { const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length]; a += x1 * y2 - x2 * y1; } return a / 2; };

function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
  let max = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / L;
    if (d > max) { max = d; idx = i; }
  }
  if (max <= eps) return [pts[0], pts[pts.length - 1]];
  return rdp(pts.slice(0, idx + 1), eps).slice(0, -1).concat(rdp(pts.slice(idx), eps));
}

const out = [];
for (const [label, src, key, kind] of PICKS) {
  const f = SRC[src].find((x) => nameOf(x) === key);
  if (!f) { console.error('MISSING', key); continue; }
  const g = f.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  // project each outer ring with a local equirectangular projection
  let best = null;
  for (const p of polys) {
    const ring = p[0];
    const lat0 = ring.reduce((s, c) => s + c[1], 0) / ring.length;
    const k = Math.cos((lat0 * Math.PI) / 180);
    const proj = ring.map(([lo, la]) => [lo * k, -la]);
    const a = Math.abs(ringArea(proj));
    if (!best || a > best.a) best = { a, proj };
  }
  let pts = best.proj.slice(0, -1);
  // normalize to 0..1000 box, centered, aspect kept
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const s = 1000 / Math.max(maxX - minX, maxY - minY);
  const ox = (1000 - (maxX - minX) * s) / 2, oy = (1000 - (maxY - minY) * s) / 2;
  pts = pts.map(([x, y]) => [(x - minX) * s + ox, (y - minY) * s + oy]);
  // simplify to a modest point count
  let eps = 1, simp = pts;
  // split the closed ring at its farthest point from the start so RDP has distinct endpoints
  let far = 0, fd = -1;
  pts.forEach(([x, y], i) => { const d = Math.hypot(x - pts[0][0], y - pts[0][1]); if (d > fd) { fd = d; far = i; } });
  const simplifyRing = (e) => rdp(pts.slice(0, far + 1), e).slice(0, -1).concat(rdp(pts.slice(far).concat([pts[0]]), e).slice(0, -1));
  while ((simp = simplifyRing(eps)).length > 200) eps *= 1.2;
  simp = simp.map(([x, y]) => [Math.round(x), Math.round(y)]);
  const id = label.toLowerCase().replace(/[^a-z]+/g, '-');
  out.push({ id, name: label, kind, pts: simp.flat() });
  console.log(label.padEnd(16), kind.padEnd(8), simp.length, 'pts');
}
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(out));
console.log('wrote', out.length, 'shapes,', JSON.stringify(out).length, 'bytes');
