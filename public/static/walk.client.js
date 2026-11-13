// WALK — a side-scrolling street through the archive, shared with everyone on the page.
// Discovery: a CORVAX topic (signed presence). Movement + talk: direct encrypted WebRTC
// DataChannels between visitors (CORVAX connect/accept), so there is no rate limit and no server.
const CORVAX = "https://cdn.jsdelivr.net/npm/@sloev/corvax@0.1.20/dist/corvax.min.js";
const TOPIC = "supernihil.party/walk";
const MAX_LINKS = 16;

const stage = document.getElementById("walk");
const world = stage.querySelector(".w-world");
const far = stage.querySelector(".w-far");
const hudCount = stage.querySelector(".w-count");
const hudState = stage.querySelector(".w-state");
const prompt = stage.querySelector(".w-prompt");
const talk = stage.querySelector(".w-talk");
const works = JSON.parse(document.getElementById("walk-data").textContent);

// ---- world layout ------------------------------------------------------------
// Salon hang: two staggered rows of cards, oldest on the left, years as markers.
const GROUND = parseInt(getComputedStyle(stage).getPropertyValue("--ground")) || 96;
const ROOM = stage.clientHeight - GROUND;                         // wall height above the ground
const ROW_H = Math.round(Math.max(80, Math.min(210, (ROOM - 240) * 0.38, stage.clientWidth * 0.34)));
const ROWS = [GROUND + 34, GROUND + 34 + ROW_H + 62];             // bottom of each row
const GAP = Math.round(ROW_H * 0.18), START = Math.round(Math.min(420, stage.clientWidth * 0.75));
const YEAR_Y = Math.min(ROWS[1] + Math.round(ROW_H * 1.12) + 44, stage.clientHeight - 150);   // above the top row
const lane = [START, START + Math.round(ROW_H * 0.5)];
const posters = [], years = [];
let lastYear = null;
for (const [i, w] of [...works].reverse().entries()) {
  const year = w.date.slice(0, 4);
  if (year !== lastYear) {
    const x = Math.max(...lane) + 30;
    const y = document.createElement("div");
    y.className = "w-year"; y.textContent = year; y.style.left = `${x}px`; y.style.bottom = `${YEAR_Y}px`;
    world.append(y);
    years.push({ x, year });
    lastYear = year;
    lane[0] = lane[1] = x + 70;
  }
  const r = lane[0] <= lane[1] ? 0 : 1;
  const k = 0.82 + (((i * 7919) % 7) / 7) * 0.3;                  // stable size jitter
  const h = Math.round(ROW_H * k), wpx = Math.round(Math.max(70, Math.min(ROW_H * 1.7, h * w.ar)));
  const x = lane[r];
  const a = document.createElement("a");
  a.className = "w-poster"; a.href = `/works/${encodeURIComponent(w.slug)}`;
  a.style.left = `${x}px`;
  const bottomPx = ROWS[r] + ((i * 37) % 3) * 8;
  a.style.bottom = `${bottomPx}px`;
  a.style.setProperty("--tilt", `${(((i * 7919) % 25) - 12) / 8}deg`);
  a.innerHTML = `<span class="w-img" style="width:${wpx}px;height:${h}px"></span><span class="w-cap"><b></b><i>${year}</i></span>${w.type === "live" ? '<span class="sticker">LIVE</span>' : ""}`;
  a.querySelector("b").textContent = w.title;
  world.append(a);
  posters.push({ el: a, x, w: wpx + 8, lift: bottomPx - GROUND, h, thumb: w.thumb, anim: w.anim, loaded: false, animOn: false, title: w.title });
  lane[r] = x + wpx + GAP;
  if (lane[r] - lane[1 - r] > ROW_H) lane[1 - r] = Math.max(lane[1 - r], lane[r] - ROW_H * 1.2);
}
const WORLD_W = Math.max(...lane) + 300;
world.style.width = `${WORLD_W}px`;
const sign = document.createElement("div");
sign.className = "w-sign"; sign.innerHTML = `<b>the archive</b><span>${works.at(-1)?.date.slice(0, 4)} → ${works[0]?.date.slice(0, 4)}</span>`;
sign.style.left = `${Math.round(Math.min(90, stage.clientWidth * 0.06))}px`;
world.append(sign);
const yearAt = (x) => (years.filter((y) => y.x <= x + 40).at(-1) || years[0])?.year || "";

// timeline strip (minimap) + off-screen indicators
const map = stage.querySelector(".w-map");
const minGap = 64 / Math.max(320, stage.clientWidth);            // keep tick labels from overlapping
let lastTick = -1;
map.innerHTML = years.filter((y) => { const f = y.x / WORLD_W; if (f - lastTick < minGap) return false; lastTick = f; return true; })
  .map((y) => `<span class="w-tick" style="left:${(y.x / WORLD_W) * 100}%">${y.year}</span>`).join("")
  + `<span class="w-view"></span><span class="w-dot me"></span>`;
const mapView = map.querySelector(".w-view"), mapMe = map.querySelector(".w-dot.me");
const edges = { left: stage.querySelector(".w-edge.l"), right: stage.querySelector(".w-edge.r") };

// ---- avatars -----------------------------------------------------------------
const hue = (a) => { let h = 0; for (const ch of String(a)) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
const handle = (a) => `crow-${String(a).slice(0, 4)}`;
// Every player gets their own body and personality, derived from their address.
const KINDS = {
  dome:    { w: [58, 80], h: [46, 60], taper: 0.45 },
  tower:   { w: [46, 60], h: [66, 86], taper: 0.3 },
  pancake: { w: [80, 100], h: [34, 44], taper: 0.55 },
  pear:    { w: [62, 78], h: [56, 72], taper: 0.62 },
};
const MOODS = {
  lazy:    { hop: 3, wobble: 0.7, melt: 0.4, jitter: 0.6, look: 3500, quips: ["can we not", "i was napping", "effort detected"] },
  nervous: { hop: 6, wobble: 1.6, melt: 0.18, jitter: 2.2, look: 700, quips: ["sorry sorry sorry", "was that me?", "eep"] },
  bouncy:  { hop: 11, wobble: 1.3, melt: 0.12, jitter: 1.2, look: 1500, quips: ["again!", "wheee", "boing boing"] },
  grumpy:  { hop: 4, wobble: 0.8, melt: 0.25, jitter: 0.8, look: 2600, quips: ["typical", "unbelievable", "hmph"] },
  dreamy:  { hop: 5, wobble: 1.0, melt: 0.3, jitter: 0.5, look: 4200, quips: ["oh. a wall.", "how poetic", "i see colours"] },
};
function shapeOf(key) {
  let h = 2166136261;
  for (const ch of String(key)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const r = (n = 1) => { h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h >>> 0) % 10000) / 10000 * n; };
  const range = ([a, b]) => Math.round(a + r(b - a));
  const kindName = Object.keys(KINDS)[Math.floor(r(4))], kind = KINDS[kindName];
  const moodName = Object.keys(MOODS)[Math.floor(r(5))];
  const W = range(kind.w), H = range(kind.h);
  const tiers = kindName === "tower" ? 3 + Math.floor(r(2)) : 2 + Math.floor(r(2));
  const n = [1, 2, 2, 2, 3, 3, 4][Math.floor(r(7))];                  // most have two
  const eyes = [];
  const top = W * (1 - kind.taper * 0.75);                           // width of the upper body
  for (let k = 0; k < n; k++) {
    const size = Math.round(Math.min(W, H) * (0.2 + r(0.16)) * (n > 2 ? 0.8 : 1));
    const span = Math.max(0, top - size);
    const x = (W - top) / 2 + (n === 1 ? span / 2 : (span * k) / (n - 1)) + r(4) - 2;
    const y = H * (0.2 + r(0.16)) + (n > 2 && k % 2 ? size * 0.35 : 0);
    eyes.push({ x: Math.round(x), y: Math.round(y), size });
  }
  return { kind: kindName, mood: moodName, W, H, tiers, taper: kind.taper, eyes, ...MOODS[moodName] };
}
function makeAvatar(name, self) {
  const el = document.createElement("div");
  el.className = `w-av${self ? " me" : ""}`;
  el.innerHTML = `<span class="w-bubble" hidden></span><span class="w-name"></span><span class="w-blob"></span>`;
  el.querySelector(".w-name").textContent = name;
  world.append(el);
  return el;
}
function shape(a, key) {
  const s = shapeOf(key);
  Object.assign(a, { H: s.H, W: s.W, traits: s, goo: null });
  const tiers = [];
  for (let i = 0; i < s.tiers; i++) {                                // stacked rolls, narrower towards the top
    const k = i / s.tiers;
    const w = s.W * (1 - s.taper * k - 0.1 * k * k), th = (s.H / s.tiers) * 2.1, b = Math.max(0, (s.H - th) * (i / Math.max(1, s.tiers - 1)));
    tiers.push(`<i class="w-tier" style="width:${w.toFixed(0)}px;height:${th.toFixed(0)}px;bottom:${b.toFixed(0)}px;left:${((s.W - w) / 2).toFixed(0)}px"></i>`);
  }
  const eyes = s.eyes.map((e) => `<i class="w-eye" style="left:${e.x}px;top:${e.y}px;width:${e.size}px;height:${e.size}px"><b></b></i>`).join("");
  const blob = a.el.querySelector(".w-blob");
  blob.style.width = `${s.W}px`; blob.style.height = `${s.H}px`;
  a.el.style.width = `${s.W}px`; a.el.style.marginLeft = `${-s.W / 2}px`;
  a.el.dataset.mood = s.mood;
  blob.innerHTML = `<span class="w-goo">${tiers.join("")}<i class="w-drip a"></i><i class="w-drip b"></i>${eyes}</span>`;
}
function speak(av, text) {
  const b = av.el.querySelector(".w-bubble");
  b.textContent = text; b.hidden = false;
  clearTimeout(av.bubbleTimer);
  av.bubbleTimer = setTimeout(() => { b.hidden = true; }, 4000 + text.length * 60);
}

const me = { x: START * 0.45 + Math.random() * START * 0.2, y: 0, vy: 0, f: 1, walking: false, el: makeAvatar("you", true) };
shape(me, (() => { try { return sessionStorage.getItem("walk.seed") || "me"; } catch { return "me"; } })());
const others = new Map();   // address -> { el, x, y, tx, ty, f, walking, ch, seen }

// ---- input -------------------------------------------------------------------
const keys = new Set();
const typing = () => document.activeElement === talk.input;
addEventListener("keydown", (e) => {
  if (typing()) {
    if (e.key === "Escape") talk.input.blur();
    return;
  }
  if (["ArrowLeft", "ArrowRight", "a", "d", "A", "D"].includes(e.key)) { keys.add(e.key.toLowerCase().replace("arrow", "")); e.preventDefault(); }
  if (e.key === " " || e.key === "w" || e.key === "W") { jump(); e.preventDefault(); }
  if (e.key === "ArrowUp" || e.key === "e" || e.key === "E") { openNear(); e.preventDefault(); }
  if (e.key === "Enter") { talk.input.focus(); e.preventDefault(); }
});
addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase().replace("arrow", "")));
addEventListener("blur", () => keys.clear());
const hold = (btn, key) => {
  const on = (e) => { e.preventDefault(); keys.add(key); btn.classList.add("down"); };
  const off = () => { keys.delete(key); btn.classList.remove("down"); };
  btn.addEventListener("pointerdown", on); btn.addEventListener("pointerup", off);
  btn.addEventListener("pointerleave", off); btn.addEventListener("pointercancel", off);
};
hold(stage.querySelector(".w-left"), "left");
hold(stage.querySelector(".w-right"), "right");
stage.querySelector(".w-jump").addEventListener("pointerdown", (e) => { e.preventDefault(); jump(); });
function jump() { if (me.y === 0) me.vy = 640; }

// ---- slapstick -----------------------------------------------------------------
const QUIPS = {
  bonk: ["art hurts", "critique received", "that's load-bearing art", "do not touch the art", "ow, culture", "rude", "i felt that in my rolls", "conceptual concussion"],
  stomp: ["boing", "sorry not sorry", "trampoline mode", "excuse me", "free ride", "splat"],
  squashed: ["hey!", "i was melting here", "personal space!", "pancake mode", "flattered. flattened.", "rude"],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const quip = (k) => (Math.random() < 0.35 && me.traits ? pick(me.traits.quips) : pick(QUIPS[k]));
function fx(x, y, text) {
  const el = document.createElement("span");
  el.className = "w-fx"; el.textContent = text;
  el.style.left = `${x}px`; el.style.bottom = `${GROUND + y}px`;
  el.style.setProperty("--rot", `${(Math.random() * 16 - 8).toFixed(0)}deg`);
  world.append(el);
  setTimeout(() => el.remove(), 1200);
}
function bonkPoster(i, local) {
  const p = posters[i];
  if (!p) return;
  p.el.classList.remove("bonk"); void p.el.offsetWidth; p.el.classList.add("bonk");
  fx(p.x + p.w / 2, p.lift - 6, pick(["BONK!", "CLANG!", "THUNK!"]));
  if (local) { speak(me, quip("bonk")); sendAll({ t: "fx", k: "bonk", i }); }
}
// Blobs are solid: you can't walk through someone, you bump and squeeze instead.
// (You can still land on top of them.)
function blocked(nx, dir) {
  if (!dir) return null;
  for (const o of others.values()) {
    if (o.el.hidden) continue;
    const reach = ((me.W || 50) + (o.W || 50)) * 0.42;
    const overlapY = me.y < o.y + (o.H || 50) * 0.7 && o.y < me.y + (me.H || 50) * 0.7;
    const d = o.x - nx;
    if (overlapY && Math.abs(d) < reach && Math.sign(d) === dir && Math.abs(o.x - me.x) >= Math.abs(d) - 0.01) {
      me.bump = Math.min(1, (me.bump || 0) + 0.25); o.bump = Math.min(1, (o.bump || 0) + 0.25);
      return o.x - dir * reach;
    }
  }
  return null;
}
let bonkCooldown = 0;
function collide(now) {
  if (me.y > 0 && me.vy > 0 && now > bonkCooldown) {             // head into a hanging work
    const head = me.y + me.H;
    for (const [i, p] of posters.entries()) {
      if (me.x > p.x + 6 && me.x < p.x + p.w - 6 && head > p.lift + 12 && head < p.lift + p.h * 0.6) {
        me.vy = -180; bonkCooldown = now + 600; bonkPoster(i, true); break;
      }
    }
  }
  if (me.y > 0 && me.vy < 0) {                                    // land on another player
    for (const [addr, o] of others) {
      if (o.el.hidden) continue;
      const top = o.y + (o.H || 40) * (o.sy || 1);
      if (Math.abs(me.x - o.x) < ((me.W || 44) + (o.W || 44)) * 0.35 && me.y <= top && me.y > top - 26) {
        me.y = top; me.vy = 820;
        o.squash = 1;
        fx(o.x, top + 8, pick(["BOING!", "SPLAT!", "SQUISH!"]));
        speak(me, quip("stomp"));
        try { o.ch?.send(JSON.stringify({ t: "stomp" })); } catch {}
        break;
      }
    }
  }
}

let near = null;
function openNear() { if (near) location.href = near.el.href; }
prompt.addEventListener("click", openNear);

talk.onsubmit = (e) => {
  e.preventDefault();
  const text = talk.input.value.trim().slice(0, 140);
  if (!text) { talk.input.blur(); return; }
  speak(me, text);
  sendAll({ t: "s", m: text });
  talk.input.value = "";
  talk.input.blur();
};

// ---- loop ----------------------------------------------------------------------
let last = performance.now(), cam = 0, lastSent = 0, sentState = "";
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  blobDt = dt;
  const dir = (keys.has("right") || keys.has("d") ? 1 : 0) - (keys.has("left") || keys.has("a") ? 1 : 0);
  me.walking = dir !== 0;
  if (dir) me.f = dir;
  const nx = Math.max(40, Math.min(WORLD_W - 60, me.x + dir * 240 * dt));
  me.x = blocked(nx, dir) ?? nx;
  me.vy -= 1800 * dt; me.y = Math.max(0, me.y + me.vy * dt);
  if (me.y === 0) me.vy = 0;
  collide(now);
  place(me);

  for (const o of others.values()) {
    o.x += (o.tx - o.x) * Math.min(1, dt * 10);
    o.y += (o.ty - o.y) * Math.min(1, dt * 14);
    place(o);
  }

  const vw = stage.clientWidth;
  const target = Math.max(0, Math.min(WORLD_W - vw, me.x - vw * 0.42));
  cam += (target - cam) * Math.min(1, dt * 6);
  world.style.transform = `translate3d(${-cam}px,0,0)`;
  far.style.transform = `translate3d(${-cam * 0.25}px,0,0)`;

  drawRadar(vw);

  near = null;
  for (const p of posters) {
    if (!p.loaded && p.x > cam - 600 && p.x < cam + vw + 900) {
      p.loaded = true;
      p.img = new Image(); p.img.alt = ""; p.img.decoding = "async"; p.img.src = p.thumb;
      p.el.querySelector(".w-img").append(p.img);
    }
    // the GIF only plays while the card is on screen; otherwise the still
    if (p.anim && p.img && now - (p.animCheck || 0) > 300) {
      p.animCheck = now;
      const visible = p.x + p.w > cam && p.x < cam + vw;
      if (visible && !p.animOn) {
        p.animOn = true;
        const g = new Image(); g.decoding = "async";
        g.onload = () => { if (p.animOn) p.img.src = g.src; };
        g.src = p.anim;
      } else if (!visible && p.animOn) { p.animOn = false; p.img.src = p.thumb; }
    }
    const d = Math.abs(me.x - (p.x + p.w / 2));
    if (d < p.w / 2 + 16 && (!near || d < near.d)) near = Object.assign(p, { d });
  }
  prompt.hidden = !near;
  if (near) prompt.querySelector("b").textContent = near.title;

  const state = `${Math.round(me.x)},${Math.round(me.y)},${me.f},${me.walking ? 1 : 0}`;
  if (state !== sentState && now - lastSent > 80 || now - lastSent > 2000) {
    sendAll({ t: "p", x: Math.round(me.x), y: Math.round(me.y), f: me.f, w: me.walking ? 1 : 0 });
    sentState = state; lastSent = now;
  }
  requestAnimationFrame(frame);
}
let radarAt = 0;
function drawRadar(vw) {
  const now = performance.now();
  mapMe.style.left = `${(me.x / WORLD_W) * 100}%`;
  mapView.style.left = `${(cam / WORLD_W) * 100}%`;
  mapView.style.width = `${(vw / WORLD_W) * 100}%`;
  if (now - radarAt < 150) return;
  radarAt = now;
  const side = { left: [], right: [] };
  for (const [addr, o] of others) {
    if (o.el.hidden) continue;
    let dot = o.dot;
    if (!dot) { dot = o.dot = document.createElement("span"); dot.className = "w-dot"; dot.style.setProperty("--who", hue(addr)); map.append(dot); }
    dot.style.left = `${(o.x / WORLD_W) * 100}%`;
    if (o.x < cam + 10) side.left.push({ addr, o, d: cam - o.x });
    else if (o.x > cam + vw - 10) side.right.push({ addr, o, d: o.x - cam - vw });
  }
  for (const k of ["left", "right"]) {
    const list = side[k].sort((a, b) => a.d - b.d), el = edges[k];
    el.hidden = !list.length;
    if (!list.length) continue;
    const n = list[0];
    el.dataset.addr = n.addr;
    el.style.setProperty("--who", hue(n.addr));
    el.querySelector(".w-edge-n").textContent = list.length > 1 ? `${list.length}` : "";
    el.querySelector(".w-edge-t").textContent = `${handle(n.addr)} · ${yearAt(n.o.x)}`;
  }
}
for (const el of Object.values(edges)) {
  el.addEventListener("click", () => {
    const o = others.get(el.dataset.addr);
    if (!o) return;
    me.x = Math.max(40, Math.min(WORLD_W - 60, o.x + (o.x > me.x ? -70 : 70)));
    me.vy = 380;
  });
}

// The blob: light and wobbly while walking, slowly melting into a puddle while standing still.
// Eyes look around on their own, follow the walking direction, and blink now and then.
let blobDt = 0.016;
function place(a) {
  const dt = blobDt, now = performance.now();
  const t = a.traits || MOODS.dreamy;
  const walking = !!a.walking && a.y <= 0.5, air = a.y > 0.5;
  if (!a.goo) {
    a.goo = a.el.querySelector(".w-goo"); a.blob = a.el.querySelector(".w-blob");
    a.tiers = [...a.el.querySelectorAll(".w-tier")];
    a.eyesEl = [...a.el.querySelectorAll(".w-eye")].map((el, k) => ({ el, b: el.querySelector("b"), r: (a.traits?.eyes[k]?.size || 12) * 0.28, px: 0, py: 0, vx: 0, vy: 0 }));
    a.name = a.el.querySelector(".w-name");
    a.melt ??= 0; a.phase ??= Math.random() * 6; a.lookX ??= 0; a.lookY ??= 0; a.nextLook ??= 0; a.nextBlink ??= now + 1500;
    a.pvx ??= 0; a.pvy ??= 0; a.lastX ??= a.x; a.lastY ??= a.y;
  }
  const H = a.H || 50;
  a.melt = walking || air ? Math.max(0, a.melt - dt * 3) : Math.min(1, a.melt + dt * t.melt);
  const m = a.melt * a.melt * (3 - 2 * a.melt);
  a.phase += dt * (walking ? 12 : 1.6);

  let sx, sy, rot = 0, hop = 0;
  if (air) { sx = 0.9; sy = 1.14; rot = 5 * a.f; }
  else if (walking) {
    const s2 = Math.sin(a.phase * 2);
    sx = 1 - 0.07 * s2 * t.wobble; sy = 1 + 0.09 * s2 * t.wobble;
    rot = 4 * Math.sin(a.phase) * a.f * t.wobble;
    hop = Math.abs(Math.sin(a.phase)) * t.hop;
  } else {
    const breathe = 0.02 * Math.sin(a.phase);
    sx = 1 + 0.3 * m - breathe; sy = 1 - 0.28 * m + breathe;           // sags about half way
  }
  if (a.squash > 0) { const q = a.squash; sx *= 1 + 0.7 * q; sy *= 1 - 0.65 * q; a.squash = Math.max(0, q - dt * 1.4); }
  if (a.bump > 0) { sx *= 1 - 0.12 * a.bump; sy *= 1 + 0.08 * a.bump; a.bump = Math.max(0, a.bump - dt * 3); }
  a.sy = sy;
  a.el.style.transform = `translate3d(${a.x}px,${-(a.y + hop)}px,0)`;
  a.goo.style.transform = `rotate(${rot.toFixed(1)}deg) scale(${sx.toFixed(3)},${sy.toFixed(3)})`;
  a.blob.style.setProperty("--melt", m.toFixed(3));
  const amp = (walking ? 3 : air ? 1.5 : 0.8 + 1.5 * m) * t.wobble;
  a.tiers.forEach((el, i) => { el.style.transform = `translateX(${(Math.sin(a.phase * 1.3 - i * 0.9) * amp * (i + 1) * 0.5).toFixed(1)}px)`; });
  a.name.style.transform = `translateY(${Math.max(0, H * (1 - sy) - 2).toFixed(1)}px)`;

  // googly eyes: each pupil is a little mass on a spring, pushed around by the body's motion
  const bvx = (a.x - a.lastX) / Math.max(dt, 0.001), bvy = (a.y + hop - a.lastY) / Math.max(dt, 0.001);
  const ax = (bvx - a.pvx) / Math.max(dt, 0.001), ay = (bvy - a.pvy) / Math.max(dt, 0.001);
  a.lastX = a.x; a.lastY = a.y + hop; a.pvx = bvx; a.pvy = bvy;
  if (now > a.nextLook) {
    a.lookX = (Math.random() * 2 - 1) * 0.8; a.lookY = (Math.random() * 2 - 1) * 0.6;
    a.nextLook = now + t.look * (0.5 + Math.random());
  }
  const lx = walking ? a.f * 0.7 : a.lookX, ly = walking ? 0.2 : a.lookY;
  let blink = 1;
  if (now > a.nextBlink) { blink = 0.1; if (now > a.nextBlink + 120) a.nextBlink = now + 2000 + Math.random() * 4000; }
  for (const e of a.eyesEl) {
    const R = e.r * 1.25;                                           // how far the pupil can roll
    const jit = t.jitter;
    e.vx += (-ax * 0.004 + (lx * R - e.px) * 30 + (Math.random() - 0.5) * jit * 40) * dt;
    e.vy += (ay * 0.004 + 220 + (-ly * R - e.py) * 12 + (Math.random() - 0.5) * jit * 40) * dt;   // gravity pulls it down
    e.vx *= Math.pow(0.04, dt); e.vy *= Math.pow(0.04, dt);
    e.px += e.vx * dt; e.py += e.vy * dt;
    const d = Math.hypot(e.px, e.py);
    if (d > R) {                                                    // bounce off the rim
      e.px *= R / d; e.py *= R / d;
      const nx = e.px / R, ny = e.py / R, dot = e.vx * nx + e.vy * ny;
      if (dot > 0) { e.vx -= 1.6 * dot * nx; e.vy -= 1.6 * dot * ny; }
    }
    e.b.style.transform = `translate(${e.px.toFixed(1)}px, ${e.py.toFixed(1)}px)`;
    e.el.style.transform = `scaleY(${blink})`;
  }
}
requestAnimationFrame(frame);

// ---- network -------------------------------------------------------------------
let peer = null, myAddr = null;
function setState(text) { hudState.textContent = text; }
function count() { hudCount.textContent = `${[...others.values()].filter((o) => o.ch).length + 1} here`; }

function sendAll(msg) {
  const s = JSON.stringify(msg);
  for (const o of others.values()) if (o.ch?.readyState === "open") try { o.ch.send(s); } catch {}
}

function attach(addr, ch) {
  if (!addr || addr === myAddr) return;
  let o = others.get(addr);
  if (!o) {
    o = { x: START - 200, y: 0, tx: START - 200, ty: 0, f: 1, walking: false, el: makeAvatar(handle(addr)), ch: null };
    shape(o, addr);
    o.el.style.setProperty("--who", hue(addr));
    o.el.hidden = true;
    others.set(addr, o);
  }
  if (o.ch && o.ch !== ch && o.ch.readyState === "open") { if (myAddr < addr) return; try { o.ch.close(); } catch {} }
  o.ch = ch;
  const hello = () => { try { ch.send(JSON.stringify({ t: "p", x: Math.round(me.x), y: Math.round(me.y), f: me.f, w: 0 })); } catch {} count(); };
  if (ch.readyState === "open") hello(); else ch.addEventListener("open", hello);
  ch.addEventListener("message", (e) => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (m.t === "p") {
      const first = o.el.hidden;
      o.tx = +m.x || 0; o.ty = +m.y || 0; o.f = m.f < 0 ? -1 : 1; o.walking = !!m.w;
      if (first) { o.x = o.tx; o.y = o.ty; o.el.hidden = false; }
    } else if (m.t === "s" && typeof m.m === "string") speak(o, m.m.slice(0, 140));
    else if (m.t === "fx" && m.k === "bonk") bonkPoster(Number(m.i), false);
    else if (m.t === "stomp") {                                    // somebody jumped on me
      me.squash = 1;
      fx(me.x, me.y + (me.H || 40) + 6, pick(["SPLAT!", "SQUISH!"]));
      setTimeout(() => speak(me, quip("squashed")), 250);
    }
  });
  ch.addEventListener("close", () => { if (o.ch === ch) drop(addr); });
}
function drop(addr) {
  const o = others.get(addr);
  if (!o) return;
  o.el.remove(); o.dot?.remove(); others.delete(addr); count();
}

const dialing = new Set();
async function dial(addr) {
  if (!peer || addr === myAddr || dialing.has(addr) || others.get(addr)?.ch || others.size >= MAX_LINKS) return;
  dialing.add(addr);
  try { const { channel } = await peer.connect(addr, { timeout: 12000 }); attach(addr, channel); }
  catch {}
  finally { dialing.delete(addr); }
}

async function connect() {
  setState("connecting…");
  try {
    const { Peer } = await import(CORVAX);
    let seed = null;
    try { seed = sessionStorage.getItem("walk.seed"); } catch {}
    peer = await Peer.create({ seed });
    try { sessionStorage.setItem("walk.seed", peer.seed); } catch {}
    myAddr = peer.address;
    shape(me, myAddr);
    me.el.style.setProperty("--who", 0);
    peer.accept(({ from, channel }) => attach(from, channel));
    await peer.publish();
    const topic = await peer.topic(TOPIC);
    topic.subscribe({
      presence: (e) => {
        if (e.address === myAddr) return;
        if (e.presence === "recent") {
          // the smaller address dials; the other side dials too if nothing arrives in a while
          setTimeout(() => dial(e.address), myAddr < e.address ? 0 : 6000);
        } else if (!others.get(e.address)?.ch || others.get(e.address).ch.readyState !== "open") drop(e.address);
      },
    });
    await topic.publish();
    for (const r of await topic.search().catch(() => [])) if (r.address !== myAddr) setTimeout(() => dial(r.address), myAddr < r.address ? 0 : 6000);
    setState("live");
    stage.classList.add("online");
    count();
    addEventListener("pagehide", () => { topic.close().catch(() => {}); peer.close().catch(() => {}); });
  } catch (e) {
    setState("solo");
    hudCount.textContent = "offline";
  }
}
connect();
