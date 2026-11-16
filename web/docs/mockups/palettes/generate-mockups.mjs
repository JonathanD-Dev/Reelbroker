import { Resvg } from '@resvg/resvg-js';
import fs from 'fs';
import path from 'path';

// Same layout as the current app (Feed / Saved / Profile); ONLY the colors change.
const OUT = '/workshop/docs/mockups/palettes';
fs.mkdirSync(OUT, { recursive: true });
const FD = path.resolve('node_modules/@expo-google-fonts/inter') + '/';
const FONTS = ['400Regular/Inter_400Regular', '600SemiBold/Inter_600SemiBold', '700Bold/Inter_700Bold', '800ExtraBold/Inter_800ExtraBold'].map((f) => FD + f + '.ttf');
const W = 390, H = 844, TAB = 84, SAFE = 47;

// ---------- color helpers ----------
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (a) => '#' + a.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => toHex(hex(a).map((v, i) => v * t + hex(b)[i] * (1 - t))); // t = share of a

// Palette tokens = the colors of global.css. `reel(brand)` and `card(pf)` give gradient stops.
const P = {
  actuel: {
    name: 'Actuel', sub: 'Référence : couleurs de l’application aujourd’hui',
    bg: '#0b0d10', surface: '#171a20', line: '#262a33', text: '#ffffff', muted: '#9aa0aa',
    activeBg: '#ffffff', activeFg: '#111111', tabOn: '#ffffff', tabOff: '#9aa0aa', tabBg: '#0b0d10',
    up: '#2e9e4f', down: '#d33a3a', flat: '#5b6068', upText: '#6fe08f', downText: '#ff8a8a',
    reel: (b) => [mix(b, '#000000', 0.55), mix(b, '#000000', 0.22), '#07080a'], reelText: '#ffffff',
    card: (c) => [mix(c, '#000000', 0.75), '#11141a'], cardText: '#ffffff', cardActive: '#ffffff',
    avatar: '#5b4bd6', primary: '#ffffff', onPrimary: '#111111', ratingOn: null,
  },
  marine: {
    name: 'Marine BNC', sub: 'Fonds marine, rouge BNC pour les états actifs, couleurs des produits conservées',
    bg: '#0b1a2b', surface: '#14304a', line: '#22405f', text: '#ffffff', muted: '#a7b6c6',
    activeBg: '#e41c23', activeFg: '#ffffff', tabOn: '#ffffff', tabOff: '#8197ad', tabBg: '#091626',
    up: '#2fae6a', down: '#ff6b5f', flat: '#5d728a', upText: '#7ee3a8', downText: '#ffa39b',
    reel: (b) => [mix(b, '#0b1a2b', 0.45), mix(b, '#0b1a2b', 0.18), '#06111d'], reelText: '#ffffff',
    card: (c) => [mix(c, '#0b1a2b', 0.6), '#0e2236'], cardText: '#ffffff', cardActive: '#e41c23',
    avatar: '#e41c23', primary: '#e41c23', onPrimary: '#ffffff', ratingOn: null,
  },
  marineUni: {
    name: 'Marine uni', sub: 'Tout en marine BNC, cartes sans couleur de produit, rouge pour l’action principale',
    bg: '#0d1f33', surface: '#17324f', line: '#264766', text: '#ffffff', muted: '#a9b9ca',
    activeBg: '#ffffff', activeFg: '#17314b', tabOn: '#ffffff', tabOff: '#8197ad', tabBg: '#0a1828',
    up: '#2fae6a', down: '#ff6b5f', flat: '#5d728a', upText: '#7ee3a8', downText: '#ffa39b',
    reel: () => ['#1d3e60', '#132c46', '#0a1828'], reelText: '#ffffff',
    card: () => ['#1d3e60', '#10263c'], cardText: '#ffffff', cardActive: '#e41c23',
    avatar: '#e41c23', primary: '#e41c23', onPrimary: '#ffffff', ratingOn: null,
  },
  clair: {
    name: 'Clair BNC', sub: 'Fond blanc, texte marine, bleu pâle pour les surfaces, rouge pour l’action',
    bg: '#ffffff', surface: '#eef6fb', line: '#dce5ee', text: '#17314b', muted: '#5b6b7c',
    activeBg: '#17314b', activeFg: '#ffffff', tabOn: '#e41c23', tabOff: '#7a8a99', tabBg: '#ffffff',
    up: '#1e7f4f', down: '#b3261e', flat: '#7a8a99', upText: '#1e7f4f', downText: '#b3261e',
    reel: (b) => [mix(b, '#ffffff', 0.22), mix(b, '#ffffff', 0.08), '#ffffff'], reelText: '#17314b',
    card: (c) => [mix(c, '#ffffff', 0.16), '#f7fafc'], cardText: '#17314b', cardActive: '#e41c23',
    avatar: '#17314b', primary: '#e41c23', onPrimary: '#ffffff', ratingOn: null,
  },
  graphite: {
    name: 'Graphite et rouge', sub: 'Gris anthracite neutre, rouge BNC comme seule couleur d’accent',
    bg: '#111214', surface: '#1d1f23', line: '#2c2f34', text: '#ffffff', muted: '#a0a3a8',
    activeBg: '#e41c23', activeFg: '#ffffff', tabOn: '#ffffff', tabOff: '#8d9096', tabBg: '#0d0e10',
    up: '#2e9e4f', down: '#ff6b5f', flat: '#5e6167', upText: '#6fe08f', downText: '#ffa39b',
    reel: () => ['#34363b', '#1d1f23', '#0b0c0d'], reelText: '#ffffff',
    card: () => ['#2d2f34', '#16171a'], cardText: '#ffffff', cardActive: '#e41c23',
    avatar: '#e41c23', primary: '#e41c23', onPrimary: '#ffffff', ratingOn: null,
  },
};

// ---------- drawing helpers ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const T = (x, y, s, { size = 14, w = 400, fill = '#fff', anchor = 'start', op = 1 } = {}) =>
  `<text x="${x}" y="${y}" font-family="Inter" font-size="${size}" font-weight="${w}" fill="${fill}" text-anchor="${anchor}" opacity="${op}">${esc(s)}</text>`;
const tw = (s, size, w = 400) => s.length * size * (w >= 600 ? 0.58 : 0.53);
const R = (x, y, w, h, r, fill, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${extra}/>`;
const ic = (x, y, s, d, c, sw = 2, fill = 'none') =>
  `<g transform="translate(${x} ${y}) scale(${s / 24})" fill="${fill}" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${d}</g>`;
const G = {
  bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
  up: '<path d="M7 11l5-5 5 5M7 18l5-5 5 5"/>',
  down: '<path d="M7 6l5 5 5-5M7 13l5 5 5-5"/>',
  home: '<path d="M3 11l9-8 9 8v10h-6v-6H9v6H3z"/>',
  sunset: '<path d="M3 18h18M5 21h14"/><path d="M7 18a5 5 0 0 1 10 0"/><path d="M12 8v3M5.6 11.6l1.6 1.6M18.4 11.6l-1.6 1.6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
};
const logo = (cx, cy, r, color, label) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>` + T(cx, cy + r * 0.36, label, { size: r * 0.75, w: 700, anchor: 'middle' });
function spark(x, y, w, h, dir, col, seed = 3) {
  let s = seed; const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const n = 12, v = Array.from({ length: n }, (_, i) => (dir === 'up' ? i : dir === 'down' ? n - i : 5) + (r() - 0.5) * 3);
  const mn = Math.min(...v), mx = Math.max(...v);
  return `<path d="${v.map((val, i) => `${i ? 'L' : 'M'}${(x + (i * w) / (n - 1)).toFixed(1)} ${(y + h - ((val - mn) / (mx - mn)) * h).toFixed(1)}`).join(' ')}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
}
const isLight = (c) => { const [r, g, b] = hex(c); return 0.299 * r + 0.587 * g + 0.114 * b > 150; };
function status(c) {
  return T(24, 30, '9:41', { size: 15, w: 600, fill: c }) + `<rect x="${W - 58}" y="19" width="26" height="13" rx="3" fill="none" stroke="${c}" stroke-width="1.5"/>` + R(W - 56, 21, 18, 9, 1.5, c) +
    [0, 1, 2, 3].map((i) => R(W - 92 + i * 6, 30 - (i + 1) * 3, 4, (i + 1) * 3, 1, c)).join('');
}
// Tab bar: Fil / Sauvegardés / Profil (portfolio icon in its color pastille), like TabBar.tsx.
function tabBar(p, active, pfColor) {
  const y = H - TAB;
  let s = R(0, y, W, TAB, 0, p.tabBg) + `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${p.line}"/>`;
  [['feed', 'Fil', G.home], ['saved', 'Sauvegardés', G.bookmark], ['profile', 'Profil', G.sunset]].forEach(([k, label, g], i) => {
    const cx = (W * (i * 2 + 1)) / 6, on = k === active, c = on ? p.tabOn : p.tabOff;
    if (k === 'profile') s += `<circle cx="${cx}" cy="${y + 22}" r="13" fill="${pfColor}" opacity="${on ? 1 : 0.7}"/>` + ic(cx - 7, y + 15, 14, g, '#fff');
    else s += ic(cx - 11, y + 11, 22, g, c, 2, on ? c : 'none');
    s += T(cx, y + 50, label, { size: 11, w: on ? 600 : 400, fill: c, anchor: 'middle' });
  });
  return s + R(W / 2 - 67, H - 10, 134, 5, 2.5, isLight(p.tabBg) ? '#111' : '#fff', 'opacity="0.5"');
}
let defs = '';
let gid = 0;
const grad = (stops, x2 = 0.35, y2 = 1) => {
  const id = 'g' + gid++;
  defs += `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.map((c, i) => `<stop offset="${stops.length === 3 ? [0, 0.6, 1][i] : i}" stop-color="${c}"/>`).join('')}</linearGradient>`;
  return `url(#${id})`;
};
const phone = (p, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs}</defs>${R(0, 0, W, H, 0, p.bg)}${body}</svg>`;
const pillChg = (xr, y, label, color) => { const w = tw(label, 11, 700) + 14; return R(xr - w, y, w, 20, 6, color) + T(xr - w / 2, y + 14, label, { size: 11, w: 700, anchor: 'middle' }); };
const PF = '#3d7cf5'; // "Retraite" portfolio color

// ---------- Feed (Reel + CardSummary + CardMeta + ActionRail + switcher) ----------
function feed(p) {
  const brand = '#76b900', tc = p.reelText, light = isLight(p.reel(brand)[1]);
  let b = R(0, 0, W, H - TAB, 0, grad(p.reel(brand), 0.35, 1));
  b += `<rect x="0" y="${(H - TAB) * 0.6}" width="${W}" height="${(H - TAB) * 0.4}" fill="${grad(light ? ['#ffffff00', '#ffffff99'] : ['#00000000', '#00000099'], 0, 1)}"/>`;
  b += status(tc);
  b += T(W / 2, SAFE + 13, 'Données fictives, à but de démonstration', { size: 11, fill: tc, anchor: 'middle', op: 0.85 });
  // active portfolio selector (overlay)
  const sx = W / 2 - 62, sy = SAFE + 26;
  b += R(sx, sy, 124, 36, 18, light ? '#ffffff' : '#000000', `fill-opacity="${light ? 0.75 : 0.45}"`) + `<circle cx="${sx + 19}" cy="${sy + 18}" r="10" fill="${PF}"/>` + ic(sx + 12.5, sy + 11.5, 13, G.sunset, '#fff') +
    T(sx + 36, sy + 23, 'Retraite', { size: 13.5, w: 700, fill: tc }) + ic(sx + 100, sy + 10, 16, G.chevron, tc);
  // summary content
  b += T(16, 330, 'Buy', { size: 35, w: 800, fill: tc }) + T(16, 372, 'Pourquoi :', { size: 15, w: 600, fill: tc });
  ["Demande soutenue pour les puces d'IA", 'Marges élevées', 'Valorisation à surveiller'].forEach((r, i) => (b += `<circle cx="27" cy="${396 + i * 30}" r="2.5" fill="${tc}"/>` + T(38, 401 + i * 30, r, { size: 15, fill: tc })));
  // rail (bottom 24, gap 12): Favori, Pour, Contre, Plus
  const rx = W - 8 - 24;
  let ry = H - TAB - 24 - 56 * 4 - 12 * 3;
  const label = (y, s) => T(rx, y + 50, s, { size: 11, w: 400, fill: tc, anchor: 'middle' });
  b += ic(rx - 14, ry + 6, 28, G.bookmark, tc, 2, tc) + label(ry, 'Favori'); ry += 68;
  const pourOn = p.up;
  b += `<circle cx="${rx}" cy="${ry + 20}" r="20" fill="${pourOn}"/>` + ic(rx - 12, ry + 8, 24, G.up, '#fff', 2.2) + label(ry, 'Pour'); ry += 68;
  b += `<circle cx="${rx}" cy="${ry + 20}" r="20" fill="${light ? '#17314b' : '#000000'}" fill-opacity="${light ? 0.1 : 0.25}"/>` + ic(rx - 12, ry + 8, 24, G.down, tc, 2.2) + label(ry, 'Contre'); ry += 68;
  b += [0, 7, 14].map((d) => `<circle cx="${rx}" cy="${ry + 13 + d}" r="2" fill="${tc}"/>`).join('') + label(ry, 'Plus');
  // card meta (bottom-left)
  const my = H - TAB - 24 - 86;
  b += logo(36, my + 20, 20, brand, 'NV') + T(64, my + 16, 'NVDA', { size: 17.5, w: 700, fill: tc });
  b += R(118, my + 3, 52, 18, 9, light ? '#ffffff' : '#000000', `fill-opacity="${light ? 0.8 : 0.45}"`) + ic(122, my + 5, 13, G.up, p.upText, 2.4) + T(137, my + 16, 'Pour', { size: 11, w: 700, fill: p.upText });
  b += T(64, my + 35, 'NVIDIA', { size: 14.5, fill: tc, op: 0.9 });
  b += T(16, my + 72, 'See more data', { size: 15, fill: tc }) + R(16, my + 75, 102, 1.3, 0, tc);
  return phone(p, b + tabBar(p, 'feed', PF));
}

// ---------- Saved (SavedPage + SavedRow) ----------
function saved(p) {
  let b = status(p.text);
  b += T(20, SAFE + 40, 'Sauvegardés', { size: 28, w: 800, fill: p.text }) + T(20, SAFE + 62, '5 produits', { size: 14, fill: p.muted });
  const sw = SAFE + 74;
  b += R(20, sw, 140, 36, 18, p.surface) + `<circle cx="39" cy="${sw + 18}" r="10" fill="${PF}"/>` + ic(32.5, sw + 11.5, 13, G.sunset, '#fff') + T(56, sw + 23, 'Retraite', { size: 13.5, w: 700, fill: p.text }) + ic(130, sw + 10, 16, G.chevron, p.text);
  const sy = sw + 50;
  b += R(20, sy, W - 40, 44, 12, p.surface) + ic(32, sy + 13, 18, G.search, p.muted) + T(58, sy + 27, 'Rechercher un produit', { size: 14, fill: p.muted });
  let cx = 20;
  ['Récents', 'Variation', 'Nom'].forEach((c, i) => {
    const w = tw(c, 13.5, 600) + 28, on = i === 0;
    b += R(cx, sy + 56, w, 36, 18, on ? p.activeBg : p.surface, on ? '' : `stroke="${p.line}"`) + T(cx + w / 2, sy + 79, c, { size: 13.5, w: 600, fill: on ? p.activeFg : p.text, anchor: 'middle' });
    cx += w + 8;
  });
  let y = sy + 104;
  [['NVDA', 'NVIDIA', '#76b900', '118,50 $', '+30,0 %', 'up', 'up'], ['TSLA', 'Tesla', '#cc0000', '250,00 $', '−15,0 %', 'down', 'down'], ['MSFT', 'Microsoft', '#00a4ef', '415,00 $', '+30,0 %', 'up', null], ['KO', 'Coca-Cola', '#f40009', '63,00 $', '+0,4 %', 'flat', null], ['UBER', 'Uber', '#276ef1', '70,00 $', '+30,0 %', 'up', null]]
    .forEach(([tk, name, col, price, pct, trend, rating]) => {
      const pc = trend === 'up' ? p.up : trend === 'down' ? p.down : p.flat;
      b += logo(40, y + 36, 20, col, name.slice(0, 2).toUpperCase());
      b += T(72, y + 32, tk, { size: 16, w: 700, fill: p.text }) + T(72, y + 50, name, { size: 12.8, fill: p.muted });
      if (rating) {
        const rc = rating === 'up' ? p.upText : p.downText, lbl = rating === 'up' ? 'Pour' : 'Contre', w = tw(lbl, 11, 700) + 26;
        b += R(72, y + 55, w, 17, 8.5, rc, 'fill-opacity="0.18"') + ic(76, y + 57, 13, rating === 'up' ? G.up : G.down, rc, 2.4) + T(91, y + 67.5, lbl, { size: 11, w: 700, fill: rc });
      }
      b += spark(186, y + 20, 70, 32, trend, pc, tk.length * 5 + 1);
      b += T(W - 20, y + 32, price, { size: 15, w: 600, fill: p.text, anchor: 'end' }) + pillChg(W - 20, y + 42, pct, pc);
      b += `<line x1="72" y1="${y + 80}" x2="${W}" y2="${y + 80}" stroke="${p.line}"/>`;
      y += 80;
    });
  b += T(W / 2, y + 26, 'Toucher : voir le titre sur BNCD · Glisser à gauche : retirer', { size: 12, fill: p.muted, anchor: 'middle' });
  return phone(p, b + tabBar(p, 'saved', PF));
}

// ---------- Profile (ProfilePage compact + PortfolioCard + PositionList) ----------
function profile(p) {
  let b = status(p.text);
  const hy = SAFE + 12;
  b += `<circle cx="42" cy="${hy + 22}" r="22" fill="${p.avatar}"/>` + T(42, hy + 28, 'AT', { size: 16.8, w: 700, anchor: 'middle', fill: '#fff' });
  b += T(76, hy + 18, 'Alex Tremblay', { size: 17.6, w: 700, fill: p.text }) + T(76, hy + 36, '3 portefeuilles · profil complet', { size: 12.8, fill: p.muted });
  b += R(W - 112, hy + 4, 92, 36, 18, p.primary) + T(W - 66, hy + 27, '+ Nouveau', { size: 13, w: 700, fill: p.onPrimary, anchor: 'middle' });
  const sy = hy + 54;
  b += R(20, sy, W - 40, 40, 20, p.surface) + R(23, sy + 3, (W - 46) / 2, 34, 17, p.activeBg);
  b += T(20 + (W - 40) / 4, sy + 25, 'Portefeuilles', { size: 13.6, w: 600, fill: p.activeFg, anchor: 'middle' }) + T(20 + (3 * (W - 40)) / 4, sy + 25, 'Profil investisseur', { size: 13.6, w: 600, fill: p.text, anchor: 'middle' });
  // card
  const cx = 20, cy = sy + 50, cw = W - 60, ch = H - TAB - cy - 40, tc = p.cardText, light = isLight(p.card(PF)[0]);
  const sub = light ? '#17314b' : '#ffffff';
  b += R(cx + cw + 12, cy + 12, 40, ch - 24, 20, grad(p.card('#2e9e4f'), 0.6, 1));
  b += R(cx, cy, cw, ch, 20, grad(p.card(PF), 0.6, 1)) + R(cx + 1, cy + 1, cw - 2, ch - 2, 19, 'none', `stroke="${p.cardActive}" stroke-width="2" stroke-opacity="0.9"`);
  b += R(cx + 14, cy + 14, 46, 22, 10, p.cardActive === '#ffffff' ? '#ffffff' : p.cardActive) + T(cx + 37, cy + 29, 'Actif', { size: 12, w: 700, fill: p.cardActive === '#ffffff' ? '#111' : '#fff', anchor: 'middle' });
  b += R(cx + cw - 88, cy + 10, 74, 30, 15, light ? '#ffffff' : '#000000', `fill-opacity="${light ? 0.7 : 0.2}" stroke="${sub}" stroke-opacity="0.5"`) + T(cx + cw - 51, cy + 29, 'Modifier', { size: 12.5, w: 600, fill: tc, anchor: 'middle' });
  b += `<circle cx="${cx + 28}" cy="${cy + 62}" r="14" fill="${sub}" fill-opacity="0.18"/>` + ic(cx + 19, cy + 53, 18, G.sunset, tc) + T(cx + 50, cy + 70, 'Retraite', { size: 19.2, w: 800, fill: tc });
  b += T(cx + 14, cy + 94, 'Objectif : préparer la retraite', { size: 12.8, fill: tc, op: 0.85 });
  // split: Encaisse (translucent) then Actifs (solid)
  const by = cy + 110, bw = cw - 28;
  b += R(cx + 14, by, bw * 0.8, 8, 4, sub, 'fill-opacity="0.35"') + R(cx + 14 + bw * 0.8, by, bw * 0.2, 8, 4, light ? '#17314b' : '#ffffff');
  const col = (x, label, amt, pct, solid) =>
    `<circle cx="${x + 4}" cy="${by + 24}" r="4" fill="${solid ? (light ? '#17314b' : '#fff') : sub}" fill-opacity="${solid ? 1 : 0.35}"/>` + T(x + 14, by + 28, label, { size: 11.2, fill: tc, op: 0.8 }) +
    T(x, by + 50, amt, { size: 20, w: 800, fill: tc }) + T(x, by + 66, pct, { size: 12, w: 600, fill: tc, op: 0.75 });
  b += col(cx + 14, 'Encaisse', '7 985,00 $', '80 %', false) + col(cx + 14 + bw / 2 + 4, 'Actifs (actions)', '2 015,00 $', '20 %', true);
  b += `<line x1="${cx + 14}" y1="${by + 80}" x2="${cx + cw - 14}" y2="${by + 80}" stroke="${sub}" stroke-opacity="0.25"/>` + T(cx + 14, by + 96, 'Valeur totale', { size: 12.8, fill: tc, op: 0.85 }) + T(cx + cw - 14, by + 96, '10 000,00 $', { size: 12.8, w: 700, fill: tc, anchor: 'end' });
  // positions
  const py = by + 120;
  b += T(cx + 14, py, 'Positions (2) · plus fortes variations', { size: 11.5, w: 600, fill: tc, op: 0.8 });
  [['NVDA', '×10', '#76b900', 'NVIDIA', '1 185,00 $'], ['MSFT', '×2', '#00a4ef', 'Microsoft', '830,00 $']].forEach(([tk, q, c, n, v], i) => {
    const y = py + 8 + i * 44;
    b += logo(cx + 28, y + 20, 14, c, tk.slice(0, 2)) + T(cx + 50, y + 17, tk, { size: 13.6, w: 700, fill: tc }) + T(cx + 50 + tw(tk, 13.6, 700) + 10, y + 17, q, { size: 12.5, w: 600, fill: tc, op: 0.75 }) + T(cx + 50, y + 32, n, { size: 11.2, fill: tc, op: 0.8 });
    b += spark(cx + 168, y + 9, 48, 22, 'up', p.up, i + 4) + T(cx + cw - 14, y + 17, v, { size: 12.8, w: 700, fill: tc, anchor: 'end' }) + pillChg(cx + cw - 14, y + 22, '+30,0 %', p.up);
    if (!i) b += `<line x1="${cx + 14}" y1="${y + 41}" x2="${cx + cw - 14}" y2="${y + 41}" stroke="${sub}" stroke-opacity="0.12"/>`;
  });
  // projection + parameters at the bottom of the card
  const gy = cy + ch - 162;
  const pts = Array.from({ length: 12 }, (_, i) => [cx + 14 + (i * (cw - 28)) / 11, gy + 30 - (i / 11) ** 1.4 * 28]);
  const d = pts.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' ');
  b += `<path d="${d} L${cx + cw - 14} ${gy + 32} L${cx + 14} ${gy + 32} Z" fill="${sub}" fill-opacity="0.18"/><path d="${d}" fill="none" stroke="${tc}" stroke-width="2.5"/>`;
  b += T(cx + 14, gy + 48, 'Projection médiane en 2051 : 299 712 $', { size: 12, fill: tc, op: 0.85 });
  const gw = (cw - 34) / 2;
  [['Horizon', '25 ans (2051)'], ['Risque', 'Dynamique'], ['Mise initiale', '10 000 $ + 300 $/mois'], ['Retraits', 'Aucun retrait prévu']].forEach(([k, v], i) => {
    const x = cx + 14 + (i % 2) * (gw + 6), y = gy + 58 + Math.floor(i / 2) * 46;
    b += R(x, y, gw, 40, 10, light ? '#17314b' : '#000000', `fill-opacity="${light ? 0.07 : 0.28}"`) + T(x + 8, y + 16, k, { size: 11.2, fill: tc, op: 0.75 }) + T(x + 8, y + 32, v, { size: 12.2, w: 700, fill: tc });
    if (k === 'Risque') [0, 1, 2].forEach((j) => (b += R(x + 80 + j * 15, y + 24, 12, 6, 3, p.down)));
  });
  b += [0, 1, 2].map((i) => `<circle cx="${W / 2 - 24 + i * 24}" cy="${cy + ch + 20}" r="${i ? 3 : 4}" fill="${i ? p.flat : p.text}"/>`).join('');
  return phone(p, b + tabBar(p, 'profile', PF));
}

// ---------- output ----------
function png(svg, file, width) {
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'Inter' } });
  fs.writeFileSync(path.join(OUT, file), r.render().asPng());
}
const inner = (s) => s.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
function swatches(p, x, y) {
  const list = [['Fond', p.bg], ['Surface', p.surface], ['Texte', p.text], ['Secondaire', p.muted], ['Actif', p.activeBg], ['Action', p.primary], ['Hausse', p.up], ['Baisse', p.down]];
  return list.map(([n, c], i) => R(x + i * 112, y, 22, 22, 6, c, 'stroke="#00000033"') + T(x + i * 112 + 28, y + 10, n, { size: 11, w: 700, fill: '#111' }) + T(x + i * 112 + 28, y + 23, c.toUpperCase(), { size: 10, fill: '#555' })).join('');
}
function sheet(title, sub, screens, labels, file, p) {
  const SW = screens.length * W + (screens.length + 1) * 40, SH = H + (p ? 210 : 180);
  let o = `<svg xmlns="http://www.w3.org/2000/svg" width="${SW}" height="${SH}"><defs>${defs}</defs>${R(0, 0, SW, SH, 0, '#e9ebef')}` + T(40, 50, title, { size: 30, w: 800, fill: '#111' }) + T(40, 76, sub, { size: 14, fill: '#444' });
  if (p) o += swatches(p, 40, 92);
  const top = p ? 134 : 100;
  screens.forEach((s, i) => {
    const x = 40 + i * (W + 40);
    o += R(x - 6, top - 6, W + 12, H + 12, 40, '#111') + `<svg x="${x}" y="${top}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><clipPath id="c${file}${i}"><rect width="${W}" height="${H}" rx="34"/></clipPath><g clip-path="url(#c${file}${i})">${inner(s)}</g></svg>`;
    o += T(x + 4, top + H + 40, labels[i][0], { size: 19, w: 800, fill: '#111' }) + T(x + 4, top + H + 62, labels[i][1], { size: 13, fill: '#444' });
  });
  png(o + '</svg>', file, SW);
}
const NOTE = 'Même mise en page que l’application actuelle, seules les couleurs changent · rouge BNC #E41C23 et marine ~#17314B (sources tierces, approximatifs)';
const keys = Object.keys(P);
const all = {};
keys.forEach((k, i) => {
  const p = P[k], s = { feed: feed(p), saved: saved(p), profile: profile(p) };
  all[k] = s;
  const n = i === 0 ? '0' : String(i);
  sheet(`${n}. ${p.name}`, `${p.sub} · ${NOTE}`, [s.feed, s.saved, s.profile], [['Fil', ''], ['Sauvegardés', ''], ['Profil', '']], `${n}-${k}.png`, p);
});
for (const scr of ['feed', 'saved', 'profile']) {
  const label = { feed: 'Fil', saved: 'Sauvegardés', profile: 'Profil' }[scr];
  sheet(`Palettes de couleurs : ${label}`, NOTE, keys.map((k) => all[k][scr]), keys.map((k, i) => [`${i}. ${P[k].name}`, P[k].sub.length > 52 ? P[k].sub.slice(0, 50) + '…' : P[k].sub]), `comparatif-${scr === 'feed' ? 'fil' : scr === 'saved' ? 'sauvegardes' : 'profil'}.png`);
}
console.log(fs.readdirSync(OUT).join('\n'));
