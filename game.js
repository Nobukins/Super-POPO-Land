const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");

const world = {
  gravity: 1800,
  width: 2400,
  floorY: 500,
  cameraX: 0,
};

const popo = {
  x: 80,
  y: 300,
  w: 32,
  h: 32,
  vx: 0,
  vy: 0,
  speed: 280,
  jumpPower: 650,
  onGround: false,
};

const flag = { x: 2250, y: 356, w: 12, h: 144 };

const platforms = [
  { x: 0, y: 500, w: 2400, h: 40 },
  { x: 300, y: 420, w: 160, h: 20 },
  { x: 560, y: 360, w: 160, h: 20 },
  { x: 900, y: 430, w: 190, h: 20 },
  { x: 1240, y: 380, w: 130, h: 20 },
  { x: 1450, y: 320, w: 130, h: 20 },
  { x: 1720, y: 270, w: 130, h: 20 },
  { x: 1960, y: 350, w: 220, h: 20 },
];

const coins = [
  { x: 360, y: 380, r: 10, taken: false },
  { x: 620, y: 320, r: 10, taken: false },
  { x: 970, y: 390, r: 10, taken: false },
  { x: 1290, y: 340, r: 10, taken: false },
  { x: 1770, y: 230, r: 10, taken: false },
  { x: 2050, y: 310, r: 10, taken: false },
];

const keys = new Set();
const state = { won: false, score: 0 };

window.addEventListener("keydown", (e) => {
  if (["ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
    e.preventDefault();
  }
  keys.add(e.code);
});

window.addEventListener("keyup", (e) => {
  keys.delete(e.code);
});

function setStatus(message) {
  statusEl.textContent = `${message} / Score: ${state.score}`;
}

function intersects(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function clampCamera() {
  const maxCameraX = Math.max(world.width - canvas.width, 0);
  world.cameraX = Math.min(Math.max(popo.x - canvas.width * 0.35, 0), maxCameraX);
}

function resetIfOut() {
  if (popo.y > canvas.height + 200) {
    popo.x = 80;
    popo.y = 300;
    popo.vx = 0;
    popo.vy = 0;
    setStatus("落下したためリスタート");
  }
}

function update(dt) {
  if (state.won) {
    return;
  }

  popo.vx = 0;
  if (keys.has("ArrowLeft")) popo.vx -= popo.speed;
  if (keys.has("ArrowRight")) popo.vx += popo.speed;

  if (keys.has("Space") && popo.onGround) {
    popo.vy = -popo.jumpPower;
    popo.onGround = false;
  }

  popo.vy += world.gravity * dt;

  popo.x += popo.vx * dt;
  popo.y += popo.vy * dt;

  popo.onGround = false;
  for (const platform of platforms) {
    const wasAbove = popo.y + popo.h - popo.vy * dt <= platform.y;
    if (intersects(popo, platform) && wasAbove && popo.vy >= 0) {
      popo.y = platform.y - popo.h;
      popo.vy = 0;
      popo.onGround = true;
    }
  }

  if (popo.x < 0) popo.x = 0;
  if (popo.x + popo.w > world.width) popo.x = world.width - popo.w;

  for (const coin of coins) {
    if (coin.taken) continue;
    const dx = popo.x + popo.w / 2 - coin.x;
    const dy = popo.y + popo.h / 2 - coin.y;
    if (Math.hypot(dx, dy) < coin.r + 12) {
      coin.taken = true;
      state.score += 100;
      setStatus("コイン獲得");
    }
  }

  if (intersects(popo, flag)) {
    state.won = true;
    setStatus("クリア！おめでとう！");
  }

  resetIfOut();
  clampCamera();
}

function drawPopo(x, y) {
  ctx.fillStyle = "#f5d0a9";
  ctx.fillRect(x + 10, y + 4, 12, 10);

  ctx.fillStyle = "#2f5fda";
  ctx.fillRect(x + 6, y + 12, 20, 12);

  ctx.fillStyle = "#d63131";
  ctx.fillRect(x + 8, y, 16, 6);

  ctx.fillStyle = "#2f2f2f";
  ctx.fillRect(x + 8, y + 24, 6, 8);
  ctx.fillRect(x + 18, y + 24, 6, 8);
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#80d2ff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const camera = world.cameraX;

  ctx.fillStyle = "#b7f27f";
  for (const p of platforms) {
    ctx.fillRect(p.x - camera, p.y, p.w, p.h);
    ctx.fillStyle = "#7ab54a";
    ctx.fillRect(p.x - camera, p.y, p.w, 6);
    ctx.fillStyle = "#b7f27f";
  }

  ctx.fillStyle = "#f3d635";
  for (const coin of coins) {
    if (coin.taken) continue;
    ctx.beginPath();
    ctx.arc(coin.x - camera, coin.y, coin.r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#eeeeee";
  ctx.fillRect(flag.x - camera, flag.y, flag.w, flag.h);
  ctx.fillStyle = "#ff4d4d";
  ctx.fillRect(flag.x - camera + flag.w, flag.y + 12, 42, 24);

  drawPopo(popo.x - camera, popo.y);

  ctx.fillStyle = "#1d3354";
  ctx.font = "bold 20px sans-serif";
  ctx.fillText(`Score: ${state.score}`, 18, 30);
}

let lastTime = performance.now();
setStatus("ステージ開始！");

function frame(time) {
  const dt = Math.min((time - lastTime) / 1000, 1 / 30);
  lastTime = time;

  update(dt);
  draw();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
