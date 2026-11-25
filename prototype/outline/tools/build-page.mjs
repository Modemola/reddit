// Inlines shapes.json into the page template.
import { readFileSync, writeFileSync } from 'node:fs';
const shapes = readFileSync('build/shapes.json', 'utf8');
const html = readFileSync('src/outline.html', 'utf8').replace('/*SHAPES*/[]', shapes);
writeFileSync('build/outline.html', html);
console.log('build/outline.html', html.length, 'bytes');
