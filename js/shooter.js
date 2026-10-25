// UFO シューティングステージ (スペースインベーダー風)
// ポポが UFO に乗って、隊列で迫ってくる敵を撃ち落とす。最後はボス「キングトゲ」。
(() => {
  "use strict";

  const A = window.PopoArt;
  const Input = window.PopoInput;
  const W = 384;
  const H = 224;
  const OUT = A.OUTLINE;
  const UFO_Y = 206; // 円盤の中心の高さ
  const DANGER_Y = UFO_Y - 22; // 敵の隊列がここまで降りてきたらアウト

  const WAVES = [
    { rows: ["pata", "toge", "kara", "gumi"], cols: 8, speed: 1, fire: 1.3, bomb: 110 },
    { rows: ["pata", "pata", "toge", "kara", "gumi"], cols: 9, speed: 1.3, fire: 0.95, bomb: 130 },
    { boss: true },
  ];
  const POINTS = { pata: 300, toge: 200, kara: 150, gumi: 100 };
  const BOMB_COLOR = { pata: "#c890ff", toge: "#ff6a5a", kara: "#ffb040", gumi: "#5af0d0", boss: "#ff8a30" };

  let S = null;
  let api = null;
  let L = null;
  let art = null;

  // ---------------------------------------------------------------- art
  function saucer(w, h, body, light, dark, frame) {
    return A.paint(w, h, (g, p, r) => {
      const cx = w / 2;
      const cy = h / 2 - 1;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const dx = (x + 0.5 - cx) / (w / 2 - 0.5);
          const dy = (y + 0.5 - cy) / (h / 2 - 1.5);
          const d = dx * dx + dy * dy;
          if (d > 1) continue;
          let col = y < cy - 1 ? light : y < cy + 2 ? body : dark;
          if (d > 0.8) col = OUT;
          p(x, y, col);
        }
      }
      const n = Math.max(3, Math.floor(w / 9));
      for (let i = 0; i < n; i++) {
        const x = Math.round(cx - ((n - 1) * 8) / 2 + i * 8) - 1;
        r(x, Math.round(cy), 2, 2, (i + frame) % 3 === 0 ? "#ffd23a" : (i + frame) % 3 === 1 ? "#ff69b4" : "#6af0ff");
      }
    });
  }

  function planet() {
    return A.paint(96, 72, (g, p, r) => {
      for (let y = 0; y < 72; y++) {
        for (let x = 0; x < 96; x++) {
          const d = Math.hypot(x + 0.5 - 48, y + 0.5 - 36);
          if (d <= 26) {
            const band = Math.floor((y + x * 0.3) / 6) % 2 === 0;
            let col = band ? "#c04a90" : "#a03a80";
            if (x + y < 70 && d > 18) col = "#e070b0";
            if (d > 25) col = "#3a1438";
            p(x, y, col);
          }
          // 輪
          const ry = (y + 0.5 - 36 - (x - 48) * 0.18) / 6;
          const rx = (x + 0.5 - 48) / 46;
          const rd = rx * rx + ry * ry;
          if (rd <= 1 && rd >= 0.62 && !(d <= 26 && y < 36 + (x - 48) * 0.18)) p(x, y, rd > 0.9 ? "#8a5ac0" : "#d8b0ff");
        }
      }
    });
  }

  function crown() {
    return A.paint(28, 14, (g, p, r) => {
      r(2, 6, 24, 8, OUT);
      r(3, 7, 22, 6, "#ffd23a");
      for (const x of [2, 12, 22]) {
        r(x, 0, 4, 7, OUT);
        r(x + 1, 1, 2, 6, "#ffd23a");
      }
      r(6, 9, 3, 2, "#ff4a6a"); r(13, 9, 3, 2, "#6af0ff"); r(20, 9, 3, 2, "#9aff6a");
      r(3, 7, 22, 1, "#fff2b0");
    });
  }

  function buildArt() {
    return {
      ufo: [0, 1, 2].map((f) => saucer(48, 16, "#a8b0c8", "#e8ecf8", "#6a7090", f)),
      mystery: [0, 1, 2].map((f) => saucer(34, 12, "#f0b020", "#ffe070", "#a86a00", f)),
      planet: planet(),
      crown: crown(),
      enemies: A.buildEnemies(),
      berry: A.berry(),
      stars: A.stars(),
    };
  }

  // ---------------------------------------------------------------- setup
  function makeStars() {
    const stars = [];
    for (let i = 0; i < 70; i++) {
      const layer = i % 3;
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        v: [8, 20, 45][layer],
        size: layer === 2 ? 2 : 1,
        color: ["#4a4a7a", "#9a9ad0", "#ffffff"][layer],
      });
    }
    return stars;
  }

  function makeBunker(cx) {
    const cols = 16;
    const rows = 8;
    const cells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let on = true;
        if (r === 0 && (c < 2 || c > 13)) on = false;
        if (r === 1 && (c < 1 || c > 14)) on = false;
        if (r >= 5 && c >= 5 && c <= 10) on = false;
        cells.push(on);
      }
    }
    return { x: Math.round(cx - cols), y: 158, cols, rows, cells };
  }

  function init(level, apiObj, startWave) {
    L = level;
    api = apiObj;
    if (!art) art = buildArt();
    S = {
      wave: startWave || 0,
      phase: "banner",
      phaseT: 0,
      t: 0,
      ufo: { x: W / 2, vx: 0, cooldown: 0, triple: 0, shield: false, invuln: 1, dead: false },
      shots: [],
      bombs: [],
      invaders: [],
      total: 1,
      march: { dir: 1, stepT: 0, frame: 0 },
      fireT: 1.5,
      bunkers: [1, 2, 3, 4].map((i) => makeBunker((W * i) / 5)),
      mystery: null,
      mysteryT: 10,
      items: [],
      boss: null,
      stars: makeStars(),
    };
  }

  function spawnWave() {
    const cfg = WAVES[S.wave];
    S.march = { dir: 1, stepT: 0, frame: 0 };
    S.fireT = 1.5;
    if (cfg.boss) {
      S.boss = { x: W / 2 - 32, y: -70, w: 64, h: 56, hp: 30, maxHp: 30, t: 0, fireT: 1.5, flash: 0, enter: true, pattern: 0, dying: false, dyingT: 0 };
      api.setCheckpoint(S.wave);
      api.music("boss");
      return;
    }
    const x0 = Math.round((W - (cfg.cols - 1) * 24 - 16) / 2);
    S.invaders = [];
    cfg.rows.forEach((type, r) => {
      for (let c = 0; c < cfg.cols; c++) {
        S.invaders.push({ type, col: c, x: x0 + c * 24 + 1, y: 40 + r * 18, w: 14, h: 12, alive: true });
      }
    });
    S.total = S.invaders.length;
  }

  // ---------------------------------------------------------------- helpers
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const ufoBox = () => ({ x: S.ufo.x - 16, y: UFO_Y - 20, w: 32, h: 24 });

  function boom(x, y, color, n = 10, speed = 90) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      L.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 0, life: 0.45 + Math.random() * 0.2, t: 0, color, size: 2 });
    }
  }

  // 弾がバンカー (かべ) に当たったら削る
  function hitBunker(box) {
    for (const b of S.bunkers) {
      if (box.x + box.w <= b.x || box.x >= b.x + b.cols * 2 || box.y + box.h <= b.y || box.y >= b.y + b.rows * 2) continue;
      const c0 = Math.max(0, Math.floor((box.x - b.x) / 2));
      const c1 = Math.min(b.cols - 1, Math.floor((box.x + box.w - 1 - b.x) / 2));
      const r0 = Math.max(0, Math.floor((box.y - b.y) / 2));
      const r1 = Math.min(b.rows - 1, Math.floor((box.y + box.h - 1 - b.y) / 2));
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          if (!b.cells[r * b.cols + c]) continue;
          // まわりをランダムに削る
          for (let dr = -2; dr <= 2; dr++) {
            for (let dc = -2; dc <= 2; dc++) {
              const rr = r + dr;
              const cc = c + dc;
              if (rr < 0 || rr >= b.rows || cc < 0 || cc >= b.cols) continue;
              if (Math.abs(dr) + Math.abs(dc) <= 1 || Math.random() < 0.35) b.cells[rr * b.cols + cc] = false;
            }
          }
          return true;
        }
      }
    }
    return false;
  }

  function eraseBunker(box) {
    for (const b of S.bunkers) {
      for (let r = 0; r < b.rows; r++) {
        for (let c = 0; c < b.cols; c++) {
          const x = b.x + c * 2;
          const y = b.y + r * 2;
          if (x + 2 > box.x && x < box.x + box.w && y + 2 > box.y && y < box.y + box.h) b.cells[r * b.cols + c] = false;
        }
      }
    }
  }

  function hitUfo(fatal) {
    const u = S.ufo;
    if (u.dead) return;
    if (!fatal && u.invuln > 0) return;
    if (u.shield && !fatal) {
      u.shield = false;
      u.invuln = 1.5;
      api.play("hurt");
      boom(u.x, UFO_Y - 8, "#ffd23a", 12);
      return;
    }
    u.dead = true;
    boom(u.x, UFO_Y - 6, "#ff69b4", 24, 120);
    boom(u.x, UFO_Y - 6, "#ffffff", 12, 70);
    api.play("explode");
    api.die();
  }

  // ---------------------------------------------------------------- update
  function updateStars(dt) {
    for (const s of S.stars) {
      s.y += s.v * dt;
      if (s.y > H) { s.y -= H; s.x = Math.random() * W; }
    }
  }

  function updateUfo(dt) {
    const u = S.ufo;
    if (u.dead) return;
    const dir = (Input.held("right") ? 1 : 0) - (Input.held("left") ? 1 : 0);
    u.vx += (dir * 170 - u.vx) * Math.min(1, dt * 12);
    u.x = Math.max(22, Math.min(W - 22, u.x + u.vx * dt));
    u.cooldown -= dt;
    if (u.invuln > 0) u.invuln -= dt;
    if (u.triple > 0) u.triple -= dt;
    const fire = Input.held("jump") || Input.held("run");
    const maxShots = u.triple > 0 ? 9 : 3;
    if (fire && u.cooldown <= 0 && S.shots.length < maxShots && S.phase !== "cleared") {
      u.cooldown = 0.22;
      const y = UFO_Y - 26;
      const spread = u.triple > 0 ? [-70, 0, 70] : [0];
      for (const vx of spread) S.shots.push({ x: u.x - 1, y, w: 2, h: 6, vx, vy: -330 });
      api.play("shoot");
    }
  }

  function updateShots(dt) {
    for (const s of S.shots) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.y < 26 || s.x < -4 || s.x > W + 4) { s.dead = true; continue; }
      if (hitBunker(s)) { s.dead = true; continue; }
      for (const e of S.invaders) {
        if (e.alive && overlap(s, e)) {
          e.alive = false;
          s.dead = true;
          api.addScore(POINTS[e.type], e.x, e.y);
          boom(e.x + 7, e.y + 6, BOMB_COLOR[e.type]);
          api.play("stomp");
          break;
        }
      }
      if (s.dead) continue;
      for (const bm of S.bombs) {
        if (!bm.dead && overlap(s, bm)) {
          bm.dead = true;
          s.dead = true;
          boom(bm.x, bm.y, "#ffffff", 4, 40);
          break;
        }
      }
      if (s.dead) continue;
      const m = S.mystery;
      if (m && overlap(s, m)) {
        s.dead = true;
        S.mystery = null;
        const pts = [300, 500, 800, 1000][Math.floor(Math.random() * 4)];
        api.addScore(pts, m.x + 8, m.y);
        boom(m.x + 17, m.y + 6, "#ffd23a", 16);
        api.play("explode");
        S.items.push({ type: S.ufo.shield ? "star" : "berry", x: m.x + 9, y: m.y, w: 14, h: 14 });
        continue;
      }
      const b = S.boss;
      if (b && !b.enter && !b.dying && overlap(s, { x: b.x + 6, y: b.y + 8, w: 52, h: 48 })) {
        s.dead = true;
        b.hp--;
        b.flash = 0.08;
        api.addScore(50);
        boom(s.x, s.y, "#ffffff", 3, 50);
        api.play("bump");
        if (b.hp <= 0) {
          b.dying = true;
          b.dyingT = 0;
          S.bombs.length = 0;
          api.addScore(10000, b.x + 16, b.y + 20);
          api.play("explode");
        }
      }
    }
    S.shots = S.shots.filter((s) => !s.dead);
  }

  function updateBombs(dt) {
    const box = ufoBox();
    for (const b of S.bombs) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.t = (b.t || 0) + dt;
      if (b.y > H || b.x < -8 || b.x > W + 8) { b.dead = true; continue; }
      if (hitBunker(b)) { b.dead = true; continue; }
      if (!S.ufo.dead && overlap(b, box)) {
        b.dead = true;
        hitUfo(false);
      }
    }
    S.bombs = S.bombs.filter((b) => !b.dead);
  }

  function dropBomb(x, y, vx, vy, kind) {
    const big = kind === "boss";
    S.bombs.push({ x: x - (big ? 2 : 1), y, w: big ? 5 : 3, h: big ? 5 : 7, vx, vy, kind });
  }

  function updateInvaders(dt) {
    const alive = S.invaders.filter((e) => e.alive);
    if (!alive.length) return;
    const cfg = WAVES[S.wave];
    const m = S.march;
    const ratio = alive.length / S.total;
    const interval = Math.max(0.035, 0.5 * ratio + 0.03) / cfg.speed;
    m.stepT += dt;
    if (m.stepT >= interval) {
      m.stepT = 0;
      m.frame ^= 1;
      let minX = Infinity;
      let maxX = -Infinity;
      for (const e of alive) { minX = Math.min(minX, e.x); maxX = Math.max(maxX, e.x + e.w); }
      if ((m.dir > 0 && maxX + 4 > W - 8) || (m.dir < 0 && minX - 4 < 8)) {
        m.dir = -m.dir;
        for (const e of alive) e.y += 8;
      } else {
        for (const e of alive) e.x += 4 * m.dir;
      }
      api.play(m.frame ? "march1" : "march2");
      for (const e of alive) eraseBunker(e);
    }
    if (alive.some((e) => e.y + e.h >= DANGER_Y)) {
      hitUfo(true);
      return;
    }
    S.fireT -= dt;
    if (S.fireT <= 0) {
      S.fireT = cfg.fire * (0.5 + Math.random());
      // 4 割はポポの真上の列から撃ってくる
      let shooter = alive[Math.floor(Math.random() * alive.length)];
      if (Math.random() < 0.4) {
        shooter = alive.reduce((best, e) => (Math.abs(e.x + 7 - S.ufo.x) < Math.abs(best.x + 7 - S.ufo.x) ? e : best), shooter);
      }
      const lowest = alive.filter((e) => e.col === shooter.col).reduce((a, b) => (b.y > a.y ? b : a));
      dropBomb(lowest.x + 7, lowest.y + lowest.h, 0, cfg.bomb, lowest.type);
      api.play("laser");
    }
  }

  function updateMystery(dt) {
    if (S.boss) return;
    if (S.mystery) {
      const m = S.mystery;
      m.x += m.vx * dt;
      if (m.x < -40 || m.x > W + 40) S.mystery = null;
      return;
    }
    S.mysteryT -= dt;
    if (S.mysteryT <= 0) {
      S.mysteryT = 14 + Math.random() * 8;
      const dir = Math.random() < 0.5 ? 1 : -1;
      S.mystery = { x: dir > 0 ? -34 : W, y: 28, w: 34, h: 12, vx: 60 * dir };
      api.play("appear");
    }
  }

  function updateBoss(dt) {
    const b = S.boss;
    if (!b) return;
    b.t += dt;
    if (b.flash > 0) b.flash -= dt;
    if (b.dying) {
      b.dyingT += dt;
      if (Math.floor(b.dyingT * 60) % 5 === 0) {
        boom(b.x + 8 + Math.random() * 48, b.y + 8 + Math.random() * 44, ["#ff8a30", "#ffd23a", "#ffffff"][Math.floor(Math.random() * 3)], 8, 80);
        api.play("stomp");
      }
      if (b.dyingT > 1.8) {
        boom(b.x + 32, b.y + 30, "#ffd23a", 40, 160);
        api.play("explode");
        S.boss = null;
      }
      return;
    }
    if (b.enter) {
      b.y += 45 * dt;
      if (b.y >= 36) { b.y = 36; b.enter = false; b.t = 0; }
      return;
    }
    const angry = b.hp <= b.maxHp / 2;
    b.x = W / 2 - 32 + Math.sin(b.t * (angry ? 1.3 : 0.9)) * 130;
    b.y = 36 + Math.sin(b.t * 2.1) * 8;
    b.fireT -= dt;
    if (b.fireT <= 0) {
      const cx = b.x + 32;
      const cy = b.y + 54;
      b.pattern = (b.pattern + 1) % 3;
      if (b.pattern === 0) {
        // 扇形の 5 方向弾
        for (const a of [-0.5, -0.25, 0, 0.25, 0.5]) dropBomb(cx, cy, Math.sin(a) * 120, Math.cos(a) * 120, "boss");
      } else if (b.pattern === 1) {
        // ポポを狙う弾
        const dx = S.ufo.x - cx;
        const dy = UFO_Y - cy;
        const n = Math.hypot(dx, dy) || 1;
        for (const k of [0, 0.15, 0.3]) dropBomb(cx, cy - k * 60, (dx / n) * 160, (dy / n) * 160, "boss");
      } else {
        // 子分のトゲ玉を左右にばらまく
        for (const vx of [-90, -40, 40, 90]) dropBomb(cx, cy, vx, 100, "toge");
      }
      api.play("laser");
      b.fireT = angry ? 0.9 : 1.3;
    }
  }

  function updateItems(dt) {
    const box = ufoBox();
    for (const it of S.items) {
      it.y += 55 * dt;
      if (it.y > H) { it.dead = true; continue; }
      if (!S.ufo.dead && overlap(it, box)) {
        it.dead = true;
        api.addScore(1000, it.x, it.y);
        if (it.type === "berry") { S.ufo.shield = true; api.play("powerup"); }
        else { S.ufo.triple = 10; api.play("star"); }
      }
    }
    S.items = S.items.filter((it) => !it.dead);
  }

  function waveCleared() {
    return !S.boss && S.invaders.every((e) => !e.alive);
  }

  function update(dt, mode) {
    S.t += dt;
    updateStars(dt);
    if (mode !== "play") return;
    S.phaseT += dt;
    updateUfo(dt);
    if (S.phase === "banner") {
      if (S.phaseT > 1.8) {
        spawnWave();
        S.phase = "fight";
        S.phaseT = 0;
      }
    } else if (S.phase === "fight") {
      updateInvaders(dt);
      updateBoss(dt);
      updateMystery(dt);
      if (waveCleared()) {
        S.wave++;
        S.phase = S.wave >= WAVES.length ? "cleared" : "banner";
        S.phaseT = 0;
        S.mystery = null;
        S.bombs.length = 0;
        if (S.phase === "banner") api.play("check");
      }
    } else if (S.phase === "cleared") {
      if (S.phaseT > 1.5) {
        S.phase = "done";
        api.clear();
      }
    }
    updateShots(dt);
    updateBombs(dt);
    updateItems(dt);
  }

  // ---------------------------------------------------------------- draw
  function drawUfo(ctx, frame) {
    const u = S.ufo;
    if (u.dead) return;
    if (u.invuln > 0 && Math.floor(frame / 3) % 2 === 0) return;
    const x = Math.round(u.x);
    // ガラスのドーム
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#9af0ff";
    ctx.beginPath();
    ctx.ellipse(x, UFO_Y - 8, 17, 17, 0, Math.PI, 0);
    ctx.fill();
    ctx.globalAlpha = 1;
    // ポポ (上半身だけ見える)
    const look = u.vx > 40 ? "walk_right1" : u.vx < -40 ? "walk_left1" : "idle";
    const pal = u.triple > 0 ? { 0: "#ffe14a", 2: "#e0a020" } : u.shield ? { 4: "#ffd23a" } : null;
    const key = u.triple > 0 ? "star0" : u.shield ? "shield" : "normal";
    ctx.drawImage(A.popoFrame(look, key, pal), 0, 0, 32, 19, x - 16, UFO_Y - 27, 32, 19);
    // 円盤
    ctx.drawImage(art.ufo[Math.floor(frame / 8) % 3], x - 24, UFO_Y - 8);
    // 噴射
    ctx.fillStyle = frame % 4 < 2 ? "#6af0ff" : "#ffffff";
    ctx.fillRect(x - 3, UFO_Y + 7, 6, 2);
    if (u.shield) {
      ctx.globalAlpha = 0.25 + 0.12 * Math.sin(frame / 6);
      ctx.fillStyle = "#ffe878";
      ctx.beginPath();
      ctx.ellipse(x, UFO_Y - 8, 27, 20, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawBoss(ctx, frame) {
    const b = S.boss;
    if (!b) return;
    if (b.flash > 0 || (b.dying && frame % 4 < 2)) ctx.globalAlpha = 0.45;
    const img = art.enemies.toge[Math.floor(b.t * 4) % 2].l;
    ctx.drawImage(img, Math.round(b.x), Math.round(b.y), 64, 64);
    ctx.drawImage(art.crown, Math.round(b.x + 18), Math.round(b.y - 4));
    ctx.globalAlpha = 1;
    // HP バー
    if (!b.enter) {
      const bw = 140;
      const bx = W / 2 - bw / 2;
      ctx.fillStyle = OUT;
      ctx.fillRect(bx - 1, 29, bw + 2, 6);
      ctx.fillStyle = "#3a1438";
      ctx.fillRect(bx, 30, bw, 4);
      ctx.fillStyle = b.hp <= b.maxHp / 2 ? "#ff6a5a" : "#ff69b4";
      ctx.fillRect(bx, 30, Math.max(0, Math.round((bw * b.hp) / b.maxHp)), 4);
    }
  }

  function draw(ctx, frame) {
    const bands = ["#05030f", "#080520", "#0c072a", "#120a36", "#180e40"];
    const bh = Math.ceil(H / bands.length);
    bands.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(0, i * bh, W, bh); });
    ctx.drawImage(art.planet, 276, 46 + Math.round(Math.sin(S.t * 0.3) * 3));
    for (const s of S.stars) {
      ctx.fillStyle = s.color;
      ctx.fillRect(Math.round(s.x), Math.round(s.y), s.size, s.size);
    }
    // バンカー
    for (const b of S.bunkers) {
      for (let r = 0; r < b.rows; r++) {
        for (let c = 0; c < b.cols; c++) {
          if (!b.cells[r * b.cols + c]) continue;
          ctx.fillStyle = r === 0 || !b.cells[(r - 1) * b.cols + c] ? "#c8ffe0" : r > 5 ? "#2a9a6a" : "#5ad09a";
          ctx.fillRect(b.x + c * 2, b.y + r * 2, 2, 2);
        }
      }
    }
    // 敵
    for (const e of S.invaders) {
      if (!e.alive) continue;
      const set = art.enemies[e.type];
      ctx.drawImage(set[S.march.frame][S.march.dir > 0 ? "r" : "l"], e.x - 1, e.y - 3);
    }
    if (S.mystery) ctx.drawImage(art.mystery[Math.floor(frame / 6) % 3], Math.round(S.mystery.x), S.mystery.y);
    drawBoss(ctx, frame);
    for (const it of S.items) {
      const img = it.type === "berry" ? art.berry : art.stars[Math.floor(frame / 4) % 2];
      ctx.drawImage(img, Math.round(it.x - 1), Math.round(it.y - 1));
    }
    // 弾
    for (const s of S.shots) {
      ctx.fillStyle = "#ff69b4";
      ctx.fillRect(Math.round(s.x) - 1, Math.round(s.y) + 2, 4, 5);
      ctx.fillStyle = "#fff6c0";
      ctx.fillRect(Math.round(s.x), Math.round(s.y), 2, 6);
    }
    for (const b of S.bombs) {
      const x = Math.round(b.x);
      const y = Math.round(b.y);
      ctx.fillStyle = BOMB_COLOR[b.kind] || "#ff6a5a";
      if (b.kind === "boss") {
        ctx.fillRect(x, y + 1, 5, 3);
        ctx.fillRect(x + 1, y, 3, 5);
      } else {
        const zig = Math.floor((b.t || 0) * 16) % 2;
        ctx.fillRect(x + zig, y, 2, 2);
        ctx.fillRect(x + 1 - zig, y + 2, 2, 2);
        ctx.fillRect(x + zig, y + 4, 2, 3);
      }
    }
    drawUfo(ctx, frame);

    const o = { align: "center", outline: OUT };
    if (S.phase === "banner") {
      const cfg = WAVES[S.wave];
      const text = cfg.boss ? "BOSS: KING TOGE" : `WAVE ${S.wave + 1}`;
      if (Math.floor(S.phaseT * 4) % 2 === 0 || S.phaseT > 1) A.drawText(ctx, text, W / 2, 84, cfg.boss ? "#ff6a5a" : "#ffd23a", { ...o, scale: 2 });
      if (S.wave === 0) A.drawText(ctx, "SPACE / A : SHOOT", W / 2, 112, "#ffffff", o);
    }
    if (S.phase === "cleared" || S.phase === "done") {
      A.drawText(ctx, "UFO ATTACK CLEAR!", W / 2, 84, "#ffd23a", { ...o, scale: 2 });
    }
  }

  function hud() {
    if (!S) return { label: "WAVE", value: "1/3" };
    const w = Math.min(S.wave, WAVES.length - 1);
    return { label: "WAVE", value: WAVES[w].boss ? "BOSS" : `${w + 1}/3` };
  }

  window.PopoShooter = { init, update, draw, hud, get state() { return S; } };
})();
