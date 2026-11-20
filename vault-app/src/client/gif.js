// A small animated GIF encoder (GIF89a, LZW), written for VAULT.
// One 256-colour palette is built for the whole clip by median cut over sampled pixels,
// so dark boards keep their tones; each pixel then maps to its nearest palette colour.
const GIF = (() => {
  function buildPalette(frames) {
    const samples = [];
    const step = Math.max(1, Math.floor(frames.reduce((n, f) => n + f.rgba.length / 4, 0) / 60000));
    let k = 0;
    for (const f of frames) for (let i = 0; i < f.rgba.length; i += 4) if (k++ % step === 0) samples.push([f.rgba[i], f.rgba[i + 1], f.rgba[i + 2]]);
    let boxes = [samples];
    while (boxes.length < 256) {
      // split the box with the widest channel range
      let bi = -1, best = -1, ch = 0;
      boxes.forEach((bx, i) => {
        if (bx.length < 2) return;
        for (let c = 0; c < 3; c++) { let lo = 255, hi = 0; for (const p of bx) { if (p[c] < lo) lo = p[c]; if (p[c] > hi) hi = p[c]; } if (hi - lo > best) { best = hi - lo; bi = i; ch = c; } }
      });
      if (bi < 0 || best <= 0) break;
      const bx = boxes[bi].sort((p, q) => p[ch] - q[ch]), mid = bx.length >> 1;
      boxes.splice(bi, 1, bx.slice(0, mid), bx.slice(mid));
    }
    const pal = boxes.filter(bx => bx.length).map(bx => { const s = [0, 0, 0]; for (const p of bx) { s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; } return s.map(v => Math.round(v / bx.length)); });
    while (pal.length < 256) pal.push([0, 0, 0]);
    return pal;
  }
  function mapper(pal) {
    const cache = new Int16Array(32768).fill(-1);
    return (r, g, b) => {
      const key = (r >> 3) << 10 | (g >> 3) << 5 | (b >> 3);
      let idx = cache[key];
      if (idx < 0) { let bd = 1e9; for (let i = 0; i < pal.length; i++) { const dr = pal[i][0] - r, dg = pal[i][1] - g, db = pal[i][2] - b, d = dr * dr * 2 + dg * dg * 4 + db * db * 3; if (d < bd) { bd = d; idx = i; } } cache[key] = idx; }
      return idx;
    };
  }
  function indexFrame(rgba, near) {
    const n = rgba.length / 4, out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = near(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
    return out;
  }

  // LZW with 8-bit pixels: codes start at 9 bits and grow to 12, then the table is cleared.
  function lzw(px) {
    const MIN = 8, CLEAR = 1 << MIN, EOI = CLEAR + 1, out = [];
    let size = MIN + 1, next = EOI + 1, acc = 0, bits = 0;
    const dict = new Map();
    const emit = c => { acc |= c << bits; bits += size; while (bits >= 8) { out.push(acc & 255); acc >>>= 8; bits -= 8; } };
    emit(CLEAR);
    let prefix = px[0];
    for (let i = 1; i < px.length; i++) {
      const k = px[i], key = prefix * 256 + k, hit = dict.get(key);
      if (hit !== undefined) { prefix = hit; continue; }
      emit(prefix);
      if (next === 4096) { emit(CLEAR); dict.clear(); size = MIN + 1; next = EOI + 1; }
      else { if (next >= (1 << size)) size++; dict.set(key, next++); }
      prefix = k;
    }
    emit(prefix); emit(EOI);
    if (bits > 0) out.push(acc & 255);
    return out;
  }

  // frames: [{ rgba: Uint8ClampedArray, delay: ms }], all w x h. Returns a Uint8Array.
  function encode(frames, w, h) {
    const palette = buildPalette(frames), near = mapper(palette), b = [];
    const u16 = v => b.push(v & 255, (v >> 8) & 255);
    const str = s => { for (const ch of s) b.push(ch.charCodeAt(0)); };
    str('GIF89a'); u16(w); u16(h); b.push(0xF7, 0, 0);
    for (const [r, g, bl] of palette) b.push(r, g, bl);
    b.push(0x21, 0xFF, 11); str('NETSCAPE2.0'); b.push(3, 1); u16(0); b.push(0); // loop forever
    for (const f of frames) {
      b.push(0x21, 0xF9, 4, 0x04); u16(Math.max(2, Math.round(f.delay / 10))); b.push(0, 0); // keep previous, delay in 1/100 s
      b.push(0x2C); u16(0); u16(0); u16(w); u16(h); b.push(0);
      b.push(8);
      const data = lzw(indexFrame(f.rgba, near));
      for (let i = 0; i < data.length; i += 255) { const chunk = data.slice(i, i + 255); b.push(chunk.length, ...chunk); }
      b.push(0);
    }
    b.push(0x3B);
    return new Uint8Array(b);
  }
  return { encode };
})();
export { GIF };
