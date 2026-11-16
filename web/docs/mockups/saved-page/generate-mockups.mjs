import { Resvg } from '@resvg/resvg-js';
import fs from 'fs';
import path from 'path';

const OUT = '/workshop/docs/mockups/saved-page';
fs.mkdirSync(OUT, { recursive: true });
const FD = 'node_modules/@expo-google-fonts/inter/';
const FONTS = ['400Regular/Inter_400Regular', '600SemiBold/Inter_600SemiBold', '700Bold/Inter_700Bold', '800ExtraBold/Inter_800ExtraBold']
  .map((f) => path.resolve(FD + f + '.ttf'));

const W = 390, H = 844;
const BG = '#0b0d10', CARD = '#171a20', LINE = '#262a33', MUTED = '#9aa0aa', GREEN = '#2e9e4f', RED = '#d33a3a';

// ---------- data (same mock products as the app) ----------
const P = [
  { t: 'NVDA', n: 'NVIDIA', c: '#76b900', price: 118.5, ch: 30.0, trend: 'up', med: 0.15, opt: 0.4, pes: -0.2 },
  { t: 'TSLA', n: 'Tesla', c: '#cc0000', price: 250, ch: -15.0, trend: 'down', med: 0.08, opt: 0.6, pes: -0.35 },
  { t: 'MSFT', n: 'Microsoft', c: '#00a4ef', price: 415, ch: 30.0, trend: 'up', med: 0.12, opt: 0.25, pes: -0.1 },
  { t: 'KO', n: 'Coca-Cola', c: '#f40009', price: 63, ch: 0.4, trend: 'flat', med: 0.06, opt: 0.12, pes: -0.07 },
  { t: 'UBER', n: 'Uber', c: '#276ef1', price: 70, ch: 30.0, trend: 'up', med: 0.15, opt: 0.45, pes: -0.25 },
  { t: 'AMD', n: 'AMD', c: '#ed1c24', price: 160, ch: -15.0, trend: 'down', med: 0.16, opt: 0.5, pes: -0.28 },
];

// ---------- helpers ----------
const fmt = (v, d = 2) => v.toFixed(d).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f');
const usd = (v, d = 2) => fmt(v, d) + '\u00a0$';
const pct = (v) => (v > 0 ? '+' : v < 0 ? '\u2212' : '') + fmt(Math.abs(v), 1) + '\u00a0%';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const T = (x, y, s, { size = 14, w = 400, fill = '#fff', anchor = 'start', op = 1 } = {}) =>
  `<text x="${x}" y="${y}" font-family="Inter" font-size="${size}" font-weight="${w}" fill="${fill}" text-anchor="${anchor}" opacity="${op}">${esc(s)}</text>`;

function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function series(p, n = 12) {
  const r = rng([...p.t].reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
  const drift = p.trend === 'up' ? 0.3 : p.trend === 'down' ? -0.15 : 0;
  return Array.from({ length: n }, (_, i) => (i === 0 || i === n - 1 ? 0 : (r() - 0.5) * 0.12) + 1 + drift * i / (n - 1));
}
function spark(vals, x, y, w, h, color, sw = 2, area = false) {
  const mn = Math.min(...vals), mx = Math.max(...vals), span = mx - mn || 1;
  const pts = vals.map((v, i) => [x + (i * w) / (vals.length - 1), y + h - ((v - mn) / span) * h]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const fillPath = area ? `<path d="${d} L${x + w} ${y + h} L${x} ${y + h} Z" fill="${color}" opacity="0.18"/>` : '';
  return fillPath + `<path d="${d}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"/>`;
}
const trendColor = (p) => (p.ch >= 2 ? GREEN : p.ch <= -2 ? RED : MUTED);
const logo = (cx, cy, r, p) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${p.c}"/>` + T(cx, cy + r * 0.36, p.n.slice(0, 2).toUpperCase(), { size: r * 0.95, w: 700, anchor: 'middle' });
const bookmark = (x, y, s, fill = '#fff', filled = true) =>
  `<path d="M${x} ${y} h${s} v${s * 1.3} l${-s / 2} ${-s * 0.38} l${-s / 2} ${s * 0.38} Z" fill="${filled ? fill : 'none'}" stroke="${fill}" stroke-width="2" stroke-linejoin="round"/>`;
const cart = (x, y, s, col = '#fff') =>
  `<g fill="none" stroke="${col}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M${x} ${y} h${s * 0.18} l${s * 0.14} ${s * 0.6} h${s * 0.6} l${s * 0.1} ${-s * 0.42} h${-s * 0.76}"/><circle cx="${x + s * 0.4}" cy="${y + s * 0.8}" r="${s * 0.07}"/><circle cx="${x + s * 0.8}" cy="${y + s * 0.8}" r="${s * 0.07}"/></g>`;
const dots = (x, y, col = '#fff') => [0, 7, 14].map((d) => `<circle cx="${x}" cy="${y + d}" r="2" fill="${col}"/>`).join('');
const chevron = (x, y, col = MUTED) => `<path d="M${x} ${y - 5} l5 5 l-5 5" fill="none" stroke="${col}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;

function statusBar() {
  return T(24, 30, '9:41', { size: 15, w: 600 }) +
    `<rect x="${W - 58}" y="19" width="26" height="13" rx="3" fill="none" stroke="#fff" stroke-width="1.5"/><rect x="${W - 56}" y="21" width="18" height="9" rx="1.5" fill="#fff"/>` +
    [0, 1, 2, 3].map((i) => `<rect x="${W - 92 + i * 6}" y="${30 - (i + 1) * 3}" width="4" height="${(i + 1) * 3}" rx="1" fill="#fff"/>`).join('');
}
// Bottom tab bar = entry point to the new page (same for all options so they compare on the page itself).
function tabBar(active = 'saved') {
  const y = H - 84;
  const item = (cx, label, icon, on) =>
    icon(cx, y + 18, on ? '#fff' : MUTED) + T(cx, y + 56, label, { size: 11, w: on ? 600 : 400, fill: on ? '#fff' : MUTED, anchor: 'middle' });
  const homeIcon = (cx, yy, c) => `<path d="M${cx - 11} ${yy + 10} l11 -10 l11 10 v12 h-7 v-7 h-8 v7 h-7 Z" fill="${c === '#fff' ? c : 'none'}" stroke="${c}" stroke-width="2" stroke-linejoin="round"/>`;
  const bmIcon = (cx, yy, c) => bookmark(cx - 9, yy, 18, c, c === '#fff');
  return `<rect x="0" y="${y}" width="${W}" height="84" fill="#0b0d10"/><line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${LINE}"/>` +
    item(W * 0.3, 'Fil', homeIcon, active === 'feed') + item(W * 0.7, 'Sauvegardés', bmIcon, active === 'saved') +
    `<rect x="${W / 2 - 67}" y="${H - 10}" width="134" height="5" rx="2.5" fill="#fff" opacity="0.6"/>`;
}
const chip = (x, y, label, on) => {
  const w = label.length * 7.4 + 26;
  return { w, svg: `<rect x="${x}" y="${y}" width="${w}" height="32" rx="16" fill="${on ? '#fff' : CARD}" stroke="${on ? '#fff' : LINE}"/>` + T(x + w / 2, y + 21, label, { size: 13, w: 600, fill: on ? '#111' : '#fff', anchor: 'middle' }) };
};
function chips(x, y, labels, activeIdx = 0) {
  let out = '', cx = x;
  labels.forEach((l, i) => { const c = chip(cx, y, l, i === activeIdx); out += c.svg; cx += c.w + 8; });
  return out;
}
const phone = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs}</defs><rect width="${W}" height="${H}" fill="${BG}"/>${body}</svg>`;
let defs = '';
P.forEach((p) => { defs += `<linearGradient id="g${p.t}" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="${p.c}"/><stop offset="1" stop-color="#0b0d10"/></linearGradient>`; });

// ---------- Option A: watchlist list ----------
function optionA() {
  let b = statusBar();
  b += T(20, 84, 'Sauvegardés', { size: 28, w: 800 }) + T(20, 108, '6 produits', { size: 14, fill: MUTED });
  // search
  b += `<rect x="20" y="124" width="${W - 40}" height="40" rx="12" fill="${CARD}"/><circle cx="42" cy="143" r="6" fill="none" stroke="${MUTED}" stroke-width="2"/><line x1="46.5" y1="147.5" x2="51" y2="152" stroke="${MUTED}" stroke-width="2" stroke-linecap="round"/>` +
    T(60, 149, 'Rechercher un produit', { size: 14, fill: MUTED });
  b += chips(20, 176, ['Récents', 'Variation', 'Nom'], 0);
  let y = 224;
  P.forEach((p, i) => {
    const rowH = 76;
    if (i === 2) {
      // swipe-to-remove demo row (shifted left, red action revealed)
      b += `<rect x="${W - 110}" y="${y}" width="110" height="${rowH}" fill="${RED}"/>` + T(W - 55, y + 46, 'Retirer', { size: 14, w: 600, anchor: 'middle' });
      b += `<g transform="translate(-90 0)">`;
    }
    b += `<rect x="0" y="${y}" width="${W}" height="${rowH}" fill="${BG}"/>`;
    b += logo(42, y + rowH / 2, 20, p);
    b += T(74, y + 33, p.t, { size: 16, w: 700 }) + T(74, y + 53, p.n, { size: 13, fill: MUTED });
    b += spark(series(p), 176, y + 22, 70, 32, trendColor(p), 2);
    b += T(W - 20, y + 33, usd(p.price), { size: 15, w: 600, anchor: 'end' });
    const pc = pct(p.ch), pw = pc.length * 7.3 + 14, col = trendColor(p);
    b += `<rect x="${W - 20 - pw}" y="${y + 42}" width="${pw}" height="22" rx="6" fill="${col}"/>` + T(W - 20 - pw / 2, y + 57, pc, { size: 12, w: 700, anchor: 'middle' });
    b += `<line x1="74" y1="${y + rowH}" x2="${W}" y2="${y + rowH}" stroke="${LINE}"/>`;
    if (i === 2) b += `</g>`;
    y += rowH;
  });
  b += T(W / 2, y + 24, 'Toucher : ouvrir dans le fil · Glisser à gauche : retirer', { size: 11, fill: MUTED, anchor: 'middle' });
  b += tabBar();
  return phone(b);
}

// ---------- Option B: grid of reel thumbnails (TikTok "Favoris") ----------
function optionB() {
  let b = statusBar();
  b += T(W / 2, 74, 'Sauvegardés', { size: 18, w: 700, anchor: 'middle' });
  // segmented tabs
  const tabs = ['Tous · 6', 'En hausse · 3', 'En baisse · 2'];
  tabs.forEach((l, i) => {
    const cx = 65 + i * 130;
    b += T(cx, 110, l, { size: 14, w: i === 0 ? 700 : 400, fill: i === 0 ? '#fff' : MUTED, anchor: 'middle' });
    if (i === 0) b += `<rect x="${cx - 40}" y="120" width="80" height="3" rx="1.5" fill="#fff"/>`;
  });
  b += `<line x1="0" y1="123" x2="${W}" y2="123" stroke="${LINE}"/>`;
  const gap = 6, tw = (W - gap * 3) / 2, th = tw * 1.42;
  P.forEach((p, i) => {
    const x = gap + (i % 2) * (tw + gap), y = 132 + Math.floor(i / 2) * (th + gap);
    if (y > H - 84) return;
    b += `<g><clipPath id="c${i}"><rect x="${x}" y="${y}" width="${tw}" height="${th}" rx="10"/></clipPath><g clip-path="url(#c${i})">`;
    b += `<rect x="${x}" y="${y}" width="${tw}" height="${th}" fill="url(#g${p.t})"/>`;
    b += T(x + 12, y + 34, 'Buy', { size: 24, w: 800 });
    b += spark(series(p), x + 12, y + 62, tw - 24, 50, '#fff', 2.5, true);
    b += `<rect x="${x}" y="${y + th - 56}" width="${tw}" height="56" fill="#000" opacity="0.35"/>`;
    b += logo(x + 24, y + th - 28, 13, p) + T(x + 44, y + th - 31, p.t, { size: 14, w: 700 }) +
      T(x + 44, y + th - 15, pct(p.ch), { size: 12, w: 600, fill: p.ch >= 2 ? '#7ee39a' : p.ch <= -2 ? '#ff8a8a' : '#ddd' });
    b += bookmark(x + tw - 24, y + 12, 12);
    b += `</g></g>`;
  });
  b += tabBar();
  return phone(b);
}

// ---------- Option C: simulated basket dashboard ----------
function optionC() {
  let b = statusBar();
  b += T(20, 84, 'Sauvegardés', { size: 28, w: 800 });
  // summary card
  const sel = P.slice(0, 4);
  const qty = [10, 5, 2, 20];
  const start = sel.reduce((a, p, i) => a + p.price * qty[i], 0);
  const med = sel.reduce((a, p, i) => a + p.price * qty[i] * (1 + p.med), 0);
  b += `<rect x="16" y="104" width="${W - 32}" height="210" rx="18" fill="${CARD}"/>`;
  b += T(32, 132, 'Si j\u2019achète ma sélection', { size: 13, fill: MUTED });
  b += T(32, 164, usd(start, 0), { size: 28, w: 800 });
  b += T(32, 186, 'Projection médiane à 12 mois : ' + usd(med, 0) + '  (' + pct((med / start - 1) * 100) + ')', { size: 12, w: 600, fill: '#7ee39a' });
  // 3-curve projection
  const cx = 32, cy = 202, cw = W - 64, ch = 80;
  const curves = [['opt', GREEN], ['med', '#e8e8e8'], ['pes', RED]];
  const mo = (r) => Array.from({ length: 13 }, (_, m) => sel.reduce((a, p, i) => a + p.price * qty[i] * Math.pow(1 + p[r] * 1, m / 12), 0));
  const all = curves.flatMap(([r]) => mo(r)), mn = Math.min(...all), mx = Math.max(...all);
  curves.forEach(([r, col]) => {
    const v = mo(r);
    const d = v.map((val, m) => (m ? 'L' : 'M') + (cx + (m * cw) / 12).toFixed(1) + ' ' + (cy + ch - ((val - mn) / (mx - mn)) * ch).toFixed(1)).join(' ');
    b += `<path d="${d}" fill="none" stroke="${col}" stroke-width="2.5" stroke-linecap="round"/>`;
  });
  b += `<circle cx="${cx}" cy="${cy + ch - ((start - mn) / (mx - mn)) * ch}" r="4" fill="#fff"/>`;
  b += T(cx, cy + ch + 20, '● Optimiste', { size: 11, fill: GREEN }) + T(cx + 100, cy + ch + 20, '● Médian', { size: 11, fill: '#e8e8e8' }) + T(cx + 185, cy + ch + 20, '● Pessimiste', { size: 11, fill: RED });
  // list with quantity steppers
  b += T(20, 352, 'Mes produits (6)', { size: 16, w: 700 }) + T(W - 20, 352, 'Trier', { size: 13, w: 600, fill: MUTED, anchor: 'end' });
  let y = 366;
  P.slice(0, 5).forEach((p, i) => {
    const on = i < 4;
    b += `<rect x="16" y="${y}" width="${W - 32}" height="66" rx="14" fill="${CARD}"/>`;
    // checkbox
    b += `<rect x="28" y="${y + 23}" width="20" height="20" rx="6" fill="${on ? '#fff' : 'none'}" stroke="${on ? '#fff' : MUTED}" stroke-width="2"/>` +
      (on ? `<path d="M32 ${y + 33} l4 4 l8 -8" fill="none" stroke="#111" stroke-width="2.5" stroke-linecap="round"/>` : '');
    b += logo(76, y + 33, 17, p);
    b += T(102, y + 29, p.t, { size: 15, w: 700 }) + T(102, y + 48, usd(p.price) + '  ' + pct(p.ch), { size: 12, fill: trendColor(p) === MUTED ? MUTED : trendColor(p) });
    // stepper
    const sx = W - 150;
    b += `<rect x="${sx}" y="${y + 17}" width="96" height="32" rx="16" fill="none" stroke="${LINE}" stroke-width="1.5"/>` +
      T(sx + 18, y + 38, '\u2212', { size: 18, w: 600, anchor: 'middle', fill: MUTED }) + T(sx + 48, y + 38, String(on ? qty[i] : 0), { size: 14, w: 700, anchor: 'middle' }) + T(sx + 78, y + 38, '+', { size: 18, w: 600, anchor: 'middle', fill: MUTED });
    b += cart(W - 44, y + 22, 22);
    y += 74;
  });
  b += tabBar();
  return phone(b);
}

// ---------- Context: feed with the new tab bar (entry point) ----------
function feedContext() {
  const p = P[0];
  let b = `<rect width="${W}" height="${H}" fill="url(#g${p.t})"/>` + statusBar();
  b += T(24, 300, 'Buy', { size: 48, w: 800 }) + T(24, 344, 'Pourquoi :', { size: 18, w: 700 });
  ["Demande soutenue pour les puces d'IA", 'Marges élevées', 'Valorisation à surveiller'].forEach((r, i) => (b += T(24, 378 + i * 30, '•  ' + r, { size: 15 })));
  // rail
  const rx = W - 40;
  b += bookmark(rx - 12, 520, 24) + T(rx, 566, 'Sauvé', { size: 11, w: 600, anchor: 'middle' });
  b += dots(rx, 600) + T(rx, 636, 'Plus', { size: 11, w: 600, anchor: 'middle' });
  // toast
  b += `<rect x="${W / 2 - 130}" y="120" width="260" height="44" rx="22" fill="#fff"/>` + T(W / 2, 148, 'Ajouté aux sauvegardés · Voir', { size: 13, w: 600, fill: '#111', anchor: 'middle' });
  b += logo(44, 690, 20, p) + T(74, 688, p.t, { size: 17, w: 700 }) + T(74, 708, p.n, { size: 13, op: 0.8 }) + T(24, 740, 'See more data', { size: 14, w: 600 });
  b += tabBar('feed');
  return phone(b);
}

// ---------- write PNGs ----------
function png(svg, file, width) {
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'Inter' } });
  fs.writeFileSync(path.join(OUT, file), r.render().asPng());
}
const screens = { A: optionA(), B: optionB(), C: optionC(), entry: feedContext() };
png(screens.A, 'option-a-liste.png', W * 2);
png(screens.B, 'option-b-grille.png', W * 2);
png(screens.C, 'option-c-panier.png', W * 2);
png(screens.entry, 'acces-depuis-le-fil.png', W * 2);

// comparison sheet
const SW = 3 * W + 4 * 40, SH = H + 170;
const inner = (s) => s.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
const cols = [
  ['A', 'Liste « watchlist »', 'Compacte, rapide à parcourir, triable'],
  ['B', 'Grille de vignettes', 'Façon onglet Favoris de TikTok'],
  ['C', 'Panier simulé', 'Projection groupée + quantités'],
];
let sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${SW}" height="${SH}"><defs>${defs}</defs><rect width="${SW}" height="${SH}" fill="#e9ebef"/>`;
sheet += T(40, 56, 'Page « Sauvegardés » : 3 propositions', { size: 30, w: 800, fill: '#111' });
[screens.A, screens.B, screens.C].forEach((s, i) => {
  const x = 40 + i * (W + 40), y = 90;
  sheet += `<rect x="${x - 6}" y="${y - 6}" width="${W + 12}" height="${H + 12}" rx="40" fill="#111"/>`;
  sheet += `<svg x="${x}" y="${y}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><clipPath id="sc${i}"><rect width="${W}" height="${H}" rx="34"/></clipPath><g clip-path="url(#sc${i})">${inner(s)}</g></svg>`;
  sheet += `<circle cx="${x + 18}" cy="${y + H + 44}" r="16" fill="#111"/>` + T(x + 18, y + H + 50, cols[i][0], { size: 16, w: 800, anchor: 'middle' });
  sheet += T(x + 44, y + H + 50, cols[i][1], { size: 20, w: 700, fill: '#111' }) + T(x + 44, y + H + 74, cols[i][2], { size: 14, fill: '#444' });
});
sheet += '</svg>';
png(sheet, 'comparatif.png', SW);
console.log(fs.readdirSync(OUT));
