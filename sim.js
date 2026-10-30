// Fleet Defense - game simulation (runs only on the HOST's browser).
// The guest never runs this; it only draws the snapshots the host sends.

const W = 480, H = 640;
const COLS = 8, EW = 27, EH = 21, SX = 46, SY = 34;
const PY = H - 48; // ships' vertical position

function mkPlayer(i, present, two) {
  return {
    present,
    x: two ? (i === 0 ? W * 0.3 : W * 0.7) : W / 2,
    lives: present ? 3 : 0,
    alive: present,
    cd: 0,
    inv: 0,
    input: { l: 0, r: 0, f: 0 },
  };
}

function newSim(two) {
  const s = {
    players: [mkPlayer(0, true, two), mkPlayer(1, two, two)],
    bullets: [], eb: [], en: [],
    fx: 0, fy: 0, dir: 1, spd: 0, rows: 0, ebv: 200,
    wave: 1, score: 0, phase: 'play', phaseT: 0, shootT: 1.2,
  };
  spawnWave(s);
  return s;
}

function spawnWave(s) {
  s.rows = Math.min(3 + Math.floor((s.wave - 1) / 2), 6);
  s.en = [];
  for (let r = 0; r < s.rows; r++)
    for (let c = 0; c < COLS; c++) s.en.push({ r, c, alive: true });
  s.fx = (W - ((COLS - 1) * SX + EW)) / 2;
  s.fy = 50;
  s.dir = 1;
  s.bullets = [];
  s.eb = [];
  s.ebv = 190 + s.wave * 12;
  s.shootT = 1.2;
}

function enemySpeed(s, aliveCount) {
  const total = s.rows * COLS;
  return (26 + s.wave * 6) * (1 + (1 - aliveCount / total) * 1.6);
}

function stepSim(s, dt) {
  if (s.phase === 'over') return;
  const pl = s.players;

  // players
  for (const p of pl) {
    if (!p.present || !p.alive) continue;
    const i = p.input;
    p.x += ((i.r ? 1 : 0) - (i.l ? 1 : 0)) * 260 * dt;
    p.x = Math.max(18, Math.min(W - 18, p.x));
    p.cd -= dt;
    if (p.inv > 0) p.inv -= dt;
    if (i.f && p.cd <= 0 && s.phase === 'play') {
      s.bullets.push({ x: p.x, y: PY - 14 });
      p.cd = 0.28;
    }
  }

  // short pause between waves
  if (s.phase === 'wave') {
    s.phaseT -= dt;
    if (s.phaseT <= 0) s.phase = 'play';
    return;
  }

  // bullets
  for (const b of s.bullets) b.y -= 520 * dt;
  s.bullets = s.bullets.filter(b => b.y > -12);
  for (const b of s.eb) b.y += s.ebv * dt;
  s.eb = s.eb.filter(b => b.y < H + 12);

  // formation movement
  const alive = s.en.filter(e => e.alive);
  s.spd = enemySpeed(s, alive.length);
  s.fx += s.dir * s.spd * dt;
  let minC = 99, maxC = -1;
  for (const e of alive) { if (e.c < minC) minC = e.c; if (e.c > maxC) maxC = e.c; }
  if (maxC >= 0) {
    const left = s.fx + minC * SX, right = s.fx + maxC * SX + EW;
    if (s.dir > 0 && right >= W - 10) { s.dir = -1; s.fy += 14; s.fx -= right - (W - 10); }
    else if (s.dir < 0 && left <= 10) { s.dir = 1; s.fy += 14; s.fx += 10 - left; }
  }

  // player bullets vs enemies
  for (const b of s.bullets) {
    for (const e of alive) {
      if (!e.alive) continue;
      const ex = s.fx + e.c * SX, ey = s.fy + e.r * SY;
      if (b.x > ex - 2 && b.x < ex + EW + 2 && b.y > ey && b.y < ey + EH) {
        e.alive = false; b.dead = true;
        s.score += 10 + (e.r % 3) * 5;
        break;
      }
    }
  }
  s.bullets = s.bullets.filter(b => !b.dead);

  // enemies shoot
  s.shootT -= dt;
  if (s.shootT <= 0) {
    s.shootT = Math.max(0.3, 1.1 - s.wave * 0.07) * (0.6 + Math.random() * 0.8);
    const live = s.en.filter(e => e.alive);
    if (live.length) {
      const cols = [...new Set(live.map(e => e.c))];
      const c = cols[Math.floor(Math.random() * cols.length)];
      let low = null;
      for (const e of live) if (e.c === c && (!low || e.r > low.r)) low = e;
      s.eb.push({ x: s.fx + low.c * SX + EW / 2, y: s.fy + low.r * SY + EH });
    }
  }

  // enemy bullets vs ships
  for (const b of s.eb) {
    for (const p of pl) {
      if (!p.present || !p.alive || p.inv > 0) continue;
      if (Math.abs(b.x - p.x) < 14 && b.y > PY - 12 && b.y < PY + 10) {
        b.dead = true;
        p.lives--;
        p.inv = 1.5;
        if (p.lives <= 0) { p.lives = 0; p.alive = false; }
        break;
      }
    }
  }
  s.eb = s.eb.filter(b => !b.dead);

  // invasion: enemies reached the ships
  for (const e of s.en) {
    if (e.alive && s.fy + e.r * SY + EH >= PY - 18) {
      for (const p of pl) { p.alive = false; p.lives = 0; }
      break;
    }
  }

  // wave cleared
  if (!s.en.some(e => e.alive) && pl.some(p => p.present && p.alive)) {
    s.score += 50 * s.wave;
    s.wave++;
    for (const p of pl) {
      if (p.present && !p.alive) { p.alive = true; p.lives = 1; p.inv = 2; }
    }
    spawnWave(s);
    s.phase = 'wave';
    s.phaseT = 2;
  }

  // game over only when every ship is down
  if (!pl.some(p => p.present && p.alive)) s.phase = 'over';
}

// ---- snapshot sent over the network (host -> guest) ----
function netSnap(s) {
  const al = new Array(s.rows * COLS).fill(0);
  for (const e of s.en) if (e.alive) al[e.r * COLS + e.c] = 1;
  return {
    ph: s.phase, sc: s.score, wv: s.wave,
    pl: s.players.map(p => p.present ? [Math.round(p.x), p.lives, p.alive ? 1 : 0, p.inv > 0 ? 1 : 0] : null),
    fx: +s.fx.toFixed(1), fy: +s.fy.toFixed(1), dir: s.dir, spd: +s.spd.toFixed(1),
    al,
    b: s.bullets.map(b => [Math.round(b.x), Math.round(b.y)]),
    eb: s.eb.map(b => [Math.round(b.x), Math.round(b.y)]),
    ebv: s.ebv,
  };
}

// ---- turn a snapshot into something drawable (age = seconds since it was made) ----
function viewFrom(n, age) {
  const en = [];
  for (let i = 0; i < n.al.length; i++) {
    if (!n.al[i]) continue;
    const r = Math.floor(i / COLS), c = i % COLS;
    en.push({ x: n.fx + n.dir * n.spd * age + c * SX, y: n.fy + r * SY, t: r % 3 });
  }
  return {
    ph: n.ph, sc: n.sc, wv: n.wv,
    pl: n.pl.map(p => p && { x: p[0], lives: p[1], alive: !!p[2], inv: !!p[3] }),
    en,
    b: n.b.map(b => ({ x: b[0], y: b[1] - 520 * age })),
    eb: n.eb.map(b => ({ x: b[0], y: b[1] + n.ebv * age })),
  };
}
