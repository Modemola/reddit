// Inlines the engine and the house vaults into the page template.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const html = readFileSync('src/vault.html', 'utf8')
  .replace('/*ENGINE*/', readFileSync('src/engine.js', 'utf8'))
  .replace('/*LEVELS*/', readFileSync('src/levels.js', 'utf8'))
  .replace('/*GIF*/', readFileSync('src/gif.js', 'utf8').replace(/^if \(typeof module.*$/m, ''))
  .replace('/*MUSIC*/', 'const MusicPlayer = (() => {\n' + readFileSync('src/music.js', 'utf8') + '\nreturn MusicPlayer;\n})();');
mkdirSync('build', { recursive: true });
writeFileSync('build/vault.html', html);
console.log('build/vault.html', html.length, 'bytes');
