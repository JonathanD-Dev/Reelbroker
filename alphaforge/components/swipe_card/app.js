/* Composant Streamlit « swipe_card » : une carte à la fois, glisser, boutons, clavier. Aucun réseau, aucune dépendance.
 * Protocole : window.parent.postMessage({isStreamlitMessage: true, type: ...}). Voir alphaforge/ui_feed.py pour le contrat des événements. */
(function () {
  "use strict";
  var L = window.SwipeLogic;
  var FRAME_H = 800;
  var S = { labels: {}, queue: [], done: {}, saved: {}, details: {}, sent: [], seq: 0, sid: L.newSid(), shown: null, expanded: false, animating: false,
            deferred: null, drag: null, asked: {}, weights: {}, wTimer: null, menuOpen: false, toastTimer: null };
  var root = document.getElementById("root");

  /* ---------- protocole Streamlit ---------- */
  function post(type, extra) { window.parent.postMessage(Object.assign({ isStreamlitMessage: true, type: type }, extra || {}), "*"); }
  function setHeight() { post("streamlit:setFrameHeight", { height: FRAME_H }); }
  function emit(type, ticker, extra) {
    S.seq += 1;
    var ev = Object.assign({ nonce: L.makeNonce(S.sid, S.seq), type: type, ticker: ticker }, extra || {});
    S.sent = L.pushEvent(S.sent, ev);
    post("streamlit:setComponentValue", { value: { events: S.sent }, dataType: "json" });
  }

  /* ---------- utilitaires ---------- */
  function $(sel) { return root.querySelector(sel); }
  function lab(k) { return S.labels[k] != null ? S.labels[k] : k; }
  var esc = L.escapeHtml;
  function top() { return S.queue[0] || null; }

  var ICON = {
    bookmark: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 3h12v18l-6-4.5L6 21z"/></svg>',
    bookmarkOn: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 3h12v18l-6-4.5L6 21z"/></svg>',
    dots: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>',
    heart: '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7.5-4.6-9.6-9.2C1 8.6 2.9 5 6.3 5c2 0 3.4 1.1 4.2 2.4h3C14.3 6.1 15.7 5 17.7 5c3.4 0 5.3 3.6 3.9 6.8C19.5 16.4 12 21 12 21z"/></svg>',
    cross: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    up: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
    compatible: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5L15.5 10"/></svg>',
    tension: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.01"/></svg>',
    conflict: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M8 2h8l6 6v8l-6 6H8l-6-6V8z"/><path d="M9 9l6 6M15 9l-6 6"/></svg>'
  };

  /* ---------- thème ---------- */
  function applyTheme(t) {
    var r = document.documentElement;
    var base = (t && t.base) || (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    r.setAttribute("data-base", base);
    if (!t) return;
    if (t.backgroundColor) r.style.setProperty("--bg", t.backgroundColor);
    if (t.secondaryBackgroundColor) r.style.setProperty("--surface", t.secondaryBackgroundColor);
    if (t.textColor) r.style.setProperty("--text", t.textColor);
    if (t.primaryColor) r.style.setProperty("--primary", t.primaryColor);
    if (t.font) document.body.style.fontFamily = t.font + ", system-ui, sans-serif";
  }

  /* ---------- rendu de la carte ---------- */
  function sparkSvg(c, w, h) {
    var s = L.sparkline(c.spark, w, h, 6);
    if (!s.line) return "";
    return '<svg class="chart" viewBox="0 0 ' + w + " " + h + '" role="img" aria-label="' + esc(lab("history")) + '">' +
      '<line x1="6" x2="' + (w - 6) + '" y1="' + s.baseY.toFixed(1) + '" y2="' + s.baseY.toFixed(1) + '" stroke="currentColor" stroke-opacity=".35" stroke-dasharray="3 3"/>' +
      '<path d="' + s.area + '" fill="var(--primary)" fill-opacity=".14"/><path d="' + s.line + '" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linejoin="round"/>' +
      '<circle cx="' + s.last[0].toFixed(1) + '" cy="' + s.last[1].toFixed(1) + '" r="3" fill="var(--primary)"/></svg>';
  }

  function cardHtml(c) {
    var v = c.verdict;
    return '<div class="deckwrap"><div class="ghost g2"></div><div class="ghost g1"></div>' +
      '<article class="card" id="card" data-verdict="' + esc(v) + '" style="--hue:' + (c.hue | 0) + '">' +
      '<div class="edge e-left">← ' + esc(lab("like")) + '</div><div class="edge e-right">' + esc(lab("dislike")) + ' →</div><div class="edge e-top">↑ ' + esc(lab("neutral")) + '</div>' +
      '<div class="stamp s-like" id="st-like">' + esc(lab("like")) + '</div><div class="stamp s-dislike" id="st-dislike">' + esc(lab("dislike")) + '</div><div class="stamp s-neutral" id="st-neutral">' + esc(lab("neutral")) + '</div>' +
      '<header class="hdr" id="hdr"><div class="chip v-' + esc(v) + '" role="status">' + ICON[v] + '<div><strong>' + esc(c.verdict_text) + '</strong><small>' + esc(c.verdict_sub) + '</small></div></div>' +
      '<div class="tools"><button class="ibtn" id="btn-save" aria-pressed="false" title="' + esc(lab("save")) + '" aria-label="' + esc(lab("save")) + '">' + ICON.bookmark + '</button>' +
      '<button class="ibtn" id="btn-menu" aria-haspopup="true" aria-expanded="false" title="' + esc(lab("menu")) + '" aria-label="' + esc(lab("menu")) + '">' + ICON.dots + '</button></div></header>' +
      '<div class="menu" id="menu" hidden role="menu"><button role="menuitem" id="m-buy">' + esc(lab("buy")) + '</button><small>' + esc(lab("simulation")) + '</small><button role="menuitem" id="m-hide">' + esc(lab("hide")) + '</button></div>' +
      '<div class="scroll" id="scroll"><section class="hero"><div class="logo" aria-hidden="true">' + esc(c.initials) + '</div>' + sparkSvg(c, 320, 110) +
      '<div class="chips">' + (c.chips || []).map(function (p) { return '<span class="pill">' + esc(p.label) + " <b>" + esc(p.value) + "</b></span>"; }).join("") + '</div><div class="win">' + esc(c.window) + '</div></section>' +
      '<section class="info"><h2>' + esc(c.name) + '</h2><div class="sub">' + esc(c.ticker) + " · " + esc(c.class_label) + (c.sector ? " · " + esc(c.sector) : "") + '</div>' +
      (c.avoided ? '<span class="badge">' + esc(lab("avoided")) + '</span>' : "") +
      '<div class="why"><b>' + esc(lab("why")) + '</b><p>' + esc(c.short) + '</p></div>' + (c.similarity_note ? '<div class="simnote">' + esc(c.similarity_note) + '</div>' : "") +
      '<button class="more" id="btn-more" aria-expanded="false">' + esc(lab("more")) + '</button></section>' +
      '<div class="sheet" id="sheet"></div></div></article><div class="toast" id="toast" role="status"></div></div>';
  }

  function actionsHtml() {
    var b = function (cls, icon, key, hint) {
      return '<button class="act ' + cls + '" data-act="' + cls + '" aria-label="' + esc(lab(key)) + '"><span class="circle">' + icon + '</span><b>' + esc(lab(key)) + '</b><small>' + esc(lab(hint)) + '</small></button>';
    };
    return '<div class="actions">' + b("like", ICON.heart, "like", "like_hint") + b("neutral", ICON.up, "neutral", "neutral_hint") + b("dislike", ICON.cross, "dislike", "dislike_hint") + '</div>' +
      '<div class="kbd">' + esc(lab("kbd")) + '</div>';
  }

  function emptyHtml() {
    return '<div class="stage"><div class="empty"><h2>' + esc(lab("empty_title")) + '</h2><p>' + esc(lab("empty_text")) + '</p></div></div>';
  }

  function renderCard() {
    var c = top();
    S.expanded = false;
    S.menuOpen = false;
    if (!c) { S.shown = null; root.innerHTML = emptyHtml(); setHeight(); return; }
    S.shown = c.ticker;
    root.innerHTML = '<div class="stage">' + cardHtml(c) + actionsHtml() + '</div>';
    bind();
    refreshDynamic();
    setHeight();
  }

  /* ---------- vue détaillée ---------- */
  function currentWeight(c) {
    var w = S.weights[c.ticker];
    return w != null ? w : (S.details[c.ticker] && S.details[c.ticker].impact ? S.details[c.ticker].impact.weight_pct : c.impact.weight_pct);
  }

  function sheetHtml(c) {
    var w = currentWeight(c);
    return '<h3>' + esc(lab("history")) + '</h3>' + sparkSvg(c, 340, 120) +
      '<div class="meta" style="display:flex;justify-content:space-between"><span>' + esc(c.spark_dates[0]) + '</span><span>' + esc(c.window) + ' · base 100</span><span>' + esc(c.spark_dates[1]) + '</span></div>' +
      '<h3>' + esc(lab("stats")) + '</h3><div class="statgrid">' + c.stats.map(function (s) {
        return '<div class="stat"><span>' + esc(s.label) + '</span><b>' + esc(s.value) + '</b><small>' + esc(s.hint) + '</small></div>';
      }).join("") + '</div>' +
      '<h3>' + esc(lab("impact")) + '</h3><div class="winput" data-nodrag><span>' + esc(lab("weight_prefix")) + '</span>' +
      '<button class="stepper" data-step="-1" aria-label="−1">−</button><input id="w-in" type="number" inputmode="numeric" min="1" max="50" step="1" value="' + w + '" aria-label="' + esc(lab("weight_prefix") + " " + lab("weight_suffix")) + '">' +
      '<button class="stepper" data-step="1" aria-label="+1">+</button><span>' + esc(lab("weight_suffix")) + '</span></div><div id="sec-impact"></div>' +
      '<h3>' + esc(lab("scenarios")) + '</h3><div id="sec-scen"></div>' +
      '<h3>' + esc(lab("more_text")) + '</h3><div id="sec-more"></div>' +
      '<div class="sheetfoot"><button class="more" id="btn-less">' + esc(lab("less")) + '</button></div>';
  }

  function impactHtml(c) {
    var w = S.weights[c.ticker] != null ? S.weights[c.ticker] : c.impact.weight_pct;
    var d = S.details[c.ticker] && S.details[c.ticker].impact, imp = null;
    if (d && d.weight_pct === w) imp = d; else if (c.impact.weight_pct === w) imp = c.impact;
    var busy = !imp;
    imp = imp || d || c.impact;
    var html = '<div class="' + (busy ? "busy" : "") + '"><div class="verdict-line v-' + esc(imp.verdict) + '">' + ICON[imp.verdict] + '<span>' + esc(lab("at_weight")) + " " + imp.weight_pct + " % : " + esc(imp.verdict_text) + '</span></div>' +
      (busy ? '<div class="loading">' + esc(lab("loading")) + '</div>' : "") + '<div class="bars">';
    imp.bars.forEach(function (b) {
      var sc = L.impactScale(b);
      html += '<div class="row"><div class="lbl">' + esc(b.label) + '</div>' +
        '<div class="bar" title="' + esc(lab("before")) + '"><i class="b" style="width:' + (sc.before * 100).toFixed(1) + '%"></i><em>' + esc(lab("before")) + " " + esc(b.before_label) + '</em></div>' +
        '<div class="bar" title="' + esc(lab("after")) + '"><i class="a" style="width:' + (sc.after * 100).toFixed(1) + '%"></i>' + (sc.limit != null ? '<u style="left:' + (sc.limit * 100).toFixed(1) + '%"></u>' : "") +
        '<em>' + esc(lab("after")) + " " + esc(b.after_label) + '</em></div>' +
        (b.limit_label ? '<small>' + esc(lab("limit")) + " : " + esc(b.limit_label) + '</small>' : "") + (b.sub_after ? '<small>' + esc(b.sub_after) + '</small>' : "") + '</div>';
    });
    html += '</div><ul class="checks">' + imp.checks.map(function (k) { return '<li class="' + esc(k.status) + '">' + esc(k.message) + '</li>'; }).join("") + '</ul>' +
      (imp.max_fit ? '<p>' + esc(imp.max_fit) + '</p>' : "") + '<div class="meta">' + esc(imp.window) + " " + esc(imp.note) + '</div></div>';
    return html;
  }

  function fanSvg(sc) {
    var f = L.fanChart(sc.fan, 340, 190, sc.amount, sc.log_scale);
    if (!f) return "";
    var g = '<svg class="chart" viewBox="0 0 340 190" role="img" aria-label="' + esc(lab("scenarios")) + '">';
    f.yTicks.forEach(function (t) { g += '<line x1="' + f.padL + '" x2="' + (340 - f.padR) + '" y1="' + t.y.toFixed(1) + '" y2="' + t.y.toFixed(1) + '" stroke="currentColor" stroke-opacity=".12"/><text x="' + (f.padL - 4) + '" y="' + (t.y + 3).toFixed(1) + '" text-anchor="end">' + esc(t.label) + '</text>'; });
    f.xTicks.forEach(function (t) { g += '<text x="' + t.x.toFixed(1) + '" y="' + (190 - 5) + '" text-anchor="middle">' + esc(t.label) + (t.label === "0" ? "" : " " + (t.label === "1" ? lab("year") : lab("years"))) + '</text>'; });
    g += '<path d="' + f.band + '" fill="var(--primary)" fill-opacity=".10"/>' +
      '<line x1="' + f.padL + '" x2="' + (340 - f.padR) + '" y1="' + f.baseY.toFixed(1) + '" y2="' + f.baseY.toFixed(1) + '" stroke="currentColor" stroke-opacity=".5" stroke-dasharray="2 3"/>' +
      '<path d="' + f.p50 + '" fill="none" stroke="currentColor" stroke-opacity=".55" stroke-width="1.4" stroke-dasharray="5 3"/>' +
      '<path d="' + f.p95 + '" fill="none" stroke="var(--ok)" stroke-width="2.2"/><path d="' + f.p5 + '" fill="none" stroke="var(--warn)" stroke-width="2.2"/>' +
      '<circle cx="' + f.ends.p95[0].toFixed(1) + '" cy="' + f.ends.p95[1].toFixed(1) + '" r="3" fill="var(--ok)"/><circle cx="' + f.ends.p5[0].toFixed(1) + '" cy="' + f.ends.p5[1].toFixed(1) + '" r="3" fill="var(--warn)"/></svg>';
    return g;
  }

  function scenHtml(c) {
    var d = S.details[c.ticker];
    if (!d) return '<div class="loading">' + esc(lab("loading")) + '</div>';
    var sc = d.scenarios;
    if (!sc) return '<p>' + esc(lab("no_data")) + '</p>';
    return '<div class="range">' + esc(sc.headline) + '</div>' +
      '<div class="duo"><div class="box pess"><small>' + esc(lab("pessimistic")) + ' (5e centile)</small><strong>' + esc(sc.p5_label) + '</strong><span>' + esc(sc.p5_ann) + '</span></div>' +
      '<div class="box opt"><small>' + esc(lab("optimistic")) + ' (95e centile)</small><strong>' + esc(sc.p95_label) + '</strong><span>' + esc(sc.p95_ann) + '</span></div></div>' +
      '<p><strong>' + esc(sc.share_below) + '</strong> ' + esc(lab("below_start")) + ' (' + esc(sc.amount_label) + ').</p>' + fanSvg(sc) +
      '<div class="legend"><span><s style="color:var(--ok)"></s>' + esc(lab("optimistic")) + '</span><span><s style="color:var(--warn)"></s>' + esc(lab("pessimistic")) +
      '</span><span><s style="color:inherit;border-top-style:dashed;opacity:.6"></s>' + esc(lab("central")) + ' : ' + esc(sc.p50_label) + '</span>' +
      '<span>' + esc(lab("start_amount")) + ' : ' + esc(sc.amount_label) + (sc.log_scale ? " · " + esc(lab("log_scale")) : "") + '</span></div>' +
      '<div class="callout"><b>⚠</b> ' + esc(sc.disclaimer) + '</div><div class="meta">' + esc(sc.window) + ". " + esc(sc.method) + '</div>';
  }

  function moreHtml(c) {
    var d = S.details[c.ticker];
    if (!d) return '<div class="loading">' + esc(lab("loading")) + '</div><div>' + L.miniMarkdown(c.reasons.join("\n\n")) + '</div>';
    var e = d.explanation, g = e.governance;
    var steps = (e.steps || []).length ? '<details><summary>' + esc("Agents") + '</summary><table>' + e.steps.map(function (s) { return '<tr><td>' + esc(s.agent) + '</td><td>' + esc(s.statut) + '</td><td>' + esc(s.role || "") + (s.detail ? " — " + esc(s.detail) : "") + '</td></tr>'; }).join("") + '</table></details>' : "";
    return '<div>' + L.miniMarkdown(e.long) + '</div><div class="meta">' + esc(lab("mode_prefix")) + " : " + esc(e.mode_label) + '. ' +
      (g ? '<span class="' + (g.passed ? "gov-ok" : "gov-ko") + '">' + esc(g.passed ? lab("governance_ok") : lab("governance_ko")) + "</span> — " + esc(g.text.replace(/^(Réussi|Échoué) : /, "")) : "") + steps + '</div>';
  }

  function refreshDynamic() {
    var c = top();
    if (!c) return;
    var sb = $("#btn-save");
    if (sb) { var on = !!S.saved[c.ticker]; sb.setAttribute("aria-pressed", on ? "true" : "false"); sb.innerHTML = on ? ICON.bookmarkOn : ICON.bookmark; var t = on ? lab("saved") : lab("save"); sb.title = t; sb.setAttribute("aria-label", t); }
    if (!S.expanded) return;
    var a = $("#sec-impact"), b = $("#sec-scen"), m = $("#sec-more");
    if (a) a.innerHTML = impactHtml(c);
    if (b) b.innerHTML = scenHtml(c);
    if (m) m.innerHTML = moreHtml(c);
  }

  function setExpanded(on) {
    var c = top(), card = $("#card");
    if (!c || !card) return;
    S.expanded = on;
    card.classList.toggle("expanded", on);
    var mb = $("#btn-more");
    if (mb) { mb.textContent = on ? lab("less") : lab("more"); mb.setAttribute("aria-expanded", on ? "true" : "false"); }
    if (on) {
      $("#sheet").innerHTML = sheetHtml(c);
      bindSheet();
      $("#scroll").scrollTop = 0;
      if (!S.details[c.ticker] && !S.asked[c.ticker]) { S.asked[c.ticker] = true; emit("expand", c.ticker); }
      refreshDynamic();
    }
  }

  function sendWeight(c, w) {
    w = L.clamp(Math.round(Number(w) || 5), 1, 50);
    S.weights[c.ticker] = w;
    var inp = $("#w-in");
    if (inp) inp.value = w;
    var have = (S.details[c.ticker] && S.details[c.ticker].impact && S.details[c.ticker].impact.weight_pct === w) || c.impact.weight_pct === w;
    refreshDynamic();
    if (have) return;
    clearTimeout(S.wTimer);
    S.wTimer = setTimeout(function () { if (top() && top().ticker === c.ticker) emit("set_weight", c.ticker, { weight: w }); }, 300);
  }

  /* ---------- liaisons ---------- */
  function bindSheet() {
    var c = top(), inp = $("#w-in");
    if (inp) {
      inp.addEventListener("change", function () { sendWeight(c, inp.value); });
      inp.addEventListener("keydown", function (e) { e.stopPropagation(); if (e.key === "Enter") { sendWeight(c, inp.value); inp.blur(); } });
    }
    Array.prototype.forEach.call(root.querySelectorAll(".stepper"), function (b) {
      b.addEventListener("click", function () { sendWeight(c, (Number(inp.value) || 5) + Number(b.getAttribute("data-step"))); });
    });
    var less = $("#btn-less");
    if (less) less.addEventListener("click", function () { setExpanded(false); });
  }

  function toast(msg) {
    var t = $("#toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("on");
    clearTimeout(S.toastTimer);
    S.toastTimer = setTimeout(function () { t.classList.remove("on"); }, 1800);
  }

  function closeMenu() {
    var m = $("#menu"), b = $("#btn-menu");
    S.menuOpen = false;
    if (m) m.hidden = true;
    if (b) b.setAttribute("aria-expanded", "false");
  }

  function toggleSave() {
    var c = top();
    if (!c) return;
    var on = !S.saved[c.ticker];
    if (on) S.saved[c.ticker] = true; else delete S.saved[c.ticker];
    emit(on ? "save" : "unsave", c.ticker);
    toast(on ? lab("toast_saved") : lab("toast_unsaved"));
    refreshDynamic();
  }

  function bind() {
    var card = $("#card");
    $("#btn-more").addEventListener("click", function () { setExpanded(!S.expanded); });
    $("#btn-save").addEventListener("click", toggleSave);
    $("#btn-menu").addEventListener("click", function (e) {
      e.stopPropagation();
      var m = $("#menu");
      S.menuOpen = !S.menuOpen;
      m.hidden = !S.menuOpen;
      $("#btn-menu").setAttribute("aria-expanded", S.menuOpen ? "true" : "false");
    });
    $("#m-buy").addEventListener("click", function () { var c = top(); closeMenu(); if (c) { toast(lab("toast_buy")); emit("simulate_purchase", c.ticker); } });
    $("#m-hide").addEventListener("click", function () { closeMenu(); toast(lab("toast_hide")); commit("hide"); });
    Array.prototype.forEach.call(root.querySelectorAll(".act"), function (b) { b.addEventListener("click", function () { commit(b.getAttribute("data-act")); }); });
    card.addEventListener("pointerdown", onDown);
    card.addEventListener("pointermove", onMove);
    card.addEventListener("pointerup", onUp);
    card.addEventListener("pointercancel", onCancel);
  }

  /* ---------- glisser ---------- */
  function stamps(action, progress) {
    ["like", "dislike", "neutral"].forEach(function (k) {
      var el = $("#st-" + k);
      if (!el) return;
      var on = k === action;
      el.style.opacity = on ? Math.min(1, progress).toFixed(2) : "0";
      el.style.transform = (k === "like" ? "rotate(-12deg)" : k === "dislike" ? "rotate(12deg)" : "") + " scale(" + (on ? (0.8 + 0.4 * Math.min(1, progress)).toFixed(2) : 0.8) + ")";
    });
    var map = { like: ".e-left", dislike: ".e-right", neutral: ".e-top" };
    Object.keys(map).forEach(function (k) { var el = $(map[k]); if (el) el.style.opacity = (k === action ? 1 : 0.35); });
  }

  function onDown(e) {
    if (S.animating || e.button > 0) return;
    if (e.target.closest("button, input, select, textarea, a, [data-nodrag]")) return;
    var inSheet = S.expanded && !e.target.closest("#hdr");
    S.drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, active: false, inSheet: inSheet };
  }
  function onMove(e) {
    var d = S.drag, card = $("#card");
    if (!d || e.pointerId !== d.id || !card) return;
    d.dx = e.clientX - d.x0; d.dy = e.clientY - d.y0;
    if (!d.active) {
      var ax = Math.abs(d.dx), ay = Math.abs(d.dy);
      if (d.inSheet) {
        // dans la zone qui défile : seul un geste nettement horizontal prend la carte ; le vertical défile
        if (ax > 12 && ax > 1.5 * ay) d.active = true; else { if (ay > 12) S.drag = null; return; }
      } else if (ax > 5 || ay > 5) d.active = true; else return;
      try { card.setPointerCapture(d.id); } catch (err) { /* ignoré */ }
      card.classList.remove("snap");
      card.classList.add("dragging");
      closeMenu();
    }
    var t = L.dragTransform(d.dx, d.dy), r = L.resolveDrag(d.dx, d.dy, card.offsetWidth, card.offsetHeight);
    card.style.transform = "translate(" + t.x + "px," + t.y + "px) rotate(" + t.rot + "deg)";
    stamps(r.action, r.progress);
  }
  function onUp(e) {
    var d = S.drag, card = $("#card");
    if (!d || e.pointerId !== d.id) return;
    S.drag = null;
    if (!d.active || !card) return;
    card.classList.remove("dragging");
    var r = L.resolveDrag(d.dx, d.dy, card.offsetWidth, card.offsetHeight);
    if (r.committed && r.action) commit(r.action); else snapBack();
  }
  function onCancel() { if (S.drag && S.drag.active) snapBack(); S.drag = null; }

  function snapBack() {
    var card = $("#card");
    if (!card) return;
    card.classList.remove("dragging");
    card.classList.add("snap");
    card.style.transform = "";
    stamps(null, 0);
    var edges = root.querySelectorAll(".edge");
    Array.prototype.forEach.call(edges, function (el) { el.style.opacity = ""; });
  }

  /* ---------- valider une action : la carte s'envole, la suivante apparaît tout de suite ---------- */
  function commit(action) {
    var c = top(), card = $("#card");
    if (S.animating || !c || !card) return;
    S.animating = true;
    closeMenu();
    var f = L.flyOut(action, card.offsetWidth, card.offsetHeight);
    card.classList.remove("dragging", "snap");
    card.classList.add("flying");
    card.style.transform = "translate(" + f.x + "px," + f.y + "px) rotate(" + f.rot + "deg)";
    card.style.opacity = "0";
    stamps(action === "hide" ? "neutral" : action, 1);
    setTimeout(function () { finish(action, c); }, 240);
  }

  function finish(action, c) {
    S.animating = false;
    S.done[c.ticker] = true;
    S.queue = S.queue.filter(function (x) { return x.ticker !== c.ticker; });
    emit(action, c.ticker);
    if (S.deferred) { var a = S.deferred; S.deferred = null; applyArgs(a); }
    renderCard();
  }

  /* ---------- clavier ---------- */
  document.addEventListener("keydown", function (e) {
    var tag = (e.target && e.target.tagName) || "";
    if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
    var a = L.ACTION_FOR_KEY[e.key];
    if (a) { e.preventDefault(); commit(a); }
    else if (e.key === "Escape") { if (S.menuOpen) closeMenu(); else if (S.expanded) setExpanded(false); }
  });
  document.addEventListener("click", function (e) { if (S.menuOpen && !e.target.closest("#menu, #btn-menu")) closeMenu(); });

  /* ---------- messages de Streamlit ---------- */
  function applyArgs(args) {
    S.labels = args.labels || S.labels;
    S.details = args.details || {};
    var pending = L.pendingEvents(S.sent, args.acked || []);
    S.queue = L.mergeQueue(S.queue, args.queue || [], S.done, pending.length);
    if (pending.length === 0) {
      S.done = {};
      S.saved = {};
      (args.saved || []).forEach(function (t) { S.saved[t] = true; });
    }
  }

  function onRender(args, theme) {
    applyTheme(theme);
    if (S.animating) { S.deferred = args; S.labels = args.labels || S.labels; return; }
    applyArgs(args);
    var c = top();
    if (!c || c.ticker !== S.shown || !$("#card")) renderCard(); else { refreshDynamic(); }
    setHeight();
  }

  window.addEventListener("message", function (e) {
    var d = e.data;
    if (d && d.type === "streamlit:render") onRender(d.args || {}, d.theme);
  });
  post("streamlit:componentReady", { apiVersion: 1 });
  setHeight();
})();
