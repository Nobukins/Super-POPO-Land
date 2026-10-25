// Super POPO Land 本体: ゲームループ・物理・敵・アイテム・画面遷移
(() => {
  "use strict";

  const A = window.PopoArt;
  const Snd = window.PopoAudio;
  const Input = window.PopoInput;
  const Levels = window.PopoLevels;
  const Shooter = window.PopoShooter;
  const { T, TILE, SOLID } = A;

  const W = 384;
  const H = 224;
  const STEP = 1 / 60;

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  // ------------------------------------------------------------ 物理パラメータ
  const PHYS = {
    walk: 90,
    run: 150,
    crawl: 45,
    accel: 520,
    runAccel: 640,
    airAccel: 420,
    friction: 520,
    skid: 1100,
    slideFriction: 220,
    jump: 410,
    jumpRunBonus: 0.15,
    gravityHold: 1150,
    gravity: 2400,
    gravityFall: 2000,
    maxFall: 420,
    coyote: 0.08,
    buffer: 0.12,
  };

  const PLAYER_W = 18;
  const PLAYER_H = 26;
  const CROUCH_H = 15;

  // ------------------------------------------------------------ 共通アセット
  const enemyArt = A.buildEnemies();
  const berryArt = A.berry();
  const starArt = A.stars();
  const checkpointArt = [A.checkpoint(false), A.checkpoint(true)];
  const signArt = { down: A.sign("down"), right: A.sign("right") };
  const tilesets = {};
  const backgrounds = {};
  const castles = {};
  function tilesetFor(theme) {
    if (!tilesets[theme]) {
      tilesets[theme] = A.buildTileset(theme);
      backgrounds[theme] = A.buildBackground(theme);
      castles[theme] = A.castle(theme);
    }
    return tilesets[theme];
  }

  const PAL_SHIELD = { 4: "#ffd23a" };
  const PAL_STAR = [
    { 0: "#ffe14a", 2: "#e0a020" },
    { 0: "#6af0ff", 2: "#2aa0d0" },
    { 0: "#9aff6a", 2: "#40c040" },
    { 0: "#ffffff", 2: "#c0c0e0" },
  ];

  // ------------------------------------------------------------ 状態
  let hiScore = 0;
  try { hiScore = Number(localStorage.getItem("popo.hiscore")) || 0; } catch (e) { /* storage unavailable */ }

  const game = {
    mode: "title", // title | intro | play | dying | goal | gameover | ending
    paused: false,
    modeTime: 0,
    levelIndex: 0,
    lives: 3,
    score: 0,
    coins: 0,
    checkpoint: null,
    level: null,
    frame: 0,
  };

  let tapped = false;
  let L = null; // 現在のステージの実行時データ
  let player = null;

  function saveHi() {
    if (game.score > hiScore) {
      hiScore = game.score;
      try { localStorage.setItem("popo.hiscore", String(hiScore)); } catch (e) { /* storage unavailable */ }
    }
  }

  // ------------------------------------------------------------ タイル
  function tileAt(cx, cy) {
    if (cx < 0 || cx >= L.cols) return T.HARD; // 左右の端は壁
    if (cy < 0 || cy >= L.rows) return T.EMPTY;
    return L.tiles[cy * L.cols + cx];
  }
  function setTile(cx, cy, t) {
    if (cx < 0 || cx >= L.cols || cy < 0 || cy >= L.rows) return;
    L.tiles[cy * L.cols + cx] = t;
  }
  const isSolid = (t) => SOLID.has(t);

  // ------------------------------------------------------------ ステージ開始
  function loadLevel(index, fromCheckpoint) {
    const lv = Levels.build(index);
    tilesetFor(lv.theme);
    L = {
      ...lv,
      tiles: new Uint8Array(lv.tiles),
      enemies: [],
      items: [],
      lifts: [],
      particles: [],
      popups: [],
      bumps: new Map(),
      multi: new Map(),
      checkpoints: lv.deco.filter((d) => d.kind === "checkpoint").map((d) => ({ ...d, on: false })),
      signs: lv.deco.filter((d) => d.kind === "sign"),
      cam: 0,
      timeLeft: lv.time,
      timeAcc: 0,
      hurried: false,
      flagY: 2 * TILE + 4,
    };
    for (const e of lv.entities) {
      if (e.kind === "enemy") spawnEnemy(e.type, e.x * TILE, (e.y + 1) * TILE);
      else if (e.kind === "lift") {
        const w = e.w * TILE;
        L.lifts.push({
          x: e.x * TILE, y: e.y * TILE, w, h: 8, axis: e.axis,
          x0: e.x * TILE, y0: e.y * TILE, range: e.range * TILE, speed: e.speed,
          t: 0, dx: 0, dy: 0, art: tilesets[lv.theme].lift(w),
        });
      }
    }
    let sx = lv.start.x * TILE;
    if (fromCheckpoint && game.checkpoint !== null) {
      const cp = L.checkpoints.find((c) => c.x === game.checkpoint);
      if (cp) {
        cp.on = true;
        sx = cp.x * TILE;
      }
    }
    player = makePlayer(sx + 2, (lv.start.y + 2) * TILE - PLAYER_H);
    if (fromCheckpoint && game.checkpoint !== null) player.y = 12 * TILE - PLAYER_H;
    L.cam = clampCam(player.x - W * 0.4);
    if (L.kind === "shooter") {
      // シューティングではポポは UFO に乗るので、通常のプレイヤーは使わない
      player.hidden = true;
      Shooter.init(L, shooterApi, fromCheckpoint && game.checkpoint !== null ? game.checkpoint : 0);
    }
  }

  const shooterApi = {
    addScore: (n, x, y) => addScore(n, x, y),
    die: () => die(),
    clear: () => {
      game.mode = "goal";
      game.goalPhase = "tally";
      game.modeTime = 0;
      L.timeLeft = 0;
      Snd.stopMusic();
      Snd.play("clear");
    },
    setCheckpoint: (wave) => { game.checkpoint = wave; },
    play: (name) => Snd.play(name),
    music: (name) => Snd.playMusic(name),
  };

  function makePlayer(x, y) {
    return {
      x, y, w: PLAYER_W, h: PLAYER_H, vx: 0, vy: 0,
      onGround: false, onLift: null, facing: 1,
      crouch: false, coyote: 0, buffer: 0, jumping: false,
      shield: false, star: 0, invuln: 0,
      animT: 0, landT: 0, hidden: false,
      combo: 0,
    };
  }

  function spawnEnemy(type, x, bottom) {
    const e = {
      type, x: x + 1, y: bottom - 14, w: 14, h: 14, vx: -30, vy: 0,
      alive: true, active: false, state: "walk", t: 0, onGround: false, combo: 0,
    };
    if (type === "kara") e.vx = -28;
    if (type === "toge") e.vx = -24;
    if (type === "pata") { e.baseY = e.y - 8; e.vx = -38; e.y = e.baseY; }
    L.enemies.push(e);
    return e;
  }

  // ------------------------------------------------------------ スコア・演出
  function addScore(n, x, y) {
    game.score += n;
    if (x !== undefined) L.popups.push({ x, y, text: String(n), t: 0 });
  }
  function addCoin(x, y) {
    game.coins++;
    addScore(200);
    Snd.play("coin");
    if (game.coins >= 100) {
      game.coins -= 100;
      oneUp(x, y);
    }
  }
  function oneUp(x, y) {
    game.lives++;
    Snd.play("oneup");
    if (x !== undefined) L.popups.push({ x, y, text: "1UP", t: 0 });
  }
  function puff(x, y, n = 4, color = "#ffffff") {
    for (let i = 0; i < n; i++) {
      L.particles.push({
        x, y, vx: (Math.random() - 0.5) * 60, vy: -Math.random() * 40 - 10,
        g: 60, life: 0.35, t: 0, color, size: 2,
      });
    }
  }
  function sparkle(x, y, color) {
    L.particles.push({ x, y, vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 30, g: 0, life: 0.4, t: 0, color, size: 1 });
  }
  function debris(cx, cy) {
    const th = tilesets[L.theme].theme;
    for (const [vx, vy, ox, oy] of [[-70, -330, 0, 0], [70, -330, 8, 0], [-60, -220, 0, 8], [60, -220, 8, 8]]) {
      L.particles.push({ x: cx * TILE + ox, y: cy * TILE + oy, vx, vy, g: 1200, life: 1.2, t: 0, color: th.brick, size: 6, outline: true });
    }
  }

  // ------------------------------------------------------------ 衝突 (タイル)
  function overlapsSolid(x, y, w, h) {
    const x0 = Math.floor(x / TILE);
    const x1 = Math.floor((x + w - 0.001) / TILE);
    const y0 = Math.floor(y / TILE);
    const y1 = Math.floor((y + h - 0.001) / TILE);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (isSolid(tileAt(cx, cy))) return true;
      }
    }
    return false;
  }

  // 汎用の移動 + タイル衝突。結果フラグを返す
  function moveBody(b, dt, opts = {}) {
    const res = { hitX: false, hitTop: false, hitBottom: false, headTiles: [] };
    // X
    b.x += b.vx * dt;
    if (b.vx !== 0) {
      const y0 = Math.floor(b.y / TILE);
      const y1 = Math.floor((b.y + b.h - 0.001) / TILE);
      if (b.vx > 0) {
        const cx = Math.floor((b.x + b.w - 0.001) / TILE);
        for (let cy = y0; cy <= y1; cy++) {
          if (isSolid(tileAt(cx, cy))) { b.x = cx * TILE - b.w; res.hitX = true; break; }
        }
      } else {
        const cx = Math.floor(b.x / TILE);
        for (let cy = y0; cy <= y1; cy++) {
          if (isSolid(tileAt(cx, cy))) { b.x = (cx + 1) * TILE; res.hitX = true; break; }
        }
      }
    }
    // Y
    const prevBottom = b.y + b.h;
    b.y += b.vy * dt;
    const x0 = Math.floor(b.x / TILE);
    const x1 = Math.floor((b.x + b.w - 0.001) / TILE);
    if (b.vy > 0) {
      const cy = Math.floor((b.y + b.h - 0.001) / TILE);
      for (let cx = x0; cx <= x1; cx++) {
        const t = tileAt(cx, cy);
        const oneWay = t === T.CLOUD && prevBottom <= cy * TILE + 0.5;
        if (isSolid(t) || oneWay) {
          b.y = cy * TILE - b.h;
          b.vy = 0;
          res.hitBottom = true;
          break;
        }
      }
    } else if (b.vy < 0) {
      const cy = Math.floor(b.y / TILE);
      for (let cx = x0; cx <= x1; cx++) {
        if (isSolid(tileAt(cx, cy))) res.headTiles.push(cx);
      }
      if (res.headTiles.length) {
        // 角に少しだけ当たった場合は横にずらして通す (コーナー補正)
        if (opts.cornerFix && res.headTiles.length === 1) {
          const cx = res.headTiles[0];
          const leftOver = b.x + b.w - cx * TILE;
          const rightOver = (cx + 1) * TILE - b.x;
          if (leftOver <= 6 && !overlapsSolid(cx * TILE - b.w, b.y, b.w, b.h)) {
            b.x = cx * TILE - b.w;
            res.headTiles = [];
            return res;
          }
          if (rightOver <= 6 && !overlapsSolid((cx + 1) * TILE, b.y, b.w, b.h)) {
            b.x = (cx + 1) * TILE;
            res.headTiles = [];
            return res;
          }
        }
        b.y = (cy + 1) * TILE;
        b.vy = 0;
        res.hitTop = true;
        res.headRow = cy;
      }
    }
    return res;
  }

  // ------------------------------------------------------------ ブロックを叩く
  function bumpTile(cx, cy, byPlayer) {
    const t = tileAt(cx, cy);
    const key = cy * L.cols + cx;
    const px = cx * TILE;
    const py = cy * TILE;
    if (t === T.BRICK) {
      if (byPlayer) {
        setTile(cx, cy, T.EMPTY);
        debris(cx, cy);
        addScore(50);
        Snd.play("brick");
      } else {
        L.bumps.set(key, 0);
        Snd.play("bump");
      }
    } else if (t === T.QCOIN || t === T.MULTI) {
      L.bumps.set(key, 0);
      spawnCoinPop(px, py);
      if (t === T.QCOIN) setTile(cx, cy, T.USED);
      else {
        const n = (L.multi.get(key) || 0) + 1;
        L.multi.set(key, n);
        if (n >= 6) setTile(cx, cy, T.USED);
      }
    } else if (t === T.QPOWER || t === T.QSTAR) {
      L.bumps.set(key, 0);
      setTile(cx, cy, T.USED);
      spawnItem(t === T.QSTAR ? "star" : "berry", px, py);
      Snd.play("appear");
    } else {
      Snd.play("bump");
      return;
    }
    // 上に乗っている敵・アイテムを跳ね上げる
    for (const e of L.enemies) {
      if (!e.alive || e.state === "dead") continue;
      if (e.x + e.w > px && e.x < px + TILE && Math.abs(e.y + e.h - py) < 4) killEnemy(e, 1, true);
    }
    for (const it of L.items) {
      if (it.x + it.w > px && it.x < px + TILE && Math.abs(it.y + it.h - py) < 4) { it.vy = -250; it.vx = it.x + it.w / 2 < px + 8 ? -Math.abs(it.vx) : Math.abs(it.vx); }
    }
    // 上のコインも取れる
    if (tileAt(cx, cy - 1) === T.COIN) {
      setTile(cx, cy - 1, T.EMPTY);
      spawnCoinPop(px, py - TILE);
    }
  }

  function spawnCoinPop(x, y) {
    L.particles.push({ coin: true, x, y: y - 4, vx: 0, vy: -320, g: 900, life: 0.55, t: 0 });
    addCoin(x, y - 20);
    L.popups.push({ x: x + 2, y: y - 24, text: "200", t: 0 });
  }

  function spawnItem(type, x, y) {
    L.items.push({
      type, x: x + 1, y: y, w: 14, h: 14, vx: 0, vy: 0,
      emerge: 0, baseY: y - 15, t: 0,
    });
  }

  // ------------------------------------------------------------ プレイヤー更新
  function updatePlayer(dt) {
    const p = player;
    const left = Input.held("left");
    const right = Input.held("right");
    const down = Input.held("down");
    const run = Input.held("run");

    // しゃがみ
    if (p.onGround && down && !p.crouch) {
      p.crouch = true;
      p.y += p.h - CROUCH_H;
      p.h = CROUCH_H;
    } else if (p.crouch && (!down || !p.onGround)) {
      // 立ち上がれる空間があるときだけ立つ
      if (!overlapsSolid(p.x, p.y + p.h - PLAYER_H, p.w, PLAYER_H)) {
        p.y += p.h - PLAYER_H;
        p.h = PLAYER_H;
        p.crouch = false;
      }
    }

    const dir = (right ? 1 : 0) - (left ? 1 : 0);
    if (dir !== 0 && !(p.crouch && p.onGround && Math.abs(p.vx) > PHYS.crawl)) p.facing = dir;
    let maxSpeed = run ? PHYS.run : PHYS.walk;
    if (p.crouch && p.onGround) maxSpeed = PHYS.crawl;

    if (p.crouch && p.onGround && Math.abs(p.vx) > PHYS.crawl) {
      // スライディング
      p.vx -= Math.sign(p.vx) * PHYS.slideFriction * dt;
    } else if (dir !== 0) {
      const accel = p.onGround ? (run ? PHYS.runAccel : PHYS.accel) : PHYS.airAccel;
      if (p.onGround && Math.sign(p.vx) === -dir && Math.abs(p.vx) > 30) {
        p.vx += dir * PHYS.skid * dt;
        if (game.frame % 6 === 0) puff(p.x + p.w / 2, p.y + p.h, 1);
      } else if (Math.abs(p.vx) < maxSpeed || Math.sign(p.vx) !== dir) {
        p.vx += dir * accel * dt;
        if (Math.abs(p.vx) > maxSpeed && Math.sign(p.vx) === dir) p.vx = dir * maxSpeed;
      } else if (p.onGround) {
        // 走りボタンを離したときはゆるやかに減速
        p.vx -= Math.sign(p.vx) * PHYS.friction * dt;
        if (Math.abs(p.vx) < maxSpeed) p.vx = dir * maxSpeed;
      }
    } else if (p.onGround) {
      const f = PHYS.friction * dt;
      p.vx = Math.abs(p.vx) <= f ? 0 : p.vx - Math.sign(p.vx) * f;
    }

    // ジャンプ (コヨーテタイム + 先行入力)
    p.coyote = p.onGround ? PHYS.coyote : p.coyote - dt;
    p.buffer = Input.pressed("jump") ? PHYS.buffer : p.buffer - dt;
    if (p.buffer > 0 && p.coyote > 0) {
      p.vy = -(PHYS.jump + Math.abs(p.vx) * PHYS.jumpRunBonus);
      p.onGround = false;
      p.onLift = null;
      p.coyote = 0;
      p.buffer = 0;
      p.jumping = true;
      Snd.play("jump");
    }

    let g = PHYS.gravityFall;
    if (p.vy < 0) g = p.jumping && Input.held("jump") ? PHYS.gravityHold : PHYS.gravity;
    p.vy = Math.min(p.vy + g * dt, PHYS.maxFall);

    // リフトに乗っていたら一緒に動く
    if (p.onLift) {
      p.x += p.onLift.dx;
      if (overlapsSolid(p.x, p.y, p.w, p.h)) p.x -= p.onLift.dx;
    }

    const wasGround = p.onGround;
    const fallSpeed = p.vy;
    const prevBottom = p.y + p.h + (p.onLift ? p.onLift.dy : 0);
    const res = moveBody(p, dt, { cornerFix: true });

    if (res.hitTop) {
      const cxCenter = Math.floor((p.x + p.w / 2) / TILE);
      const target = res.headTiles.includes(cxCenter) ? cxCenter : res.headTiles[0];
      bumpTile(target, res.headRow, true);
      p.jumping = false;
    }

    p.onGround = res.hitBottom;
    p.onLift = null;
    // リフトとの当たり判定 (上からのみ)
    if (p.vy >= 0) {
      for (const lf of L.lifts) {
        if (p.x + p.w > lf.x && p.x < lf.x + lf.w && prevBottom <= lf.y + 1 + Math.max(0, lf.dy) && p.y + p.h >= lf.y) {
          p.y = lf.y - p.h;
          p.vy = 0;
          p.onGround = true;
          p.onLift = lf;
        }
      }
    }
    if (p.onGround) {
      p.jumping = false;
      if (!wasGround && fallSpeed > 260) {
        p.landT = 0.08;
        puff(p.x + p.w / 2, p.y + p.h, 3);
      }
      p.combo = 0;
    }
    if (p.landT > 0) p.landT -= dt;

    // 画面左端より戻れない
    if (p.x < L.cam) { p.x = L.cam; if (p.vx < 0) p.vx = 0; }

    // コイン
    collectCoins(p);

    // トゲ・溶岩
    if (touchesTile(p, T.LAVA, 6)) { die(); return; }
    if (touchesTile(p, T.SPIKE, 8)) hurt(true);

    // 落下
    if (p.y > H + 16) { die(true); return; }

    // アニメ
    p.animT += dt * (Math.abs(p.vx) / 60 + 0.5);
    if (p.invuln > 0) p.invuln -= dt;
    if (p.star > 0) {
      p.star -= dt;
      if (game.frame % 4 === 0) sparkle(p.x + Math.random() * p.w, p.y + Math.random() * p.h, ["#ffe14a", "#6af0ff", "#ffffff"][game.frame % 3]);
      if (p.star <= 0) Snd.playMusic(L.music);
    }
    if (p.shield && game.frame % 20 === 0) sparkle(p.x + p.w / 2 + (Math.random() - 0.5) * 16, p.y - 4, "#ffd23a");

    // チェックポイント
    for (const cp of L.checkpoints) {
      if (!cp.on && p.x + p.w / 2 > cp.x * TILE + 8) {
        cp.on = true;
        game.checkpoint = cp.x;
        Snd.play("check");
        L.popups.push({ x: cp.x * TILE, y: cp.y * TILE - 8, text: "CHECK!", t: 0 });
      }
    }

    // ゴール
    if (L.goalX !== undefined) {
      // 旗の土台ブロックかポールに触れたらゴール
      if (p.x + p.w >= L.goalX * TILE - 1) startGoal();
    }
  }

  function touchesTile(b, t, inset) {
    const x0 = Math.floor((b.x + 3) / TILE);
    const x1 = Math.floor((b.x + b.w - 3) / TILE);
    const y0 = Math.floor((b.y + inset) / TILE);
    const y1 = Math.floor((b.y + b.h - 1) / TILE);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (tileAt(cx, cy) !== t) continue;
        // トゲ・溶岩はタイルの下半分 (溶岩は上 6px を除く) に触れたら
        const top = cy * TILE + (t === T.SPIKE ? 8 : 6);
        if (b.y + b.h > top) return true;
      }
    }
    return false;
  }

  function collectCoins(b) {
    const x0 = Math.floor((b.x + 2) / TILE);
    const x1 = Math.floor((b.x + b.w - 2) / TILE);
    const y0 = Math.floor((b.y + 2) / TILE);
    const y1 = Math.floor((b.y + b.h - 2) / TILE);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (tileAt(cx, cy) === T.COIN) {
          setTile(cx, cy, T.EMPTY);
          addCoin(cx * TILE, cy * TILE);
          for (let i = 0; i < 3; i++) sparkle(cx * TILE + 8, cy * TILE + 8, "#fff6c0");
        }
      }
    }
  }

  function hurt(fromSpike) {
    const p = player;
    if (p.invuln > 0 || p.star > 0) return;
    if (p.shield) {
      p.shield = false;
      p.invuln = 2;
      Snd.play("hurt");
      if (fromSpike) { p.vy = -300; p.onGround = false; }
      for (let i = 0; i < 8; i++) sparkle(p.x + p.w / 2, p.y + 4, "#ffd23a");
    } else {
      die();
    }
  }

  function die(fellInPit) {
    if (game.mode !== "play") return;
    game.mode = "dying";
    game.modeTime = 0;
    player.vx = 0;
    player.vy = fellInPit ? 0 : -420;
    player.shield = false;
    player.star = 0;
    Snd.stopMusic();
    Snd.play("die");
  }

  // ------------------------------------------------------------ 敵
  function stompBounce() {
    player.vy = Input.held("jump") ? -420 : -260;
    player.jumping = Input.held("jump");
    player.onGround = false;
  }

  function comboScore(n) {
    const table = [100, 200, 400, 500, 800, 1000, 2000, 4000, 5000, 8000];
    return table[Math.min(n, table.length - 1)];
  }

  function killEnemy(e, dir, flip) {
    if (e.state === "dead") return;
    e.state = "dead";
    e.vy = -260;
    e.vx = 40 * (dir || 1);
    e.flip = flip;
    e.t = 0;
    addScore(100, e.x, e.y - 8);
    Snd.play("kick");
  }

  function updateEnemies(dt) {
    const p = player;
    for (const e of L.enemies) {
      if (!e.alive) continue;
      if (!e.active) {
        if (e.x < L.cam + W + 24) e.active = true;
        else continue;
      }
      e.t += dt;

      if (e.state === "dead") {
        e.vy += 1200 * dt;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        if (e.y > H + 32) e.alive = false;
        continue;
      }
      if (e.state === "flat") {
        if (e.t > 0.5) e.alive = false;
        continue;
      }

      if (e.type === "pata") {
        e.x += e.vx * dt;
        e.y = e.baseY + Math.sin(e.t * 3) * 22;
        if (e.x < L.cam - 64) e.alive = false;
      } else {
        const prevVx = e.vx;
        e.vy = Math.min(e.vy + 1400 * dt, 400);
        const res = moveBody(e, dt);
        e.onGround = res.hitBottom;
        if (res.hitX) e.vx = -prevVx;
        // カラとトゲは崖で引き返す
        if ((e.type === "kara" || e.type === "toge") && e.state === "walk" && e.onGround) {
          const ahead = e.vx > 0 ? e.x + e.w + 1 : e.x - 1;
          const below = tileAt(Math.floor(ahead / TILE), Math.floor((e.y + e.h + 2) / TILE));
          if (!isSolid(below) && below !== T.CLOUD) e.vx = -e.vx;
        }
        if (e.y > H + 32) { e.alive = false; continue; }
        if (touchesTile(e, T.LAVA, 6)) { e.alive = false; continue; }
      }

      // 動いている甲羅は他の敵を倒す
      if (e.state === "shell" && e.vx !== 0) {
        for (const o of L.enemies) {
          if (o === e || !o.alive || o.state === "dead" || !o.active) continue;
          if (overlap(e, o)) {
            e.combo++;
            killEnemy(o, Math.sign(e.vx), true);
            addScore(comboScore(e.combo) - 100);
          }
        }
        if (e.x < L.cam - 200 || e.x > L.cam + W + 200) e.alive = false;
      } else if (e.state === "walk") {
        // 歩く敵同士はぶつかったら反転
        for (const o of L.enemies) {
          if (o === e || !o.alive || o.state !== "walk" || o.type === "pata" || e.type === "pata") continue;
          if (overlap(e, o) && Math.sign(o.x - e.x) === Math.sign(e.vx)) {
            e.vx = -e.vx;
          }
        }
      }

      // プレイヤーとの接触
      if (game.mode !== "play" || !overlap(e, p)) continue;
      if (p.star > 0) {
        p.combo++;
        killEnemy(e, Math.sign(e.x - p.x) || 1, true);
        continue;
      }
      const stomping = p.vy > 40 && p.y + p.h - e.y < 10;
      if (stomping && e.type !== "toge") {
        p.y = e.y - p.h;
        if (e.type === "gumi") {
          e.state = "flat";
          e.t = 0;
        } else if (e.type === "kara") {
          if (e.state === "walk" || e.vx !== 0) {
            e.state = "shell";
            e.vx = 0;
            e.combo = 0;
          } else {
            kickShell(e);
          }
        } else if (e.type === "pata") {
          killEnemy(e, 1, true);
        }
        addScore(comboScore(p.combo), e.x, e.y - 8);
        p.combo++;
        Snd.play("stomp");
        stompBounce();
      } else if (e.state === "shell" && e.vx === 0) {
        kickShell(e);
      } else if (e.state === "shell" && e.kickGrace > 0) {
        // 蹴った直後は当たらない
      } else {
        hurt(false);
      }
    }
    for (const e of L.enemies) if (e.kickGrace > 0) e.kickGrace -= dt;
    L.enemies = L.enemies.filter((e) => e.alive);
  }

  function kickShell(e) {
    const dir = player.x + player.w / 2 < e.x + e.w / 2 ? 1 : -1;
    e.vx = 220 * dir;
    e.kickGrace = 0.25;
    e.combo = 0;
    addScore(400, e.x, e.y - 8);
    Snd.play("kick");
  }

  function overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // ------------------------------------------------------------ アイテム
  function updateItems(dt) {
    const p = player;
    for (const it of L.items) {
      it.t += dt;
      if (it.emerge < 1) {
        it.emerge = Math.min(1, it.emerge + dt * 2);
        it.y = it.baseY + 15 * (1 - it.emerge);
        if (it.emerge >= 1) {
          it.vx = it.type === "star" ? 70 : 50;
          if (it.type === "star") it.vy = -200;
        }
        continue;
      }
      it.vy = Math.min(it.vy + (it.type === "star" ? 900 : 1200) * dt, 400);
      const prevVx = it.vx;
      const res = moveBody(it, dt);
      if (res.hitX) it.vx = -prevVx;
      if (res.hitBottom && it.type === "star") it.vy = -300;
      if (it.y > H + 32 || touchesTile(it, T.LAVA, 6)) it.dead = true;
      if (game.mode === "play" && overlap(it, p)) {
        it.dead = true;
        if (it.type === "berry") {
          addScore(1000, it.x, it.y);
          p.shield = true;
          Snd.play("powerup");
        } else if (it.type === "star") {
          p.star = 10;
          addScore(1000, it.x, it.y);
          Snd.play("star");
          Snd.playMusic("star");
        }
      }
    }
    L.items = L.items.filter((it) => !it.dead);
  }

  // ------------------------------------------------------------ リフト
  function updateLifts(dt) {
    for (const lf of L.lifts) {
      lf.t += dt;
      const period = (lf.range * 2) / lf.speed;
      const phase = (lf.t % period) / period;
      const k = phase < 0.5 ? phase * 2 : 2 - phase * 2;
      const eased = 0.5 - Math.cos(k * Math.PI) / 2;
      const nx = lf.axis === "x" ? lf.x0 + eased * lf.range : lf.x0;
      const ny = lf.axis === "y" ? lf.y0 - eased * lf.range : lf.y0;
      lf.dx = nx - lf.x;
      lf.dy = ny - lf.y;
      lf.x = nx;
      lf.y = ny;
    }
    // 乗っているプレイヤーは上下移動に追従
    const p = player;
    if (p.onLift && p.onLift.dy !== 0 && game.mode === "play") {
      p.y = p.onLift.y - p.h;
    }
  }

  // ------------------------------------------------------------ パーティクル
  function updateParticles(dt) {
    for (const pt of L.particles) {
      pt.t += dt;
      pt.vy += pt.g * dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
    }
    L.particles = L.particles.filter((pt) => pt.t < pt.life);
    for (const pp of L.popups) { pp.t += dt; pp.y -= 30 * dt; }
    L.popups = L.popups.filter((pp) => pp.t < 0.9);
    for (const [k, t] of L.bumps) {
      if (t > 0.18) L.bumps.delete(k);
      else L.bumps.set(k, t + dt);
    }
  }

  // ------------------------------------------------------------ カメラ
  function clampCam(x) {
    return Math.max(0, Math.min(x, L.cols * TILE - W));
  }
  function updateCamera() {
    const target = player.x + player.w / 2 - W * 0.42 + player.facing * 12;
    // 前方向はすぐ追従、戻りはゆっくり
    const want = clampCam(target);
    L.cam += (want - L.cam) * (want > L.cam ? 0.2 : 0.06);
    L.cam = clampCam(L.cam);
  }

  // ------------------------------------------------------------ ゴール
  function startGoal() {
    if (game.mode !== "play") return;
    game.mode = "goal";
    game.modeTime = 0;
    const p = player;
    const top = p.y;
    const pts = top < 3 * TILE ? 5000 : top < 5 * TILE ? 2000 : top < 7 * TILE ? 800 : top < 9 * TILE ? 400 : 100;
    addScore(pts, L.goalX * TILE + 12, top);
    p.x = L.goalX * TILE + 8 - p.w - 1;
    p.vx = 0;
    p.vy = 0;
    p.star = 0;
    p.facing = 1;
    if (p.crouch) { p.y += p.h - PLAYER_H; p.h = PLAYER_H; p.crouch = false; }
    game.goalPhase = "slide";
    Snd.stopMusic();
    Snd.play("flag");
  }

  function updateGoal(dt) {
    const p = player;
    const baseY = 11 * TILE;
    if (game.goalPhase === "slide") {
      p.y = Math.min(p.y + 150 * dt, baseY - p.h);
      L.flagY = Math.min(L.flagY + 150 * dt, baseY - 14);
      if (p.y >= baseY - p.h && L.flagY >= baseY - 14) {
        game.goalPhase = "hop";
        p.x += p.w + 2;
        p.facing = -1;
        game.modeTime = 0;
      }
    } else if (game.goalPhase === "hop") {
      if (game.modeTime > 0.35) {
        game.goalPhase = "walk";
        p.facing = 1;
        p.vy = -150;
        Snd.play("clear");
      }
    } else if (game.goalPhase === "walk") {
      p.vx = 70;
      p.vy = Math.min(p.vy + PHYS.gravityFall * dt, PHYS.maxFall);
      const res = moveBody(p, dt);
      p.onGround = res.hitBottom;
      p.animT += dt * 1.6;
      const door = (L.goalX + 7) * TILE;
      if (p.x + p.w / 2 >= door) {
        p.hidden = true;
        game.goalPhase = "tally";
        game.modeTime = 0;
      }
    } else if (game.goalPhase === "tally") {
      if (L.timeLeft > 0) {
        const n = Math.min(L.timeLeft, 3);
        L.timeLeft -= n;
        game.score += n * 50;
        if (game.frame % 3 === 0) Snd.play("tick");
        game.modeTime = 0;
      } else if (game.modeTime > 1.6) {
        saveHi();
        if (L.last) {
          game.mode = "ending";
          game.modeTime = 0;
          Snd.playMusic("title");
        } else {
          game.levelIndex++;
          game.checkpoint = null;
          startIntro();
        }
      }
    }
    updateCamera();
  }

  // ------------------------------------------------------------ 画面遷移
  function startIntro() {
    game.mode = "intro";
    game.modeTime = 0;
    Snd.stopMusic();
    loadLevel(game.levelIndex, true);
  }

  function newGame() {
    game.lives = 3;
    game.score = 0;
    game.coins = 0;
    game.levelIndex = 0;
    game.checkpoint = null;
    startIntro();
  }

  function update(dt) {
    game.frame++;
    game.modeTime += dt;
    Input.update();
    const tap = tapped;
    tapped = false;

    if (Input.pressed("start") && (game.mode === "play")) {
      game.paused = !game.paused;
      Snd.play("pause");
      if (game.paused) Snd.stopMusic();
      else if (L.kind === "shooter" && Shooter.state.boss) Snd.playMusic("boss");
      else Snd.playMusic(player.star > 0 ? "star" : L.music);
    }
    if (game.paused) return;

    switch (game.mode) {
      case "title":
        if (Snd.music !== "title" && game.modeTime > 0.1) Snd.playMusic("title");
        if (game.modeTime > 0.3 && (tap || Input.pressed("jump") || Input.pressed("start"))) {
          Snd.unlock();
          Snd.play("select");
          newGame();
        }
        break;
      case "intro":
        if (game.modeTime > 2.2 || (game.modeTime > 0.5 && Input.pressed("start"))) {
          game.mode = "play";
          game.modeTime = 0;
          Snd.playMusic(L.music);
        }
        break;
      case "play":
        if (L.kind === "shooter") {
          Shooter.update(dt, "play");
          updateParticles(dt);
          break;
        }
        updateLifts(dt);
        updatePlayer(dt);
        if (game.mode === "play") {
          updateEnemies(dt);
          updateItems(dt);
          updateTimer(dt);
        }
        updateParticles(dt);
        updateCamera();
        break;
      case "dying":
        if (L.kind === "shooter") Shooter.update(dt, "dying");
        if (game.modeTime > 0.5) {
          player.vy += 1300 * dt;
          player.y += player.vy * dt;
        }
        updateParticles(dt);
        if (game.modeTime > 3) {
          game.lives--;
          saveHi();
          if (game.lives < 0) {
            game.mode = "gameover";
            game.modeTime = 0;
            Snd.play("gameover");
          } else {
            startIntro();
          }
        }
        break;
      case "goal":
        if (L.kind === "shooter") Shooter.update(dt, "goal");
        updateLifts(dt);
        updateEnemies(dt);
        updateParticles(dt);
        updateGoal(dt);
        break;
      case "gameover":
        if (game.modeTime > 1.5 && (tap || Input.pressed("jump") || Input.pressed("start"))) {
          // コンティニュー: 同じステージの最初から
          game.lives = 3;
          game.score = 0;
          game.coins = 0;
          game.checkpoint = null;
          startIntro();
        }
        break;
      case "ending":
        updateParticles(dt);
        if (game.frame % 20 === 0) fireworks();
        if (game.modeTime > 3 && (tap || Input.pressed("jump") || Input.pressed("start"))) {
          game.mode = "title";
          game.modeTime = 0;
        }
        break;
    }
  }

  function fireworks() {
    const x = L.cam + 40 + Math.random() * (W - 80);
    const y = 30 + Math.random() * 70;
    const col = ["#ff69b4", "#ffd23a", "#6af0ff", "#9aff6a", "#c890ff"][Math.floor(Math.random() * 5)];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      L.particles.push({ x, y, vx: Math.cos(a) * 80, vy: Math.sin(a) * 80, g: 60, life: 0.9, t: 0, color: col, size: 2 });
    }
    Snd.play("tick");
  }

  function updateTimer(dt) {
    L.timeAcc += dt;
    while (L.timeAcc >= 0.4) {
      L.timeAcc -= 0.4;
      L.timeLeft--;
      if (L.timeLeft === 100 && !L.hurried) {
        L.hurried = true;
        Snd.play("hurry");
      }
      if (L.timeLeft <= 0) {
        L.timeLeft = 0;
        die();
        return;
      }
    }
  }

  // ============================================================ 描画
  function drawBackground() {
    const bg = backgrounds[L.theme];
    const bandH = Math.ceil(H / bg.bands.length);
    bg.bands.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect(0, i * bandH, W, bandH);
    });
    for (const layer of bg.layers) {
      const off = Math.floor(L.cam * layer.par) % layer.c.width;
      for (let x = -off; x < W; x += layer.c.width) ctx.drawImage(layer.c, x, layer.y);
    }
    if (L.theme === "castle") {
      const glow = ctx.createLinearGradient(0, H - 60, 0, H);
      glow.addColorStop(0, "rgba(255,90,20,0)");
      glow.addColorStop(1, "rgba(255,90,20,0.35)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, H - 60, W, 60);
    }
  }

  function drawTiles() {
    const ts = tilesets[L.theme];
    const cam = Math.floor(L.cam);
    const c0 = Math.floor(cam / TILE);
    const c1 = Math.min(L.cols - 1, c0 + Math.ceil(W / TILE) + 1);
    const anim = Math.floor(game.frame / 10);
    for (let cy = 0; cy < L.rows; cy++) {
      for (let cx = c0; cx <= c1; cx++) {
        const t = L.tiles[cy * L.cols + cx];
        if (t === T.EMPTY) continue;
        let x = cx * TILE - cam;
        let y = cy * TILE;
        const bt = L.bumps.get(cy * L.cols + cx);
        if (bt !== undefined) y -= Math.round(Math.sin((bt / 0.18) * Math.PI) * 5);
        let img = null;
        switch (t) {
          case T.GROUND: {
            const above = cy > 0 ? L.tiles[(cy - 1) * L.cols + cx] : T.GROUND;
            img = above !== T.GROUND ? ts.groundTop : ts.ground;
            break;
          }
          case T.BRICK: case T.MULTI: img = ts.brick; break;
          case T.QCOIN: case T.QPOWER: case T.QSTAR: img = ts.q[[0, 0, 1, 2][anim % 4] % 3]; break;
          case T.USED: img = ts.used; break;
          case T.HARD: img = ts.hard; break;
          case T.PIPE_TL: img = ts.pipe.TL; break;
          case T.PIPE_TR: img = ts.pipe.TR; break;
          case T.PIPE_L: img = ts.pipe.L; break;
          case T.PIPE_R: img = ts.pipe.R; break;
          case T.CLOUD: img = ts.cloud; break;
          case T.SPIKE: img = ts.spike; break;
          case T.LAVA: {
            const above = cy > 0 ? L.tiles[(cy - 1) * L.cols + cx] : T.LAVA;
            img = (above !== T.LAVA ? ts.lavaTop : ts.lava)[anim % 4];
            break;
          }
          case T.COIN: img = ts.coin[anim % 4]; break;
        }
        if (img) ctx.drawImage(img, x, y);
      }
    }
  }

  function drawDeco() {
    const cam = Math.floor(L.cam);
    for (const s of L.signs) {
      const x = s.x * TILE - cam;
      if (x > -16 && x < W) ctx.drawImage(signArt[s.dir], x, s.y * TILE);
    }
    for (const cp of L.checkpoints) {
      const x = cp.x * TILE - cam;
      if (x > -16 && x < W) ctx.drawImage(checkpointArt[cp.on ? 1 : 0], x, (cp.y) * TILE);
    }
    if (L.goalX === undefined) return;
    const gx = L.goalX * TILE - cam;
    // 城
    const castle = castles[L.theme];
    ctx.drawImage(castle, gx + 4 * TILE + 8, 12 * TILE - castle.height);
    // ポール
    ctx.fillStyle = "#e8f0e8";
    ctx.fillRect(gx + 7, 2 * TILE + 6, 2, 9 * TILE - 6);
    ctx.fillStyle = "#8aa08a";
    ctx.fillRect(gx + 8, 2 * TILE + 6, 1, 9 * TILE - 6);
    ctx.fillStyle = A.OUTLINE;
    ctx.fillRect(gx + 4, 2 * TILE - 2, 8, 8);
    ctx.fillStyle = "#5ad04a";
    ctx.fillRect(gx + 5, 2 * TILE - 1, 6, 6);
    ctx.fillStyle = "#c8ffb0";
    ctx.fillRect(gx + 6, 2 * TILE, 2, 2);
    // 旗 (ポポの顔マーク)
    const fy = Math.round(L.flagY);
    ctx.fillStyle = A.OUTLINE;
    ctx.fillRect(gx - 9, fy - 1, 16, 14);
    ctx.fillStyle = "#ff69b4";
    ctx.fillRect(gx - 8, fy, 15, 12);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(gx - 4, fy + 3, 6, 6);
    ctx.fillStyle = A.OUTLINE;
    ctx.fillRect(gx - 2, fy + 4, 2, 3);
  }

  function popoSprite() {
    const p = player;
    let name = "idle";
    const fast = Math.abs(p.vx) > 125;
    const moving = Math.abs(p.vx) > 8;
    if (game.mode === "dying") name = "jump";
    else if (p.crouch || p.landT > 0) name = "crouch";
    else if (!p.onGround && game.mode !== "goal") name = "jump";
    else if (game.mode === "goal" && game.goalPhase === "slide") name = "jump";
    else if (moving) {
      const f = Math.floor(p.animT * 1.5) % 2 === 0 ? 1 : 2;
      const side = p.vx > 0 ? "right" : "left";
      name = (fast ? "" : "walk_") + side + f;
    }
    const flip = (name === "idle" || name === "jump" || name === "crouch") && p.facing < 0;
    let key = "normal";
    let pal = null;
    if (p.star > 0) {
      const i = Math.floor(game.frame / 3) % PAL_STAR.length;
      key = "star" + i;
      pal = PAL_STAR[i];
    } else if (p.shield) {
      key = "shield";
      pal = PAL_SHIELD;
    }
    return A.popoFrame(name, key, pal, flip);
  }

  function drawPlayer() {
    const p = player;
    if (p.hidden) return;
    if (p.invuln > 0 && Math.floor(game.frame / 3) % 2 === 0) return;
    const img = popoSprite();
    const x = Math.round(p.x + p.w / 2 - 16 - L.cam);
    const y = Math.round(p.y + p.h - 30);
    if (p.shield) {
      ctx.globalAlpha = 0.25 + 0.15 * Math.sin(game.frame / 6);
      ctx.fillStyle = "#ffe878";
      ctx.beginPath();
      ctx.ellipse(x + 16, y + 18, 15, 15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(img, x, y);
  }

  function drawEnemies() {
    const cam = L.cam;
    for (const e of L.enemies) {
      if (!e.active) continue;
      const x = Math.round(e.x - 1 - cam);
      const y = Math.round(e.y + e.h - 16);
      if (x < -20 || x > W + 4) continue;
      let set;
      let img;
      const step = Math.floor(e.t * 5) % 2;
      const side = e.vx > 0 ? "r" : "l";
      if (e.state === "flat") img = enemyArt.gumiFlat.l;
      else if (e.state === "shell" || (e.state === "dead" && e.type === "kara")) img = enemyArt.shell.l;
      else {
        set = enemyArt[e.type];
        img = set[e.type === "pata" ? Math.floor(e.t * 8) % 2 : step][side];
      }
      if (e.state === "dead" && e.flip) {
        ctx.save();
        ctx.translate(x, y + 16);
        ctx.scale(1, -1);
        ctx.drawImage(img, 0, 0);
        ctx.restore();
      } else {
        ctx.drawImage(img, x, y);
      }
    }
  }

  function drawItems() {
    for (const it of L.items) {
      const x = Math.round(it.x - 1 - L.cam);
      const y = Math.round(it.y - 2);
      const img = it.type === "star" ? starArt[Math.floor(game.frame / 4) % 2] : berryArt;
      if (it.emerge < 1) {
        // ブロックから生えてくる途中はブロックの上だけ見せる
        const visible = Math.ceil(16 * it.emerge);
        ctx.drawImage(img, 0, 0, 16, visible, x, y, 16, visible);
      } else {
        ctx.drawImage(img, x, y);
      }
    }
  }

  function drawLifts() {
    for (const lf of L.lifts) ctx.drawImage(lf.art, Math.round(lf.x - L.cam), Math.round(lf.y));
  }

  function drawParticles() {
    const ts = tilesets[L.theme];
    for (const pt of L.particles) {
      const x = Math.round(pt.x - L.cam);
      const y = Math.round(pt.y);
      if (pt.coin) {
        ctx.drawImage(ts.coin[Math.floor(pt.t * 20) % 4], x, y);
        continue;
      }
      if (pt.outline) {
        ctx.fillStyle = A.OUTLINE;
        ctx.fillRect(x - 1, y - 1, pt.size + 2, pt.size + 2);
      }
      ctx.fillStyle = pt.color;
      ctx.fillRect(x, y, pt.size, pt.size);
    }
    for (const pp of L.popups) {
      A.drawText(ctx, pp.text, Math.round(pp.x - L.cam), Math.round(pp.y), "#ffffff", { shadow: A.OUTLINE });
    }
  }

  function pad(n, len) { return String(Math.max(0, n)).padStart(len, "0"); }

  function drawHUD() {
    const sh = { shadow: A.OUTLINE };
    A.drawText(ctx, "POPO", 16, 8, "#ffb0dc", sh);
    A.drawText(ctx, pad(game.score, 6), 16, 18, "#ffffff", sh);
    // コイン
    const coinImg = tilesets[L.theme].coin[Math.floor(game.frame / 10) % 4];
    ctx.drawImage(coinImg, 116, 14);
    A.drawText(ctx, "×" + pad(game.coins, 2), 132, 18, "#ffffff", sh);
    A.drawText(ctx, "WORLD", 206, 8, "#ffffff", sh);
    A.drawText(ctx, L.name, 212, 18, "#ffffff", sh);
    if (L.kind === "shooter") {
      const info = Shooter.hud();
      A.drawText(ctx, info.label, 312, 8, "#ffffff", sh);
      A.drawText(ctx, info.value, 318, 18, "#ffffff", sh);
    } else {
      A.drawText(ctx, "TIME", 312, 8, "#ffffff", sh);
      const tcol = L.timeLeft <= 100 && Math.floor(game.frame / 15) % 2 === 0 ? "#ff6a6a" : "#ffffff";
      A.drawText(ctx, pad(L.timeLeft, 3), 318, 18, tcol, sh);
    }
    // 残機
    const icon = A.popoFrame("idle", "normal", null, false);
    ctx.drawImage(icon, 0, 0, 32, 32, 60, 5, 12, 12);
    A.drawText(ctx, "×" + game.lives, 74, 8, "#ffffff", sh);
    if (Snd.muted) A.drawText(ctx, "MUTE", W - 8, H - 12, "#ffffff", { ...sh, align: "right" });
  }

  function drawWorld() {
    if (L.kind === "shooter") {
      Shooter.draw(ctx, game.frame);
      drawParticles();
      return;
    }
    drawBackground();
    drawDeco();
    drawTiles();
    drawLifts();
    drawItems();
    drawEnemies();
    drawPlayer();
    drawParticles();
  }

  function dim(alpha) {
    ctx.fillStyle = `rgba(10,6,20,${alpha})`;
    ctx.fillRect(0, 0, W, H);
  }

  function drawTitle() {
    if (!L || !L.titleDemo) {
      loadLevel(0, false);
      L.titleDemo = true;
    }
    L.cam = (game.modeTime * 20) % (L.cols * TILE - W);
    drawBackground();
    drawTiles();
    dim(0.25);
    const o = { outline: A.OUTLINE, align: "center" };
    A.drawText(ctx, "SUPER", W / 2, 24, "#ffd23a", { ...o, scale: 2 });
    A.drawText(ctx, "POPO LAND", W / 2, 44, "#ff69b4", { ...o, scale: 4 });
    // ぴょんぴょん跳ねるポポ
    const bounce = Math.abs(Math.sin(game.modeTime * 3)) * 18;
    const frame = bounce > 10 ? "jump" : "idle";
    ctx.drawImage(A.popoFrame(frame), W / 2 - 32, 150 - 64 - bounce + 20, 64, 64);
    if (Math.floor(game.modeTime * 2) % 2 === 0) {
      A.drawText(ctx, matchMedia("(pointer: coarse)").matches ? "TAP A TO START" : "PRESS SPACE / ENTER", W / 2, 160, "#ffffff", o);
    }
    A.drawText(ctx, "HI " + pad(hiScore, 6), W / 2, 178, "#ffd23a", o);
    A.drawText(ctx, "5 STAGES: HILLS CAVE SKY UFO CASTLE", W / 2, 204, "#ffffff", o);
  }

  function drawIntro() {
    ctx.fillStyle = "#0c0818";
    ctx.fillRect(0, 0, W, H);
    const o = { align: "center" };
    A.drawText(ctx, "WORLD " + L.name, W / 2, 62, "#ffffff", { ...o, scale: 2 });
    A.drawText(ctx, L.title, W / 2, 86, "#ffd23a", o);
    ctx.drawImage(A.popoFrame("idle"), W / 2 - 40, 108);
    A.drawText(ctx, "×  " + game.lives, W / 2 + 14, 122, "#ffffff", o);
    if (game.checkpoint !== null) A.drawText(ctx, L.kind === "shooter" ? "FROM BOSS" : "CHECKPOINT", W / 2, 160, "#9aff6a", o);
    if (L.kind === "shooter") A.drawText(ctx, "RIDE THE UFO!  MOVE: L/R  SHOOT: A/SPACE", W / 2, 144, "#6af0ff", o);
    A.drawText(ctx, "SCORE " + pad(game.score, 6), W / 2, 190, "#ffffff", o);
  }

  function drawGameOver() {
    ctx.fillStyle = "#0c0818";
    ctx.fillRect(0, 0, W, H);
    const o = { align: "center" };
    A.drawText(ctx, "GAME OVER", W / 2, 80, "#ff6a6a", { ...o, scale: 3 });
    ctx.drawImage(A.popoFrame("crouch"), W / 2 - 16, 112);
    if (game.modeTime > 1.5 && Math.floor(game.modeTime * 2) % 2 === 0) A.drawText(ctx, "CONTINUE? PRESS START", W / 2, 162, "#ffffff", o);
    A.drawText(ctx, "HI " + pad(hiScore, 6), W / 2, 190, "#ffd23a", o);
  }

  function drawEnding() {
    drawBackground();
    drawTiles();
    drawParticles();
    dim(0.35);
    const o = { align: "center", outline: A.OUTLINE };
    A.drawText(ctx, "CONGRATULATIONS!", W / 2, 40, "#ffd23a", { ...o, scale: 2 });
    A.drawText(ctx, "POPO SAVED POPO LAND!", W / 2, 68, "#ffffff", o);
    const hop = Math.abs(Math.sin(game.modeTime * 4)) * 16;
    ctx.drawImage(A.popoFrame(hop > 8 ? "jump" : "idle"), W / 2 - 32, 82 - hop + 16, 64, 64);
    A.drawText(ctx, "SCORE " + pad(game.score, 6), W / 2, 160, "#ffffff", o);
    A.drawText(ctx, "HI " + pad(hiScore, 6), W / 2, 174, "#ffd23a", o);
    A.drawText(ctx, "THANK YOU FOR PLAYING!", W / 2, 198, "#ff9ad0", o);
  }

  function draw() {
    ctx.imageSmoothingEnabled = false;
    switch (game.mode) {
      case "title": drawTitle(); return;
      case "intro": drawIntro(); return;
      case "gameover": drawGameOver(); return;
      case "ending": drawEnding(); return;
    }
    drawWorld();
    drawHUD();
    if (game.paused) {
      dim(0.5);
      A.drawText(ctx, "PAUSE", W / 2, H / 2 - 8, "#ffffff", { align: "center", scale: 2 });
    }
    if (game.mode === "play" && game.modeTime < 1.2) {
      A.drawText(ctx, L.title, W / 2, 48, "#ffffff", { align: "center", outline: A.OUTLINE });
    }
    if (game.mode === "goal" && game.goalPhase === "tally" && L.kind !== "shooter") {
      A.drawText(ctx, "COURSE CLEAR!", W / 2, 64, "#ffd23a", { align: "center", outline: A.OUTLINE, scale: 2 });
    }
  }

  // ------------------------------------------------------------ ループ
  let last = performance.now();
  let acc = 0;
  function frame(now) {
    acc += Math.min(0.1, (now - last) / 1000);
    last = now;
    while (acc >= STEP) {
      update(STEP);
      acc -= STEP;
    }
    draw();
    requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------ 画面サイズ (整数倍で拡大してドットをくっきり)
  function fit() {
    const wrap = canvas.parentElement;
    const availW = wrap.clientWidth;
    const touch = document.body.classList.contains("is-touch");
    const landscape = touch && matchMedia("(orientation: landscape) and (max-height: 500px)").matches;
    const top = wrap.getBoundingClientRect().top + window.scrollY;
    const availH = landscape ? window.innerHeight - 16 : window.innerHeight - top - (touch ? 130 : 24);
    let s = Math.min(availW / W, Math.max(availH, 160) / H);
    if (s >= 2) s = Math.floor(s);
    canvas.style.width = `${Math.floor(W * s)}px`;
    canvas.style.height = `${Math.floor(H * s)}px`;
  }

  // 画面タップでもタイトル・ゲームオーバー・エンディングを進められる
  canvas.addEventListener("pointerdown", () => { tapped = true; });

  Input.on((what) => {
    Snd.unlock();
    if (what === "mute") Snd.toggleMute();
  });
  Input.setupTouch(document.getElementById("touch"));
  if (matchMedia("(pointer: coarse)").matches) document.body.classList.add("is-touch");
  window.addEventListener("resize", fit);
  fit();

  const muteBtn = document.getElementById("mute");
  if (muteBtn) {
    const label = () => { muteBtn.textContent = Snd.muted ? "🔇 音オフ" : "🔊 音オン"; };
    label();
    muteBtn.addEventListener("click", () => { Snd.unlock(); Snd.toggleMute(); label(); muteBtn.blur(); });
    Input.on((w) => { if (w === "mute") label(); });
  }

  // デバッグ・テスト用
  window.PopoGame = { game, get level() { return L; }, get player() { return player; }, newGame, loadLevel, update, draw };

  requestAnimationFrame(frame);
})();
