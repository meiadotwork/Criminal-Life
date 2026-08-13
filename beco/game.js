/* BECO — a favela run-and-gun.
 *
 * Everything here draws from the commission art in ./assets, packed by
 * tools/build_assets.py. Sprite frames are stored tight-cropped with a per
 * frame offset from the character's anchor (the point between his feet), so
 * the renderer positions by anchor and never has to think about padding.
 */
'use strict';

// ---------------------------------------------------------------- constants

const VIEW_W = 960;
const VIEW_H = 540;
const GROUND_Y = 470;          // the street

const PLAYER_H = 116;          // on-screen standing height, in view pixels
const COP_H = 120;

const GRAVITY = 2100;
const JUMP_V = -760;
const WALK_SPEED = 175;
const RUN_SPEED = 330;
const CROUCH_SPEED = 95;
const ROLL_SPEED = 430;

const MAG_SIZE = 30;
const RELOAD_TIME = 1.55;
const FIRE_INTERVAL = 0.085;
const BULLET_SPEED = 1500;
const COP_BULLET_SPEED = 720;
const PLAYER_DMG = 26;
const MAX_HP = 100;
const MAX_GRENADES = 3;

const TAU = Math.PI * 2;

// ------------------------------------------------------------------- helpers

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);

/** Small deterministic PRNG so a given level always assembles the same street. */
function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ loading

const boot = document.getElementById('boot');
const bootbar = document.getElementById('bootbar');

function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('image failed: ' + src));
    im.src = src;
  });
}

async function loadSheet(name) {
  const meta = await fetch(`assets/${name}.json`).then((r) => {
    if (!r.ok) throw new Error(`${name}.json ${r.status}`);
    return r.json();
  });
  meta.img = await loadImage('assets/' + meta.image);
  return meta;
}

// -------------------------------------------------------------------- input

const Input = {
  keys: new Set(),
  pressed: new Set(),
  pointer: null,
  touch: false,
  pad: null,
  padPrev: {},

  down(code) { return this.keys.has(code); },
  once(code) {
    if (this.pressed.has(code)) { this.pressed.delete(code); return true; }
    return false;
  },
  clearFrame() { this.pressed.clear(); },

  // derived controls -------------------------------------------------------
  get left()   { return this.down('ArrowLeft') || this.down('KeyA') || this.vk.left; },
  get right()  { return this.down('ArrowRight') || this.down('KeyD') || this.vk.right; },
  get up()     { return this.down('ArrowUp') || this.down('KeyW') || this.vk.up; },
  get down_()  { return this.down('ArrowDown') || this.down('KeyS') || this.vk.down; },
  get fire()   { return this.down('KeyJ') || this.down('KeyZ') || this.down('Space') || this.vk.fire; },
  get run()    { return this.down('ShiftLeft') || this.down('ShiftRight') || this.vk.run; },

  vk: { left:false, right:false, up:false, down:false, fire:false, run:false,
        jump:false, roll:false, reload:false, nade:false },
  vkOnce: {},

  takeVk(name) {
    if (this.vkOnce[name]) { this.vkOnce[name] = false; return true; }
    return false;
  },

  jumpPressed()   { return this.once('KeyK') || this.once('KeyC') || this.takeVk('jump'); },
  rollPressed()   { return this.once('KeyL') || this.once('KeyX') || this.takeVk('roll'); },
  reloadPressed() { return this.once('KeyR') || this.takeVk('reload'); },
  nadePressed()   { return this.once('KeyG') || this.once('KeyE') || this.takeVk('nade'); },
};

addEventListener('keydown', (e) => {
  if (e.repeat) { e.preventDefault(); return; }
  Input.keys.add(e.code);
  Input.pressed.add(e.code);
  if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => Input.keys.delete(e.code));
addEventListener('blur', () => { Input.keys.clear(); });

// -------------------------------------------------------------------- audio

/* No audio in the art drop, so the whole soundtrack is synthesised. Gunfire is
 * a filtered noise burst with a fast decay; everything else is a shaped tone. */
const Sfx = {
  ctx: null,
  noise: null,
  muted: false,

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const len = this.ctx.sampleRate * 0.5;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },

  burst(vol, dur, freq, q, type) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = this.ctx.createBiquadFilter();
    f.type = type || 'lowpass';
    f.frequency.value = freq;
    f.Q.value = q || 1;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f); f.connect(g); g.connect(this.ctx.destination);
    src.start(t); src.stop(t + dur + 0.02);
  },
  tone(vol, dur, f0, f1, type) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type || 'square';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  },

  shot()      { this.burst(0.22, 0.13, 1800, 0.8); this.tone(0.10, 0.07, 190, 60, 'sawtooth'); },
  copShot()   { this.burst(0.11, 0.15, 1100, 0.9); },
  hit()       { this.burst(0.18, 0.09, 500, 2); },
  playerHurt(){ this.tone(0.16, 0.22, 240, 70, 'sawtooth'); },
  reload()    { this.tone(0.07, 0.05, 800, 500, 'square'); },
  jump()      { this.tone(0.06, 0.10, 320, 620, 'triangle'); },
  boom()      { this.burst(0.42, 0.65, 420, 0.6); this.tone(0.20, 0.5, 110, 28, 'sawtooth'); },
  pickup()    { this.tone(0.10, 0.09, 700, 1250, 'triangle'); },
  dry()       { this.tone(0.05, 0.04, 300, 220, 'square'); },
  levelDone() { [523, 659, 784, 1047].forEach((f, i) =>
                  setTimeout(() => this.tone(0.10, 0.22, f, f, 'triangle'), i * 110)); },
};

// ------------------------------------------------------------------ renderer

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
ctx.imageSmoothingEnabled = true;

const A = {};   // loaded sheets

/** Draw one atlas frame with its anchor at (x, y) in screen space. */
function drawFrame(sheet, anim, index, x, y, flip, scale, alpha) {
  const list = sheet.anims[anim];
  if (!list) return;
  const f = list[((index % list.length) + list.length) % list.length];
  ctx.save();
  if (alpha !== undefined && alpha < 1) ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(sheet.img, f.x, f.y, f.w, f.h,
                f.dx * scale, f.dy * scale, f.w * scale, f.h * scale);
  ctx.restore();
}

/** Same, but silhouetted in a flat colour — used for hit flashes. */
function drawFrameTinted(sheet, anim, index, x, y, flip, scale, colour, alpha) {
  const list = sheet.anims[anim];
  if (!list) return;
  const f = list[((index % list.length) + list.length) % list.length];
  const c = tintCanvas(sheet, f, colour);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(c, f.dx * scale, f.dy * scale, f.w * scale, f.h * scale);
  ctx.restore();
}

const tintCache = new Map();
function tintCanvas(sheet, f, colour) {
  const key = sheet.image + f.x + ':' + f.y + ':' + colour;
  let c = tintCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = f.w; c.height = f.h;
  const g = c.getContext('2d');
  g.drawImage(sheet.img, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = colour;
  g.fillRect(0, 0, f.w, f.h);
  tintCache.set(key, c);
  return c;
}

function fxFrame(kind, i) {
  const list = A.fx.anims[kind];
  return list[clamp(i | 0, 0, list.length - 1)];
}

/** FX sprites are anchored at their centre. */
function drawFx(kind, i, x, y, scale, alpha, rot) {
  const f = fxFrame(kind, i);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.drawImage(A.fx.img, f.x, f.y, f.w, f.h,
                -f.w * scale / 2, -f.h * scale / 2, f.w * scale, f.h * scale);
  ctx.restore();
}

// ------------------------------------------------------------------ particles

const particles = [];

function spark(x, y, vx, vy, life, colour, size, grav) {
  particles.push({ kind:'spark', x, y, vx, vy, life, max:life, colour, size, grav: grav === undefined ? 900 : grav });
}
function fxPuff(kind, x, y, vx, vy, life, scale, idx, spin, grav, drag) {
  particles.push({ kind:'fx', sub:kind, x, y, vx, vy, life, max:life, scale, idx: idx|0, rot:0,
                   spin: spin || 0,
                   grav: grav === undefined ? 40 : grav,
                   drag: drag === undefined ? 1.2 : drag });
}
/** The light a shot throws, drawn additively. The flash itself is in the art. */
const glows = [];
function muzzleGlow(x, y, r) {
  glows.push({ x, y, r, life: 0.075, max: 0.075 });
}
function ejectBrass(x, y, face) {
  particles.push({ kind:'fx', sub:'casing', x, y,
                   vx: -face * (70 + Math.random() * 80), vy: -220 - Math.random() * 90,
                   life: 1.1, max: 1.1, scale: 0.6, idx: (Math.random() * 6) | 0, rot: 0,
                   spin: 16 + Math.random() * 10, grav: 1500, drag: 0.4, bounce: true });
}

function decal(x, y, idx, scale) {
  decals.push({ x, y, idx, scale, life: 14, rot: Math.random() * TAU });
}
const decals = [];

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.kind === 'spark') {
      p.vy += p.grav * dt;
      if (p.y > GROUND_Y) { p.y = GROUND_Y; p.vy *= -0.35; p.vx *= 0.6; }
    } else {
      p.vy += p.grav * dt;
      p.vx *= 1 - p.drag * dt;
      p.rot += p.spin * dt;
      if (p.bounce && p.y > GROUND_Y) { p.y = GROUND_Y; p.vy *= -0.3; p.vx *= 0.5; p.spin *= 0.5; }
    }
  }
  for (let i = decals.length - 1; i >= 0; i--) {
    decals[i].life -= dt;
    if (decals[i].life <= 0) decals.splice(i, 1);
  }
  for (let i = glows.length - 1; i >= 0; i--) {
    glows[i].life -= dt;
    if (glows[i].life <= 0) glows.splice(i, 1);
  }
}

function drawParticles(cam) {
  for (const d of decals) {
    const sx = d.x - cam.x;
    if (sx < -80 || sx > VIEW_W + 80) continue;
    drawFx('blood', d.idx, sx, d.y, d.scale, clamp(d.life / 4, 0, 1) * 0.85, d.rot);
  }
  for (const p of particles) {
    const sx = p.x - cam.x;
    if (sx < -120 || sx > VIEW_W + 120) continue;
    const t = p.life / p.max;
    if (p.kind === 'spark') {
      ctx.globalAlpha = clamp(t * 1.4, 0, 1);
      ctx.fillStyle = p.colour;
      ctx.fillRect(sx - p.size / 2, p.y - p.size / 2, p.size, p.size);
      ctx.globalAlpha = 1;
    } else {
      drawFx(p.sub, p.idx, sx, p.y, p.scale * (1 + (1 - t) * 0.6), clamp(t, 0, 1) * 0.9, p.rot);
    }
  }
}

function drawGlows(cam) {
  if (!glows.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const g of glows) {
    const sx = g.x - cam.x;
    if (sx < -80 || sx > VIEW_W + 80) continue;
    const t = g.life / g.max;
    const r = g.r * (0.7 + t * 0.5);
    const rg = ctx.createRadialGradient(sx, g.y, 0, sx, g.y, r);
    rg.addColorStop(0, `rgba(255,232,170,${0.55 * t})`);
    rg.addColorStop(0.45, `rgba(255,150,50,${0.22 * t})`);
    rg.addColorStop(1, 'rgba(255,120,20,0)');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(sx, g.y, r, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

// --------------------------------------------------------------------- level

/* A level is a strip of favela: three parallax bands of building facades, a
 * street, and a handful of concrete slabs (lajes) to climb onto. */

function buildLevel(n) {
  const rnd = mulberry(0x9e37 + n * 7919);
  const length = 4200 + n * 900;
  const B = A.buildings.frames;
  const pick = () => (rnd() * B.length) | 0;

  const bands = [];
  // [parallax, baseline y, height, tint alpha, jitter]
  const spec = [
    { par: 0.22, base: GROUND_Y - 26, h: 250, haze: 0.62, gap: 40 },
    { par: 0.48, base: GROUND_Y - 10, h: 330, haze: 0.34, gap: 26 },
    { par: 0.80, base: GROUND_Y + 6,  h: 420, haze: 0.10, gap: 14 },
  ];
  for (const s of spec) {
    const items = [];
    let x = -400;
    const span = length / s.par + VIEW_W * 2;
    while (x < span) {
      const f = B[pick()];
      const h = s.h * (0.78 + rnd() * 0.44);
      const w = (f.w / f.h) * h;
      items.push({ f, x, y: s.base + rnd() * 14, w, h });
      x += w * (0.72 + rnd() * 0.2) + rnd() * s.gap;
    }
    bands.push({ par: s.par, haze: s.haze, items });
  }

  // climbable slabs, always reachable from the street or from each other
  const slabs = [];
  let px = 620;
  while (px < length - 500) {
    const w = 130 + rnd() * 190;
    const h = 116 + rnd() * 74;
    slabs.push({ x: px, y: GROUND_Y - h, w, h });
    if (rnd() < 0.42) {
      const w2 = 110 + rnd() * 130;
      slabs.push({ x: px + w + 60 + rnd() * 70, y: GROUND_Y - h - 92 - rnd() * 30, w: w2, h: 22 });
    }
    px += 520 + rnd() * 620;
  }

  // enemy placements: clusters that wake when the player gets close
  const squads = [];
  const count = 6 + n * 2;
  for (let i = 0; i < count; i++) {
    const at = 760 + (length - 1300) * (i / count) + rnd() * 180;
    const size = 1 + ((rnd() * (1.6 + n * 0.5)) | 0);
    squads.push({ x: at, size, woken: false });
  }

  return { n, length, bands, slabs, squads, rnd };
}

function drawBackdrop(level, cam) {
  // sky
  const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  g.addColorStop(0, '#1a222c');
  g.addColorStop(0.55, '#33323a');
  g.addColorStop(1, '#5a4a41');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, GROUND_Y);

  const img = A.buildings.img;
  for (const band of level.bands) {
    const ox = cam.x * band.par;
    for (const it of band.items) {
      const sx = it.x - ox;
      if (sx + it.w < -40 || sx > VIEW_W + 40) continue;
      ctx.drawImage(img, it.f.x, it.f.y, it.f.w, it.f.h, sx, it.y - it.h, it.w, it.h);
    }
    if (band.haze > 0.02) {
      ctx.fillStyle = `rgba(30,36,46,${band.haze})`;
      ctx.fillRect(0, 0, VIEW_W, GROUND_Y + 8);
    }
  }
}

function drawStreet(level, cam) {
  // packed dirt / concrete
  const g = ctx.createLinearGradient(0, GROUND_Y, 0, VIEW_H);
  g.addColorStop(0, '#4b4239');
  g.addColorStop(1, '#241f1b');
  ctx.fillStyle = g;
  ctx.fillRect(0, GROUND_Y, VIEW_W, VIEW_H - GROUND_Y);

  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, GROUND_Y, VIEW_W, 3);

  // scattered grit, stable under scrolling
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  const start = Math.floor(cam.x / 37) * 37;
  for (let x = start; x < cam.x + VIEW_W + 37; x += 37) {
    const h = ((x * 2654435761) >>> 0) % 1000 / 1000;
    ctx.fillRect(x - cam.x, GROUND_Y + 8 + h * 52, 14 + h * 22, 2);
  }

  for (const s of level.slabs) drawSlab(s, cam);
}

/* Lajes: the unfinished concrete roof slabs you climb around on. Drawn rather
 * than sprited -- the facade art has no isolated ledge -- so they get enough
 * brick, rebar and grime to sit alongside the painted buildings. */
function drawSlab(s, cam) {
  const sx = Math.round(s.x - cam.x);
  if (sx + s.w < -20 || sx > VIEW_W + 20) return;
  const w = Math.round(s.w), h = Math.round(s.h);
  const seed = ((s.x * 2654435761) >>> 0);
  const rnd = mulberry(seed);

  // body: brick under a concrete cap
  const body = ctx.createLinearGradient(0, s.y, 0, s.y + h);
  body.addColorStop(0, '#7c6d5e');
  body.addColorStop(0.12, '#6a4f3d');
  body.addColorStop(1, '#3b2c23');
  ctx.fillStyle = body;
  ctx.fillRect(sx, s.y, w, h);

  // brick courses
  ctx.save();
  ctx.beginPath();
  ctx.rect(sx, s.y + 12, w, h - 12);
  ctx.clip();
  ctx.strokeStyle = 'rgba(30,20,14,0.32)';
  ctx.lineWidth = 1;
  for (let y = s.y + 20; y < s.y + h; y += 13) {
    ctx.beginPath(); ctx.moveTo(sx, y + 0.5); ctx.lineTo(sx + w, y + 0.5); ctx.stroke();
  }
  let row = 0;
  for (let y = s.y + 20; y < s.y + h; y += 13, row++) {
    for (let x = sx + (row % 2 ? 0 : 13); x < sx + w; x += 26) {
      ctx.beginPath(); ctx.moveTo(x + 0.5, y + 0.5); ctx.lineTo(x + 0.5, y + 13); ctx.stroke();
    }
  }
  // damp staining
  ctx.fillStyle = 'rgba(24,30,20,0.20)';
  for (let i = 0; i < 4; i++) {
    const bx = sx + rnd() * w;
    ctx.fillRect(bx, s.y + 14, 6 + rnd() * 16, h - 14);
  }
  ctx.restore();

  // concrete cap
  const cap = ctx.createLinearGradient(0, s.y, 0, s.y + 14);
  cap.addColorStop(0, '#a9a396');
  cap.addColorStop(1, '#6d685e');
  ctx.fillStyle = cap;
  ctx.fillRect(sx - 3, s.y, w + 6, 12);
  ctx.fillStyle = 'rgba(255,255,255,0.20)';
  ctx.fillRect(sx - 3, s.y, w + 6, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(sx - 3, s.y + 12, w + 6, 3);

  // rebar stubs — the tell that another floor was always coming
  ctx.strokeStyle = 'rgba(60,48,38,0.9)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const rx = sx + 12 + rnd() * (w - 24);
    const rh = 8 + rnd() * 12;
    ctx.beginPath();
    ctx.moveTo(rx, s.y);
    ctx.lineTo(rx + (rnd() - 0.5) * 5, s.y - rh);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(sx, s.y + h - 3, w, 3);
}

// -------------------------------------------------------------------- actors

/* Muzzle positions come from the atlas metadata -- the pipeline measures the
 * barrel tip off the art rather than leaving it to hand-tuned constants. Only
 * the barrel *angle* is stated here, since that is a property of the pose the
 * geometry cannot tell us. */
const AIM_ANGLE = { fire: 0, crouch_fire: 0, fire_up: -Math.PI / 4, fire_down: Math.PI / 4 };

/** Muzzle offset for a pose, in view pixels, facing right. */
function muzzleOf(sheet, pose, scale, fallback) {
  const m = (sheet.muzzle && (sheet.muzzle[pose] || sheet.muzzle[fallback])) || [50, -80];
  return { x: m[0] * scale, y: m[1] * scale, ang: AIM_ANGLE[pose] || 0 };
}

class Player {
  constructor(x) {
    this.x = x; this.y = GROUND_Y;
    this.vx = 0; this.vy = 0;
    this.face = 1;
    this.onGround = true;
    this.hp = MAX_HP;
    this.mag = MAG_SIZE;
    this.reserve = 150;
    this.grenades = MAX_GRENADES;
    this.anim = 'idle'; this.frame = 0; this.clock = 0;
    this.fireCd = 0; this.reloading = 0; this.hurtCd = 0; this.flash = 0;
    this.crouching = false; this.rolling = 0; this.throwing = 0;
    this.dead = false; this.deathClock = 0;
    this.score = 0;
    this.scale = PLAYER_H / A.player.unit;
    this.recoil = 0;
  }

  get w() { return 34; }
  get h() { return this.crouching ? 66 : 104; }
  get cx() { return this.x; }
  get cy() { return this.y - this.h / 2; }

  hurt(dmg, fromX) {
    if (this.dead || this.hurtCd > 0 || this.rolling > 0) return;
    this.hp -= dmg;
    this.hurtCd = 0.55;
    this.flash = 0.16;
    shake(7, 0.22);
    Sfx.playerHurt();
    for (let i = 0; i < 7; i++) {
      spark(this.x, this.y - 60 + Math.random() * 30,
            (Math.random() - 0.5) * 200 - sign(fromX - this.x) * 90,
            -Math.random() * 220, 0.4 + Math.random() * 0.3, '#b3222b', 3);
    }
    decal(this.x - sign(fromX - this.x) * 18, this.y - 4, (Math.random() * 3) | 0, 0.7);
    if (this.hp <= 0) { this.hp = 0; this.die(); }
  }

  die() {
    this.dead = true;
    this.anim = 'death'; this.frame = 0; this.clock = 0; this.deathClock = 0;
    this.vx = 0;
    shake(14, 0.5);
  }

  update(dt, level, world) {
    if (this.dead) {
      this.deathClock += dt;
      const fr = A.player.anims.death.length;
      this.frame = Math.min(fr - 1, Math.floor(this.deathClock / 0.11));
      this.vy += GRAVITY * dt;
      this.y = Math.min(GROUND_Y, this.y + this.vy * dt);
      return;
    }

    this.fireCd -= dt;
    this.hurtCd -= dt;
    this.flash -= dt;
    this.recoil = Math.max(0, this.recoil - dt * 5);

    // --- roll -------------------------------------------------------------
    if (this.rolling > 0) {
      this.rolling -= dt;
      this.x += this.face * ROLL_SPEED * dt;
      this.clock += dt;
      const n = A.player.anims.roll.length;
      this.frame = Math.min(n - 1, Math.floor(this.clock / 0.062));
      this.anim = 'roll';
      this.applyGravity(dt, level);
      this.clampToLevel(level);
      return;
    }

    // --- throwing ---------------------------------------------------------
    if (this.throwing > 0) {
      this.throwing -= dt;
      this.clock += dt;
      const n = A.player.anims.throw.length;
      const idx = Math.floor(this.clock / 0.06);
      this.frame = Math.min(n - 1, idx);
      this.anim = 'throw';
      if (!this.threw && idx >= 3) {
        this.threw = true;
        world.grenades.push(new Grenade(this.x + this.face * 26, this.y - 74,
                                        this.face * 430, -400));
      }
      this.vx *= 0.85;
      this.applyGravity(dt, level);
      this.clampToLevel(level);
      return;
    }

    const wantLeft = Input.left, wantRight = Input.right;
    const running = Input.run && !Input.down_ && this.onGround;
    this.crouching = Input.down_ && this.onGround;

    // face: aiming locks facing to the movement key, otherwise keep last
    if (wantLeft && !wantRight) this.face = -1;
    else if (wantRight && !wantLeft) this.face = 1;

    let speed = this.crouching ? CROUCH_SPEED : (running ? RUN_SPEED : WALK_SPEED);
    const moving = (wantLeft !== wantRight);
    this.vx = moving ? (wantRight ? speed : -speed) : 0;

    // --- reload -----------------------------------------------------------
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        const want = MAG_SIZE - this.mag;
        const take = Math.min(want, this.reserve);
        this.mag += take; this.reserve -= take;
      }
    } else if (Input.reloadPressed() && this.mag < MAG_SIZE && this.reserve > 0) {
      this.reloading = RELOAD_TIME;
      this.clock = 0;
      Sfx.reload();
    }

    // --- actions ----------------------------------------------------------
    if (Input.jumpPressed() && this.onGround && !this.crouching) {
      this.vy = JUMP_V; this.onGround = false; this.clock = 0; Sfx.jump();
    }
    if (Input.rollPressed() && this.onGround && this.rolling <= 0) {
      this.rolling = 0.42; this.clock = 0;
    }
    if (Input.nadePressed() && this.grenades > 0 && this.onGround) {
      this.grenades--; this.throwing = 0.42; this.threw = false; this.clock = 0;
    }

    // --- shooting ---------------------------------------------------------
    let firing = false;
    if (Input.fire && this.reloading <= 0 && this.rolling <= 0) {
      if (this.mag > 0) {
        firing = true;
        if (this.fireCd <= 0) {
          this.shoot(world);
          this.fireCd = FIRE_INTERVAL;
        }
      } else if (this.fireCd <= 0) {
        Sfx.dry();
        this.fireCd = 0.35;
        if (this.reserve > 0) { this.reloading = RELOAD_TIME; Sfx.reload(); }
      }
    }

    // --- pick the pose ----------------------------------------------------
    let next;
    if (this.reloading > 0) next = 'reload';
    else if (!this.onGround) next = 'jump';
    else if (firing && this.mag > 0) {
      if (this.crouching) next = 'crouch_fire';
      else if (Input.up) next = 'fire_up';
      else if (Input.down_) next = 'fire_down';
      else next = 'fire';
    } else if (this.crouching) next = moving ? 'crouch_walk' : 'crouch';
    else if (moving) next = running ? 'run' : 'walk';
    else next = 'idle';

    if (next !== this.anim) { this.anim = next; this.clock = 0; }
    this.clock += dt;

    const rate = { idle:0.17, walk:0.085, run:0.062, crouch:0.19, crouch_walk:0.09,
                   fire:FIRE_INTERVAL, fire_up:FIRE_INTERVAL, fire_down:FIRE_INTERVAL,
                   crouch_fire:FIRE_INTERVAL, reload:RELOAD_TIME / 8, jump:0.09 }[this.anim] || 0.1;

    const n = A.player.anims[this.anim].length;
    if (this.anim === 'jump') {
      // map the jump pose to the arc rather than to a timer
      const t = this.vy < -260 ? 1 : this.vy < -60 ? 2 : this.vy < 180 ? 3 : 4;
      this.frame = Math.min(n - 1, t);
    } else if (this.anim === 'reload') {
      this.frame = Math.min(n - 1, Math.floor((RELOAD_TIME - this.reloading) / rate));
    } else {
      this.frame = Math.floor(this.clock / rate) % n;
    }

    this.x += this.vx * dt;
    this.applyGravity(dt, level);
    this.clampToLevel(level);
  }

  applyGravity(dt, level) {
    this.vy += GRAVITY * dt;
    const prevY = this.y;
    this.y += this.vy * dt;
    this.onGround = false;

    if (this.y >= GROUND_Y) { this.y = GROUND_Y; this.vy = 0; this.onGround = true; }

    // land on slab tops only when falling onto them from above
    for (const s of level.slabs) {
      if (this.x < s.x - 6 || this.x > s.x + s.w + 6) continue;
      if (this.vy >= 0 && prevY <= s.y + 8 && this.y >= s.y) {
        this.y = s.y; this.vy = 0; this.onGround = true;
      }
    }
  }

  clampToLevel(level) {
    this.x = clamp(this.x, 30, level.length - 30);
  }

  aimAngle() {
    if (this.anim === 'fire_up') return -Math.PI / 4;
    if (this.anim === 'fire_down') return Math.PI / 4;
    if (Input.up && !this.crouching) return -Math.PI / 4;
    if (Input.down_ && !this.crouching) return Math.PI / 4;
    return 0;
  }

  muzzlePoint() {
    const pose = AIM_ANGLE[this.anim] !== undefined ? this.anim : 'fire';
    const m = muzzleOf(A.player, pose, this.scale, 'fire');
    return { x: this.x + this.face * m.x, y: this.y + m.y, ang: m.ang };
  }

  shoot(world) {
    this.mag--;
    const m = this.muzzlePoint();
    // pitch is a property of the pose, so it is not mirrored with the facing
    const dirx = Math.cos(m.ang) * this.face;
    const diry = Math.sin(m.ang);
    const spread = (Math.random() - 0.5) * 0.035;
    const cs = Math.cos(spread), sn = Math.sin(spread);
    world.bullets.push(new Bullet(m.x, m.y,
      (dirx * cs - diry * sn) * BULLET_SPEED,
      (dirx * sn + diry * cs) * BULLET_SPEED, true, PLAYER_DMG));

    // the firing frames already carry a painted flash; all the engine adds is
    // the light it throws and the brass coming out of the ejection port
    this.recoil = 1;
    muzzleGlow(m.x, m.y, 34);
    ejectBrass(this.x - this.face * 6 * this.scale, this.y - 76 * this.scale, this.face);
    shake(2.2, 0.06);
    Sfx.shot();
  }

  draw(cam) {
    const sx = this.x - cam.x;
    const sy = this.y;
    // contact shadow
    if (!this.dead) {
      ctx.save();
      ctx.globalAlpha = 0.34;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(sx, sy + 2, 24, 6, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    drawFrame(A.player, this.anim, this.frame, sx, sy, this.face < 0, this.scale);
    if (this.flash > 0) {
      drawFrameTinted(A.player, this.anim, this.frame, sx, sy, this.face < 0,
                      this.scale, '#ff5a5a', clamp(this.flash / 0.16, 0, 1) * 0.75);
    }
  }
}

class Cop {
  constructor(x, tough) {
    this.x = x; this.y = GROUND_Y;
    this.vx = 0; this.vy = 0;
    this.face = -1;
    this.hp = tough ? 130 : 72;
    this.maxHp = this.hp;
    this.tough = !!tough;
    this.anim = 'idle'; this.frame = 0; this.clock = 0;
    this.state = 'sleep';
    this.think = 0;
    this.burst = 0;
    this.fireCd = 0;
    this.flash = 0;
    this.dead = false; this.deadClock = 0;
    this.range = 220 + Math.random() * 190;
    this.kneel = Math.random() < 0.35;
    this.scale = COP_H / A.police.unit;
    this.stagger = 0;
  }

  get cy() { return this.y - 56; }

  hurt(dmg, fromX, world) {
    if (this.dead) return;
    this.hp -= dmg;
    this.flash = 0.12;
    this.stagger = 0.1;
    Sfx.hit();
    for (let i = 0; i < 6; i++) {
      spark(this.x, this.y - 55 - Math.random() * 40,
            sign(this.x - fromX) * (40 + Math.random() * 190),
            -Math.random() * 190, 0.32 + Math.random() * 0.3, '#c22a2a', 3);
    }
    fxPuff('blood', this.x, this.y - 62, sign(this.x - fromX) * 60, -30,
           0.32, 0.75, (Math.random() * 3) | 0);
    if (this.hp <= 0) this.kill(world, fromX);
  }

  kill(world, fromX) {
    this.dead = true;
    this.anim = 'dead';
    this.frame = 0;
    this.deadClock = 0;
    this.face = fromX > this.x ? -1 : 1;
    decal(this.x, this.y - 3, (Math.random() * 3) | 0, 1.0);
    world.player.score += this.tough ? 250 : 100;
    world.killed++;
    if (Math.random() < 0.33) world.pickups.push(new Pickup(this.x, this.y - 16,
      Math.random() < 0.42 ? 'med' : 'ammo'));
  }

  update(dt, world, level) {
    this.flash -= dt;
    if (this.dead) {
      this.deadClock += dt;
      // keep settling onto whatever he fell on
      this.vy += GRAVITY * dt;
      this.y = Math.min(GROUND_Y, this.y + this.vy * dt);
      return;
    }

    this.fireCd -= dt;
    this.stagger -= dt;
    const p = world.player;
    const dx = p.x - this.x;
    const dist = Math.abs(dx);

    if (this.state === 'sleep') {
      if (dist < VIEW_W * 0.62) this.state = 'advance';
      this.anim = 'idle';
      this.clock += dt;
      this.frame = Math.floor(this.clock / 0.22) % A.police.anims.idle.length;
      return;
    }

    if (p.dead) {
      this.state = 'advance';
    }

    this.face = dx < 0 ? -1 : 1;

    let moving = false;
    if (this.stagger > 0) {
      this.vx = 0;
    } else if (dist > this.range) {
      this.vx = sign(dx) * 118;
      moving = true;
      this.state = 'advance';
    } else if (dist < this.range * 0.55) {
      this.vx = -sign(dx) * 92;
      moving = true;
    } else {
      this.vx = 0;
      this.state = 'engage';
    }

    // firing
    if (!p.dead && dist < this.range * 1.35 && Math.abs(p.y - this.y) < 150) {
      if (this.burst > 0) {
        if (this.fireCd <= 0) {
          this.shoot(world);
          this.burst--;
          this.fireCd = 0.14;
        }
      } else if (this.fireCd <= 0) {
        this.burst = 2 + ((Math.random() * 3) | 0);
        this.fireCd = 0.5 + Math.random() * 0.9;
      }
    }

    const shooting = this.burst > 0 && dist < this.range * 1.35;
    let next;
    if (shooting) next = this.kneel ? 'crouch_fire' : 'fire';
    else if (moving) next = 'walk';
    else next = this.kneel ? 'crouch' : 'aim';

    if (next !== this.anim) { this.anim = next; this.clock = 0; }
    this.clock += dt;
    const rate = { walk: 0.09, idle: 0.22, aim: 0.15, fire: 0.07,
                   crouch: 0.2, crouch_fire: 0.07 }[this.anim] || 0.14;
    this.frame = Math.floor(this.clock / rate) % A.police.anims[this.anim].length;

    this.x += this.vx * dt;
    this.vy += GRAVITY * dt;
    this.y = Math.min(GROUND_Y, this.y + this.vy * dt);
    if (this.y >= GROUND_Y) { this.y = GROUND_Y; this.vy = 0; }
    this.x = clamp(this.x, 20, level.length - 20);
  }

  shoot(world) {
    // crouch_fire's frames all carry a painted flash, so the measured barrel
    // tip runs long; the standing reach is the honest number for both
    const m = muzzleOf(A.police, 'fire', this.scale, 'fire');
    const my = this.y + (this.anim === 'crouch_fire' ? -48 * this.scale : m.y);
    const mx = this.x + this.face * m.x;
    const p = world.player;
    let ang = Math.atan2((p.y - 58) - my, p.x - mx);
    ang += (Math.random() - 0.5) * 0.14;
    world.bullets.push(new Bullet(mx, my,
      Math.cos(ang) * COP_BULLET_SPEED, Math.sin(ang) * COP_BULLET_SPEED,
      false, this.tough ? 14 : 9));
    muzzleGlow(mx, my, 24);
    ejectBrass(this.x - this.face * 6 * this.scale, my - 4, this.face);
    Sfx.copShot();
  }

  draw(cam) {
    const sx = this.x - cam.x;
    if (sx < -160 || sx > VIEW_W + 160) return;
    if (!this.dead) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(sx, this.y + 2, 22, 6, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    const alpha = this.dead ? clamp(1 - (this.deadClock - 6) / 2, 0, 1) : 1;
    drawFrame(A.police, this.anim, this.frame, sx, this.y, this.face < 0, this.scale, alpha);
    if (this.flash > 0 && !this.dead) {
      drawFrameTinted(A.police, this.anim, this.frame, sx, this.y, this.face < 0,
                      this.scale, '#ffffff', clamp(this.flash / 0.12, 0, 1) * 0.6);
    }
    if (!this.dead && this.hp < this.maxHp) {
      const w = 40, hp = this.hp / this.maxHp;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(sx - w / 2, this.y - 132, w, 4);
      ctx.fillStyle = hp > 0.5 ? '#7dd88f' : hp > 0.25 ? '#e0c264' : '#d3564f';
      ctx.fillRect(sx - w / 2, this.y - 132, w * hp, 4);
    }
  }
}

class Bullet {
  constructor(x, y, vx, vy, mine, dmg) {
    this.x = x; this.y = y; this.px = x; this.py = y;
    this.vx = vx; this.vy = vy;
    this.mine = mine; this.dmg = dmg;
    this.life = 1.6;
    this.dead = false;
  }
  update(dt, world, level) {
    this.px = this.x; this.py = this.y;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }

    if (this.y >= GROUND_Y) {
      this.impact(world);
      return;
    }
    for (const s of level.slabs) {
      if (this.x > s.x && this.x < s.x + s.w && this.y > s.y && this.y < s.y + s.h) {
        this.impact(world);
        return;
      }
    }

    if (this.mine) {
      for (const c of world.cops) {
        if (c.dead) continue;
        if (Math.abs(this.x - c.x) < 22 && this.y > c.y - 118 && this.y < c.y - 4) {
          c.hurt(this.dmg, this.x, world);
          this.dead = true;
          return;
        }
      }
    } else {
      const p = world.player;
      if (!p.dead && Math.abs(this.x - p.x) < 20 && this.y > p.y - p.h && this.y < p.y - 2) {
        p.hurt(this.dmg, this.x);
        this.dead = true;
      }
    }
  }
  impact(world) {
    this.dead = true;
    for (let i = 0; i < 4; i++) {
      spark(this.x, Math.min(this.y, GROUND_Y),
            (Math.random() - 0.5) * 190, -Math.random() * 170,
            0.22, '#cfc2a4', 2);
    }
  }
  draw(cam) {
    const sx = this.x - cam.x, spx = this.px - cam.x;
    ctx.strokeStyle = this.mine ? 'rgba(255,226,150,0.95)' : 'rgba(255,170,120,0.9)';
    ctx.lineWidth = this.mine ? 2 : 1.6;
    ctx.beginPath();
    ctx.moveTo(spx, this.py);
    ctx.lineTo(sx, this.y);
    ctx.stroke();
  }
}

class Grenade {
  constructor(x, y, vx, vy) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.fuse = 1.5; this.rot = 0; this.dead = false;
  }
  update(dt, world, level) {
    this.fuse -= dt;
    this.vy += GRAVITY * 0.62 * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rot += this.vx * dt * 0.05;
    if (this.y >= GROUND_Y) {
      this.y = GROUND_Y; this.vy *= -0.42; this.vx *= 0.6;
      if (Math.abs(this.vy) < 40) this.vy = 0;
    }
    for (const s of level.slabs) {
      if (this.x > s.x && this.x < s.x + s.w && this.y > s.y && this.y < s.y + 14 && this.vy > 0) {
        this.y = s.y; this.vy *= -0.4; this.vx *= 0.6;
      }
    }
    if (this.fuse <= 0) this.explode(world);
  }
  explode(world) {
    this.dead = true;
    Sfx.boom();
    shake(20, 0.5);
    for (let i = 0; i < 4; i++) {
      fxPuff('smoke', this.x + (Math.random() - 0.5) * 60, this.y - 20 - Math.random() * 40,
             (Math.random() - 0.5) * 120, -40 - Math.random() * 60,
             0.9 + Math.random() * 0.5, 1.1 + Math.random(), (Math.random() * 2) | 0,
             (Math.random() - 0.5) * 2);
    }
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * TAU;
      const sp = 120 + Math.random() * 420;
      spark(this.x, this.y - 12, Math.cos(a) * sp, Math.sin(a) * sp - 120,
            0.4 + Math.random() * 0.4, i % 3 ? '#ffb54a' : '#fff0c0', 3);
    }
    for (const c of world.cops) {
      if (c.dead) continue;
      const d = Math.hypot(c.x - this.x, (c.y - 50) - this.y);
      if (d < 170) c.hurt(160 * (1 - d / 170) + 40, this.x, world);
    }
    const p = world.player;
    const pd = Math.hypot(p.x - this.x, (p.y - 50) - this.y);
    if (pd < 130 && !p.dead) p.hurt(40 * (1 - pd / 130), this.x);
  }
  draw(cam) {
    drawFx('grenade', 0, this.x - cam.x, this.y - 8, 0.7, 1, this.rot);
    if (Math.floor(this.fuse * 12) % 2 === 0) {
      ctx.fillStyle = '#ff5a3c';
      ctx.fillRect(this.x - cam.x - 1, this.y - 22, 2, 2);
    }
  }
}

class Pickup {
  constructor(x, y, kind) {
    this.x = x; this.y = y; this.kind = kind; this.t = 0; this.dead = false;
  }
  update(dt, world) {
    this.t += dt;
    const p = world.player;
    if (!p.dead && Math.abs(p.x - this.x) < 34 && Math.abs((p.y - 40) - this.y) < 70) {
      if (this.kind === 'med') p.hp = Math.min(MAX_HP, p.hp + 34);
      else p.reserve += 60;
      this.dead = true;
      Sfx.pickup();
    }
  }
  draw(cam) {
    const sx = this.x - cam.x;
    const bob = Math.sin(this.t * 4) * 3;
    ctx.save();
    ctx.translate(sx, this.y + bob);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(-11, -9, 22, 18);
    if (this.kind === 'med') {
      ctx.fillStyle = '#e8e3da'; ctx.fillRect(-9, -7, 18, 14);
      ctx.fillStyle = '#c8352f'; ctx.fillRect(-1.5, -4.5, 3, 9); ctx.fillRect(-5, -1.5, 10, 3);
    } else {
      ctx.fillStyle = '#5e5a3c'; ctx.fillRect(-9, -7, 18, 14);
      ctx.fillStyle = '#c8b06a'; ctx.fillRect(-6, -4, 3, 8); ctx.fillRect(-1.5, -4, 3, 8);
      ctx.fillRect(3, -4, 3, 8);
    }
    ctx.restore();
  }
}

// -------------------------------------------------------------------- camera

const cam = { x: 0, shakeMag: 0, shakeT: 0, ox: 0, oy: 0 };
function shake(mag, t) {
  cam.shakeMag = Math.max(cam.shakeMag, mag);
  cam.shakeT = Math.max(cam.shakeT, t);
}
function updateCamera(dt, world, level) {
  const p = world.player;
  const target = clamp(p.x + p.face * 70 - VIEW_W / 2, 0, Math.max(0, level.length - VIEW_W));
  cam.x = lerp(cam.x, target, 1 - Math.pow(0.0016, dt));
  if (cam.shakeT > 0) {
    cam.shakeT -= dt;
    const k = clamp(cam.shakeT / 0.3, 0, 1) * cam.shakeMag;
    cam.ox = (Math.random() - 0.5) * k * 2;
    cam.oy = (Math.random() - 0.5) * k * 2;
    if (cam.shakeT <= 0) { cam.shakeMag = 0; cam.ox = cam.oy = 0; }
  } else { cam.ox = cam.oy = 0; }
}

// ---------------------------------------------------------------------- HUD

function drawHUD(world, level) {
  const p = world.player;
  ctx.save();

  // health
  ctx.fillStyle = 'rgba(6,9,12,0.72)';
  ctx.fillRect(16, 16, 214, 46);
  ctx.strokeStyle = 'rgba(125,216,143,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(16.5, 16.5, 213, 45);

  const hpw = 182 * (p.hp / MAX_HP);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(28, 26, 182, 10);
  ctx.fillStyle = p.hp > 50 ? '#7dd88f' : p.hp > 22 ? '#e0c264' : '#d3564f';
  ctx.fillRect(28, 26, hpw, 10);

  ctx.font = '11px ui-monospace, monospace';
  ctx.fillStyle = '#cfe6d4';
  ctx.textAlign = 'left';
  const magTxt = p.reloading > 0 ? 'RELOADING' : `${String(p.mag).padStart(2, '0')} / ${p.reserve}`;
  ctx.fillText(magTxt, 28, 52);

  // grenades
  for (let i = 0; i < MAX_GRENADES; i++) {
    ctx.globalAlpha = i < p.grenades ? 1 : 0.22;
    drawFx('grenade', 0, 152 + i * 22, 44, 0.42, 1, 0);
  }
  ctx.globalAlpha = 1;

  // score + level
  ctx.textAlign = 'right';
  ctx.fillStyle = '#cfe6d4';
  ctx.font = '13px ui-monospace, monospace';
  ctx.fillText(String(p.score).padStart(6, '0'), VIEW_W - 18, 32);
  ctx.font = '10px ui-monospace, monospace';
  ctx.fillStyle = 'rgba(207,230,212,0.6)';
  ctx.fillText(`BECO ${level.n + 1}`, VIEW_W - 18, 50);

  // progress along the street
  const prog = clamp(p.x / (level.length - 120), 0, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(VIEW_W / 2 - 120, 20, 240, 4);
  ctx.fillStyle = 'rgba(125,216,143,0.85)';
  ctx.fillRect(VIEW_W / 2 - 120, 20, 240 * prog, 4);
  ctx.fillStyle = '#e6d98a';
  ctx.fillRect(VIEW_W / 2 - 120 + 240 * prog - 1, 17, 2, 10);

  if (p.hurtCd > 0.3) {
    ctx.fillStyle = `rgba(190,30,30,${(p.hurtCd - 0.3) * 0.5})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  ctx.restore();
}

// --------------------------------------------------------------- touch input

const vpad = { active: false, zones: [] };

/* Every pad button must sit fully inside the 960x540 view: the canvas is
 * letterboxed to fit the screen, so anything hanging past the edge is simply
 * not there to press. */
function layoutTouch() {
  vpad.zones = [
    { k: 'up',    x: 100, y: 378, r: 32, label: '▲' },
    { k: 'left',  x: 50,  y: 452, r: 38, label: '◀' },
    { k: 'right', x: 150, y: 452, r: 38, label: '▶' },
    { k: 'down',  x: 100, y: 502, r: 32, label: '▼' },
    { k: 'run',   x: 218, y: 396, r: 28, label: 'RUN' },

    { k: 'fire',  x: 888, y: 468, r: 46, label: 'FIRE' },
    { k: 'jump',  x: 796, y: 424, r: 34, label: 'JMP', once: true },
    { k: 'roll',  x: 826, y: 506, r: 26, label: 'RLL', once: true },
    { k: 'reload',x: 890, y: 380, r: 28, label: 'RLD', once: true },
    { k: 'nade',  x: 792, y: 342, r: 26, label: 'NDE', once: true },
  ];
  for (const z of vpad.zones) {
    z.x = clamp(z.x, z.r + 2, VIEW_W - z.r - 2);
    z.y = clamp(z.y, z.r + 2, VIEW_H - z.r - 2);
  }
}
layoutTouch();

function canvasPoint(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * (VIEW_W / r.width),
           y: (e.clientY - r.top) * (VIEW_H / r.height) };
}

const activeTouches = new Map();

function handleTouches() {
  for (const z of vpad.zones) Input.vk[z.k] = false;
  for (const p of activeTouches.values()) {
    for (const z of vpad.zones) {
      const d = Math.hypot(p.x - z.x, p.y - z.y);
      if (d < z.r + 12) Input.vk[z.k] = true;
    }
  }
}

canvas.addEventListener('pointerdown', (e) => {
  Sfx.init(); Sfx.resume();
  canvas.setPointerCapture(e.pointerId);
  const p = canvasPoint(e);
  if (e.pointerType === 'touch') Input.touch = true;
  activeTouches.set(e.pointerId, p);
  for (const z of vpad.zones) {
    if (z.once && Math.hypot(p.x - z.x, p.y - z.y) < z.r + 12) Input.vkOnce[z.k] = true;
  }
  handleTouches();
  Game.anyPress = true;
  if (e.pointerType === 'mouse' && Game.state === 'play') Input.vk.fire = true;
});
canvas.addEventListener('pointermove', (e) => {
  if (!activeTouches.has(e.pointerId)) return;
  activeTouches.set(e.pointerId, canvasPoint(e));
  handleTouches();
});
function endPointer(e) {
  activeTouches.delete(e.pointerId);
  handleTouches();
  if (e.pointerType === 'mouse') Input.vk.fire = false;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function drawTouchControls() {
  if (!Input.touch) return;
  ctx.save();
  ctx.font = '10px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const z of vpad.zones) {
    const on = Input.vk[z.k];
    ctx.beginPath();
    ctx.arc(z.x, z.y, z.r, 0, TAU);
    ctx.fillStyle = on ? 'rgba(125,216,143,0.24)' : 'rgba(10,14,18,0.34)';
    ctx.fill();
    ctx.strokeStyle = on ? 'rgba(125,216,143,0.8)' : 'rgba(180,200,190,0.28)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = on ? '#dffbe6' : 'rgba(214,232,220,0.6)';
    ctx.fillText(z.label, z.x, z.y + 1);
  }
  ctx.restore();
}

// -------------------------------------------------------------------- gamepad

function pollGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = pads && pads[0];
  if (!gp) return;
  const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
  const b = gp.buttons;
  const held = (i) => b[i] && b[i].pressed;
  Input.vk.left  = Input.vk.left  || ax < -0.35 || held(14);
  Input.vk.right = Input.vk.right || ax >  0.35 || held(15);
  Input.vk.up    = Input.vk.up    || ay < -0.45 || held(12);
  Input.vk.down  = Input.vk.down  || ay >  0.45 || held(13);
  Input.vk.fire  = Input.vk.fire  || held(7) || held(2);
  Input.vk.run   = Input.vk.run   || held(6) || held(10);
  const edge = (i, name) => {
    const now = held(i);
    if (now && !Input.padPrev[i]) Input.vkOnce[name] = true;
    Input.padPrev[i] = now;
  };
  edge(0, 'jump'); edge(1, 'roll'); edge(3, 'reload'); edge(5, 'nade');
  edge(9, 'pause');
}

// ---------------------------------------------------------------------- game

const Game = {
  state: 'title',      // title | play | dead | cleared | won | paused
  levelIndex: 0,
  world: null,
  level: null,
  t: 0,
  msgT: 0,
  anyPress: false,
  debug: false,
  best: Number(localStorage.getItem('beco.best') || 0),
};

function newWorld(levelIndex) {
  const level = buildLevel(levelIndex);
  const world = {
    player: new Player(140),
    cops: [], bullets: [], grenades: [], pickups: [],
    killed: 0, total: 0,
  };
  for (const sq of level.squads) world.total += sq.size;
  particles.length = 0;
  decals.length = 0;
  glows.length = 0;
  cam.x = 0;
  return { world, level };
}

function startLevel(i, keepScore) {
  const prev = Game.world ? Game.world.player.score : 0;
  const { world, level } = newWorld(i);
  if (keepScore) world.player.score = prev;
  Game.world = world;
  Game.level = level;
  Game.levelIndex = i;
  Game.state = 'play';
  Game.msgT = 2.2;
}

function updatePlay(dt) {
  const w = Game.world, level = Game.level;
  const p = w.player;

  p.update(dt, level, w);

  // wake squads and spawn their cops just off-screen
  for (const sq of level.squads) {
    if (sq.woken) continue;
    if (Math.abs(sq.x - p.x) < VIEW_W * 0.75) {
      sq.woken = true;
      for (let i = 0; i < sq.size; i++) {
        const tough = Game.levelIndex >= 1 && Math.random() < 0.22;
        w.cops.push(new Cop(sq.x + i * 62 + Math.random() * 40, tough));
      }
    }
  }

  for (const c of w.cops) c.update(dt, w, level);
  for (let i = w.cops.length - 1; i >= 0; i--) {
    if (w.cops[i].dead && w.cops[i].deadClock > 8) w.cops.splice(i, 1);
  }

  for (let i = w.bullets.length - 1; i >= 0; i--) {
    const b = w.bullets[i];
    b.update(dt, w, level);
    if (b.dead || b.x < cam.x - 400 || b.x > cam.x + VIEW_W + 400) w.bullets.splice(i, 1);
  }
  for (let i = w.grenades.length - 1; i >= 0; i--) {
    w.grenades[i].update(dt, w, level);
    if (w.grenades[i].dead) w.grenades.splice(i, 1);
  }
  for (let i = w.pickups.length - 1; i >= 0; i--) {
    w.pickups[i].update(dt, w);
    if (w.pickups[i].dead) w.pickups.splice(i, 1);
  }

  updateParticles(dt);
  updateCamera(dt, w, level);

  if (p.dead && p.deathClock > 1.6) {
    Game.state = 'dead';
    if (p.score > Game.best) {
      Game.best = p.score;
      localStorage.setItem('beco.best', String(Game.best));
    }
  }

  // reaching the far end with the street cleared behind you ends the beco
  const aliveAhead = w.cops.some((c) => !c.dead && c.x > p.x - 200);
  if (!p.dead && p.x > level.length - 160 && !aliveAhead) {
    Game.state = 'cleared';
    Game.msgT = 0;
    Sfx.levelDone();
    p.score += 500 + Math.round(p.hp * 5);
  }
}

function drawWorld() {
  const w = Game.world, level = Game.level;
  ctx.save();
  ctx.translate(cam.ox, cam.oy);

  drawBackdrop(level, cam);
  drawStreet(level, cam);
  drawParticles(cam);

  for (const pu of w.pickups) pu.draw(cam);
  for (const c of w.cops) if (c.dead) c.draw(cam);
  for (const c of w.cops) if (!c.dead) c.draw(cam);
  for (const g of w.grenades) g.draw(cam);
  w.player.draw(cam);
  for (const b of w.bullets) b.draw(cam);
  drawGlows(cam);

  // end-of-street marker
  const endX = level.length - 90 - cam.x;
  if (endX < VIEW_W + 40) {
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#7dd88f';
    for (let y = GROUND_Y - 150; y < GROUND_Y; y += 22) {
      ctx.fillRect(endX, y, 3, 11);
    }
    ctx.restore();
  }

  if (Game.debug) drawDebug(w, level);
  ctx.restore();

  // vignette
  const vg = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.35,
                                      VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.85);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  drawHUD(w, level);
  drawTouchControls();
}

function drawDebug(w, level) {
  ctx.save();
  ctx.strokeStyle = '#38f'; ctx.lineWidth = 1;
  const p = w.player;
  ctx.strokeRect(p.x - cam.x - p.w / 2, p.y - p.h, p.w, p.h);
  const m = p.muzzlePoint();
  ctx.fillStyle = '#f3f'; ctx.fillRect(m.x - cam.x - 2, m.y - 2, 4, 4);
  ctx.strokeStyle = '#f66';
  for (const c of w.cops) if (!c.dead) ctx.strokeRect(c.x - cam.x - 22, c.y - 118, 44, 114);
  ctx.strokeStyle = '#3f6';
  for (const s of level.slabs) ctx.strokeRect(s.x - cam.x, s.y, s.w, s.h);
  ctx.restore();
}

// ------------------------------------------------------------------- screens

function panel(x, y, w, h) {
  ctx.fillStyle = 'rgba(5,8,11,0.86)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(125,216,143,0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

function centreText(txt, y, size, colour, weight) {
  ctx.font = `${weight || ''} ${size}px ui-monospace, monospace`.trim();
  ctx.textAlign = 'center';
  ctx.fillStyle = colour;
  ctx.fillText(txt, VIEW_W / 2, y);
}

function drawTitle() {
  ctx.fillStyle = '#0a0d11';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // a slow drifting skyline behind the title
  const t = Game.t * 12;
  const lv = Game.titleLevel;
  ctx.save();
  const fake = { x: t };
  drawBackdrop(lv, fake);
  drawStreet(lv, fake);
  ctx.fillStyle = 'rgba(5,8,11,0.62)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.restore();

  centreText('B E C O', 168, 62, '#e8f4ea', 'bold');
  centreText('hold the alley. stay standing.', 200, 12, 'rgba(190,214,196,0.72)');

  panel(VIEW_W / 2 - 250, 246, 500, 168);
  ctx.textAlign = 'left';
  ctx.font = '11px ui-monospace, monospace';
  const rows = [
    ['MOVE', 'A / D  or  ← →'],
    ['AIM UP / DOWN', 'W / S  (hold while firing)'],
    ['FIRE', 'J  /  Z  /  SPACE'],
    ['JUMP  ·  ROLL', 'K  ·  L'],
    ['RELOAD  ·  GRENADE', 'R  ·  G'],
    ['RUN', 'SHIFT'],
  ];
  rows.forEach((r, i) => {
    ctx.fillStyle = 'rgba(125,216,143,0.85)';
    ctx.fillText(r[0], VIEW_W / 2 - 226, 274 + i * 22);
    ctx.fillStyle = 'rgba(214,232,220,0.8)';
    ctx.fillText(r[1], VIEW_W / 2 - 40, 274 + i * 22);
  });

  const blink = Math.sin(Game.t * 4) > -0.3;
  if (blink) centreText('PRESS ANY KEY', 456, 14, '#e6d98a');
  if (Game.best > 0) centreText(`BEST  ${String(Game.best).padStart(6, '0')}`, 486, 10,
                                'rgba(190,214,196,0.5)');
  centreText('gamepad and touch supported', 512, 9, 'rgba(190,214,196,0.35)');
}

function drawOverlayMessage() {
  const p = Game.world.player;
  if (Game.state === 'dead') {
    ctx.fillStyle = 'rgba(60,6,6,0.45)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    panel(VIEW_W / 2 - 190, 190, 380, 150);
    centreText('CAIU', 244, 40, '#d3564f', 'bold');
    centreText(`score  ${String(p.score).padStart(6, '0')}`, 276, 12, '#cfe6d4');
    centreText(`best   ${String(Game.best).padStart(6, '0')}`, 296, 11, 'rgba(190,214,196,0.6)');
    if (Math.sin(Game.t * 4) > -0.3) centreText('R  —  try the beco again', 322, 11, '#e6d98a');
  } else if (Game.state === 'cleared') {
    panel(VIEW_W / 2 - 200, 186, 400, 158);
    centreText('BECO CLEAR', 234, 34, '#7dd88f', 'bold');
    centreText(`${Game.world.killed} down  ·  +${500 + Math.round(p.hp * 5)} bonus`, 266, 11, '#cfe6d4');
    centreText(`score  ${String(p.score).padStart(6, '0')}`, 288, 12, '#cfe6d4');
    if (Math.sin(Game.t * 4) > -0.3)
      centreText(Game.levelIndex + 1 >= 4 ? 'ENTER  —  finish' : 'ENTER  —  next beco',
                 322, 11, '#e6d98a');
  } else if (Game.state === 'won') {
    panel(VIEW_W / 2 - 220, 170, 440, 190);
    centreText('THE MORRO IS YOURS', 220, 26, '#7dd88f', 'bold');
    centreText('four becos held. nobody took the hill.', 250, 11, 'rgba(214,232,220,0.8)');
    centreText(`final score  ${String(p.score).padStart(6, '0')}`, 288, 15, '#e8f4ea');
    centreText(`best  ${String(Game.best).padStart(6, '0')}`, 312, 11, 'rgba(190,214,196,0.6)');
    if (Math.sin(Game.t * 4) > -0.3) centreText('R  —  again', 340, 11, '#e6d98a');
  } else if (Game.state === 'paused') {
    ctx.fillStyle = 'rgba(5,8,11,0.6)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    centreText('PAUSED', 260, 30, '#cfe6d4', 'bold');
    centreText('P / ESC to resume', 288, 11, 'rgba(190,214,196,0.7)');
  }

  if (Game.state === 'play' && Game.msgT > 0) {
    const a = clamp(Game.msgT, 0, 1) * clamp((2.2 - Game.msgT) * 4, 0, 1);
    ctx.globalAlpha = a;
    centreText(`BECO ${Game.levelIndex + 1}`, 150, 34, '#e8f4ea', 'bold');
    centreText(['viela do fundo', 'ladeira', 'laje alta', 'boca'][Game.levelIndex] || '',
               176, 12, 'rgba(190,214,196,0.8)');
    ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------------ main loop

let last = performance.now();
let acc = 0;
const STEP = 1 / 120;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;
  Game.t += dt;

  pollGamepad();

  // ---- state transitions --------------------------------------------------
  if (Game.state === 'title') {
    if (Input.pressed.size > 0 || Game.anyPress) {
      Sfx.init(); Sfx.resume();
      startLevel(0, false);
    }
  } else if (Game.state === 'dead' || Game.state === 'won') {
    if (Input.once('KeyR') || Input.once('Enter') || Game.anyPress) startLevel(0, false);
  } else if (Game.state === 'cleared') {
    if (Input.once('Enter') || Input.once('KeyR') || Game.anyPress) {
      if (Game.levelIndex + 1 >= 4) {
        Game.state = 'won';
        const s = Game.world.player.score;
        if (s > Game.best) { Game.best = s; localStorage.setItem('beco.best', String(s)); }
      } else {
        startLevel(Game.levelIndex + 1, true);
      }
    }
  }
  if (Input.once('KeyP') || Input.once('Escape') || Input.takeVk('pause')) {
    if (Game.state === 'play') Game.state = 'paused';
    else if (Game.state === 'paused') Game.state = 'play';
  }
  if (Input.once('Backquote')) Game.debug = !Game.debug;
  if (Input.once('KeyM')) { Sfx.muted = !Sfx.muted; }
  Game.anyPress = false;

  // ---- simulate -----------------------------------------------------------
  if (Game.state === 'play') {
    acc += dt;
    let guard = 0;
    while (acc >= STEP && guard++ < 8) { updatePlay(STEP); acc -= STEP; }
    if (Game.msgT > 0) Game.msgT -= dt;
  } else {
    acc = 0;
    if (Game.state !== 'title') updateParticles(dt);
  }

  // ---- draw ---------------------------------------------------------------
  ctx.fillStyle = '#05070a';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  if (Game.state === 'title') {
    drawTitle();
    drawTouchControls();
  } else {
    drawWorld();
    drawOverlayMessage();
  }

  Input.clearFrame();
  for (const k in Input.vkOnce) Input.vkOnce[k] = false;
}

// ------------------------------------------------------------------- resizing

function resize() {
  const pad = 0;
  const aw = innerWidth - pad, ah = innerHeight - pad;
  const s = Math.min(aw / VIEW_W, ah / VIEW_H);
  canvas.style.width = Math.floor(VIEW_W * s) + 'px';
  canvas.style.height = Math.floor(VIEW_H * s) + 'px';
}
addEventListener('resize', resize);

// -------------------------------------------------------------------- startup

(async function main() {
  try {
    const names = ['player', 'police', 'fx', 'buildings'];
    let done = 0;
    const sheets = await Promise.all(names.map(async (n) => {
      const s = await loadSheet(n);
      done++;
      bootbar.style.width = (done / names.length * 100) + '%';
      return s;
    }));
    names.forEach((n, i) => (A[n] = sheets[i]));

    Game.titleLevel = buildLevel(99);
    resize();
    boot.classList.add('gone');
    setTimeout(() => boot.remove(), 500);
    requestAnimationFrame((t) => { last = t; frame(t); });

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  } catch (err) {
    boot.innerHTML = `<div class="err">could not load BECO<br>${err.message}<br><br>` +
                     `serve this folder over http (assets are fetched), e.g.<br>` +
                     `<code>python3 -m http.server</code></div>`;
    throw err;
  }
})();
