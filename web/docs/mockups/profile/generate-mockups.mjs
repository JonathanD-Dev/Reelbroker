import { Resvg } from '@resvg/resvg-js';
import fs from 'fs';
import path from 'path';

const OUT = '/workshop/docs/mockups/profile';
fs.mkdirSync(OUT, { recursive: true });
const FD = path.resolve('node_modules/@expo-google-fonts/inter') + '/';
const FONTS = ['400Regular/Inter_400Regular', '600SemiBold/Inter_600SemiBold', '700Bold/Inter_700Bold', '800ExtraBold/Inter_800ExtraBold'].map((f) => FD + f + '.ttf');

const W = 390, H = 844;
const BG = '#0b0d10', CARD = '#171a20', LINE = '#262a33', MUTED = '#9aa0aa', GREEN = '#2e9e4f', RED = '#d33a3a', BLUE = '#3d7cf5', AMBER = '#e0a526';

// ---------- mock data ----------
const ACCOUNT = { name: 'Alex Tremblay', initials: 'AT' };
const SHARED = [
  ['Situation financière', 'Revenus stables · fonds d\u2019urgence 6 mois'],
  ['Obligations', 'Hypothèque · 1 personne à charge'],
  ['Expérience', 'Intermédiaire · actions et FNB'],
  ['Préférences', 'ESG · exclut tabac, armes, fossiles'],
];
const RISK = { Prudent: 1, 'Équilibré': 2, Dynamique: 3 };
const PF = [
  { name: 'Retraite', goal: 'Préparer la retraite', color: '#3d7cf5', value: '14\u202f820\u00a0$', ch: '+8,4\u00a0%', up: true, horizon: '25 ans', until: '2051', risk: 'Dynamique', initial: '10\u202f000\u00a0$ + 300\u00a0$/mois', withdraw: 'Aucun retrait avant 2051', active: true },
  { name: 'Mise de fonds maison', goal: 'Acheter une maison', color: '#2e9e4f', value: '21\u202f150\u00a0$', ch: '+2,1\u00a0%', up: true, horizon: '5 ans', until: '2031', risk: 'Prudent', initial: '20\u202f000\u00a0$', withdraw: 'Retrait total en 2031' },
  { name: 'Projet voyage', goal: 'Voyage en Asie', color: '#e0a526', value: '3\u202f080\u00a0$', ch: '\u22121,3\u00a0%', up: false, horizon: '2 ans', until: '2028', risk: 'Équilibré', initial: '3\u202f000\u00a0$', withdraw: 'Retraits partiels possibles' },
];

// ---------- helpers ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const T = (x, y, s, { size = 14, w = 400, fill = '#fff', anchor = 'start', op = 1 } = {}) =>
  `<text x="${x}" y="${y}" font-family="Inter" font-size="${size}" font-weight="${w}" fill="${fill}" text-anchor="${anchor}" opacity="${op}">${esc(s)}</text>`;
const textW = (s, size, w = 400) => s.length * size * (w >= 600 ? 0.58 : 0.54);
const avatar = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#5b4bd6"/>` + T(cx, cy + r * 0.34, ACCOUNT.initials, { size: r * 0.9, w: 700, anchor: 'middle' });
const chevron = (x, y, col = MUTED) => `<path d="M${x} ${y - 5} l5 5 l-5 5" fill="none" stroke="${col}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
const pill = (x, y, label, { bg = '#22262e', fg = '#fff', size = 11, h = 22, stroke = null } = {}) => {
  const w = textW(label, size, 600) + 16;
  return { w, svg: `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${bg}" ${stroke ? `stroke="${stroke}"` : ''}/>` + T(x + w / 2, y + h / 2 + size * 0.36, label, { size, w: 600, fill: fg, anchor: 'middle' }) };
};
function pills(x, y, labels, opts) { let o = '', cx = x; labels.forEach((l) => { const p = pill(cx, y, l, opts); o += p.svg; cx += p.w + 6; }); return o; }
const riskDots = (x, y, level, size = 7) => [1, 2, 3].map((i) => `<rect x="${x + (i - 1) * (size * 2 + 3)}" y="${y}" width="${size * 2}" height="${size}" rx="${size / 2}" fill="${i <= level ? [GREEN, AMBER, RED][level - 1] : '#3a3f4a'}"/>`).join('');
function statusBar(dark = true) {
  const c = dark ? '#fff' : '#111';
  return T(24, 30, '9:41', { size: 15, w: 600, fill: c }) +
    `<rect x="${W - 58}" y="19" width="26" height="13" rx="3" fill="none" stroke="${c}" stroke-width="1.5"/><rect x="${W - 56}" y="21" width="18" height="9" rx="1.5" fill="${c}"/>` +
    [0, 1, 2, 3].map((i) => `<rect x="${W - 92 + i * 6}" y="${30 - (i + 1) * 3}" width="4" height="${(i + 1) * 3}" rx="1" fill="${c}"/>`).join('');
}
function tabBar(active = 'profile') {
  const y = H - 84;
  const home = (cx, yy, c) => `<path d="M${cx - 11} ${yy + 10} l11 -10 l11 10 v12 h-7 v-7 h-8 v7 h-7 Z" fill="${c === '#fff' ? c : 'none'}" stroke="${c}" stroke-width="2" stroke-linejoin="round"/>`;
  const bm = (cx, yy, c) => `<path d="M${cx - 9} ${yy} h18 v23 l-9 -7 l-9 7 Z" fill="${c === '#fff' ? c : 'none'}" stroke="${c}" stroke-width="2" stroke-linejoin="round"/>`;
  const user = (cx, yy, c) => `<circle cx="${cx}" cy="${yy + 6}" r="6" fill="${c === '#fff' ? c : 'none'}" stroke="${c}" stroke-width="2"/><path d="M${cx - 11} ${yy + 23} a11 9 0 0 1 22 0" fill="${c === '#fff' ? c : 'none'}" stroke="${c}" stroke-width="2"/>`;
  const items = [['feed', 'Fil', home], ['saved', 'Sauvegardés', bm], ['profile', 'Profil', user]];
  return `<rect x="0" y="${y}" width="${W}" height="84" fill="${BG}"/><line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${LINE}"/>` +
    items.map(([k, label, icon], i) => { const cx = W * (i * 2 + 1) / 6, on = k === active, c = on ? '#fff' : MUTED; return icon(cx, y + 16, c) + T(cx, y + 56, label, { size: 11, w: on ? 600 : 400, fill: c, anchor: 'middle' }); }).join('') +
    `<rect x="${W / 2 - 67}" y="${H - 10}" width="134" height="5" rx="2.5" fill="#fff" opacity="0.6"/>`;
}
let defs = '';
PF.forEach((p, i) => { defs += `<linearGradient id="pg${i}" x1="0" y1="0" x2="0.5" y2="1"><stop offset="0" stop-color="${p.color}"/><stop offset="1" stop-color="#11141a"/></linearGradient>`; });
const phone = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs}</defs><rect width="${W}" height="${H}" fill="${BG}"/>${body}</svg>`;
const plusBtn = (x, y, label) => { const w = textW(label, 13, 600) + 34; return `<rect x="${x - w}" y="${y}" width="${w}" height="32" rx="16" fill="#fff"/>` + T(x - w + 14, y + 21, '+', { size: 17, w: 700, fill: '#111' }) + T(x - w + 26, y + 21, label, { size: 13, w: 600, fill: '#111' }); };
function spark(x, y, w, h, up, col) {
  let s = 11; const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const n = 14, vals = Array.from({ length: n }, (_, i) => (up ? i : n - i * 0.5) + (r() - 0.5) * 3);
  const mn = Math.min(...vals), mx = Math.max(...vals);
  const d = vals.map((v, i) => `${i ? 'L' : 'M'}${(x + (i * w) / (n - 1)).toFixed(1)} ${(y + h - ((v - mn) / (mx - mn)) * h).toFixed(1)}`).join(' ');
  return `<path d="${d} L${x + w} ${y + h} L${x} ${y + h} Z" fill="${col}" opacity="0.18"/><path d="${d}" fill="none" stroke="${col}" stroke-width="2.5" stroke-linejoin="round"/>`;
}

// ---------- Option A: single page with sections ----------
function optionA() {
  let b = statusBar();
  b += avatar(46, 88, 26) + T(84, 84, ACCOUNT.name, { size: 20, w: 700 }) + T(84, 104, 'Compte · 3 portefeuilles', { size: 13, fill: MUTED }) + T(W - 20, 92, 'Modifier', { size: 13, w: 600, fill: BLUE, anchor: 'end' });
  b += T(20, 150, 'Profil investisseur', { size: 17, w: 700 }) + T(20, 169, 'Partagé par tous vos portefeuilles', { size: 12, fill: MUTED });
  const cy = 182, rh = 47;
  b += `<rect x="16" y="${cy}" width="${W - 32}" height="${rh * 4}" rx="14" fill="${CARD}"/>`;
  SHARED.forEach(([k, v], i) => {
    const y = cy + i * rh;
    if (i) b += `<line x1="32" y1="${y}" x2="${W - 16}" y2="${y}" stroke="${LINE}"/>`;
    b += T(32, y + 20, k, { size: 13, w: 600 }) + T(32, y + 37, v, { size: 12, fill: MUTED }) + chevron(W - 36, y + rh / 2);
  });
  b += T(20, 404, 'Mes portefeuilles', { size: 17, w: 700 }) + plusBtn(W - 20, 384, 'Nouveau');
  PF.forEach((p, i) => {
    const y = 420 + i * 108, h = 100;
    b += `<rect x="16" y="${y}" width="${W - 32}" height="${h}" rx="14" fill="${CARD}" ${p.active ? `stroke="${BLUE}" stroke-width="1.5"` : ''}/>`;
    b += `<rect x="16" y="${y + 14}" width="4" height="${h - 28}" rx="2" fill="${p.color}"/>`;
    b += T(32, y + 26, p.name, { size: 15, w: 700 });
    if (p.active) b += pill(32 + textW(p.name, 15, 700) + 10, y + 12, 'Actif', { bg: 'none', fg: BLUE, stroke: BLUE, size: 10, h: 18 }).svg;
    b += T(W - 32, y + 26, p.value, { size: 15, w: 700, anchor: 'end' }) + T(W - 32, y + 44, p.ch, { size: 12, w: 600, fill: p.up ? '#5fd384' : '#ff7b7b', anchor: 'end' });
    b += T(32, y + 44, p.goal, { size: 12, fill: MUTED });
    b += pills(32, y + 56, [p.horizon, p.risk], {}) + riskDots(32 + textW(p.horizon, 11, 600) + 16 + 6 + textW(p.risk, 11, 600) + 16 + 8, y + 64, RISK[p.risk]);
    b += T(32, y + 92, p.initial + '  ·  ' + p.withdraw, { size: 11, fill: MUTED });
  });
  b += tabBar();
  return phone(b);
}

// ---------- Option B: tabs + big portfolio cards (carousel) ----------
function optionB() {
  let b = statusBar();
  b += avatar(W / 2, 96, 34) + T(W / 2, 156, ACCOUNT.name, { size: 19, w: 700, anchor: 'middle' }) + T(W / 2, 176, '3 portefeuilles · profil complet', { size: 12, fill: MUTED, anchor: 'middle' });
  // segmented control
  b += `<rect x="20" y="194" width="${W - 40}" height="38" rx="19" fill="${CARD}"/><rect x="23" y="197" width="${(W - 46) / 2}" height="32" rx="16" fill="#fff"/>` +
    T(20 + (W - 40) / 4, 218, 'Portefeuilles', { size: 13, w: 600, fill: '#111', anchor: 'middle' }) + T(20 + (3 * (W - 40)) / 4, 218, 'Profil investisseur', { size: 13, w: 600, anchor: 'middle' });
  // carousel
  const cw = 300, ch = 360, cx = 20, cy = 250;
  const p = PF[0];
  b += `<rect x="${cx + cw + 12}" y="${cy + 16}" width="${cw}" height="${ch - 32}" rx="20" fill="url(#pg1)" opacity="0.8"/>` + T(cx + cw + 30, cy + 52, PF[1].name, { size: 18, w: 700 });
  b += `<rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" rx="20" fill="url(#pg0)"/>`;
  b += pill(cx + 18, cy + 18, 'Actif', { bg: '#fff', fg: '#111', size: 10, h: 20 }).svg;
  b += T(cx + 18, cy + 70, p.name, { size: 24, w: 800 }) + T(cx + 18, cy + 92, 'Objectif : ' + p.goal.toLowerCase(), { size: 12, op: 0.85 });
  b += T(cx + 18, cy + 132, p.value, { size: 28, w: 800 }) + T(cx + 18, cy + 152, p.ch + ' depuis le début', { size: 12, w: 600, fill: '#9df0b6' });
  b += spark(cx + 18, cy + 164, cw - 36, 46, true, '#fff');
  const grid = [['Horizon', p.horizon + ' (' + p.until + ')'], ['Risque', p.risk], ['Mise initiale', '10\u202f000\u00a0$ + 300\u00a0$/m'], ['Retraits', 'Aucun avant ' + p.until]];
  grid.forEach(([k, v], i) => {
    const gx = cx + 18 + (i % 2) * ((cw - 36) / 2 + 6), gy = cy + 226 + Math.floor(i / 2) * 62, gw = (cw - 36) / 2 - 6;
    b += `<rect x="${gx}" y="${gy}" width="${gw}" height="54" rx="10" fill="#000" opacity="0.28"/>` + T(gx + 10, gy + 20, k, { size: 11, op: 0.75 }) + T(gx + 10, gy + 40, v, { size: 12, w: 700 });
    if (k === 'Risque') b += riskDots(gx + gw - 60, gy + 14, RISK[p.risk], 6);
  });
  // dots + create
  [0, 1, 2].map((i) => (b += `<circle cx="${W / 2 - 14 + i * 14}" cy="${cy + ch + 20}" r="${i === 0 ? 4 : 3}" fill="${i === 0 ? '#fff' : '#555'}"/>`));
  b += `<rect x="20" y="${cy + ch + 40}" width="${W - 40}" height="48" rx="14" fill="none" stroke="#3a3f4a" stroke-width="1.5" stroke-dasharray="6 5"/>` + T(W / 2, cy + ch + 69, '+  Créer un portefeuille', { size: 14, w: 600, anchor: 'middle' });
  b += tabBar();
  return phone(b);
}

// ---------- Option C: dashboard of the active portfolio ----------
function optionC() {
  let b = statusBar();
  // switcher
  b += `<rect x="20" y="52" width="196" height="40" rx="20" fill="${CARD}"/><circle cx="42" cy="72" r="7" fill="${PF[0].color}"/>` + T(56, 77, 'Retraite', { size: 15, w: 700 }) +
    `<path d="M196 69 l5 5 l5 -5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>` + avatar(W - 40, 72, 20);
  b += T(20, 134, PF[0].value, { size: 34, w: 800 }) + T(20, 158, PF[0].ch + ' depuis le début · Objectif : préparer la retraite', { size: 12, w: 600, fill: '#5fd384' });
  // projection
  const x0 = 20, y0 = 176, w0 = W - 40, h0 = 92;
  b += `<rect x="16" y="${y0 - 6}" width="${W - 32}" height="${h0 + 40}" rx="14" fill="${CARD}"/>`;
  [[0.55, GREEN], [0.3, '#e8e8e8'], [0.05, RED]].forEach(([r, c]) => {
    const pts = Array.from({ length: 13 }, (_, m) => [x0 + 14 + (m * (w0 - 28)) / 12, y0 + h0 - 10 - (m / 12) * r * 140 - (r < 0.1 ? -(m / 12) * 20 : 0)]);
    b += `<path d="${pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ')}" fill="none" stroke="${c}" stroke-width="2.5" stroke-linecap="round"/>`;
  });
  b += T(x0 + 14, y0 + h0 + 22, 'Projection jusqu\u2019en 2051 · optimiste / médiane / pessimiste', { size: 11, fill: MUTED });
  // parameters
  b += T(20, 330, 'Paramètres du portefeuille', { size: 16, w: 700 }) + T(W - 20, 330, 'Modifier', { size: 13, w: 600, fill: BLUE, anchor: 'end' });
  const py = 344, rh = 58;
  b += `<rect x="16" y="${py}" width="${W - 32}" height="${rh * 4}" rx="14" fill="${CARD}"/>`;
  const rows = [['Objectif', 'Préparer la retraite'], ['Horizon', '25 ans · 2026 \u2192 2051'], ['Tolérance au risque', 'Dynamique'], ['Mise et retraits', '10\u202f000\u00a0$ + 300\u00a0$/mois · aucun retrait']];
  rows.forEach(([k, v], i) => {
    const y = py + i * rh;
    if (i) b += `<line x1="32" y1="${y}" x2="${W - 16}" y2="${y}" stroke="${LINE}"/>`;
    b += T(32, y + 24, k, { size: 12, fill: MUTED }) + T(32, y + 44, v, { size: 14, w: 600 });
    if (k === 'Horizon') b += `<rect x="${W - 132}" y="${y + 26}" width="100" height="6" rx="3" fill="#3a3f4a"/><rect x="${W - 132}" y="${y + 26}" width="6" height="6" rx="3" fill="${BLUE}"/>` + T(W - 32, y + 20, '2051', { size: 10, fill: MUTED, anchor: 'end' });
    if (k === 'Tolérance au risque') b += riskDots(W - 90, y + 26, 3, 8);
  });
  // shared profile summary
  const sy = 592;
  b += `<rect x="16" y="${sy}" width="${W - 32}" height="72" rx="14" fill="${CARD}"/>` + T(32, sy + 26, 'Profil investisseur (partagé)', { size: 14, w: 700 }) + chevron(W - 36, sy + 21);
  b += pills(32, sy + 38, ['Revenus stables', '1 à charge', 'Intermédiaire', 'ESG'], { size: 10, h: 20 });
  b += `<rect x="16" y="${sy + 82}" width="${W - 32}" height="44" rx="14" fill="none" stroke="#3a3f4a" stroke-dasharray="6 5"/>` + T(W / 2, sy + 109, '+  Nouveau portefeuille', { size: 13, w: 600, anchor: 'middle' });
  b += tabBar();
  return phone(b);
}

// ---------- Common 1: new portfolio wizard (step 3/4) ----------
function wizard() {
  let b = statusBar();
  b += `<path d="M30 66 l-8 8 l8 8" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>` + T(W / 2, 80, 'Nouveau portefeuille', { size: 16, w: 700, anchor: 'middle' }) + T(W - 20, 80, '3 / 4', { size: 13, fill: MUTED, anchor: 'end' });
  [0, 1, 2, 3].forEach((i) => (b += `<rect x="${20 + i * ((W - 52) / 4 + 4)}" y="98" width="${(W - 52) / 4}" height="4" rx="2" fill="${i < 3 ? '#fff' : '#3a3f4a'}"/>`));
  b += pills(20, 118, ['Objectif : Retraite', 'Horizon : 25 ans'], { bg: CARD, fg: MUTED });
  b += T(20, 182, 'Tolérance au risque', { size: 13, w: 600, fill: MUTED });
  ['Si ce portefeuille perdait 20 % en', 'un mois, que feriez-vous ?'].forEach((l, i) => (b += T(20, 214 + i * 30, l, { size: 22, w: 700 })));
  const opts = [
    ['Je vends pour limiter les pertes', 'Prudent', 1],
    ['J\u2019attends que ça remonte', 'Équilibré', 2],
    ['J\u2019en profite pour acheter davantage', 'Dynamique', 3],
  ];
  opts.forEach(([l, r, lvl], i) => {
    const y = 278 + i * 82, on = i === 2;
    b += `<rect x="20" y="${y}" width="${W - 40}" height="70" rx="14" fill="${CARD}" stroke="${on ? '#fff' : LINE}" stroke-width="${on ? 2 : 1}"/>`;
    b += `<circle cx="46" cy="${y + 35}" r="10" fill="none" stroke="${on ? '#fff' : MUTED}" stroke-width="2"/>` + (on ? `<circle cx="46" cy="${y + 35}" r="5" fill="#fff"/>` : '');
    b += T(68, y + 30, l, { size: 14, w: 600 }) + T(68, y + 50, r, { size: 12, fill: MUTED }) + riskDots(68 + textW(r, 12) + 10, y + 42, lvl, 6);
  });
  b += `<rect x="20" y="532" width="${W - 40}" height="96" rx="14" fill="#1b2433"/>` + T(36, 558, 'Profil suggéré : Dynamique', { size: 14, w: 700 }) +
    T(36, 580, 'Compatible avec un horizon de 25 ans. Des baisses', { size: 12, fill: '#c9d4e8' }) + T(36, 598, 'temporaires de \u221225 % à \u221235 % sont possibles.', { size: 12, fill: '#c9d4e8' }) +
    T(36, 616, 'Tient compte de votre profil : revenus stables.', { size: 12, fill: '#8fb0f0' });
  b += T(20, 672, 'Étape suivante : mise initiale et besoins de retrait', { size: 12, fill: MUTED });
  b += `<rect x="20" y="${H - 106}" width="${W - 40}" height="52" rx="14" fill="#fff"/>` + T(W / 2, H - 74, 'Continuer', { size: 16, w: 700, fill: '#111', anchor: 'middle' });
  b += `<rect x="${W / 2 - 67}" y="${H - 10}" width="134" height="5" rx="2.5" fill="#fff" opacity="0.6"/>`;
  return phone(b);
}

// ---------- Common 2: shared investor profile (edit) ----------
function sharedProfile() {
  let b = statusBar();
  b += `<path d="M30 66 l-8 8 l8 8" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>` + T(W / 2, 80, 'Profil investisseur', { size: 16, w: 700, anchor: 'middle' });
  b += `<rect x="20" y="100" width="${W - 40}" height="44" rx="12" fill="#1b2433"/>` + T(36, 127, 'S\u2019applique à vos 3 portefeuilles', { size: 13, w: 600, fill: '#c9d4e8' });
  let y = 160;
  SHARED.slice(0, 3).forEach(([k, v]) => {
    b += `<rect x="16" y="${y}" width="${W - 32}" height="60" rx="14" fill="${CARD}"/>` + T(32, y + 25, k, { size: 14, w: 600 }) + T(32, y + 44, v, { size: 12, fill: MUTED }) +
      `<circle cx="${W - 44}" cy="${y + 30}" r="9" fill="${GREEN}"/><path d="M${W - 48} ${y + 30} l3 3 l6 -6" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`;
    y += 68;
  });
  // expanded section
  b += `<rect x="16" y="${y}" width="${W - 32}" height="__SECTION_H__" rx="14" fill="${CARD}" stroke="#3a3f4a"/>`;
  b += T(32, y + 28, 'Préférences et exclusions', { size: 15, w: 700 }) + `<path d="M${W - 48} ${y + 26} l5 -5 l5 5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`;
  b += T(32, y + 66, 'Privilégier les entreprises ESG', { size: 14, w: 600 }) + `<rect x="${W - 80}" y="${y + 50}" width="48" height="28" rx="14" fill="${GREEN}"/><circle cx="${W - 46}" cy="${y + 64}" r="11" fill="#fff"/>`;
  b += T(32, y + 108, 'Exclure ces secteurs', { size: 13, fill: MUTED });
  const ex = [['Tabac', 1], ['Armes', 1], ['Énergies fossiles', 1], ['Jeux d\u2019argent', 0], ['Alcool', 0], ['Nucléaire', 0], ['Tests sur animaux', 0]];
  let cx = 32, cy = y + 120;
  ex.forEach(([l, on]) => {
    const label = (on ? '\u2713 ' : '') + l, w = textW(label, 13, 600) + 24;
    if (cx + w > W - 32) { cx = 32; cy += 44; }
    b += `<rect x="${cx}" y="${cy}" width="${w}" height="34" rx="17" fill="${on ? '#fff' : 'none'}" stroke="${on ? '#fff' : '#3a3f4a'}"/>` + T(cx + w / 2, cy + 22, label, { size: 13, w: 600, fill: on ? '#111' : '#fff', anchor: 'middle' });
    cx += w + 8;
  });
  const ny = cy + 60;
  b += T(32, ny, 'Les produits exclus n\u2019apparaîtront plus dans', { size: 12, fill: MUTED }) + T(32, ny + 18, 'le fil ni dans les recommandations.', { size: 12, fill: MUTED });
  b += `<rect x="32" y="${ny + 30}" width="${W - 64}" height="28" rx="8" fill="#22262e"/>` + T(W / 2, ny + 49, '2 produits du fil seraient exclus', { size: 12, w: 600, fill: AMBER, anchor: 'middle' });
  b = b.replace('__SECTION_H__', String(ny + 72 - y));
  b += tabBar();
  return phone(b);
}

// ---------- output ----------
function png(svg, file, width) {
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'Inter' } });
  fs.writeFileSync(path.join(OUT, file), r.render().asPng());
}
const S = { A: optionA(), B: optionB(), C: optionC(), wiz: wizard(), shared: sharedProfile() };
png(S.A, 'option-a-page-unique.png', W * 2);
png(S.B, 'option-b-onglets-cartes.png', W * 2);
png(S.C, 'option-c-tableau-de-bord.png', W * 2);
png(S.wiz, 'commun-nouveau-portefeuille.png', W * 2);
png(S.shared, 'commun-profil-investisseur.png', W * 2);

const inner = (s) => s.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
function sheet(title, screens, labels, file) {
  const SW = screens.length * W + (screens.length + 1) * 40, SH = H + 170;
  let o = `<svg xmlns="http://www.w3.org/2000/svg" width="${SW}" height="${SH}"><defs>${defs}</defs><rect width="${SW}" height="${SH}" fill="#e9ebef"/>` + T(40, 56, title, { size: 30, w: 800, fill: '#111' });
  screens.forEach((s, i) => {
    const x = 40 + i * (W + 40), y = 90;
    o += `<rect x="${x - 6}" y="${y - 6}" width="${W + 12}" height="${H + 12}" rx="40" fill="#111"/><svg x="${x}" y="${y}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><clipPath id="k${file}${i}"><rect width="${W}" height="${H}" rx="34"/></clipPath><g clip-path="url(#k${file}${i})">${inner(s)}</g></svg>`;
    o += `<circle cx="${x + 18}" cy="${y + H + 44}" r="16" fill="#111"/>` + T(x + 18, y + H + 50, labels[i][0], { size: 16, w: 800, anchor: 'middle' }) +
      T(x + 44, y + H + 50, labels[i][1], { size: 20, w: 700, fill: '#111' }) + T(x + 44, y + H + 74, labels[i][2], { size: 14, fill: '#444' });
  });
  png(o + '</svg>', file, SW);
}
sheet('Écran Profil : 3 propositions', [S.A, S.B, S.C], [
  ['A', 'Page unique', 'Profil partagé puis liste des portefeuilles'],
  ['B', 'Onglets + cartes', 'Un portefeuille par carte, à faire glisser'],
  ['C', 'Tableau de bord', 'Portefeuille actif en grand + sélecteur'],
], 'comparatif-profil.png');
sheet('Écrans communs aux 3 options', [S.wiz, S.shared], [
  ['1', 'Nouveau portefeuille', 'Questionnaire en 4 étapes'],
  ['2', 'Profil investisseur', 'Infos partagées par tous les portefeuilles'],
], 'ecrans-communs.png');
console.log(fs.readdirSync(OUT).join('\n'));
