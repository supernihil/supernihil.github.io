// THE MACHINE — a shared step sequencer over CORVAX topics.
// Everyone in the room edits one 16×8 pattern. Each cell has a version counter:
// odd = on, highest version wins, so concurrent edits merge without a server.
// CORVAX broadcasts are ≤ 1 KB and ≤ 10 per minute per sender, so every visitor
// gets 10 "signals" a minute: each send (a batch of toggles, a shout) costs one.
const CORVAX = "https://cdn.jsdelivr.net/npm/@sloev/corvax@0.1.20/dist/corvax.min.js";
const TOPIC = "supernihil.party/machine";
const STEPS = 16, TRACKS = 8, BUDGET = 10, WINDOW = 60e3;
const NOTES = [880, 783.99, 659.25, 587.33, 523.25, 440];   // A minor pentatonic, top row highest
const LABELS = ["A5", "G5", "E5", "D5", "C5", "A4", "SN", "KK"];

const $ = (s) => document.querySelector(s);
const grid = $("#grid"), here = $("#here"), people = $("#people"), log = $("#log"), meter = $("#meter");
const enterBtn = $("#enter"), playBtn = $("#play"), form = $("#shout"), status = $("#status");

// ---- pattern state -----------------------------------------------------------
const ver = new Uint32Array(STEPS * TRACKS);
const on = (i) => ver[i] % 2 === 1;
const DEFAULT = { 6: [4, 12], 7: [0, 6, 8, 11], 5: [0, 3, 10], 3: [7], 1: [14] };
function load() {
  try {
    const saved = JSON.parse(localStorage.getItem("machine.v1") || "null");
    if (saved?.length === ver.length) { ver.set(saved); return; }
  } catch {}
  for (const [row, steps] of Object.entries(DEFAULT)) for (const s of steps) ver[row * STEPS + s] = 1;
}
const save = () => { try { localStorage.setItem("machine.v1", JSON.stringify([...ver])); } catch {} };
const encode = (idxs) => idxs.filter((i) => ver[i]).map((i) => `${i.toString(36)}.${ver[i].toString(36)}`).join(",");
function merge(str, from) {
  let changed = false;
  for (const part of String(str || "").split(",")) {
    const [a, b] = part.split(".");
    const i = parseInt(a, 36), v = parseInt(b, 36);
    if (!(i >= 0 && i < ver.length) || !(v > 0) || v <= ver[i]) continue;
    ver[i] = v; changed = true; paint(i, from);
  }
  if (changed) save();
}

// ---- grid ---------------------------------------------------------------------
const cells = [];
for (let r = 0; r < TRACKS; r++) {
  const lab = document.createElement("span");
  lab.className = "m-label"; lab.textContent = LABELS[r];
  grid.append(lab);
  for (let s = 0; s < STEPS; s++) {
    const b = document.createElement("button");
    const i = r * STEPS + s;
    b.className = `m-cell${s % 4 === 0 ? " beat" : ""}${r >= 6 ? " drum" : ""}`;
    b.setAttribute("aria-label", `${LABELS[r]} step ${s + 1}`);
    b.onclick = () => toggle(i);
    cells[i] = b; grid.append(b);
  }
}
function paint(i, from) {
  const c = cells[i];
  c.classList.toggle("on", on(i));
  c.setAttribute("aria-pressed", on(i));
  if (from) { c.classList.remove("remote"); void c.offsetWidth; c.classList.add("remote"); c.style.setProperty("--who", hue(from)); }
}
const paintAll = () => cells.forEach((_, i) => paint(i));

// ---- signal budget --------------------------------------------------------------
const sent = [];
const left = () => { const now = Date.now(); while (sent.length && now - sent[0] > WINDOW) sent.shift(); return BUDGET - sent.length; };
function drawMeter() {
  const n = room ? left() : BUDGET;
  meter.innerHTML = Array.from({ length: BUDGET }, (_, k) => `<i class="${k < n ? "full" : ""}"></i>`).join("");
  meter.title = `${n} of ${BUDGET} signals left this minute`;
}
setInterval(drawMeter, 1000);

// ---- room ------------------------------------------------------------------------
let room = null, topic = null, me = null;
const others = new Map();     // address -> last seen
const pending = new Set();    // cell indexes waiting to be sent
let flushTimer = null;

const handle = (a) => `crow-${String(a).slice(0, 4)}`;
const hue = (a) => { let h = 0; for (const ch of String(a)) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };

function toggle(i) {
  ver[i] += 1; paint(i); save();
  if (!room) return;
  pending.add(i);
  scheduleFlush();
}
function scheduleFlush(delay = 700) {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, delay);
}
async function flush() {
  if (!pending.size) return;
  if (left() <= 0) { scheduleFlush(WINDOW - (Date.now() - sent[0]) + 50); say("out of signals — your edits go out when the meter refills", "sys"); return; }
  const idxs = [...pending]; pending.clear();
  if (!(await send({ k: "set", c: encode(idxs) }))) idxs.forEach((i) => pending.add(i));
}
async function send(body) {
  if (!topic || left() <= 0) return false;
  try { sent.push(Date.now()); await topic.broadcast(body); drawMeter(); return true; }
  catch (e) { say(`not sent: ${e.message}`, "sys"); return false; }
}

function say(text, who) {
  const li = document.createElement("li");
  if (who === "sys") { li.className = "sys"; li.textContent = text; }
  else {
    const b = document.createElement("b");
    b.textContent = who === "me" ? "you" : handle(who);
    b.style.setProperty("--who", who === "me" ? 0 : hue(who));
    li.append(b, " ", text);
  }
  log.prepend(li);
  while (log.children.length > 40) log.lastChild.remove();
}
function drawPeople() {
  const now = Date.now();
  for (const [a, t] of others) if (now - t > 11 * 60e3) others.delete(a);
  here.textContent = room ? others.size + 1 : "?";
  people.innerHTML = room
    ? [`<li><i style="--who:0"></i>you</li>`, ...[...others.keys()].map((a) => `<li><i style="--who:${hue(a)}"></i>${handle(a)}</li>`)].join("")
    : "";
}

let stateTimer = null;
function onMessage(m) {
  const from = m.from, body = m.body || {};
  if (from && from !== me) { others.set(from, Date.now()); drawPeople(); }
  if (body.k === "set") merge(body.c, from);
  else if (body.k === "st") { clearTimeout(stateTimer); merge(body.c, from); }
  else if (body.k === "say") say(String(body.t || "").slice(0, 120), from);
  else if (body.k === "hi") {
    say(`${handle(from)} entered`, "sys");
    // one of us answers with the full pattern; random delay so not everyone does
    clearTimeout(stateTimer);
    stateTimer = setTimeout(() => send({ k: "st", c: encode([...ver.keys()]) }), 400 + Math.random() * 2500);
  }
}

async function enter() {
  enterBtn.disabled = true; enterBtn.textContent = "connecting…";
  status.textContent = "";
  try {
    const { Peer } = await import(CORVAX);
    let seed = null;
    try { seed = sessionStorage.getItem("machine.seed"); } catch {}
    const peer = await Peer.create({ seed });
    try { sessionStorage.setItem("machine.seed", peer.seed); } catch {}
    me = peer.address;
    topic = await peer.topic(TOPIC);
    topic.subscribe({
      presence: (e) => { if (e.address === me) return; e.presence === "recent" ? others.set(e.address, Date.now()) : others.delete(e.address); drawPeople(); },
      message: onMessage,
    });
    await topic.publish();
    room = peer;
    document.body.classList.add("m-joined");
    enterBtn.textContent = "in the room";
    for (const r of await topic.search().catch(() => [])) if (r.address !== me) others.set(r.address, Date.now());
    drawPeople(); drawMeter();
    say(`you are ${handle(me)}. ${BUDGET} signals a minute — spend them well.`, "sys");
    await send({ k: "hi" });
    addEventListener("pagehide", () => { topic.close().catch(() => {}); peer.close().catch(() => {}); });
  } catch (e) {
    enterBtn.disabled = false; enterBtn.textContent = "try again";
    status.textContent = `couldn't reach the network (${e.message}). You can still play solo.`;
  }
}
enterBtn.onclick = enter;

form.onsubmit = async (e) => {
  e.preventDefault();
  const t = form.t.value.trim().slice(0, 120);
  if (!t) return;
  if (!room) { status.textContent = "enter the room to shout"; return; }
  if (left() <= 0) { say("out of signals — wait for the meter", "sys"); return; }
  if (await send({ k: "say", t })) { say(t, "me"); form.t.value = ""; }
};

// ---- sound ---------------------------------------------------------------------
let ctx = null, master = null, playing = false, step = 0, nextTime = 0, timer = null;
const BPM = 112, STEP_DUR = 60 / BPM / 4;
let noiseBuf = null;

function voice(track, t) {
  if (track < 6) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "square";
    o.frequency.setValueAtTime(NOTES[track], t);
    o.frequency.exponentialRampToValueAtTime(NOTES[track] * 0.985, t + 0.15);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(master); o.start(t); o.stop(t + 0.2);
  } else if (track === 6) {
    const n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    n.buffer = noiseBuf; f.type = "highpass"; f.frequency.value = 1800;
    g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    n.connect(f).connect(g).connect(master); n.start(t); n.stop(t + 0.13);
  } else {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.14);
    g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(master); o.start(t); o.stop(t + 0.26);
  }
}
function tick() {
  while (nextTime < ctx.currentTime + 0.12) {
    for (let r = 0; r < TRACKS; r++) if (on(r * STEPS + step)) voice(r, nextTime);
    const s = step, delay = Math.max(0, (nextTime - ctx.currentTime) * 1000);
    setTimeout(() => highlight(s), delay);
    step = (step + 1) % STEPS;
    nextTime += STEP_DUR;
  }
}
let lit = -1;
function highlight(s) {
  if (lit >= 0) for (let r = 0; r < TRACKS; r++) cells[r * STEPS + lit].classList.remove("now");
  lit = s;
  if (s >= 0) for (let r = 0; r < TRACKS; r++) cells[r * STEPS + s].classList.add("now");
}
function setupAudio() {
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = 0.7;
  // a little grit: soft clip
  const shaper = ctx.createWaveShaper(), k = 2.5, curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) { const x = (i / 512) - 1; curve[i] = Math.tanh(k * x) / Math.tanh(k); }
  shaper.curve = curve;
  master.connect(shaper).connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
playBtn.onclick = async () => {
  if (!ctx) setupAudio();
  if (playing) {
    playing = false; clearInterval(timer); grid.classList.remove("playing"); highlight(-1);
    playBtn.textContent = "▶ play"; return;
  }
  await ctx.resume();
  playing = true; step = 0; nextTime = ctx.currentTime + 0.05;
  timer = setInterval(tick, 25);
  grid.classList.add("playing");
  playBtn.textContent = "■ stop";
};
$("#clear").onclick = () => {
  for (let i = 0; i < ver.length; i++) if (on(i)) toggle(i);
};

load(); paintAll(); drawMeter(); drawPeople();
