// Checks that src/styles/theme-bnc.css changes ONLY colors (no layout / position / size).
// Usage: node scripts/check-theme-colors-only.mjs   (or: npm run check:theme)
// Exit code 1 and a list of offending declarations if anything else is found.
import fs from 'node:fs';

const FILE = new URL('../src/styles/theme-bnc.css', import.meta.url);

// Properties that only affect painting, never the box model or the position of elements.
const ALLOWED = new Set([
  'color', 'background', 'background-color', 'background-image',
  'border-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'outline-color', 'box-shadow', 'text-shadow', 'accent-color', 'caret-color', 'fill', 'stroke',
  'filter',
]);
// Custom properties allowed: the theme's own tokens and the color variables of global.css.
const ALLOWED_VARS = /^--(bnc-[a-z0-9-]+|green|red|ink|bg|card|muted|line|surface|soft)$/;
// `background` shorthand values must not carry size / position / repeat parts.
const BG_FORBIDDEN = /\b(\d+(\.\d+)?(px|em|rem|%)\s*\/|no-repeat|repeat(-x|-y)?|space|round|cover|contain|fixed|local|scroll|top|bottom|left|right|center)\b/;

const css = fs.readFileSync(FILE, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const problems = [];
let rules = 0;
let decls = 0;
for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const selector = m[1].trim();
  if (selector.startsWith('@')) problems.push(`règle @ interdite : ${selector}`);
  rules++;
  for (const raw of m[2].split(';')) {
    const d = raw.trim();
    if (!d) continue;
    decls++;
    const i = d.indexOf(':');
    const prop = d.slice(0, i).trim().toLowerCase();
    const value = d.slice(i + 1).trim();
    const ok = prop.startsWith('--') ? ALLOWED_VARS.test(prop) : ALLOWED.has(prop);
    if (!ok) problems.push(`${selector} → ${prop}: ${value}`);
    if (prop === 'background' && BG_FORBIDDEN.test(value.replace(/linear-gradient\([^)]*\)|radial-gradient\(.*\)|color-mix\([^)]*\)/g, ''))) {
      problems.push(`${selector} → background avec taille/position : ${value}`);
    }
    if (prop === 'filter' && !/^(none|drop-shadow\(.*\))$/.test(value)) problems.push(`${selector} → filter non pictural : ${value}`);
  }
}

if (problems.length) {
  console.error(`✗ ${problems.length} déclaration(s) hors couleur dans theme-bnc.css :`);
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log(`✓ theme-bnc.css : ${rules} règles, ${decls} déclarations, toutes de couleur (aucune modification de mise en page).`);
