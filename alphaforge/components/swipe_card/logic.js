/* Logique pure du composant swipe_card : décisions de geste, nonces, fusion de file, constructeurs de tracés SVG.
 * Aucune dépendance au DOM : chargé par le navigateur (window.SwipeLogic) et par Node pour les tests (module.exports).
 * Geste : glisser vers la GAUCHE = J'aime, vers la DROITE = Je n'aime pas, vers le HAUT = Neutre (suivant). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SwipeLogic = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var ACTION_FOR_KEY = { ArrowLeft: "like", ArrowRight: "dislike", ArrowUp: "neutral" };
  var MAX_SENT = 20;

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function thresholds(w, h) {
    return { x: Math.max(70, 0.25 * w), y: Math.max(70, 0.16 * h) };
  }

  /* Que veut dire un glissement de (dx, dy) pixels ? progress va de 0 à 1 (>= 1 : l'action est validée). */
  function resolveDrag(dx, dy, w, h) {
    var t = thresholds(w, h), ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax < 6 && ay < 6) return { action: null, progress: 0, axis: null, committed: false };
    if (ax >= ay) {
      var px = ax / t.x;
      return { action: dx < 0 ? "like" : "dislike", progress: Math.min(px, 1.5), axis: "x", committed: px >= 1 };
    }
    if (dy < 0) {
      var py = ay / t.y;
      return { action: "neutral", progress: Math.min(py, 1.5), axis: "y", committed: py >= 1 };
    }
    return { action: null, progress: 0, axis: "y", committed: false }; // vers le bas : rien
  }

  /* Transformation de la carte pendant le glissement : suit le doigt, tourne légèrement. */
  function dragTransform(dx, dy) {
    var rot = clamp(dx / 18, -12, 12);
    var y = dy > 0 ? dy * 0.25 : dy;
    return { x: dx, y: y, rot: rot };
  }

  function flyOut(action, w, h) {
    if (action === "like") return { x: -(w * 1.4), y: 20, rot: -18 };
    if (action === "dislike") return { x: w * 1.4, y: 20, rot: 18 };
    return { x: 0, y: -(h * 1.2), rot: 0 }; // neutre, masquer
  }

  function newSid(rand) {
    var r = typeof rand === "function" ? rand : Math.random;
    return Math.floor(r() * 0xffffffff).toString(36) + Math.floor(r() * 0xffff).toString(36);
  }
  function makeNonce(sid, n) { return sid + ":" + n; }

  /* Ajoute un événement à la liste des derniers événements envoyés (bornée). */
  function pushEvent(sent, ev) {
    var out = sent.concat([ev]);
    return out.length > MAX_SENT ? out.slice(out.length - MAX_SENT) : out;
  }
  function pendingEvents(sent, acked) {
    var set = {};
    (acked || []).forEach(function (n) { set[n] = true; });
    return sent.filter(function (e) { return !set[e.nonce]; });
  }

  /* File locale après un message "render". Si des événements sont en attente, la file de Python est périmée : on garde la file locale,
   * moins les actifs déjà traités. Sinon on prend celle de Python, en gardant la carte affichée en tête si elle y figure encore. */
  function mergeQueue(localQueue, argsQueue, done, pendingCount) {
    var isDone = function (c) { return !!done[c.ticker]; };
    if (pendingCount > 0) {
      var base = localQueue.length ? localQueue : argsQueue;
      var fresh = {};
      argsQueue.forEach(function (c) { fresh[c.ticker] = c; });
      return base.filter(function (c) { return !isDone(c); }).map(function (c) { return fresh[c.ticker] || c; });
    }
    var q = argsQueue.filter(function (c) { return !isDone(c); });
    var cur = localQueue.length ? localQueue[0].ticker : null;
    if (cur) {
      var i = q.findIndex(function (c) { return c.ticker === cur; });
      if (i > 0) q = [q[i]].concat(q.slice(0, i), q.slice(i + 1));
    }
    return q;
  }

  /* ---------- formats ---------- */
  var NB = " ";
  function frMoney(x) {
    var r = Math.round(x), s = String(Math.abs(r)).replace(/\B(?=(\d{3})+(?!\d))/g, NB);
    return (r < 0 ? "−" : "") + s + NB + "$";
  }
  function frPct(x, d) {
    return (Math.abs(x) * 100).toFixed(d == null ? 1 : d).replace(".", ",") + NB + "%";
  }
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  /* Mini-markdown sûr : échappe d'abord, puis **gras**, listes « - » et paragraphes. */
  function miniMarkdown(text) {
    var blocks = String(text == null ? "" : text).replace(/\r/g, "").split(/\n{2,}/), out = [];
    blocks.forEach(function (b) {
      b = b.trim();
      if (!b) return;
      var lines = b.split("\n"), inline = function (s) { return escapeHtml(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>"); };
      if (lines.every(function (l) { return /^\s*[-•]\s+/.test(l); })) {
        out.push("<ul>" + lines.map(function (l) { return "<li>" + inline(l.replace(/^\s*[-•]\s+/, "")) + "</li>"; }).join("") + "</ul>");
      } else {
        var h = /^#{1,4}\s+(.*)$/.exec(lines[0]);
        if (h && lines.length === 1) out.push("<h4>" + inline(h[1]) + "</h4>");
        else out.push("<p>" + lines.map(function (l) { return inline(l.replace(/^#{1,4}\s+/, "")); }).join("<br>") + "</p>");
      }
    });
    return out.join("");
  }

  /* ---------- tracés SVG ---------- */
  function fmtNum(n) { return (Math.round(n * 10) / 10).toString(); }
  function pathFrom(points) {
    return points.map(function (p, i) { return (i ? "L" : "M") + fmtNum(p[0]) + " " + fmtNum(p[1]); }).join(" ");
  }

  /* Courbe de prix (base 100). Retourne la ligne, l'aire, la ligne de base 100 et les bornes. */
  function sparkline(series, w, h, pad) {
    var p = pad == null ? 6 : pad;
    if (!series || series.length < 2) return { line: "", area: "", baseY: null, min: null, max: null };
    var min = Math.min.apply(null, series), max = Math.max.apply(null, series);
    if (max === min) { max += 1; min -= 1; }
    var lo = Math.min(min, 100), hi = Math.max(max, 100);
    var sx = function (i) { return p + (i * (w - 2 * p)) / (series.length - 1); };
    var sy = function (v) { return h - p - ((v - lo) * (h - 2 * p)) / (hi - lo); };
    var pts = series.map(function (v, i) { return [sx(i), sy(v)]; });
    var line = pathFrom(pts);
    return { line: line, area: line + " L" + fmtNum(sx(series.length - 1)) + " " + fmtNum(h - p) + " L" + fmtNum(sx(0)) + " " + fmtNum(h - p) + " Z",
             baseY: sy(100), min: min, max: max, last: pts[pts.length - 1], lo: lo, hi: hi };
  }

  function niceLinearTicks(lo, hi, n) {
    var span = hi - lo, raw = span / Math.max(1, n), mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
    var step = (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * mag, out = [];
    for (var v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(v);
    return out;
  }
  function logTicks(lo, hi) {
    var out = [], k0 = Math.floor(Math.log10(lo)), k1 = Math.ceil(Math.log10(hi));
    for (var k = k0; k <= k1; k++) [1, 2, 5].forEach(function (m) { var v = m * Math.pow(10, k); if (v >= lo && v <= hi) out.push(v); });
    return out;
  }

  /* Graphique en éventail : bande p5-p95, lignes p5, p50, p95, ligne de la mise de départ. */
  function fanChart(fan, w, h, amount, useLog) {
    var padL = 52, padR = 8, padT = 10, padB = 20;
    if (!fan || fan.length < 2) return null;
    var vals = [];
    fan.forEach(function (f) { vals.push(f.p5, f.p50, f.p95); });
    vals.push(amount);
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    var tr = useLog ? Math.log : function (v) { return v; };
    if (!useLog) { lo = Math.min(lo, 0); }
    var a = tr(Math.max(lo, 1e-9)), b = tr(hi);
    if (useLog) { a -= 0.04 * (b - a); b += 0.04 * (b - a); } else { b += 0.04 * (b - a); }
    var x0 = fan[0].year, x1 = fan[fan.length - 1].year;
    var sx = function (yr) { return padL + ((yr - x0) / (x1 - x0)) * (w - padL - padR); };
    var sy = function (v) { return padT + (1 - (tr(Math.max(v, 1e-9)) - a) / (b - a)) * (h - padT - padB); };
    var mk = function (key) { return fan.map(function (f) { return [sx(f.year), sy(f[key])]; }); };
    var up = mk("p95"), dn = mk("p5");
    var band = pathFrom(up) + " " + dn.slice().reverse().map(function (p) { return "L" + fmtNum(p[0]) + " " + fmtNum(p[1]); }).join(" ") + " Z";
    var ticks = (useLog ? logTicks(Math.exp(a), Math.exp(b)) : niceLinearTicks(Math.max(0, lo), hi, 4)).map(function (v) { return { y: sy(v), label: frMoney(v) }; });
    var xt = [];
    for (var yr = Math.ceil(x0); yr <= x1 + 1e-9; yr++) xt.push({ x: sx(yr), label: String(yr) });
    var last = function (key) { return [sx(fan[fan.length - 1].year), sy(fan[fan.length - 1][key])]; };
    return { p5: pathFrom(dn), p50: pathFrom(mk("p50")), p95: pathFrom(up), band: band, baseY: sy(amount), yTicks: ticks, xTicks: xt,
             ends: { p5: last("p5"), p50: last("p50"), p95: last("p95") }, padL: padL, padR: padR, padT: padT, padB: padB, w: w, h: h };
  }

  /* Barres avant / après : largeur relative de chaque barre (0..1) sur une échelle commune. */
  function impactScale(bar) {
    var m = Math.max(bar.before || 0, bar.after || 0, bar.limit || 0) * 1.12 || 1;
    return { before: (bar.before || 0) / m, after: (bar.after || 0) / m, limit: bar.limit ? bar.limit / m : null };
  }

  return { ACTION_FOR_KEY: ACTION_FOR_KEY, thresholds: thresholds, resolveDrag: resolveDrag, dragTransform: dragTransform, flyOut: flyOut,
           newSid: newSid, makeNonce: makeNonce, pushEvent: pushEvent, pendingEvents: pendingEvents, mergeQueue: mergeQueue,
           frMoney: frMoney, frPct: frPct, escapeHtml: escapeHtml, miniMarkdown: miniMarkdown, sparkline: sparkline, fanChart: fanChart,
           impactScale: impactScale, clamp: clamp };
});
