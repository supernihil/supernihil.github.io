// GHOST EDITOR — somebody is slowly editing this text in an old word processor.
// A caret wanders through the text, makes typos, deletes words, inserts words picked
// by a word-level Markov chain built from the page itself, and pastes things back.
// The more the text has drifted, the more likely the next action is a repair, so over
// time the text hovers around the original (or around the current "goal" phrase).
//
//   <div data-ghost>…</div>                       edit the text inside (links are left alone)
//   <p data-ghost-goals='["a","b"]'>a</p>          keep rewriting towards one phrase, then the next

const NEAR = {
  q: "wa", w: "qes", e: "wrd", r: "etf", t: "ryg", y: "tuh", u: "yij", i: "uok", o: "ipl", p: "o",
  a: "qsz", s: "adw", d: "sfe", f: "dgr", g: "fht", h: "gjy", j: "hku", k: "jli", l: "ko",
  z: "xa", x: "zcs", c: "xvd", v: "cbf", b: "vng", n: "bmh", m: "nj",
};
const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function words(text) {
  const out = [];
  for (const m of text.matchAll(WORD)) out.push({ s: m.index, e: m.index + m[0].length, w: m[0] });
  return out;
}

function chain(corpus) {
  const next = new Map(), all = [];
  const toks = corpus.match(WORD) || [];
  for (let i = 0; i < toks.length; i++) {
    const a = toks[i].toLowerCase();
    all.push(toks[i]);
    if (i + 1 < toks.length) (next.get(a) || next.set(a, []).get(a)).push(toks[i + 1]);
  }
  return { after: (w) => pick(next.get(String(w).toLowerCase()) || all), any: () => pick(all) };
}

function typo(w) {
  if (w.length < 3) return w + w.at(-1);
  const i = 1 + Math.floor(Math.random() * (w.length - 2));
  const kind = Math.random();
  if (kind < 0.3) return w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2);           // swap
  if (kind < 0.5) return w.slice(0, i) + w.slice(i + 1);                              // drop
  if (kind < 0.7) return w.slice(0, i) + w[i] + w.slice(i);                           // double
  const c = w[i].toLowerCase(), n = NEAR[c];
  if (!n) return w.slice(0, i) + w[i] + w.slice(i);
  const r = pick(n);
  return w.slice(0, i) + (w[i] === c ? r : r.toUpperCase()) + w.slice(i + 1);         // fat finger
}

class Ghost {
  constructor(root, { goals = null, pace = 1 } = {}) {
    this.root = root;
    this.pace = pace;
    this.goals = goals;
    this.goalIndex = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement.closest("a, script, style, .ghost-ui") || n.data.trim().length < (goals ? 1 : 24)
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    this.nodes = [];
    for (let n; (n = walker.nextNode());) this.nodes.push({ node: n, goal: n.data });
    if (!this.nodes.length) return;
    if (goals) this.nodes = [this.nodes[0]];
    this.mc = chain([root.textContent, ...(goals || [])].join(" "));

    if (getComputedStyle(root).position === "static") root.style.position = "relative";
    this.caret = Object.assign(document.createElement("span"), { className: "ghost-ui ghost-caret" });
    this.sel = Object.assign(document.createElement("span"), { className: "ghost-ui ghost-sel" });
    this.caret.setAttribute("aria-hidden", "true");
    this.sel.setAttribute("aria-hidden", "true");
    root.append(this.sel, this.caret);
    this.cur = this.nodes[0];
    this.pos = 0;
    this.heldSince = performance.now();
    addEventListener("resize", () => this.draw());
    this.run();
  }

  // ---- drawing ---------------------------------------------------------------
  rectAt(node, pos) {
    const r = document.createRange();
    const len = node.data.length;
    r.setStart(node, Math.min(pos, len));
    r.setEnd(node, Math.min(pos, len));
    let rect = r.getClientRects()[0];
    if (!rect && len) {                         // collapsed range at a line edge: measure a neighbour char
      const a = Math.max(0, Math.min(pos, len - 1));
      r.setStart(node, a); r.setEnd(node, a + 1);
      const rr = r.getBoundingClientRect();
      rect = { left: pos > a ? rr.right : rr.left, top: rr.top, height: rr.height };
    }
    return rect || node.parentElement.getBoundingClientRect();
  }
  draw() {
    if (!this.cur) return;
    const base = this.root.getBoundingClientRect();
    const r = this.rectAt(this.cur.node, this.pos);
    this.caret.style.transform = `translate(${r.left - base.left}px, ${r.top - base.top}px)`;
    this.caret.style.height = `${r.height}px`;
  }
  select(a, b) {
    this.sel.innerHTML = "";
    if (a === b) return;
    const base = this.root.getBoundingClientRect();
    const r = document.createRange();
    r.setStart(this.cur.node, a); r.setEnd(this.cur.node, b);
    for (const q of r.getClientRects()) {
      const s = document.createElement("i");
      Object.assign(s.style, { left: `${q.left - base.left}px`, top: `${q.top - base.top}px`, width: `${q.width}px`, height: `${q.height}px` });
      this.sel.append(s);
    }
  }
  busy(on) { this.caret.classList.toggle("typing", on); }

  // ---- primitive actions (animated) --------------------------------------------
  get data() { return this.cur.node.data; }
  set data(v) { this.cur.node.data = v; }
  key() { return rand(70, 190) / this.pace + (Math.random() < 0.08 ? rand(250, 700) : 0); }

  async go(entry, pos) {
    if (entry !== this.cur) { this.cur = entry; this.pos = 0; this.draw(); await sleep(rand(300, 700)); }
    // walk there word by word, like ctrl+arrow
    const stops = [0, ...words(this.data).flatMap((w) => [w.s, w.e]), this.data.length];
    let guard = 0;
    while (this.pos !== pos && guard++ < 400) {
      const dir = pos > this.pos ? 1 : -1;
      const next = dir > 0 ? stops.find((s) => s > this.pos && s <= pos) ?? pos : [...stops].reverse().find((s) => s < this.pos && s >= pos) ?? pos;
      this.pos = next; this.draw();
      await sleep(rand(45, 110) / this.pace);
    }
    this.pos = pos; this.draw();
    await sleep(rand(150, 450));
  }
  async backspace(n) {
    for (let i = 0; i < n && this.pos > 0; i++) {
      this.data = this.data.slice(0, this.pos - 1) + this.data.slice(this.pos);
      this.pos--; this.draw();
      await sleep(this.key() * 0.6);
    }
  }
  async type(text, sloppy = true) {
    for (const ch of text) {
      if (sloppy && /[a-z]/i.test(ch) && Math.random() < 0.05 && NEAR[ch.toLowerCase()]) {
        await this.insert(pick(NEAR[ch.toLowerCase()]));
        await sleep(rand(200, 500));
        await this.backspace(1);
      }
      await this.insert(ch);
    }
  }
  async insert(ch) {
    this.data = this.data.slice(0, this.pos) + ch + this.data.slice(this.pos);
    this.pos += ch.length; this.draw();
    await sleep(this.key());
  }
  async cut(a, b) {
    await this.go(this.cur, b);
    this.select(a, b); await sleep(rand(450, 900));
    this.data = this.data.slice(0, a) + this.data.slice(b);
    this.select(0, 0); this.pos = a; this.draw();
    await sleep(rand(200, 400));
  }
  async paste(text) {
    const a = this.pos;
    this.data = this.data.slice(0, a) + text + this.data.slice(a);
    this.pos = a + text.length; this.select(a, this.pos); this.draw();
    await sleep(rand(500, 900));
    this.select(0, 0);
  }

  // ---- edits ----------------------------------------------------------------------
  async repair(entry) {
    this.cur = entry;
    const cur = this.data, goal = entry.goal;
    let p = 0;
    while (p < cur.length && p < goal.length && cur[p] === goal[p]) p++;
    let s = 0;
    while (s < cur.length - p && s < goal.length - p && cur[cur.length - 1 - s] === goal[goal.length - 1 - s]) s++;
    const wrong = cur.slice(p, cur.length - s), want = goal.slice(p, goal.length - s);
    await this.go(entry, cur.length - s);
    if (wrong.length > 8 && Math.random() < 0.5) await this.cut(p, p + wrong.length);
    else await this.backspace(wrong.length);
    if (want.length > 14 && !this.goals && Math.random() < 0.5) await this.paste(want);
    else await this.type(want, want.length > 3);
  }

  async mutate(entry) {
    this.cur = entry;
    const ws = words(this.data).filter((w) => w.w.length > 1);
    if (!ws.length) return;
    const w = pick(ws), r = Math.random();
    if (r < 0.45) {                                         // typo inside a word
      const t = typo(w.w);
      let i = 0;
      while (i < t.length && t[i] === w.w[i]) i++;
      await this.go(entry, w.e);
      await this.backspace(w.e - (w.s + i));
      await this.type(t.slice(i), false);
    } else if (r < 0.65) {                                  // delete a word (and its space)
      const end = this.data[w.e] === " " ? w.e + 1 : w.e;
      if (Math.random() < 0.5) await this.cut(w.s, end);
      else { await this.go(entry, end); await this.backspace(end - w.s); }
    } else if (r < 0.85) {                                  // insert a word the chain suggests
      await this.go(entry, w.e);
      await this.type(` ${this.mc.after(w.w).toLowerCase()}`);
    } else {                                                // overwrite a word with a likelier one
      const prev = ws[ws.indexOf(w) - 1]?.w || this.mc.any();
      await this.cut(w.s, w.e);
      await this.type(this.mc.after(prev).toLowerCase());
    }
  }

  async step() {
    if (this.goals) {
      const n = this.nodes[0];
      if (n.node.data === n.goal && performance.now() - this.heldSince > rand(6000, 11000)) {
        this.goalIndex = (this.goalIndex + 1) % this.goals.length;
        n.goal = this.goals[this.goalIndex];
      }
    }
    const dirty = this.nodes.filter((n) => n.node.data !== n.goal);
    const repairOdds = this.goals ? 0.68 : Math.min(0.9, 0.12 + 0.3 * dirty.length);
    this.busy(true);
    if (dirty.length && Math.random() < repairOdds) {
      await this.repair(pick(dirty));
      if (this.goals && this.nodes[0].node.data === this.nodes[0].goal) this.heldSince = performance.now();
    } else {
      const weighted = this.nodes.flatMap((n) => Array(Math.ceil(n.node.data.length / 60)).fill(n));
      await this.mutate(pick(weighted));
    }
    this.busy(false);
  }

  async run() {
    await sleep(rand(1200, 2500));
    for (;;) {
      if (document.hidden) { await sleep(1000); continue; }
      try { await this.step(); } catch {}
      await sleep(rand(1400, 4200) / this.pace);
    }
  }
}

// Runs for everyone (it is slow and small); with reduced motion the caret just doesn't blink.
for (const el of document.querySelectorAll("[data-ghost], [data-ghost-goals]")) {
  let goals = null;
  try { goals = el.dataset.ghostGoals ? JSON.parse(el.dataset.ghostGoals) : null; } catch {}
  new Ghost(el, { goals, pace: goals ? 1.3 : 1 });
}
