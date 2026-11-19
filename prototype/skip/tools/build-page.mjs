// Inlines the physics module into the page template.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const physics = readFileSync('src/physics.js', 'utf8');
const html = readFileSync('src/skip.html', 'utf8').replace('/*PHYSICS*/', physics);
mkdirSync('build', { recursive: true });
writeFileSync('build/skip.html', html);
console.log('build/skip.html', html.length, 'bytes');
