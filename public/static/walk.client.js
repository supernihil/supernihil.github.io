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
const GROUND = parseInt(getComputedStyle(stage).getPropertyValue("--ground")) || 96;
const ROOM = stage.clientHeight - GROUND;                       // wall height above the ground
const POSTER_H = Math.round(Math.max(120, Math.min(280, (ROOM - 190) * 0.62, stage.clientWidth * 0.5)));
const GAP = Math.round(POSTER_H * 0.8), START = 520;
let cursor = START, lastYear = null;
const posters = [];
for (const [i, w] of [...works].reverse().entries()) {          // oldest on the left
  const year = w.date.slice(0, 4);
  if (year !== lastYear) {
    const y = document.createElement("div");
    y.className = "w-year"; y.textContent = year; y.style.left = `${cursor}px`;
    world.append(y);
    lastYear = year; cursor += 140;
  }
  const h = POSTER_H, wpx = Math.round(Math.max(100, Math.min(300, h * w.ar)));
  const a = document.createElement("a");
  a.className = "w-poster"; a.href = `/works/${encodeURIComponent(w.slug)}`;
  a.style.left = `${cursor}px`;
  a.style.bottom = `${GROUND + Math.round(ROOM * 0.18) + ((i * 37) % 3) * 18}px`;
  a.style.setProperty("--tilt", `${(((i * 7919) % 25) - 12) / 10}deg`);
  a.innerHTML = `<span class="w-img" style="width:${wpx}px;height:${h}px"></span><span class="w-cap"><b></b><i>${year}</i></span>${w.type === "live" ? '<span class="sticker">LIVE</span>' : ""}`;
  a.querySelector("b").textContent = w.title;
  world.append(a);
  posters.push({ el: a, x: cursor, w: wpx + 8, thumb: w.thumb, loaded: false, title: w.title });
  cursor += wpx + GAP;
}
const WORLD_W = cursor + 400;
world.style.width = `${WORLD_W}px`;
const sign = document.createElement("div");
sign.className = "w-sign"; sign.innerHTML = `<b>the archive</b><span>${works.at(-1)?.date.slice(0, 4)} → ${works[0]?.date.slice(0, 4)}</span>`;
sign.style.left = "140px";
world.append(sign);

// ---- avatars -----------------------------------------------------------------
const hue = (a) => { let h = 0; for (const ch of String(a)) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
const handle = (a) => `crow-${String(a).slice(0, 4)}`;
function makeAvatar(name, self) {
  const el = document.createElement("div");
  el.className = `w-av${self ? " me" : ""}`;
  el.innerHTML = `<span class="w-bubble" hidden></span><span class="w-name"></span><span class="w-body"><i class="w-head"></i><i class="w-beak"></i><i class="w-leg l"></i><i class="w-leg r"></i></span>`;
  el.querySelector(".w-name").textContent = name;
  world.append(el);
  return el;
}
function speak(av, text) {
  const b = av.el.querySelector(".w-bubble");
  b.textContent = text; b.hidden = false;
  clearTimeout(av.bubbleTimer);
  av.bubbleTimer = setTimeout(() => { b.hidden = true; }, 4000 + text.length * 60);
}

const me = { x: START - 260 + Math.random() * 120, y: 0, vy: 0, f: 1, walking: false, el: makeAvatar("you", true) };
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
function jump() { if (me.y === 0) me.vy = 620; }

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
  const dir = (keys.has("right") || keys.has("d") ? 1 : 0) - (keys.has("left") || keys.has("a") ? 1 : 0);
  me.walking = dir !== 0;
  if (dir) me.f = dir;
  me.x = Math.max(40, Math.min(WORLD_W - 60, me.x + dir * 240 * dt));
  me.vy -= 1800 * dt; me.y = Math.max(0, me.y + me.vy * dt);
  if (me.y === 0) me.vy = 0;
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

  near = null;
  for (const p of posters) {
    if (!p.loaded && p.x > cam - 600 && p.x < cam + vw + 900) {
      p.loaded = true;
      const img = new Image(); img.alt = ""; img.decoding = "async"; img.src = p.thumb;
      p.el.querySelector(".w-img").append(img);
    }
    if (me.x > p.x - 20 && me.x < p.x + p.w + 20) near = p;
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
function place(a) {
  a.el.style.transform = `translate3d(${a.x}px,${-a.y}px,0)`;
  a.el.classList.toggle("walking", !!a.walking && a.y === 0);
  a.el.classList.toggle("air", a.y > 0);
  a.el.classList.toggle("left", a.f < 0);
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
  });
  ch.addEventListener("close", () => { if (o.ch === ch) drop(addr); });
}
function drop(addr) {
  const o = others.get(addr);
  if (!o) return;
  o.el.remove(); others.delete(addr); count();
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
