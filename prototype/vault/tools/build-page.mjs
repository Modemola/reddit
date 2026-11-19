// Inlines the engine and the house vaults into the page template.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const html = readFileSync('src/vault.html', 'utf8')
  .replace('/*ENGINE*/', readFileSync('src/engine.js', 'utf8'))
  .replace('/*LEVELS*/', readFileSync('src/levels.js', 'utf8'));
mkdirSync('build', { recursive: true });
writeFileSync('build/vault.html', html);
console.log('build/vault.html', html.length, 'bytes');
