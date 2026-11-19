// SKIP physics. Pure and deterministic: the same throw on the same lake gives the same result.
// Units: metres, seconds. x = sideways, z = distance out, y = height.
const G = 9.81, SWEET = 20; // best angle of attack is about 20 degrees (Clanet et al., Nature 2004)

function hash(n) { n = Math.sin(n * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); }
function makeLake(day) {
  const r = i => hash(day * 13.37 + i);
  return {
    day,
    wind: { head: (r(1) - 0.5) * 3.2, cross: (r(2) - 0.5) * 1.6 }, // m/s^2-ish nudges
    chop: 0.15 + r(3) * 0.75,                                      // 0 calm .. 1 rough
    length: 62,
  };
}
// deterministic surface roughness at a point
const chopAt = (lake, x, z) => (hash(Math.floor(z * 3) * 7.1 + Math.floor(x * 3) * 3.3 + lake.day) - 0.5) * 2;

// throw: { power 0..1, aim radians, tilt degrees }
function simulate(lake, th) {
  const v0 = 5 + 17 * th.power;
  let x = 0, y = 0.9, z = 1.2, vx = Math.sin(th.aim) * v0, vz = Math.cos(th.aim) * v0, vy = 0.4;
  let tilt = th.tilt + Math.max(0, th.power - 0.8) * 50; // a very hard throw lifts the leading edge
  const spin = 0.4 + 0.6 * th.power;                      // spin keeps the stone steady
  const path = [], skips = [], dt = 1 / 240;
  let t = 0, end = 'sink';
  path.push([t, x, y, z]);
  for (let step = 0; step < 240 * 30; step++) {
    vz += lake.wind.head * dt * 0.5; vx += lake.wind.cross * dt * 0.4; vy -= G * dt;
    x += vx * dt; y += vy * dt; z += vz * dt; t += dt;
    if (step % 4 === 0) path.push([t, x, y, z]);
    if (z >= lake.length) { end = 'shore'; path.push([t, x, Math.max(y, 0), z]); break; }
    if (y > 0) continue;
    // contact with the water
    const speed = Math.hypot(vx, vz), inc = Math.atan2(-vy, speed) * 180 / Math.PI;
    const good = Math.exp(-(((tilt - SWEET) / 7) ** 2));
    if (speed < 2 || inc > 10 + 16 * good || tilt < 4 || tilt > 45) { y = 0; path.push([t, x, 0, z]); end = 'sink'; break; }
    skips.push([x, z, t, good]);
    const keep = 0.83 + 0.1 * good;
    vx *= keep; vz *= keep;
    vy = 0.045 * speed * keep * (0.3 + good) + 0.2 * -vy * good;
    y = 0;
    tilt += chopAt(lake, x, z) * lake.chop * 4 * (1.15 - spin);
    path.push([t, x, 0, z]);
    if (vy < 0.3) { end = 'sink'; break; }
  }
  const dist = Math.hypot(x, z - 1.2);
  return { skips, path, end, dist, n: skips.length };
}
if (typeof module !== 'undefined') module.exports = { makeLake, simulate };
