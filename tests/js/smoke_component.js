// Test de fumée du composant avec un DOM factice : node tests/js/smoke_component.js <charge.json>
// Vérifie que app.js se charge, produit le HTML attendu avec de vraies charges utiles Python et émet les bons événements.
// Ce n'est PAS un rendu dans un vrai navigateur (pas de mise en page, de CSS ni de vrais événements de pointeur).
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const dir = path.join(__dirname, "..", "..", "alphaforge", "components", "swipe_card");
const P = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));

const posted = [];
const listeners = {}; // window
const docListeners = {};
let cache = {};
function makeEl(sel) {
  const el = {
    sel, innerHTML: "", textContent: "", value: "", hidden: false, title: "", scrollTop: 0, offsetWidth: 400, offsetHeight: 640, listeners: {}, attrs: {}, classes: new Set(),
    style: { setProperty() {} },
    classList: { add: (...c) => c.forEach((x) => el.classes.add(x)), remove: (...c) => c.forEach((x) => el.classes.delete(x)), toggle: (c, on) => (on ? el.classes.add(c) : el.classes.delete(c)) },
    addEventListener(t, f) { (el.listeners[t] = el.listeners[t] || []).push(f); },
    setAttribute(k, v) { el.attrs[k] = String(v); }, getAttribute(k) { return el.attrs[k] != null ? el.attrs[k] : null; },
    setPointerCapture() {}, blur() {}, closest() { return null; },
  };
  return el;
}
const rootEl = makeEl("#root");
Object.defineProperty(rootEl, "innerHTML", { get() { return this._h || ""; }, set(v) { this._h = v; cache = {}; } });
const q = (sel) => (cache[sel] = cache[sel] || makeEl(sel));
rootEl.querySelector = (sel) => (rootEl._h ? q(sel) : null);
rootEl.querySelectorAll = (sel) => {
  if (sel === ".act") return ["like", "neutral", "dislike"].map((k) => { const e = q(".act-" + k); e.attrs["data-act"] = k; return e; });
  if (sel === ".stepper") return ["-1", "1"].map((k) => { const e = q(".stepper" + k); e.attrs["data-step"] = k; return e; });
  return [];
};
global.document = {
  getElementById: () => rootEl, documentElement: { setAttribute() {}, style: { setProperty() {} } }, body: { style: {} },
  addEventListener(t, f) { (docListeners[t] = docListeners[t] || []).push(f); },
};
global.window = {
  SwipeLogic: require(path.join(dir, "logic.js")), parent: { postMessage: (m) => posted.push(m) },
  addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); }, matchMedia: () => ({ matches: false }),
};
global.setTimeout = (fn) => { fn(); return 1; };
global.clearTimeout = () => {};
require(path.join(dir, "app.js"));

const events = () => posted.filter((m) => m.type === "streamlit:setComponentValue").map((m) => m.value.events).pop() || [];
const lastEvent = () => events().slice(-1)[0];
const render = (args) => listeners.message.forEach((f) => f({ data: { type: "streamlit:render", args, theme: { base: "dark", backgroundColor: "#111", secondaryBackgroundColor: "#222", textColor: "#eee", primaryColor: "#48f", font: "Inter" } } }));
const click = (sel) => (q(sel).listeners.click || []).forEach((f) => f({ target: q(sel), stopPropagation() {} }));

assert.ok(posted.some((m) => m.type === "streamlit:componentReady" && m.apiVersion === 1), "componentReady");
assert.ok(posted.some((m) => m.type === "streamlit:setFrameHeight" && m.height > 300), "setFrameHeight");

// 1. première file
const [c0, c1] = P.queue;
render({ ...P, details: {}, acked: [] });
assert.ok(rootEl.innerHTML.includes(c0.name.replace(/&/g, "&amp;")) && rootEl.innerHTML.includes(c0.verdict_text), "carte affichée");
assert.ok(rootEl.innerHTML.includes("<path d=\"M") && !/NaN|undefined|null/.test(rootEl.innerHTML.replace(/Neutre/g, "")), "svg propre, pas d'undefined");
assert.ok(rootEl.innerHTML.includes("Pourquoi") && rootEl.innerHTML.includes("Voir plus"));

// 2. voir plus -> événement expand, éléments de chargement
click("#btn-more");
assert.deepStrictEqual([lastEvent().type, lastEvent().ticker], ["expand", c0.ticker]);
assert.ok(q("#sheet").innerHTML.includes("Prix passé") && q("#sec-scen").innerHTML.includes("Calcul en cours"));
assert.ok(q("#card").classes.has("expanded"));
const nBefore = events().length;
click("#btn-more"); // replier puis rouvrir : pas de deuxième demande
click("#btn-more");
assert.strictEqual(events().length, nBefore, "une seule demande d'expansion");

// 3. détails reçus
const det = P.details_for_first;
render({ ...P, details: { [c0.ticker]: det }, acked: events().map((e) => e.nonce) });
const scen = q("#sec-scen").innerHTML;
assert.ok(scen.includes(det.scenarios.p5_label) && scen.includes(det.scenarios.p95_label) && scen.includes("callout"), "fourchette et avertissement visibles");
assert.ok(scen.indexOf("pess") < scen.indexOf("opt"), "pessimiste d'abord");
assert.ok(scen.includes(det.scenarios.disclaimer.slice(0, 40)), "avertissement dans le HTML");
assert.ok(!/NaN|undefined/.test(scen));
assert.ok(q("#sec-more").innerHTML.includes("Texte rédigé par"), "mode de rédaction");

// 4. changement de part
q("#w-in").value = "12";
(q("#w-in").listeners.change || []).forEach((f) => f({}));
assert.deepStrictEqual([lastEvent().type, lastEvent().weight], ["set_weight", 12]);
assert.ok(q("#sec-impact").innerHTML.includes("busy"), "calcul en cours");
render({ ...P, details: { [c0.ticker]: { ...det, impact: { ...c0.impact, weight_pct: 12 } } }, acked: events().map((e) => e.nonce) });
assert.ok(!q("#sec-impact").innerHTML.includes('class="busy"') && q("#sec-impact").innerHTML.includes("12 %"));
q("#w-in").value = "999";
(q("#w-in").listeners.change || []).forEach((f) => f({}));
assert.strictEqual(lastEvent().weight, 50, "borné à 50 %");

// 5. signet
click("#btn-save");
assert.strictEqual(lastEvent().type, "save");
assert.strictEqual(q("#btn-save").attrs["aria-pressed"], "true");

// 6. J'aime par bouton : la carte suivante apparaît tout de suite
click(".act-like");
assert.strictEqual(lastEvent().type, "like");
assert.strictEqual(lastEvent().ticker, c0.ticker);
assert.ok(rootEl.innerHTML.includes(c1.name.replace(/&/g, "&amp;")), "carte suivante affichée sans attendre Python");
// file périmée de Python (événements non acquittés) : la carte 0 ne revient pas
render({ ...P, details: {}, acked: [] });
assert.ok(rootEl.innerHTML.includes(c1.name.replace(/&/g, "&amp;")), "la file périmée ne ramène pas la carte déjà traitée");
// accusé de réception : la file de Python prend le relais
render({ ...P, queue: P.queue.slice(1), details: {}, acked: events().map((e) => e.nonce) });
assert.ok(rootEl.innerHTML.includes(c1.name.replace(/&/g, "&amp;")));

// 7. clavier
(docListeners.keydown || []).forEach((f) => f({ key: "ArrowRight", target: { tagName: "BODY" }, preventDefault() {} }));
assert.deepStrictEqual([lastEvent().type, lastEvent().ticker], ["dislike", c1.ticker]);

// 8. glisser (pointer events) : 150 px vers la gauche = J'aime
const card = q("#card");
const ev = (x, y) => ({ pointerId: 1, clientX: x, clientY: y, button: 0, target: { closest: () => null } });
(card.listeners.pointerdown || []).forEach((f) => f(ev(300, 300)));
(card.listeners.pointermove || []).forEach((f) => f(ev(240, 300)));
assert.ok(card.classes.has("dragging"));
(card.listeners.pointermove || []).forEach((f) => f(ev(120, 305)));
(card.listeners.pointerup || []).forEach((f) => f(ev(120, 305)));
const last = lastEvent();
assert.ok(last.type === "like" || last.type === "neutral" || last.type === "dislike");
assert.strictEqual(last.type, "like", "glisser à gauche = J'aime");
// sous le seuil : retour en place, aucun événement
const n = events().length;
const card2 = q("#card");
(card2.listeners.pointerdown || []).forEach((f) => f(ev(300, 300)));
(card2.listeners.pointermove || []).forEach((f) => f(ev(270, 300)));
(card2.listeners.pointerup || []).forEach((f) => f(ev(270, 300)));
assert.strictEqual(events().length, n, "sous le seuil : pas d'événement");
assert.ok(card2.classes.has("snap"));

// 9. file vide
render({ ...P, queue: [], details: {}, acked: events().map((e) => e.nonce), saved: [] });
assert.ok(rootEl.innerHTML.includes("parcouru tous les actifs"));

// 10. nonces uniques
const nonces = events().map((e) => e.nonce);
assert.strictEqual(new Set(nonces).size, nonces.length);
console.log("smoke_component.js : OK (" + posted.length + " messages postés)");
