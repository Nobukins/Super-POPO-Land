// ステージデータ。ビルダー関数でタイルや敵を配置する (座標はタイル単位, 縦は 0〜13 行)
(() => {
  "use strict";

  const { T } = window.PopoArt;
  const ROWS = 14;

  const ROW_CHARS = {
    "?": T.QCOIN, P: T.QPOWER, S: T.QSTAR, B: T.BRICK, b: T.MULTI, X: T.HARD,
    o: T.COIN, "=": T.CLOUD, "^": T.SPIKE, "~": T.LAVA, U: T.USED,
  };

  function builder(width) {
    const tiles = new Uint8Array(width * ROWS);
    const entities = [];
    const deco = [];
    const b = {
      width,
      tiles,
      entities,
      deco,
      start: { x: 3, y: 10 },
      set(x, y, t) {
        if (x >= 0 && x < width && y >= 0 && y < ROWS) tiles[y * width + x] = t;
      },
      fill(x0, y0, x1, y1, t) {
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) b.set(x, y, t);
      },
      ground(x0, x1, top = 12) { b.fill(x0, top, x1, ROWS - 1, T.GROUND); },
      row(x, y, str) {
        [...str].forEach((ch, i) => { if (ROW_CHARS[ch] !== undefined) b.set(x + i, y, ROW_CHARS[ch]); });
      },
      coins(x, y, n) { for (let i = 0; i < n; i++) b.set(x + i, y, T.COIN); },
      clouds(x, y, n) { for (let i = 0; i < n; i++) b.set(x + i, y, T.CLOUD); },
      spikes(x, y, n) { for (let i = 0; i < n; i++) b.set(x + i, y, T.SPIKE); },
      lava(x0, x1) {
        b.fill(x0, 12, x1, ROWS - 1, T.LAVA);
      },
      pipe(x, top, bottom = 11) {
        b.set(x, top, T.PIPE_TL);
        b.set(x + 1, top, T.PIPE_TR);
        for (let y = top + 1; y <= bottom; y++) { b.set(x, y, T.PIPE_L); b.set(x + 1, y, T.PIPE_R); }
      },
      // 階段: dir=+1 で右上がり, -1 で右下がり
      stairs(x, n, dir, base = 11) {
        for (let i = 0; i < n; i++) {
          const h = dir > 0 ? i + 1 : n - i;
          b.fill(x + i, base - h + 1, x + i, base, T.HARD);
        }
      },
      enemy(type, x, y = 11) { entities.push({ kind: "enemy", type, x, y }); },
      lift(x, y, w, axis, range, speed = 40) { entities.push({ kind: "lift", x, y, w, axis, range, speed }); },
      checkpoint(x, y = 10) { deco.push({ kind: "checkpoint", x, y }); },
      sign(x, y, dir) { deco.push({ kind: "sign", x, y, dir }); },
      goal(x) {
        b.goalX = x;
        b.set(x, 11, T.HARD);
      },
    };
    return b;
  }

  // ------------------------------------------------------------ 1-1 ポポの丘
  function level1(b) {
    b.start = { x: 3, y: 10 };
    b.ground(0, 69);
    b.row(16, 8, "?");
    b.row(20, 8, "B?BPB");
    b.row(22, 4, "?");
    b.enemy("gumi", 24);
    b.pipe(29, 10);
    b.coins(32, 7, 3);
    b.pipe(38, 9);
    b.enemy("gumi", 42);
    b.pipe(47, 8);
    b.enemy("gumi", 51);
    b.enemy("gumi", 53);
    b.pipe(57, 8);
    b.row(63, 8, "?");
    // 穴 70-71
    b.ground(72, 86);
    b.row(76, 8, "BPB");
    b.row(79, 4, "BBBBBBBB");
    b.enemy("gumi", 80, 3);
    b.enemy("gumi", 82, 3);
    // 穴 87-89
    b.ground(90, 152);
    b.row(91, 4, "BBB?");
    b.row(94, 8, "b");
    b.checkpoint(97);
    b.enemy("kara", 101);
    b.row(103, 8, "BS");
    b.row(108, 8, "?");
    b.row(111, 8, "?");
    b.row(111, 4, "P");
    b.row(114, 8, "?");
    b.enemy("gumi", 110);
    b.enemy("gumi", 112);
    b.row(120, 8, "B");
    b.row(123, 4, "BBB");
    b.enemy("gumi", 117);
    b.enemy("gumi", 119);
    b.row(128, 4, "B??B");
    b.row(129, 8, "BB");
    b.enemy("kara", 131);
    b.stairs(135, 4, 1);
    b.stairs(141, 4, -1);
    b.stairs(147, 4, 1);
    b.fill(151, 8, 152, 11, b.T_HARD);
    // 穴 153-154
    b.ground(155, 214);
    b.stairs(155, 4, -1);
    b.pipe(164, 10);
    b.row(169, 8, "BB?B");
    b.enemy("gumi", 173);
    b.enemy("gumi", 175);
    b.pipe(180, 10);
    b.stairs(183, 8, 1);
    b.fill(191, 4, 191, 11, b.T_HARD);
    b.goal(200);
  }

  // ------------------------------------------------------------ 1-2 クリスタル洞窟
  function level2(b) {
    b.start = { x: 2, y: 10 };
    b.fill(0, 0, b.width - 1, 1, b.T_GROUND);
    b.ground(0, 40);
    b.row(9, 8, "P??");
    b.enemy("gumi", 15);
    b.fill(18, 9, 19, 11, b.T_GROUND);
    b.enemy("kara", 24);
    b.fill(26, 2, 30, 7, b.T_GROUND);
    b.row(26, 8, "BBBBB");
    b.coins(26, 11, 5);
    b.spikes(35, 11, 3);
    // 穴 41-43
    b.ground(44, 80);
    b.row(46, 8, "b");
    b.enemy("pata", 50, 7);
    b.sign(51, 11, "down");
    // しゃがみトンネル
    b.fill(54, 2, 59, 10, b.T_GROUND);
    b.coins(54, 11, 6);
    b.enemy("pata", 62, 6);
    b.enemy("toge", 66);
    b.row(67, 8, "?B?");
    b.enemy("toge", 72);
    b.checkpoint(77);
    // 穴 81-88 を横移動リフトで渡る
    b.lift(81, 9, 3, "x", 5, 45);
    b.ground(89, 132);
    b.fill(92, 10, 93, 11, b.T_GROUND);
    b.fill(96, 8, 97, 11, b.T_GROUND);
    b.coins(96, 6, 2);
    b.fill(100, 7, 101, 11, b.T_GROUND);
    b.coins(100, 4, 2);
    b.enemy("pata", 106, 6);
    b.enemy("kara", 109);
    b.row(112, 8, "BSB");
    b.enemy("gumi", 115);
    b.enemy("gumi", 117);
    b.row(117, 7, "BB?B");
    b.enemy("gumi", 119, 6);
    // トゲの上はレンガの橋を渡る
    b.spikes(124, 11, 5);
    b.row(123, 8, "BBBBBBB");
    // 穴 133-135
    b.ground(136, 185);
    b.enemy("pata", 141, 5);
    b.enemy("pata", 147, 8);
    b.pipe(151, 9);
    b.enemy("toge", 156);
    b.stairs(160, 4, 1);
    b.fill(164, 8, 165, 11, b.T_HARD);
    b.goal(174);
  }

  // ------------------------------------------------------------ 1-3 くものうえ
  function level3(b) {
    b.start = { x: 3, y: 10 };
    b.ground(0, 14);
    b.clouds(16, 10, 4);
    b.clouds(22, 8, 4);
    b.coins(22, 6, 4);
    b.ground(28, 36);
    b.row(30, 8, "?P?");
    b.enemy("gumi", 34);
    b.lift(38, 10, 3, "y", 4, 35);
    b.clouds(43, 6, 5);
    b.enemy("kara", 46, 5);
    b.clouds(50, 9, 3);
    b.coins(50, 7, 3);
    b.clouds(55, 7, 3);
    b.enemy("pata", 58, 4);
    b.clouds(60, 9, 3);
    b.ground(65, 80);
    b.row(68, 8, "B?B?B");
    b.enemy("gumi", 72);
    b.enemy("gumi", 74);
    b.checkpoint(78);
    b.lift(82, 9, 3, "x", 6, 45);
    b.ground(93, 98);
    b.clouds(100, 9, 3);
    b.coins(100, 7, 3);
    b.lift(105, 10, 3, "y", 5, 35);
    b.clouds(110, 5, 6);
    b.coins(110, 3, 6);
    b.clouds(118, 9, 4);
    b.enemy("pata", 121, 6);
    b.ground(124, 150);
    b.row(128, 8, "BSB");
    b.enemy("toge", 133);
    b.enemy("kara", 139);
    b.stairs(142, 4, 1);
    b.fill(146, 8, 150, 11, b.T_HARD);
    // 穴 151-153
    b.ground(154, 178);
    b.enemy("gumi", 158);
    b.goal(166);
  }

  // ------------------------------------------------------------ 1-4 ポポ城
  function level4(b) {
    b.start = { x: 2, y: 10 };
    b.fill(0, 0, b.width - 1, 1, b.T_HARD);
    b.ground(0, 16);
    b.lava(17, 19);
    b.ground(20, 30);
    b.row(22, 8, "?P?");
    b.enemy("toge", 27);
    b.ground(31, 33, 9);
    b.lava(34, 36);
    b.ground(37, 37);
    b.ground(38, 55);
    b.enemy("kara", 42);
    b.fill(45, 2, 52, 6, b.T_HARD);
    b.enemy("gumi", 47);
    b.enemy("gumi", 49);
    b.lava(56, 64);
    b.lift(56, 10, 3, "x", 5, 40);
    b.ground(65, 92);
    b.checkpoint(67);
    b.row(71, 8, "BBSBB");
    b.enemy("toge", 76);
    b.enemy("toge", 79);
    b.enemy("kara", 86);
    b.lava(93, 103);
    b.ground(95, 96, 9);
    b.ground(100, 101, 8);
    b.coins(100, 6, 2);
    b.ground(104, 142);
    b.enemy("pata", 112, 6);
    b.row(114, 8, "?b?");
    b.enemy("gumi", 116);
    b.enemy("gumi", 118);
    b.enemy("gumi", 120);
    b.spikes(126, 11, 3);
    b.enemy("kara", 133);
    b.enemy("toge", 138);
    b.lava(143, 152);
    b.lift(143, 9, 3, "x", 6, 45);
    b.ground(153, 190);
    b.stairs(157, 5, 1);
    b.fill(162, 7, 164, 11, b.T_HARD);
    b.goal(178);
  }

  const DEFS = [
    { name: "1-1", title: "POPO HILLS", theme: "grass", width: 216, time: 400, music: "grass", build: level1 },
    { name: "1-2", title: "CRYSTAL CAVE", theme: "cave", width: 188, time: 400, music: "cave", build: level2 },
    { name: "1-3", title: "CLOUD WALK", theme: "sky", width: 182, time: 300, music: "sky", build: level3 },
    { name: "1-4", title: "POPO CASTLE", theme: "castle", width: 194, time: 400, music: "castle", build: level4 },
  ];

  function buildLevel(index) {
    const def = DEFS[index];
    const b = builder(def.width);
    b.T_GROUND = T.GROUND;
    b.T_HARD = T.HARD;
    def.build(b);
    return {
      index,
      name: def.name,
      title: def.title,
      theme: def.theme,
      music: def.music,
      time: def.time,
      cols: def.width,
      rows: ROWS,
      tiles: b.tiles,
      entities: b.entities,
      deco: b.deco,
      start: b.start,
      goalX: b.goalX,
      last: index === DEFS.length - 1,
    };
  }

  window.PopoLevels = { count: DEFS.length, build: buildLevel, ROWS };
})();
