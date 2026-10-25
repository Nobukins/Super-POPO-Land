// ドット絵アセット: タイル・敵・アイテム・背景・フォントをすべてコードで 8bit 風に生成する
(() => {
  "use strict";

  const TILE = 16;
  const OUTLINE = "#18141c";

  // タイル番号
  const T = {
    EMPTY: 0, GROUND: 1, BRICK: 2, QCOIN: 3, QPOWER: 4, QSTAR: 5, USED: 6, HARD: 7,
    PIPE_TL: 8, PIPE_TR: 9, PIPE_L: 10, PIPE_R: 11, CLOUD: 12, SPIKE: 13, LAVA: 14,
    MULTI: 15, COIN: 16,
  };
  const SOLID = new Set([T.GROUND, T.BRICK, T.QCOIN, T.QPOWER, T.QSTAR, T.USED, T.HARD,
    T.PIPE_TL, T.PIPE_TR, T.PIPE_L, T.PIPE_R, T.MULTI]);

  // ---------------------------------------------------------------- helpers
  function canvasOf(w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }

  function paint(w, h, fn) {
    const c = canvasOf(w, h);
    const g = c.getContext("2d");
    const p = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
    const r = (x, y, rw, rh, col) => { g.fillStyle = col; g.fillRect(x, y, rw, rh); };
    fn(g, p, r);
    return c;
  }

  // 文字列のドット絵 → canvas (行の長さが足りなくても '.' 扱いで安全に描く)
  function fromRows(rows, palette, w = 16, h = 16) {
    return paint(w, h, (g, p) => {
      for (let y = 0; y < Math.min(h, rows.length); y++) {
        for (let x = 0; x < w; x++) {
          const col = palette[rows[y][x]];
          if (col) p(x, y, col);
        }
      }
    });
  }

  function flipped(c) {
    const f = canvasOf(c.width, c.height);
    const g = f.getContext("2d");
    g.translate(c.width, 0);
    g.scale(-1, 1);
    g.drawImage(c, 0, 0);
    return f;
  }

  const hash = (x, y) => (((x * 73856093) ^ (y * 19349663)) >>> 0) % 997;

  // ---------------------------------------------------------------- themes
  const THEMES = {
    grass: {
      bands: ["#5cb8ff", "#72c4ff", "#8ad0ff", "#a4dcff", "#bfe8ff"],
      ground: "#c8743a", groundDark: "#8a4a22", groundLight: "#e8a060",
      top: "#5ad04a", topDark: "#2f9a2f", topLight: "#a6f07a",
      brick: "#d0603a", brickDark: "#5a2a14", brickLight: "#f4a070",
      hard: "#c09a70", hardDark: "#6a5038", hardLight: "#ecd2a8",
      pipe: "#3cc04a", pipeDark: "#1a6a28", pipeLight: "#a6f0a0",
      lift: "#f0a040", liftDark: "#8a4a10",
    },
    cave: {
      bands: ["#0c0818", "#120c22", "#18102c", "#1e1436", "#241a40"],
      ground: "#5a5a8a", groundDark: "#363660", groundLight: "#8a8ab8",
      top: "#9a7ae0", topDark: "#5a40a0", topLight: "#d8c0ff",
      brick: "#4a6ab0", brickDark: "#1a2a50", brickLight: "#8aaae8",
      hard: "#6a6a7a", hardDark: "#34343e", hardLight: "#a8a8b8",
      pipe: "#3ab0b0", pipeDark: "#146060", pipeLight: "#a0f0f0",
      lift: "#d0b060", liftDark: "#6a5020",
    },
    sky: {
      bands: ["#78c8ff", "#90d4ff", "#a8deff", "#c0e8ff", "#d8f2ff"],
      ground: "#f0d8a8", groundDark: "#c0a070", groundLight: "#fff0d0",
      top: "#7ae0a0", topDark: "#3aa86a", topLight: "#c8ffd8",
      brick: "#e88aa8", brickDark: "#8a3a58", brickLight: "#ffc8da",
      hard: "#c8c8e0", hardDark: "#7a7a9a", hardLight: "#f4f4ff",
      pipe: "#5ac8f0", pipeDark: "#1a6a9a", pipeLight: "#c0f0ff",
      lift: "#ffffff", liftDark: "#8aa8d0",
    },
    castle: {
      bands: ["#100408", "#1a060c", "#240a10", "#2e0e14", "#3a1218"],
      ground: "#7a7a8a", groundDark: "#3e3e4a", groundLight: "#a8a8b8",
      top: "#9a9aaa", topDark: "#4a4a5a", topLight: "#d0d0e0",
      brick: "#8a3a3a", brickDark: "#3a1010", brickLight: "#c86a5a",
      hard: "#5a5a6a", hardDark: "#2a2a34", hardLight: "#9a9aaa",
      pipe: "#7a5ac0", pipeDark: "#3a2070", pipeLight: "#c8b0ff",
      lift: "#c0c0c8", liftDark: "#5a5a68",
    },
    space: {
      bands: ["#05030f", "#080520", "#0c072a", "#120a36", "#180e40"],
      ground: "#5a5a8a", groundDark: "#363660", groundLight: "#8a8ab8",
      top: "#9a7ae0", topDark: "#5a40a0", topLight: "#d8c0ff",
      brick: "#5a4a9a", brickDark: "#1a1440", brickLight: "#9a8ad8",
      hard: "#6a6a7a", hardDark: "#34343e", hardLight: "#a8a8b8",
      pipe: "#3ab0b0", pipeDark: "#146060", pipeLight: "#a0f0f0",
      lift: "#c0c0c8", liftDark: "#5a5a68",
    },
  };

  // ---------------------------------------------------------------- tiles
  function groundTile(th, top) {
    return paint(TILE, TILE, (g, p, r) => {
      r(0, 0, 16, 16, th.ground);
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          const h = hash(x, y);
          if (h % 17 === 0) p(x, y, th.groundDark);
          else if (h % 29 === 0) p(x, y, th.groundLight);
        }
      }
      // 石のつなぎ目
      r(0, 15, 16, 1, th.groundDark);
      r(7, 8, 1, 7, th.groundDark);
      r(0, 7, 16, 1, th.groundDark);
      r(15, 0, 1, 7, th.groundDark);
      r(1, 8, 5, 1, th.groundLight);
      r(8, 8, 6, 1, th.groundLight);
      if (top) {
        r(0, 0, 16, 5, th.top);
        r(0, 0, 16, 1, th.topLight);
        for (let x = 0; x < 16; x++) {
          const d = 5 + ((x * 5) % 3 === 0 ? 1 : 0) + (x % 7 === 3 ? 1 : 0);
          r(x, 5, 1, d - 5, th.top);
          p(x, d, th.topDark);
        }
        p(3, 2, th.topLight); p(10, 1, th.topLight); p(13, 3, th.topDark); p(6, 3, th.topDark);
      }
    });
  }

  function brickTile(th, shine) {
    return paint(TILE, TILE, (g, p, r) => {
      r(0, 0, 16, 16, th.brick);
      for (let row = 0; row < 4; row++) {
        const y = row * 4;
        r(0, y + 3, 16, 1, th.brickDark);
        const off = row % 2 === 0 ? 7 : 15;
        r(off, y, 1, 3, th.brickDark);
        r(row % 2 === 0 ? 0 : 8, y, row % 2 === 0 ? 7 : 7, 1, th.brickLight);
      }
      if (shine) { p(2, 1, "#fff"); p(3, 1, "#fff"); p(2, 2, "#fff"); }
    });
  }

  const QMARK = [
    ".1111.",
    "11..11",
    "....11",
    "...11.",
    "..11..",
    "..11..",
    "......",
    "..11..",
  ];

  function qTile(fill) {
    return paint(TILE, TILE, (g, p, r) => {
      r(0, 0, 16, 16, OUTLINE);
      r(1, 1, 14, 14, fill);
      r(1, 1, 14, 1, "#fff2b0");
      r(1, 1, 1, 14, "#fff2b0");
      r(2, 14, 13, 1, "#b8700a");
      r(14, 2, 1, 13, "#b8700a");
      [[2, 2], [13, 2], [2, 13], [13, 13]].forEach(([x, y]) => p(x, y, "#8a4a00"));
      QMARK.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          if (row[x] === "1") { p(5 + x + 1, 4 + y + 1, "#b8700a"); p(5 + x, 4 + y, "#fff8e0"); }
        }
      });
    });
  }

  function usedTile() {
    return paint(TILE, TILE, (g, p, r) => {
      r(0, 0, 16, 16, OUTLINE);
      r(1, 1, 14, 14, "#a0703a");
      r(1, 1, 14, 1, "#c8945a");
      r(2, 14, 13, 1, "#6a4420");
      [[2, 2], [13, 2], [2, 13], [13, 13]].forEach(([x, y]) => p(x, y, "#4a2a10"));
    });
  }

  function hardTile(th) {
    return paint(TILE, TILE, (g, p, r) => {
      r(0, 0, 16, 16, th.hardDark);
      r(0, 0, 15, 15, th.hardLight);
      r(1, 1, 14, 14, th.hard);
      r(3, 3, 10, 10, th.hardLight);
      r(4, 4, 9, 9, th.hardDark);
      r(4, 4, 8, 8, th.hard);
    });
  }

  function pipeTile(th, kind) {
    return paint(TILE, TILE, (g, p, r) => {
      const lip = kind === "TL" || kind === "TR";
      const left = kind === "TL" || kind === "L";
      const x0 = lip ? 0 : left ? 2 : 0;
      const x1 = lip ? 16 : left ? 16 : 14;
      r(x0, 0, x1 - x0, 16, th.pipe);
      if (left) {
        r(x0, 0, 1, 16, OUTLINE);
        r(x0 + 2, 0, 2, 16, th.pipeLight);
        r(x0 + 5, 0, 1, 16, th.pipeLight);
      } else {
        r(x1 - 1, 0, 1, 16, OUTLINE);
        r(x1 - 5, 0, 4, 16, th.pipeDark);
        r(0, 0, 2, 16, th.pipe);
      }
      if (lip) {
        r(0, 0, 16, 1, OUTLINE);
        r(0, 15, 16, 1, OUTLINE);
      }
    });
  }

  // 乗れる雲 (背景の雲と見分けやすいように濃い縁取り付き)
  function cloudTile() {
    return paint(TILE, TILE, (g, p, r) => {
      r(0, 0, 16, 10, "#3a5a9a");
      r(0, 1, 16, 8, "#ffffff");
      r(0, 6, 16, 3, "#c8dcff");
      r(0, 8, 16, 1, "#8aaee8");
      p(3, 2, "#eaf4ff"); p(4, 2, "#eaf4ff"); p(11, 3, "#eaf4ff");
      g.clearRect(5, 9, 6, 1);
      p(5, 9, "#3a5a9a"); p(10, 9, "#3a5a9a");
    });
  }

  function spikeTile() {
    return paint(TILE, TILE, (g, p, r) => {
      for (let s = 0; s < 2; s++) {
        const bx = s * 8;
        for (let y = 0; y < 8; y++) {
          const half = Math.floor((y + 1) / 2);
          r(bx + 4 - half, 8 + y, half * 2, 1, y === 7 ? "#5a5a6a" : "#c8c8d8");
          p(bx + 4 - half, 8 + y, OUTLINE);
          p(bx + 3 + half, 8 + y, OUTLINE);
        }
        p(bx + 3, 8, "#ffffff");
      }
      r(0, 15, 16, 1, OUTLINE);
    });
  }

  function lavaTile(frame, top) {
    return paint(TILE, TILE, (g, p, r) => {
      r(0, 0, 16, 16, "#d02a10");
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          if ((hash(x + frame * 5, y) % 11) === 0) p(x, y, "#ff7a20");
        }
      }
      if (top) {
        r(0, 0, 16, 4, "rgba(0,0,0,0)");
        g.clearRect(0, 0, 16, 4);
        for (let x = 0; x < 16; x++) {
          const wave = Math.round(1.5 + 1.5 * Math.sin((x + frame * 4) * Math.PI / 4));
          r(x, wave, 1, 4 - wave, "#ff9a30");
          p(x, wave, "#ffe070");
        }
      }
    });
  }

  function coinTile(frame) {
    const rx = [5, 3, 1, 3][frame];
    return paint(TILE, TILE, (g, p) => {
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          const dx = (x + 0.5 - 8) / (rx + 0.6);
          const dy = (y + 0.5 - 8) / 7;
          const d = dx * dx + dy * dy;
          if (d <= 1) {
            const edge = ((x + 0.5 - 8) / (rx - 0.4)) ** 2 + ((y + 0.5 - 8) / 6) ** 2 > 1;
            p(x, y, edge ? "#8a5a00" : "#ffd23a");
          }
        }
      }
      if (rx >= 3) {
        p(8 - rx + 2, 5, "#fff6c0"); p(8 - rx + 2, 6, "#fff6c0");
        for (let y = 5; y <= 10; y++) p(8, y, "#d8a010");
      }
    });
  }

  function liftCanvas(th, w) {
    return paint(w, 8, (g, p, r) => {
      r(0, 0, w, 8, OUTLINE);
      r(1, 1, w - 2, 6, th.lift);
      r(1, 1, w - 2, 1, "#ffffff");
      r(1, 6, w - 2, 1, th.liftDark);
      for (let x = 4; x < w - 2; x += 8) p(x, 3, th.liftDark);
    });
  }

  function buildTileset(themeName) {
    const th = THEMES[themeName];
    return {
      theme: th,
      groundTop: groundTile(th, true),
      ground: groundTile(th, false),
      brick: brickTile(th, false),
      q: [qTile("#ffc53a"), qTile("#ffd870"), qTile("#f0b020")],
      used: usedTile(),
      hard: hardTile(th),
      pipe: { TL: pipeTile(th, "TL"), TR: pipeTile(th, "TR"), L: pipeTile(th, "L"), R: pipeTile(th, "R") },
      cloud: cloudTile(),
      spike: spikeTile(),
      lava: [0, 1, 2, 3].map((f) => lavaTile(f, false)),
      lavaTop: [0, 1, 2, 3].map((f) => lavaTile(f, true)),
      coin: [0, 1, 2, 1].map(coinTile),
      lift: (w) => liftCanvas(th, w),
    };
  }

  // ---------------------------------------------------------------- backgrounds
  function hillsLayer(th) {
    return paint(512, 120, (g, p, r) => {
      const hills = [[90, 120, 70, "#3fae50"], [260, 120, 50, "#4cbc5c"], [420, 120, 80, "#3fae50"]];
      for (const [cx, cy, rad, col] of hills) {
        for (let y = 0; y < 120; y++) {
          for (let x = -rad; x <= rad; x++) {
            const xx = (cx + x + 512) % 512;
            const d = Math.hypot(x, (y - cy) * 1.3);
            if (d <= rad) p(xx, y, d > rad - 2 ? "#1f6a2c" : col);
          }
        }
        // 模様
        for (let k = 0; k < 4; k++) {
          const xx = (cx - 20 + k * 13 + 512) % 512;
          r(xx, cy - rad * 0.55 + (k % 2) * 10, 3, 6, "#2a8a3a");
        }
      }
    });
  }

  function cloudsLayer(color, shade, count, seed, h = 80) {
    return paint(512, h, (g, p, r) => {
      for (let i = 0; i < count; i++) {
        const cx = (hash(i, seed) * 7) % 512;
        const cy = 14 + (hash(seed, i) % (h - 34));
        const puffs = [[0, 6, 10], [12, 0, 12], [26, 4, 10], [36, 8, 7]];
        for (const [ox, oy, rad] of puffs) {
          for (let y = -rad; y <= rad; y++) {
            for (let x = -rad; x <= rad; x++) {
              if (x * x + y * y <= rad * rad) {
                const px = (cx + ox + x + 512) % 512;
                const py = cy + oy + y;
                if (py >= 0 && py < h) p(px, py, y > rad * 0.45 ? shade : color);
              }
            }
          }
        }
      }
    });
  }

  function caveLayer() {
    return paint(512, 224, (g, p, r) => {
      for (let x = 0; x < 512; x += 16) {
        const len = 10 + (hash(x, 3) % 50);
        for (let y = 0; y < len; y++) {
          const w = Math.max(1, Math.round(8 * (1 - y / len)));
          r(x + 8 - w, y, w * 2, 1, "#241c3c");
        }
        const hgt = 8 + (hash(x, 9) % 40);
        for (let y = 0; y < hgt; y++) {
          const w = Math.max(1, Math.round(9 * (y / hgt)));
          r(x + 8 - w, 224 - hgt + y, w * 2, 1, "#20182e");
        }
      }
      for (let i = 0; i < 40; i++) {
        const x = (hash(i, 77) * 13) % 512;
        const y = 40 + (hash(77, i) % 140);
        const col = i % 3 === 0 ? "#ff8ad0" : i % 3 === 1 ? "#8ae0ff" : "#c8a0ff";
        p(x, y, col); p(x + 1, y, col); p(x, y + 1, col);
        if (i % 4 === 0) { p(x, y - 1, col); p(x - 1, y, col); }
      }
    });
  }

  function castleLayer() {
    return paint(512, 224, (g, p, r) => {
      for (let y = 0; y < 224; y += 8) {
        for (let x = (y / 8) % 2 ? 0 : 8; x < 512; x += 16) {
          r(x, y, 15, 7, "#2a0e14");
        }
      }
      for (let i = 0; i < 6; i++) {
        const x = 30 + i * 85;
        r(x, 60, 18, 30, "#120408");
        r(x + 2, 62, 14, 26, "#ff7a30");
        r(x + 4, 64, 4, 10, "#ffd070");
        r(x + 8, 62, 2, 26, "#120408");
        r(x + 2, 74, 14, 2, "#120408");
      }
    });
  }

  function islandsLayer() {
    return paint(512, 120, (g, p, r) => {
      const isl = [[60, 70, 40], [230, 50, 28], [380, 80, 50]];
      for (const [cx, cy, w] of isl) {
        r(cx - w, cy, w * 2, 4, "#8ad0a0");
        for (let y = 4; y < 22; y++) {
          const hw = Math.round(w * (1 - y / 22));
          r(cx - hw, cy + y, hw * 2, 1, "#b8c8e8");
        }
      }
    });
  }

  function buildBackground(themeName) {
    const th = THEMES[themeName];
    const layers = [];
    if (themeName === "grass") {
      layers.push({ c: cloudsLayer("#ffffff", "#d8ecff", 6, 1), par: 0.15, y: 8 });
      layers.push({ c: hillsLayer(th), par: 0.35, y: 104 });
    } else if (themeName === "cave") {
      layers.push({ c: caveLayer(), par: 0.3, y: 0 });
    } else if (themeName === "sky") {
      layers.push({ c: islandsLayer(), par: 0.1, y: 60 });
      layers.push({ c: cloudsLayer("#ffffff", "#e0f0ff", 7, 5, 100), par: 0.25, y: 100 });
      layers.push({ c: cloudsLayer("#f4faff", "#d0e6ff", 4, 9), par: 0.45, y: 10 });
    } else if (themeName === "castle") {
      layers.push({ c: castleLayer(), par: 0.4, y: 0 });
    }
    return { bands: th.bands, layers };
  }

  // ---------------------------------------------------------------- enemies & items
  const ENEMY_ROWS = {
    gumiA: [
      "................",
      "................",
      "......1111......",
      "....11222211....",
      "...1233222221...",
      "..123222222221..",
      "..122442244221..",
      ".12224522452221.",
      ".12224522452221.",
      ".12222222222221.",
      ".12222111122221.",
      ".12222222222221.",
      "..122222222221..",
      "..112222222211..",
      "...11......11...",
      "................",
    ],
    gumiB: [
      "................",
      "................",
      "................",
      "......1111......",
      "....11222211....",
      "...1233222221...",
      "..123222222221..",
      ".12224422442221.",
      ".12224522452221.",
      ".12222222222221.",
      ".12222111122221.",
      ".12222222222221.",
      "..122222222221..",
      "..121111111121..",
      ".11..........11.",
      "................",
    ],
    gumiFlat: [
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "....11111111....",
      "..112222222211..",
      ".12244222244221.",
      ".12222222222221.",
      "..111111111111..",
    ],
    karaA: [
      "................",
      "................",
      "................",
      "........11111...",
      ".......1222221..",
      "......122333221.",
      "..11..123222321.",
      ".1441.123232321.",
      ".1561.123222321.",
      ".1441.122333221.",
      ".14411122222221.",
      ".14444411111111.",
      "..1444444444441.",
      "..1111111111111.",
      "...11..11..11...",
      "................",
    ],
    karaB: [
      "................",
      "................",
      "................",
      "........11111...",
      ".......1222221..",
      "......122333221.",
      "..11..123222321.",
      ".1441.123232321.",
      ".1561.123222321.",
      ".1441.122333221.",
      ".14411122222221.",
      ".14444411111111.",
      "..1444444444441.",
      "..1111111111111.",
      "..11..11..11....",
      "................",
    ],
    shell: [
      "................",
      "................",
      "................",
      "....1111111.....",
      "...122222221....",
      "..12223332221...",
      "..12232223221...",
      "..12232323221...",
      "..12232223221...",
      "..12223332221...",
      "..12222222221...",
      "...122222221....",
      "..11111111111...",
      "................",
      "................",
      "................",
    ],
    togeA: [
      "................",
      "....3..3..3.....",
      "...313313313....",
      "..31222222221...",
      ".3122222222221..",
      "31224422222221..",
      ".1224522222221.3",
      ".12222222222213.",
      "312222222222221.",
      ".1222222222221.3",
      "..122222222221..",
      "...1111111111...",
      "...16611..1661..",
      "...1111...1111..",
      "................",
      "................",
    ],
    togeB: [
      "................",
      "....3..3..3.....",
      "...313313313....",
      "..31222222221...",
      ".3122222222221..",
      "31224422222221..",
      ".1224522222221.3",
      ".12222222222213.",
      "312222222222221.",
      ".1222222222221.3",
      "..122222222221..",
      "...1111111111...",
      "..16611..16611..",
      "..1111....1111..",
      "................",
      "................",
    ],
    pataA: [
      "................",
      "11............11",
      "131..........131",
      "1331..1111..1331",
      ".13311222211331.",
      ".13332222223331.",
      "..133244224331..",
      "..113245224311..",
      "....12222221....",
      "....12211221....",
      ".....122221.....",
      "......1111......",
      "................",
      "................",
      "................",
      "................",
    ],
    pataB: [
      "................",
      "................",
      "................",
      "......1111......",
      ".....122221.....",
      "....12222221....",
      "...1244224421...",
      "..112452245211..",
      ".13312222221331.",
      "1333112112113331",
      "1331..1221..1331",
      "131....11....131",
      "11............11",
      "................",
      "................",
      "................",
    ],
  };

  const ENEMY_PAL = {
    gumi: { 1: OUTLINE, 2: "#2fc0a8", 3: "#a8fff0", 4: "#ffffff", 5: OUTLINE },
    kara: { 1: OUTLINE, 2: "#f0902a", 3: "#a85010", 4: "#ffe08a", 5: "#ffffff", 6: OUTLINE },
    toge: { 1: OUTLINE, 2: "#e8403a", 3: "#f4f4f4", 4: "#ffffff", 5: OUTLINE, 6: "#ffb040" },
    pata: { 1: OUTLINE, 2: "#5a3a8a", 3: "#8a6ac8", 4: "#ffe040", 5: OUTLINE },
  };

  function buildEnemies() {
    const make = (rows, pal) => {
      const c = fromRows(rows, pal);
      return { l: c, r: flipped(c) };
    };
    return {
      gumi: [make(ENEMY_ROWS.gumiA, ENEMY_PAL.gumi), make(ENEMY_ROWS.gumiB, ENEMY_PAL.gumi)],
      gumiFlat: make(ENEMY_ROWS.gumiFlat, ENEMY_PAL.gumi),
      kara: [make(ENEMY_ROWS.karaA, ENEMY_PAL.kara), make(ENEMY_ROWS.karaB, ENEMY_PAL.kara)],
      shell: make(ENEMY_ROWS.shell, ENEMY_PAL.kara),
      toge: [make(ENEMY_ROWS.togeA, ENEMY_PAL.toge), make(ENEMY_ROWS.togeB, ENEMY_PAL.toge)],
      pata: [make(ENEMY_ROWS.pataA, ENEMY_PAL.pata), make(ENEMY_ROWS.pataB, ENEMY_PAL.pata)],
    };
  }

  function berrySprite() {
    return paint(16, 16, (g, p, r) => {
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 9.5);
          if (d <= 6.2) p(x, y, d > 5.2 ? OUTLINE : "#a050e0");
        }
      }
      r(5, 6, 2, 2, "#e0b0ff"); p(5, 8, "#e0b0ff");
      r(9, 10, 3, 2, "#6a2aa0");
      // 葉っぱ
      r(7, 1, 2, 3, OUTLINE);
      r(9, 1, 4, 2, "#3ac04a"); r(9, 0, 3, 1, OUTLINE); r(13, 1, 1, 2, OUTLINE); r(9, 3, 4, 1, OUTLINE);
      // 顔
      p(6, 10, OUTLINE); p(10, 10, OUTLINE);
    });
  }

  function starSprite(fill, edge) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const rad = i % 2 === 0 ? 7.6 : 3.4;
      pts.push([8 + Math.cos(a) * rad, 8.6 + Math.sin(a) * rad]);
    }
    const inside = (x, y) => {
      let c = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i];
        const [xj, yj] = pts[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
      }
      return c;
    };
    return paint(16, 16, (g, p) => {
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          if (!inside(x + 0.5, y + 0.5)) continue;
          const border = !inside(x - 0.5, y + 0.5) || !inside(x + 1.5, y + 0.5) || !inside(x + 0.5, y - 0.5) || !inside(x + 0.5, y + 1.5);
          p(x, y, border ? edge : fill);
        }
      }
      p(6, 7, OUTLINE); p(6, 8, OUTLINE); p(9, 7, OUTLINE); p(9, 8, OUTLINE);
    });
  }

  // ---------------------------------------------------------------- decorations
  function castleCanvas(th) {
    const b = brickTile(th, false);
    return paint(96, 96, (g, p, r) => {
      // 下段
      for (let y = 48; y < 96; y += 16) for (let x = 0; x < 96; x += 16) g.drawImage(b, x, y);
      // 上段
      for (let y = 16; y < 48; y += 16) for (let x = 16; x < 80; x += 16) g.drawImage(b, x, y);
      // 城壁のギザギザ
      for (let x = 0; x < 96; x += 16) { g.drawImage(b, x, 40, 16, 8); g.clearRect(x + 5, 40, 6, 4); }
      for (let x = 16; x < 80; x += 16) { g.drawImage(b, x, 8, 16, 8); g.clearRect(x + 5, 8, 6, 4); }
      g.clearRect(0, 44, 96, 4);
      for (let x = 0; x < 96; x += 16) g.drawImage(b, x, 44, 16, 4);
      // 窓と扉
      r(28, 22, 8, 12, OUTLINE); r(60, 22, 8, 12, OUTLINE);
      r(38, 64, 20, 32, OUTLINE);
      r(40, 62, 16, 2, OUTLINE);
      r(42, 60, 12, 2, OUTLINE);
      // 旗
      r(47, 0, 2, 10, OUTLINE);
      r(49, 1, 8, 5, "#ff69b4");
    });
  }

  function checkpointCanvas(on) {
    return paint(16, 32, (g, p, r) => {
      r(7, 2, 2, 30, "#d8d8e0");
      r(9, 2, 1, 30, "#8a8a9a");
      r(6, 0, 4, 3, "#ffd23a");
      const col = on ? "#ff69b4" : "#9a9aa8";
      r(9, 4, 7, 7, col);
      r(9, 4, 7, 1, OUTLINE); r(9, 10, 7, 1, OUTLINE); r(15, 4, 1, 7, OUTLINE);
      if (on) { p(12, 7, "#fff"); p(12, 6, OUTLINE); }
      r(4, 30, 8, 2, OUTLINE);
    });
  }

  function signCanvas(kind) {
    return paint(16, 16, (g, p, r) => {
      r(7, 9, 2, 7, "#8a5a2a");
      r(1, 1, 14, 10, OUTLINE);
      r(2, 2, 12, 8, "#f0d8a0");
      const arrow = kind === "down"
        ? ["..11..", "..11..", "..11..", "111111", ".1111.", "..11.."]
        : ["..1...", "..11..", "111111", "111111", "..11..", "..1..."];
      arrow.forEach((row, y) => {
        for (let x = 0; x < 6; x++) if (row[x] === "1") p(5 + x, 3 + y, "#c8303a");
      });
    });
  }

  // ---------------------------------------------------------------- font (5x7)
  const GLYPHS = {
    A: "01110100011000111111100011000110001", B: "11110100011000111110100011000111110",
    C: "01110100011000010000100001000101110", D: "11110100011000110001100011000111110",
    E: "11111100001000011110100001000011111", F: "11111100001000011110100001000010000",
    G: "01110100011000010111100011000101111", H: "10001100011000111111100011000110001",
    I: "01110001000010000100001000010001110", J: "00111000100001000010000101001001100",
    K: "10001100101010011000101001001010001", L: "10000100001000010000100001000011111",
    M: "10001110111010110101100011000110001", N: "10001100011100110101100111000110001",
    O: "01110100011000110001100011000101110", P: "11110100011000111110100001000010000",
    Q: "01110100011000110001101011001001101", R: "11110100011000111110101001001010001",
    S: "01111100001000001110000010000111110", T: "11111001000010000100001000010000100",
    U: "10001100011000110001100011000101110", V: "10001100011000110001100010101000100",
    W: "10001100011000110101101011010101010", X: "10001100010101000100010101000110001",
    Y: "10001100010101000100001000010000100", Z: "11111000010001000100010001000011111",
    0: "01110100011001110101110011000101110", 1: "00100011000010000100001000010001110",
    2: "01110100010000100010001000100011111", 3: "11111000100010000010000011000101110",
    4: "00010001100101010010111110001000010", 5: "11111100001111000001000011000101110",
    6: "00110010001000011110100011000101110", 7: "11111000010001000100010000100001000",
    8: "01110100011000101110100011000101110", 9: "01110100011000101111000010001001100",
    "-": "00000000000000011111000000000000000", "*": "00000000001000101010001000101010001",
    "!": "00100001000010000100001000000000100", ".": "00000000000000000000000000110001100",
    ":": "00000011000110000000011000110000000", "?": "01110100010000100010001000000000100",
    "/": "00001000010001000100010001000010000", "'": "00100001000100000000000000000000000",
    ",": "00000000000000000000011000010001000", "<": "00000010101111111111011100010000000",
    ">": "01000011000111001111011100110001000", "@": "01110110111101111011110111101101110",
    "+": "00000001000010011111001000010000000", "(": "00010001000100001000010000010000010",
    ")": "01000001000001000010000100010001000", "#": "00000000000000000000000000000000000",
  };

  const fontCache = new Map();
  function glyphCanvas(ch, color) {
    const key = ch + color;
    if (fontCache.has(key)) return fontCache.get(key);
    const bits = GLYPHS[ch];
    const c = paint(5, 7, (g, p) => {
      if (!bits) return;
      for (let i = 0; i < 35; i++) if (bits[i] === "1") p(i % 5, Math.floor(i / 5), color);
    });
    fontCache.set(key, c);
    return c;
  }

  // text を描画。scale 倍、shadow 色を指定すると 1px 影付き
  function drawText(ctx, text, x, y, color = "#fff", opts = {}) {
    const scale = opts.scale || 1;
    const str = String(text).replace(/×/g, "*").toUpperCase();
    const width = str.length * 6 * scale - scale;
    let sx = x;
    if (opts.align === "center") sx = Math.round(x - width / 2);
    else if (opts.align === "right") sx = x - width;
    const drawRun = (col, ox, oy) => {
      for (let i = 0; i < str.length; i++) {
        const ch = str[i];
        if (ch === " ") continue;
        ctx.drawImage(glyphCanvas(ch, col), sx + i * 6 * scale + ox, y + oy, 5 * scale, 7 * scale);
      }
    };
    if (opts.outline) {
      for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) drawRun(opts.outline, ox * scale, oy * scale);
    } else if (opts.shadow) {
      drawRun(opts.shadow, scale, scale);
    }
    drawRun(color, 0, 0);
    return width;
  }

  // ---------------------------------------------------------------- POPO
  const POPO = window.POPO_SPRITES;
  const popoCache = new Map();
  // variant: パレットの差し替え { index: color }
  function popoFrame(name, variantKey = "normal", override = null, flip = false) {
    const key = `${name}|${variantKey}|${flip}`;
    if (popoCache.has(key)) return popoCache.get(key);
    const rows = POPO.frames[name];
    const pal = {};
    POPO.palette.forEach((col, i) => { pal[String(i)] = col; });
    if (override) Object.entries(override).forEach(([i, col]) => { pal[String(i)] = col; });
    let c = fromRows(rows, pal, POPO.size, POPO.size);
    if (flip) c = flipped(c);
    popoCache.set(key, c);
    return c;
  }

  window.PopoArt = {
    TILE, T, SOLID, OUTLINE, THEMES,
    buildTileset, buildBackground, buildEnemies,
    berry: () => berrySprite(),
    stars: () => [starSprite("#ffe14a", "#c88a00"), starSprite("#fff6b0", "#e0a020")],
    castle: (theme) => castleCanvas(THEMES[theme]),
    checkpoint: (on) => checkpointCanvas(on),
    sign: (kind) => signCanvas(kind),
    drawText, popoFrame, paint, flipped,
  };
})();
