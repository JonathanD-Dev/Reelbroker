import { Resvg } from '@resvg/resvg-js';
import fs from 'fs';
import path from 'path';

const OUT = '/workshop/docs/mockups/rating';
fs.mkdirSync(OUT, { recursive: true });
const FD = path.resolve('node_modules/@expo-google-fonts/inter') + '/';
const FONTS = ['400Regular/Inter_400Regular', '600SemiBold/Inter_600SemiBold', '700Bold/Inter_700Bold', '800ExtraBold/Inter_800ExtraBold'].map((f) => FD + f + '.ttf');
const GREEN = '#2e9e4f', RED = '#d33a3a', MUTED = '#9aa0aa', BG = '#0b0d10', CARD = '#171a20', LINE = '#262a33';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const T = (x, y, s, { size = 14, w = 400, fill = '#fff', anchor = 'start' } = {}) =>
  `<text x="${x}" y="${y}" font-family="Inter" font-size="${size}" font-weight="${w}" fill="${fill}" text-anchor="${anchor}">${esc(s)}</text>`;

const OPTIONS = [
  {
    key: 'A', title: 'Tendance', sub: 'Vocabulaire de marché : vue haussière / baissière',
    like: { label: 'Haussier', d: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>' },
    dislike: { label: 'Baissier', d: '<path d="M3 7l6 6 4-4 8 8"/><path d="M15 17h6v-6"/>' },
  },
  {
    key: 'B', title: 'Chevrons', sub: 'Vote pour / contre, sobre et compact',
    like: { label: 'Pour', d: '<path d="M7 11l5-5 5 5"/><path d="M7 18l5-5 5 5"/>' },
    dislike: { label: 'Contre', d: '<path d="M7 6l5 5 5-5"/><path d="M7 13l5 5 5-5"/>' },
  },
  {
    key: 'C', title: 'Plus / moins', sub: 'Neutre, lisible, sans connotation',
    like: { label: 'J’aime', d: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>' },
    dislike: { label: 'Je n’aime pas', d: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>' },
  },
  {
    key: 'D', title: 'Retenu / écarté', sub: 'Langage d’analyste : coche / croix',
    like: { label: 'Retenu', d: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.8 2.8L16 9.5"/>' },
    dislike: { label: 'Écarté', d: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>' },
  },
];

const icon = (x, y, s, d, color = '#fff', sw = 2) =>
  `<g transform="translate(${x} ${y}) scale(${s / 24})" fill="none" stroke="${color}" stroke-width="${(sw * 24) / s * (s / 24)}" stroke-linecap="round" stroke-linejoin="round">${d}</g>`;
// rail button: 44px circle; active = filled color, glyph white
function railBtn(cx, cy, g, state, label) {
  const on = state !== 'off';
  const col = state === 'like' ? GREEN : state === 'dislike' ? RED : null;
  return (on ? `<circle cx="${cx}" cy="${cy}" r="20" fill="${col}"/>` : `<circle cx="${cx}" cy="${cy}" r="20" fill="#000" opacity="0.25"/>`) +
    icon(cx - 13, cy - 13, 26, g.d, '#fff') + T(cx, cy + 36, label, { size: 11, w: 600, anchor: 'middle' });
}
const pill = (x, y, g, color, label) => {
  const w = label.length * 6.6 + 34;
  return `<rect x="${x}" y="${y}" width="${w}" height="22" rx="11" fill="${color}" opacity="0.18"/>` +
    icon(x + 7, y + 4, 14, g.d, color, 2.2) + T(x + 26, y + 15.5, label, { size: 11, w: 700, fill: color });
};

const ROW_H = 230, W = 1240, H = 120 + OPTIONS.length * ROW_H + 30;
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="reel" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="#3f6400"/><stop offset="1" stop-color="#0b0d10"/></linearGradient></defs>`;
svg += `<rect width="${W}" height="${H}" fill="#e9ebef"/>` + T(40, 56, 'Like / dislike : 4 propositions d’icônes', { size: 30, w: 800, fill: '#111' }) +
  T(40, 86, 'Au repos · Like actif · Dislike actif · Dans le rail d’une carte · Note sur la ligne des Sauvegardés', { size: 15, fill: '#444' });
['Au repos', 'Like actif', 'Dislike actif', 'Rail de la carte', 'Ligne des Sauvegardés'].forEach((h, i) =>
  (svg += T([330, 470, 610, 790, 1010][i], 116, h, { size: 12, w: 700, fill: '#666', anchor: 'middle' })));

OPTIONS.forEach((o, i) => {
  const y = 130 + i * ROW_H;
  svg += `<rect x="30" y="${y}" width="${W - 60}" height="${ROW_H - 14}" rx="18" fill="#fff"/>`;
  svg += `<circle cx="66" cy="${y + 40}" r="18" fill="#111"/>` + T(66, y + 46, o.key, { size: 16, w: 800, anchor: 'middle' });
  svg += T(96, y + 46, o.title, { size: 22, w: 800, fill: '#111' });
  // wrap the subtitle to the left column (~200 px)
  const words = o.sub.split(' ');
  const lines = [''];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if ((cur + ' ' + w).trim().length > 30) lines.push(w);
    else lines[lines.length - 1] = (cur + ' ' + w).trim();
  }
  lines.forEach((l, k) => (svg += T(56, y + 76 + k * 18, l, { size: 13, fill: '#555' })));
  svg += T(56, y + 86 + lines.length * 18, `« ${o.like.label} » / « ${o.dislike.label} »`, { size: 13, w: 600, fill: '#111' });
  // dark tiles for states
  const tile = (cx, content) => `<rect x="${cx - 62}" y="${y + 20}" width="124" height="176" rx="14" fill="${BG}"/>` + content;
  svg += tile(330, railBtn(330, y + 70, o.like, 'off', o.like.label) + railBtn(330, y + 140, o.dislike, 'off', o.dislike.label));
  svg += tile(470, railBtn(470, y + 70, o.like, 'like', o.like.label) + railBtn(470, y + 140, o.dislike, 'off', o.dislike.label));
  svg += tile(610, railBtn(610, y + 70, o.like, 'off', o.like.label) + railBtn(610, y + 140, o.dislike, 'dislike', o.dislike.label));
  // rail preview on a reel crop
  const rx = 700, rw = 180;
  svg += `<clipPath id="cp${i}"><rect x="${rx}" y="${y + 20}" width="${rw}" height="176" rx="14"/></clipPath><g clip-path="url(#cp${i})"><rect x="${rx}" y="${y + 20}" width="${rw}" height="176" fill="url(#reel)"/>`;
  svg += T(rx + 14, y + 52, 'Buy', { size: 22, w: 800 }) + T(rx + 14, y + 74, 'Pourquoi :', { size: 11, w: 700 }) + T(rx + 14, y + 90, '• Demande soutenue…', { size: 10 });
  const cx = rx + rw - 38;
  svg += `<path d="M${cx - 9} ${y + 32} h18 v22 l-9 -7 l-9 7 Z" fill="#fff"/>` + T(cx, y + 68, 'Favori', { size: 9, w: 600, anchor: 'middle' });
  svg += `<circle cx="${cx}" cy="${y + 92}" r="15" fill="${GREEN}"/>` + icon(cx - 10, y + 82, 20, o.like.d) + T(cx, y + 119, o.like.label, { size: 9, w: 600, anchor: 'middle' });
  svg += icon(cx - 10, y + 132, 20, o.dislike.d) + T(cx, y + 165, o.dislike.label, { size: 9, w: 600, anchor: 'middle' });
  svg += [0, 6, 12].map((d) => `<circle cx="${cx}" cy="${y + 176 + d}" r="1.8" fill="#fff"/>`).join('') + `</g>`;
  // saved row
  const sx = 900, sw2 = 300;
  svg += `<rect x="${sx}" y="${y + 20}" width="${sw2}" height="176" rx="14" fill="${BG}"/>`;
  const row = (ry, t, n, price, pct, pc, note) => {
    let r = `<circle cx="${sx + 30}" cy="${ry + 26}" r="16" fill="${t === 'NVDA' ? '#76b900' : '#cc0000'}"/>` + T(sx + 30, ry + 31, n.slice(0, 2).toUpperCase(), { size: 12, w: 700, anchor: 'middle' });
    r += T(sx + 56, ry + 22, t, { size: 13, w: 700 }) + T(sx + 56, ry + 38, n, { size: 10, fill: MUTED });
    r += T(sx + sw2 - 14, ry + 22, price, { size: 12, w: 600, anchor: 'end' }) + `<rect x="${sx + sw2 - 64}" y="${ry + 29}" width="50" height="17" rx="5" fill="${pc}"/>` + T(sx + sw2 - 39, ry + 41.5, pct, { size: 9.5, w: 700, anchor: 'middle' });
    if (note) r += pill(sx + 56, ry + 48, note.g, note.c, note.l);
    return r + `<line x1="${sx + 56}" y1="${ry + 80}" x2="${sx + sw2}" y2="${ry + 80}" stroke="${LINE}"/>`;
  };
  svg += row(y + 24, 'NVDA', 'NVIDIA', '118,50 $', '+30,0 %', GREEN, { g: o.like, c: '#5fd384', l: o.like.label });
  svg += row(y + 108, 'TSLA', 'Tesla', '250,00 $', '−15,0 %', RED, { g: o.dislike, c: '#ff7b7b', l: o.dislike.label });
});
svg += '</svg>';
const r = new Resvg(svg, { fitTo: { mode: 'width', value: W }, font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'Inter' } });
fs.writeFileSync(path.join(OUT, 'comparatif-like-dislike.png'), r.render().asPng());
console.log('ok');
