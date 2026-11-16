// Tests de la logique pure du composant : node tests/js/test_logic.js
const assert = require("assert");
const path = require("path");
const L = require(path.join(__dirname, "..", "..", "alphaforge", "components", "swipe_card", "logic.js"));

// --- gestes : gauche = J'aime, droite = Je n'aime pas, haut = neutre
const W = 400, H = 640;
assert.strictEqual(L.resolveDrag(-10, 0, W, H).committed, false);
assert.strictEqual(L.resolveDrag(2, 2, W, H).action, null);
let r = L.resolveDrag(-150, 20, W, H);
assert.deepStrictEqual([r.action, r.committed, r.axis], ["like", true, "x"]);
r = L.resolveDrag(150, -20, W, H);
assert.deepStrictEqual([r.action, r.committed], ["dislike", true]);
r = L.resolveDrag(10, -140, W, H);
assert.deepStrictEqual([r.action, r.committed, r.axis], ["neutral", true, "y"]);
r = L.resolveDrag(5, 200, W, H);
assert.strictEqual(r.action, null); // vers le bas : rien
r = L.resolveDrag(-60, 0, W, H); // seuil horizontal = max(70, 100) = 100
assert.ok(r.action === "like" && !r.committed && r.progress > 0.5 && r.progress < 1);
assert.ok(L.resolveDrag(-99, 0, W, H).committed === false && L.resolveDrag(-100, 0, W, H).committed === true);
assert.ok(L.resolveDrag(-5000, 0, W, H).progress <= 1.5);
// diagonale : l'axe dominant gagne
assert.strictEqual(L.resolveDrag(-120, -110, W, H).action, "like");
assert.strictEqual(L.resolveDrag(-60, -130, W, H).action, "neutral");
// petite carte : seuils minimaux
assert.strictEqual(L.thresholds(200, 300).x, 70);

const t = L.dragTransform(180, -30);
assert.strictEqual(t.x, 180); assert.ok(t.rot > 0 && t.rot <= 12);
assert.ok(L.dragTransform(0, 100).y < 100);
assert.ok(L.flyOut("like", W, H).x < 0 && L.flyOut("dislike", W, H).x > 0 && L.flyOut("neutral", W, H).y < 0);
assert.deepStrictEqual(Object.assign({}, L.ACTION_FOR_KEY), { ArrowLeft: "like", ArrowRight: "dislike", ArrowUp: "neutral" });

// --- nonces et événements
const sid = L.newSid(() => 0.5);
assert.ok(typeof sid === "string" && sid.length > 0);
const seen = new Set();
for (let i = 1; i <= 200; i++) seen.add(L.makeNonce(sid, i));
assert.strictEqual(seen.size, 200);
let sent = [];
for (let i = 1; i <= 30; i++) sent = L.pushEvent(sent, { nonce: L.makeNonce(sid, i), type: "like", ticker: "AAPL" });
assert.strictEqual(sent.length, 20);
assert.strictEqual(sent[0].nonce, L.makeNonce(sid, 11));
assert.strictEqual(L.pendingEvents(sent, [L.makeNonce(sid, 30), L.makeNonce(sid, 29)]).length, 18);
assert.strictEqual(L.pendingEvents(sent, []).length, 20);

// --- fusion de la file
const mk = (...ts) => ts.map((ticker) => ({ ticker }));
let q = L.mergeQueue(mk("A", "B", "C"), mk("B", "C", "D"), { A: true }, 1);
assert.deepStrictEqual(q.map((c) => c.ticker), ["B", "C"]); // en attente : file locale moins ce qui est fait
q = L.mergeQueue(mk("B", "C"), mk("C", "B", "D"), {}, 0);
assert.deepStrictEqual(q.map((c) => c.ticker), ["B", "C", "D"]); // carte affichée gardée en tête
q = L.mergeQueue([], mk("X", "Y"), {}, 0);
assert.deepStrictEqual(q.map((c) => c.ticker), ["X", "Y"]);
q = L.mergeQueue(mk("Z"), mk("X"), {}, 0); // la carte affichée n'est plus dans la file de Python : on prend celle de Python
assert.deepStrictEqual(q.map((c) => c.ticker), ["X"]);

// --- formats
assert.strictEqual(L.frMoney(10000), "10 000 $");
assert.strictEqual(L.frMoney(1234567), "1 234 567 $");
assert.strictEqual(L.frPct(0.129), "12,9 %");
assert.strictEqual(L.escapeHtml('<b a="1">&\'</b>'), "&lt;b a=&quot;1&quot;&gt;&amp;&#39;&lt;/b&gt;");
const md = L.miniMarkdown("Un **gras** <script>alert(1)</script>\n\n- a\n- b\n\n### Titre");
assert.ok(md.includes("<strong>gras</strong>") && md.includes("<ul><li>a</li><li>b</li></ul>") && md.includes("<h4>Titre</h4>"));
assert.ok(!md.includes("<script>"));

// --- SVG
const series = Array.from({ length: 60 }, (_, i) => 100 + i * 2 + Math.sin(i) * 5);
const sp = L.sparkline(series, 320, 110, 6);
assert.ok(sp.line.startsWith("M") && sp.area.endsWith("Z") && !/NaN|undefined/.test(sp.line + sp.area));
assert.ok(sp.baseY >= 0 && sp.baseY <= 110);
assert.strictEqual(L.sparkline([100], 10, 10).line, "");
const flat = L.sparkline([100, 100, 100], 100, 50);
assert.ok(!/NaN/.test(flat.line));
const fan = Array.from({ length: 21 }, (_, i) => ({ year: i / 4, p5: 10000 * (1 - 0.02 * i), p50: 10000 * (1 + 0.05 * i), p95: 10000 * (1 + 0.15 * i) }));
for (const useLog of [false, true]) {
  const f = L.fanChart(fan, 340, 190, 10000, useLog);
  const all = [f.p5, f.p50, f.p95, f.band].join(" ");
  assert.ok(!/NaN|undefined|Infinity/.test(all), "fan " + useLog);
  assert.ok(f.baseY > 0 && f.baseY < 190 && f.yTicks.length >= 2 && f.xTicks.length >= 5);
  assert.ok(f.ends.p95[1] < f.ends.p5[1]); // l'optimiste est plus haut (y plus petit) que le pessimiste
}
assert.strictEqual(L.fanChart([], 100, 100, 1, false), null);
const sc = L.impactScale({ before: 0.1, after: 0.14, limit: 0.12 });
assert.ok(sc.after <= 1 && sc.limit < 1 && sc.before < sc.after);
assert.deepStrictEqual(L.impactScale({ before: 0, after: 0, limit: null }), { before: 0, after: 0, limit: null });

console.log("logic.js : tous les tests passent");
