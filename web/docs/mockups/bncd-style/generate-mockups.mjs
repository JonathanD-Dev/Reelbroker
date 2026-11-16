import { Resvg } from '@resvg/resvg-js';
import fs from 'fs';
import path from 'path';

const OUT = '/workshop/docs/mockups/bncd-style';
fs.mkdirSync(OUT, { recursive: true });
const FD = path.resolve('node_modules/@expo-google-fonts/inter') + '/';
const FONTS = ['400Regular/Inter_400Regular', '600SemiBold/Inter_600SemiBold', '700Bold/Inter_700Bold', '800ExtraBold/Inter_800ExtraBold'].map((f) => FD + f + '.ttf');
const W = 390, H = 844;

// Brand references (approximate, third-party sources): red #E41C23, pale blue #EEF6FB,
// dark grey #444444 (Brandfetch); navy ~#17314B (logotyp.us). No official logo is drawn.
const RED = '#E41C23', NAVY = '#17314B', PALE = '#EEF6FB', GREY = '#444444';

const THEMES = {
  A: {
    key: 'A', title: 'Clair institutionnel', sub: 'Fond blanc, texte marine, rouge réservé aux actions',
    bg: '#FFFFFF', surface: PALE, text: NAVY, muted: '#5B6B7C', line: '#DCE5EE',
    accent: RED, onAccent: '#FFFFFF', up: '#1E7F4F', down: '#B3261E', tabBg: '#FFFFFF', tabOn: RED, tabOff: '#7A8A99',
    feed: 'light', card: 'light',
  },
  B: {
    key: 'B', title: 'Marine immersif', sub: 'Fond marine profond, accents rouges, proche du fil actuel',
    bg: '#0C1C2E', surface: '#16304A', text: '#FFFFFF', muted: '#A9B8C8', line: '#24415E',
    accent: RED, onAccent: '#FFFFFF', up: '#3DD68C', down: '#FF8A80', tabBg: '#0A1726', tabOn: '#FFFFFF', tabOff: '#7F93A8',
    feed: 'navy', card: 'navy',
  },
  C: {
    key: 'C', title: 'Rouge signature', sub: 'Bandeaux rouges francs, grands titres, « Faire. Avancer. »',
    bg: '#FFFFFF', surface: '#F6F7F9', text: '#1B1B1B', muted: GREY, line: '#E6E8EB',
    accent: RED, onAccent: '#FFFFFF', up: '#1E7F4F', down: '#B3261E', tabBg: '#FFFFFF', tabOn: RED, tabOff: '#8A8A8A',
    feed: 'red', card: 'red',
  },
};

// ---------- helpers ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const T = (x, y, s, { size = 14, w = 400, fill = '#000', anchor = 'start', op = 1 } = {}) =>
  `<text x="${x}" y="${y}" font-family="Inter" font-size="${size}" font-weight="${w}" fill="${fill}" text-anchor="${anchor}" opacity="${op}">${esc(s)}</text>`;
const tw = (s, size, w = 400) => s.length * size * (w >= 600 ? 0.58 : 0.53);
const rect = (x, y, w, h, r, fill, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${extra}/>`;
const icon = (x, y, s, d, color, sw = 2, fill = 'none') =>
  `<g transform="translate(${x} ${y}) scale(${s / 24})" fill="${fill}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${d}</g>`;
const G = {
  bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
  up: '<path d="M7 11l5-5 5 5M7 18l5-5 5 5"/>',
  down: '<path d="M7 6l5 5 5-5M7 13l5 5 5-5"/>',
  home: '<path d="M3 11l9-8 9 8v10h-6v-6H9v6H3z"/>',
  sunset: '<path d="M3 18h18M5 21h14"/><path d="M7 18a5 5 0 0 1 10 0"/><path d="M12 8v3M5.6 11.6l1.6 1.6M18.4 11.6l-1.6 1.6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
};
const dots = (cx, y, c) => [0, 7, 14].map((d) => `<circle cx="${cx}" cy="${y + d}" r="2.2" fill="${c}"/>`).join('');
const logo = (cx, cy, r, color, label) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>` + T(cx, cy + r * 0.36, label, { size: r * 0.9, w: 700, fill: '#fff', anchor: 'middle' });
function spark(x, y, w, h, up, col, seed = 3) {
  let s = seed; const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const n = 12, v = Array.from({ length: n }, (_, i) => (up ? i : n - i) + (r() - 0.5) * 3);
  const mn = Math.min(...v), mx = Math.max(...v);
  return `<path d="${v.map((val, i) => `${i ? 'L' : 'M'}${(x + (i * w) / (n - 1)).toFixed(1)} ${(y + h - ((val - mn) / (mx - mn)) * h).toFixed(1)}`).join(' ')}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round"/>`;
}
const brandMark = (x, y, t, onRed = false) =>
  rect(x, y, 44, 20, 4, onRed ? '#FFFFFF' : RED) + T(x + 22, y + 14.5, 'BNCD', { size: 10.5, w: 800, fill: onRed ? RED : '#FFFFFF', anchor: 'middle' });

function statusBar(c) {
  return T(24, 30, '9:41', { size: 15, w: 600, fill: c }) +
    `<rect x="${W - 58}" y="19" width="26" height="13" rx="3" fill="none" stroke="${c}" stroke-width="1.5"/>` + rect(W - 56, 21, 18, 9, 1.5, c) +
    [0, 1, 2, 3].map((i) => rect(W - 92 + i * 6, 30 - (i + 1) * 3, 4, (i + 1) * 3, 1, c)).join('');
}
function tabBar(t, active) {
  const y = H - 84;
  const items = [['feed', 'Fil', G.home], ['saved', 'Sauvegardés', G.bookmark], ['profile', 'Profil', G.sunset]];
  let s = rect(0, y, W, 84, 0, t.tabBg) + `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${t.line}"/>`;
  items.forEach(([k, label, g], i) => {
    const cx = (W * (i * 2 + 1)) / 6, on = k === active, c = on ? t.tabOn : t.tabOff;
    if (k === 'profile') s += `<circle cx="${cx}" cy="${y + 28}" r="13" fill="${on ? RED : t.tabOff}"/>` + icon(cx - 8, y + 20, 16, g, '#fff');
    else s += icon(cx - 11, y + 17, 22, g, c, 2, on ? c : 'none');
    if (on && t.key !== 'B') s += rect(cx - 14, y, 28, 3, 1.5, RED);
    s += T(cx, y + 58, label, { size: 11, w: on ? 700 : 500, fill: c, anchor: 'middle' });
  });
  return s + rect(W / 2 - 67, H - 10, 134, 5, 2.5, t.key === 'B' ? '#ffffff' : '#111111', 'opacity="0.5"');
}
let defs = `<linearGradient id="navyGrad" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="#1D3E60"/><stop offset="1" stop-color="#0A1726"/></linearGradient>`;
const phone = (t, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs}</defs>${rect(0, 0, W, H, 0, t.bg)}${body}</svg>`;
const pill = (x, y, label, color, solid = true) => {
  const w = tw(label, 11, 700) + 14;
  return rect(x - w, y, w, 20, 6, color, solid ? '' : 'fill-opacity="0.14"') + T(x - w / 2, y + 14, label, { size: 11, w: 700, fill: solid ? '#fff' : color, anchor: 'middle' });
};

// ---------- Feed ----------
function feed(t) {
  let b = '';
  const reasons = ["Demande soutenue pour les puces d'IA", 'Marges élevées', 'Valorisation à surveiller'];
  if (t.feed === 'light') {
    b += rect(0, 0, W, H - 84, 0, '#FFFFFF') + rect(0, 0, W, 6, 0, '#76b900');
    b += statusBar(NAVY);
    b += brandMark(20, 46, t) + rect(W / 2 - 66, 44, 132, 26, 13, PALE) + icon(W / 2 - 56, 50, 14, G.sunset, NAVY) + T(W / 2 + 2, 61, 'Retraite', { size: 12, w: 700, fill: NAVY, anchor: 'middle' }) + icon(W / 2 + 34, 51, 12, G.chevron, NAVY, 2.4);
    b += T(W / 2, 94, 'Simulation · pas un conseil financier', { size: 10, fill: t.muted, anchor: 'middle' });
    b += rect(16, 120, W - 96, 380, 20, PALE);
    b += T(36, 186, 'Buy', { size: 44, w: 800, fill: NAVY }) + rect(36, 200, 40, 4, 2, RED);
    b += T(36, 240, 'Pourquoi :', { size: 16, w: 700, fill: NAVY });
    reasons.forEach((r, i) => (b += `<circle cx="42" cy="${266 + i * 30}" r="3" fill="${RED}"/>` + T(54, 271 + i * 30, r, { size: 12.5, fill: GREY })));
    b += T(36, 470, 'See more data  →', { size: 13, w: 700, fill: RED });
    b += logo(40, 560, 20, '#76b900', 'NV') + T(70, 556, 'NVDA', { size: 18, w: 800, fill: NAVY }) + T(70, 576, 'NVIDIA · NASDAQ', { size: 12, fill: t.muted });
    // rail
    const rx = W - 40, rail = (y, g, label, on, color) =>
      `<circle cx="${rx}" cy="${y}" r="21" fill="${on ? color : PALE}"/>` + icon(rx - 12, y - 12, 24, g, on ? '#fff' : NAVY, 2, g === G.bookmark && on ? '#fff' : 'none') + T(rx, y + 36, label, { size: 10.5, w: 600, fill: NAVY, anchor: 'middle' });
    b += rail(170, G.bookmark, 'Favori', true, RED) + rail(250, G.up, 'Pour', true, t.up) + rail(330, G.down, 'Contre', false) + dots(rx, 400, NAVY) + T(rx, 440, 'Plus', { size: 10.5, w: 600, fill: NAVY, anchor: 'middle' });
    b += rect(16, 610, W - 32, 52, 14, RED) + T(W / 2, 642, 'Buy now  ·  ouvrir sur BNCD', { size: 14, w: 700, fill: '#fff', anchor: 'middle' });
  } else if (t.feed === 'navy') {
    b += rect(0, 0, W, H - 84, 0, 'url(#navyGrad)') + statusBar('#fff');
    b += brandMark(20, 46, t) + rect(W / 2 - 66, 44, 132, 26, 13, '#000', 'fill-opacity="0.35"') + `<circle cx="${W / 2 - 50}" cy="57" r="9" fill="${RED}"/>` + icon(W / 2 - 56, 51, 12, G.sunset, '#fff') + T(W / 2 + 2, 61, 'Retraite', { size: 12, w: 700, fill: '#fff', anchor: 'middle' }) + icon(W / 2 + 34, 51, 12, G.chevron, '#fff', 2.4);
    b += T(W / 2, 92, 'Simulation · pas un conseil financier', { size: 10, fill: '#fff', anchor: 'middle', op: 0.7 });
    b += T(24, 270, 'Buy', { size: 52, w: 800, fill: '#fff' }) + rect(24, 286, 48, 4, 2, RED);
    b += T(24, 330, 'Pourquoi :', { size: 18, w: 700, fill: '#fff' });
    reasons.forEach((r, i) => (b += rect(24, 350 + i * 34, 3, 18, 1.5, RED) + T(36, 364 + i * 34, r, { size: 14.5, fill: '#fff' })));
    const rx = W - 40, rail = (y, g, label, on, color) =>
      (on ? `<circle cx="${rx}" cy="${y}" r="21" fill="${color}"/>` : `<circle cx="${rx}" cy="${y}" r="21" fill="#000" fill-opacity="0.3"/>`) + icon(rx - 12, y - 12, 24, g, '#fff', 2, g === G.bookmark && on ? '#fff' : 'none') + T(rx, y + 36, label, { size: 10.5, w: 600, fill: '#fff', anchor: 'middle' });
    b += rail(480, G.bookmark, 'Favori', true, RED) + rail(558, G.up, 'Pour', false) + rail(636, G.down, 'Contre', false) + dots(rx, 696, '#fff');
    b += logo(44, 668, 20, '#76b900', 'NV') + T(74, 664, 'NVDA', { size: 18, w: 800, fill: '#fff' }) + T(74, 684, 'NVIDIA', { size: 12, fill: '#fff', op: 0.8 }) + T(24, 728, 'See more data', { size: 14, w: 700, fill: '#fff' }) + rect(24, 734, 98, 2, 1, RED);
  } else {
    b += rect(0, 0, W, 360, 0, RED) + statusBar('#fff');
    b += brandMark(20, 46, t, true) + T(W - 36, 61, 'Retraite', { size: 13, w: 700, fill: '#fff', anchor: 'end' }) + icon(W - 32, 50, 14, G.chevron, '#fff', 2.4);
    b += T(24, 170, 'Buy', { size: 76, w: 800, fill: '#fff' });
    b += T(24, 210, 'NVDA · NVIDIA', { size: 16, w: 700, fill: '#fff' }) + T(24, 236, 'Faire. Avancer. — simulation, pas un conseil', { size: 11, fill: '#fff', op: 0.85 });
    b += logo(W - 56, 176, 28, '#76b900', 'NV');
    b += rect(0, 330, W, H - 84 - 330, 28, '#FFFFFF') + rect(0, 360, W, 40, 0, '#FFFFFF');
    b += T(24, 382, 'Pourquoi :', { size: 18, w: 800, fill: '#1B1B1B' });
    reasons.forEach((r, i) => (b += T(24, 416 + i * 32, `${i + 1}`, { size: 14, w: 800, fill: RED }) + T(44, 416 + i * 32, r, { size: 14.5, fill: GREY })));
    b += `<line x1="24" y1="${520}" x2="${W - 24}" y2="${520}" stroke="#E6E8EB"/>`;
    const act = (x, g, label, on, color) =>
      rect(x, 540, 76, 70, 14, on ? color : '#F6F7F9') + icon(x + 26, 552, 24, g, on ? '#fff' : '#1B1B1B', 2, g === G.bookmark && on ? '#fff' : 'none') + T(x + 38, 598, label, { size: 11, w: 700, fill: on ? '#fff' : '#1B1B1B', anchor: 'middle' });
    b += act(24, G.bookmark, 'Favori', true, RED) + act(110, G.up, 'Pour', true, t.up) + act(196, G.down, 'Contre', false) + rect(282, 540, 84, 70, 14, '#F6F7F9') + dots(324, 562, '#1B1B1B');
    b += rect(24, 634, W - 48, 52, 26, '#1B1B1B') + T(W / 2, 666, 'Buy now  →  BNCD', { size: 15, w: 800, fill: '#fff', anchor: 'middle' });
    b += T(W / 2, 712, 'See more data', { size: 13, w: 700, fill: RED, anchor: 'middle' });
  }
  return phone(t, b + tabBar(t, 'feed'));
}

// ---------- Saved ----------
const ROWS = [
  ['NVDA', 'NVIDIA', '#76b900', '118,50 $', '+30,0 %', true, 'up'],
  ['TSLA', 'Tesla', '#cc0000', '250,00 $', '−15,0 %', false, 'down'],
  ['MSFT', 'Microsoft', '#00a4ef', '415,00 $', '+30,0 %', true, null],
  ['KO', 'Coca-Cola', '#f40009', '63,00 $', '+0,4 %', null, null],
  ['UBER', 'Uber', '#276ef1', '70,00 $', '+30,0 %', true, null],
];
function saved(t) {
  const dark = t.key === 'B';
  let b = statusBar(dark ? '#fff' : t.text);
  if (t.key === 'C') b += rect(0, 0, W, 132, 0, RED) + statusBar('#fff');
  const titleC = t.key === 'C' ? '#fff' : t.text;
  b += T(20, 88, 'Sauvegardés', { size: 28, w: 800, fill: titleC }) + T(20, 112, '5 produits · Retraite', { size: 13, fill: t.key === 'C' ? '#fff' : t.muted, op: t.key === 'C' ? 0.9 : 1 });
  if (t.key !== 'C') b += rect(20, 74 - 54, 0, 0, 0, 'none');
  if (t.key === 'A') b += rect(20, 120, 40, 4, 2, RED);
  const sy = t.key === 'C' ? 148 : 134;
  b += rect(20, sy, W - 40, 42, 12, t.surface) + icon(32, sy + 11, 20, G.search, t.muted) + T(60, sy + 26, 'Rechercher un produit', { size: 14, fill: t.muted });
  const chips = ['Récents', 'Variation', 'Nom'];
  let cx = 20;
  chips.forEach((c, i) => {
    const w = tw(c, 13, 700) + 26, on = i === 0;
    b += rect(cx, sy + 54, w, 32, 16, on ? (dark ? '#fff' : t.key === 'A' ? NAVY : RED) : t.surface, on ? '' : `stroke="${t.line}"`) + T(cx + w / 2, sy + 75, c, { size: 13, w: 700, fill: on ? (dark ? NAVY : '#fff') : t.text, anchor: 'middle' });
    cx += w + 8;
  });
  let y = sy + 100;
  ROWS.forEach(([tk, name, col, price, pct, upTrend, rating]) => {
    const pc = upTrend === null ? t.muted : upTrend ? t.up : t.down;
    b += logo(40, y + 36, 20, col, name.slice(0, 2).toUpperCase());
    b += T(72, y + 32, tk, { size: 16, w: 800, fill: t.text }) + T(72, y + 51, name, { size: 12.5, fill: t.muted });
    if (rating) {
      const rc = rating === 'up' ? t.up : t.down, label = rating === 'up' ? 'Pour' : 'Contre';
      b += rect(72 + tw(name, 12.5) + 8, y + 40, tw(label, 10, 700) + 26, 16, 8, rc, 'fill-opacity="0.14"') + icon(72 + tw(name, 12.5) + 11, y + 42, 12, rating === 'up' ? G.up : G.down, rc, 2.4) + T(72 + tw(name, 12.5) + 26, y + 52, label, { size: 10, w: 700, fill: rc });
    }
    b += spark(206, y + 22, 64, 28, upTrend !== false, pc, tk.length * 7);
    b += T(W - 20, y + 32, price, { size: 15, w: 700, fill: t.text, anchor: 'end' }) + pill(W - 20, y + 40, pct, pc, t.key !== 'A');
    b += `<line x1="72" y1="${y + 72}" x2="${W}" y2="${y + 72}" stroke="${t.line}"/>`;
    y += 72;
  });
  b += T(W / 2, y + 26, 'Toucher : voir le titre sur BNCD · Glisser à gauche : retirer', { size: 11, fill: t.muted, anchor: 'middle' });
  return phone(t, b + tabBar(t, 'saved'));
}

// ---------- Profile ----------
function profile(t) {
  const dark = t.key === 'B';
  let b = statusBar(dark ? '#fff' : t.text);
  if (t.key === 'C') b += rect(0, 0, W, 116, 0, RED) + statusBar('#fff');
  const headC = t.key === 'C' ? '#fff' : t.text;
  b += `<circle cx="42" cy="78" r="22" fill="${t.key === 'C' ? '#fff' : NAVY}"/>` + T(42, 85, 'AT', { size: 17, w: 800, fill: t.key === 'C' ? RED : '#fff', anchor: 'middle' });
  b += T(74, 74, 'Alex Tremblay', { size: 18, w: 800, fill: headC }) + T(74, 93, '3 portefeuilles · profil complet', { size: 12, fill: headC, op: t.key === 'C' ? 0.9 : 1 });
  b += rect(W - 104, 62, 86, 32, 16, t.key === 'C' ? '#fff' : RED) + T(W - 61, 83, '+ Nouveau', { size: 12.5, w: 800, fill: t.key === 'C' ? RED : '#fff', anchor: 'middle' });
  const sy = 128;
  b += rect(20, sy, W - 40, 38, 19, t.surface) + rect(23, sy + 3, (W - 46) / 2, 32, 16, dark ? '#fff' : t.key === 'A' ? NAVY : '#1B1B1B');
  b += T(20 + (W - 40) / 4, sy + 24, 'Portefeuilles', { size: 13, w: 700, fill: dark ? NAVY : '#fff', anchor: 'middle' }) + T(20 + (3 * (W - 40)) / 4, sy + 24, 'Profil investisseur', { size: 13, w: 600, fill: t.text, anchor: 'middle' });
  // card
  const cx = 20, cy = 182, cw = W - 60, ch = H - 84 - cy - 30;
  const cardBg = t.key === 'A' ? '#FFFFFF' : t.key === 'B' ? '#16304A' : '#FFFFFF';
  b += rect(cx + cw + 10, cy + 14, 40, ch - 28, 18, t.key === 'B' ? '#1D3E60' : PALE);
  b += rect(cx, cy, cw, ch, 20, cardBg, t.key === 'B' ? `stroke="#ffffff" stroke-opacity="0.85" stroke-width="2"` : `stroke="${t.key === 'A' ? '#DCE5EE' : '#E6E8EB'}" stroke-width="1.5"`);
  if (t.key === 'C') b += `<path d="M${cx} ${cy + 20} a20 20 0 0 1 20 -20 h${cw - 40} a20 20 0 0 1 20 20 v52 h${-cw} z" fill="${RED}"/>`;
  if (t.key === 'A') b += rect(cx, cy + 18, 4, 46, 2, RED);
  const tc = t.key === 'C' ? '#fff' : t.text;
  b += rect(cx + 14, cy + 14, 50, 20, 10, t.key === 'C' ? '#fff' : RED) + T(cx + 39, cy + 28, 'Actif', { size: 11, w: 800, fill: t.key === 'C' ? RED : '#fff', anchor: 'middle' });
  b += T(cx + cw - 14, cy + 28, 'Modifier', { size: 12, w: 700, fill: t.key === 'C' ? '#fff' : t.key === 'B' ? '#fff' : RED, anchor: 'end' });
  b += T(cx + 14, cy + 60, 'Retraite', { size: 20, w: 800, fill: tc }) + T(cx + 108, cy + 60, '· Préparer la retraite', { size: 11.5, fill: tc, op: 0.8 });
  // split
  const sy2 = cy + 88, mut = t.key === 'B' ? '#A9B8C8' : t.muted, txt = t.key === 'B' ? '#fff' : t.text;
  b += rect(cx + 14, sy2, cw - 28, 8, 4, t.key === 'B' ? '#ffffff' : NAVY, 'fill-opacity="0.18"') + rect(cx + 14 + (cw - 28) * 0.8, sy2, (cw - 28) * 0.2, 8, 4, t.key === 'B' ? '#fff' : RED);
  b += T(cx + 14, sy2 + 28, 'Encaisse', { size: 11, fill: mut }) + T(cx + 14, sy2 + 50, '7 985,00 $', { size: 20, w: 800, fill: txt }) + T(cx + 14, sy2 + 66, '80 %', { size: 11, w: 600, fill: mut });
  b += `<circle cx="${cx + cw / 2 + 4}" cy="${sy2 + 24}" r="4" fill="${t.key === 'B' ? '#fff' : RED}"/>` + T(cx + cw / 2 + 12, sy2 + 28, 'Actifs (actions)', { size: 11, fill: mut }) + T(cx + cw / 2 + 4, sy2 + 50, '2 015,00 $', { size: 20, w: 800, fill: txt }) + T(cx + cw / 2 + 4, sy2 + 66, '20 %', { size: 11, w: 600, fill: mut });
  b += `<line x1="${cx + 14}" y1="${sy2 + 80}" x2="${cx + cw - 14}" y2="${sy2 + 80}" stroke="${t.line}"/>` + T(cx + 14, sy2 + 98, 'Valeur totale', { size: 12, fill: mut }) + T(cx + cw - 14, sy2 + 98, '10 000,00 $', { size: 12, w: 700, fill: txt, anchor: 'end' });
  // positions
  let py = sy2 + 124;
  b += T(cx + 14, py, 'Positions (2) · plus fortes variations', { size: 11, w: 600, fill: mut });
  [['NVDA', '×10', '#76b900', '1 185,00 $', '+30,0 %'], ['MSFT', '×2', '#00a4ef', '830,00 $', '+30,0 %']].forEach(([tk, q, col, v, pct], i) => {
    const y = py + 10 + i * 46;
    b += logo(cx + 28, y + 22, 14, col, tk.slice(0, 2)) + T(cx + 50, y + 20, tk, { size: 13, w: 800, fill: txt }) + T(cx + 50 + tw(tk, 13, 800) + 12, y + 20, q, { size: 12, w: 600, fill: mut }) + T(cx + 50, y + 35, i ? 'Microsoft' : 'NVIDIA', { size: 10.5, fill: mut });
    b += spark(cx + 150, y + 10, 46, 22, true, t.up, i + 2) + T(cx + cw - 14, y + 20, v, { size: 12.5, w: 700, fill: txt, anchor: 'end' }) + pill(cx + cw - 14, y + 26, pct, t.up, t.key !== 'A');
    if (!i) b += `<line x1="${cx + 14}" y1="${y + 44}" x2="${cx + cw - 14}" y2="${y + 44}" stroke="${t.line}"/>`;
  });
  // params grid
  const gy = cy + ch - 104, gw = (cw - 34) / 2;
  [['Horizon', '25 ans (2051)'], ['Risque', 'Dynamique'], ['Mise initiale', '10 000 $ + 300 $/mois'], ['Retraits', 'Aucun prévu']].forEach(([k, v], i) => {
    const x = cx + 14 + (i % 2) * (gw + 6), y = gy + Math.floor(i / 2) * 46;
    b += rect(x, y, gw, 40, 10, t.key === 'B' ? '#0C1C2E' : t.key === 'A' ? PALE : '#F6F7F9') + T(x + 10, y + 16, k, { size: 10, fill: mut }) + T(x + 10, y + 32, v, { size: 11.5, w: 700, fill: txt });
  });
  b += [0, 1, 2].map((i) => `<circle cx="${W / 2 - 14 + i * 14}" cy="${cy + ch + 16}" r="${i ? 3 : 4}" fill="${i ? (dark ? '#4A6480' : '#C5CFD9') : RED}"/>`).join('');
  return phone(t, b + tabBar(t, 'profile'));
}

// ---------- output ----------
function png(svg, file, width) {
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'Inter' } });
  fs.writeFileSync(path.join(OUT, file), r.render().asPng());
}
const inner = (s) => s.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
function sheet(title, subtitle, screens, labels, file) {
  const SW = screens.length * W + (screens.length + 1) * 40, SH = H + 190;
  let o = `<svg xmlns="http://www.w3.org/2000/svg" width="${SW}" height="${SH}"><defs>${defs}</defs>${rect(0, 0, SW, SH, 0, '#E9EBEF')}` +
    T(40, 52, title, { size: 30, w: 800, fill: '#111' }) + T(40, 80, subtitle, { size: 14, fill: '#444' });
  screens.forEach((s, i) => {
    const x = 40 + i * (W + 40), y = 104;
    o += rect(x - 6, y - 6, W + 12, H + 12, 40, '#111') + `<svg x="${x}" y="${y}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><clipPath id="k${file}${i}"><rect width="${W}" height="${H}" rx="34"/></clipPath><g clip-path="url(#k${file}${i})">${inner(s)}</g></svg>`;
    o += T(x + 4, y + H + 46, labels[i][0], { size: 20, w: 800, fill: '#111' }) + T(x + 4, y + H + 70, labels[i][1], { size: 13, fill: '#444' });
  });
  png(o + '</svg>', file, SW);
}
const NOTE = 'Couleurs BNC approximatives (sources tierces) · logo officiel non reproduit (bloc « BNCD ») · police Inter en substitut';
const all = {};
for (const t of Object.values(THEMES)) {
  const s = { feed: feed(t), saved: saved(t), profile: profile(t) };
  all[t.key] = s;
  png(s.feed, `${t.key.toLowerCase()}-fil.png`, W * 2);
  png(s.saved, `${t.key.toLowerCase()}-sauvegardes.png`, W * 2);
  png(s.profile, `${t.key.toLowerCase()}-profil.png`, W * 2);
  sheet(`${t.key}. ${t.title}`, `${t.sub} · ${NOTE}`, [s.feed, s.saved, s.profile], [['Fil', 'Carte « Buy »'], ['Sauvegardés', 'Liste watchlist'], ['Profil', 'Portefeuille actif']], `proposition-${t.key.toLowerCase()}.png`);
}
sheet('Direction artistique BNCD : 3 propositions', NOTE, [all.A.feed, all.B.feed, all.C.feed],
  Object.values(THEMES).map((t) => [`${t.key}. ${t.title}`, t.sub]), 'comparatif-fil.png');
console.log(fs.readdirSync(OUT).join('\n'));
