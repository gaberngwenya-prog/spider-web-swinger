const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const installBtn = document.getElementById('installBtn');

let deferredPrompt = null;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  });
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event;
  installBtn.hidden = false;
});

installBtn.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  if (choice.outcome === 'accepted') {
    statusEl.textContent = 'App installed';
  }
  deferredPrompt = null;
  installBtn.hidden = true;
});

const world = {
  width: 2200,
  height: canvas.height,
  gravity: 0.55,
  groundY: 500,
};

const controls = {
  left: false,
  right: false,
  jumpQueued: false,
  swingQueued: false,
};

const platforms = [
  { x: 0, y: 500, w: 2200, h: 80 },
  { x: 190, y: 420, w: 210, h: 16 },
  { x: 500, y: 330, w: 170, h: 16 },
  { x: 820, y: 390, w: 240, h: 16 },
  { x: 1180, y: 300, w: 200, h: 16 },
  { x: 1490, y: 380, w: 240, h: 16 },
  { x: 1810, y: 260, w: 300, h: 16 },
];

const anchors = [
  { x: 240, y: 350 },
  { x: 610, y: 260 },
  { x: 930, y: 300 },
  { x: 1280, y: 220 },
  { x: 1600, y: 290 },
  { x: 1930, y: 190 },
];

const goal = { x: 2085, y: 145, w: 52, h: 80 };

const player = {
  x: 90,
  y: 420,
  radius: 18,
  vx: 0,
  vy: 0,
  onGround: false,
  swinging: false,
  anchor: null,
  ropeLength: 0,
  swingAngle: 0,
  swingVelocity: 0,
  facing: 1,
};

const camera = { x: 0 };

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function resetPlayer() {
  player.x = 90;
  player.y = 420;
  player.vx = 0;
  player.vy = 0;
  player.onGround = false;
  player.swinging = false;
  player.anchor = null;
  player.ropeLength = 0;
  player.swingAngle = 0;
  player.swingVelocity = 0;
  player.facing = 1;
}

function attachToNearestAnchor() {
  let best = null;
  let bestDist = Infinity;

  for (const anchor of anchors) {
    const dx = player.x - anchor.x;
    const dy = player.y - anchor.y;
    const dist = Math.hypot(dx, dy);

    if (dist < bestDist) {
      bestDist = dist;
      best = { anchor, dist };
    }
  }

  if (best && best.dist < 120 && !player.swinging) {
    player.anchor = best.anchor;
    player.ropeLength = best.dist || 120;
    player.swingAngle = Math.atan2(player.y - best.anchor.y, player.x - best.anchor.x);
    player.swingVelocity = 0;
    player.swinging = true;
    player.vx = 0;
    player.vy = 0;
    return true;
  }

  return false;
}

function releaseSwing() {
  if (!player.swinging) return;

  const angle = player.swingAngle;
  const releaseSpeed = 8.5;

  player.swinging = false;
  player.anchor = null;
  player.vx = Math.cos(angle) * releaseSpeed;
  player.vy = Math.sin(angle) * releaseSpeed + 1.4;
  player.ropeLength = 0;
  if (controls.left) player.vx -= 1.6;
  if (controls.right) player.vx += 1.6;
}

function handleMovement() {
  if (player.swinging) {
    const anchor = player.anchor;
    if (!anchor) {
      player.swinging = false;
      return;
    }

    if (controls.left) player.swingVelocity -= 0.02;
    if (controls.right) player.swingVelocity += 0.02;

    player.swingVelocity *= 0.985;
    player.swingAngle += player.swingVelocity;

    const prevX = player.x;
    const prevY = player.y;
    player.x = anchor.x + Math.cos(player.swingAngle) * player.ropeLength;
    player.y = anchor.y + Math.sin(player.swingAngle) * player.ropeLength;
    player.vx = (player.x - prevX) * 0.7;
    player.vy = (player.y - prevY) * 0.7;

    if (player.y > world.groundY || player.x < 0 || player.x > world.width) {
      player.y = Math.min(player.y, world.groundY - 10);
      player.swinging = false;
      player.anchor = null;
    }

    return;
  }

  const moveAxis = (controls.left ? -1 : 0) + (controls.right ? 1 : 0);
  if (moveAxis !== 0) {
    player.vx += moveAxis * 0.66;
    player.facing = moveAxis;
  } else {
    player.vx *= 0.8;
  }

  player.vx = clamp(player.vx, -7.2, 7.2);
  player.vy += world.gravity;
  player.vy = clamp(player.vy, -18, 18);

  player.x += player.vx;
  player.y += player.vy;

  player.onGround = false;

  for (const platform of platforms) {
    const withinX = player.x + player.radius > platform.x && player.x - player.radius < platform.x + platform.w;
    const falling = player.vy >= 0;
    const touchingTop = player.y + player.radius >= platform.y && player.y + player.radius <= platform.y + 26;

    if (withinX && falling && touchingTop) {
      player.y = platform.y - player.radius;
      player.vy = 0;
      player.onGround = true;
      break;
    }
  }

  if (player.y + player.radius > world.groundY) {
    player.y = world.groundY - player.radius;
    player.vy = 0;
    player.onGround = true;
  }

  if (player.y > canvas.height + 60) {
    resetPlayer();
  }

  if (player.x < player.radius) {
    player.x = player.radius;
    player.vx = 0;
  }

  if (player.x > world.width - player.radius) {
    player.x = world.width - player.radius;
    player.vx = 0;
  }

  if (player.onGround && controls.jumpQueued) {
    player.vy = -12.6;
    player.onGround = false;
  }
}

function updateCamera() {
  const target = player.x - canvas.width * 0.38;
  camera.x = clamp(target, 0, world.width - canvas.width);
}

function update() {
  if (controls.jumpQueued && !player.swinging) {
    if (player.onGround) {
      player.vy = -12.6;
      player.onGround = false;
    }
    controls.jumpQueued = false;
  }

  if (controls.swingQueued) {
    if (player.swinging) {
      releaseSwing();
    } else {
      attachToNearestAnchor();
    }
    controls.swingQueued = false;
  }

  handleMovement();
  updateCamera();

  const reachedGoal =
    player.x + player.radius > goal.x &&
    player.x - player.radius < goal.x + goal.w &&
    player.y + player.radius > goal.y &&
    player.y - player.radius < goal.y + goal.h;

  if (reachedGoal) {
    statusEl.textContent = 'Mission complete!';
  } else if (player.swinging) {
    statusEl.textContent = 'Swinging through the city';
  } else if (player.onGround) {
    statusEl.textContent = 'Stay mobile and keep climbing';
  } else {
    statusEl.textContent = 'Swing to the skyline';
  }
}

function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, '#14a2ff');
  sky.addColorStop(0.55, '#bce6ff');
  sky.addColorStop(1, '#edf8ff');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 18; i++) {
    const x = i * 70 - (camera.x * 0.2) % 130;
    const y = 60 + (i % 5) * 28;
    const size = 2 + (i % 3);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(x, y, size, size);
  }

  const cityOffset = -camera.x * 0.5;
  for (let i = 0; i < 24; i++) {
    const x = i * 110 + (cityOffset % 110);
    const height = 70 + (i % 6) * 40;
    const y = world.groundY - height;
    ctx.fillStyle = 'rgba(29, 50, 76, 0.72)';
    ctx.fillRect(x, y, 65, height);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    for (let j = 0; j < 5; j++) {
      ctx.fillRect(x + 12 + j * 12, y + 12, 5, height - 26);
    }
  }
}

function drawPlatforms() {
  for (const p of platforms) {
    const x = p.x - camera.x;
    const y = p.y;
    const grad = ctx.createLinearGradient(x, y, x, y + p.h);
    grad.addColorStop(0, '#3b5c88');
    grad.addColorStop(1, '#1e304f');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, p.w, p.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.strokeRect(x, y, p.w, p.h);
  }
}

function drawAnchors() {
  for (const anchor of anchors) {
    const x = anchor.x - camera.x;
    const y = anchor.y;

    ctx.beginPath();
    ctx.fillStyle = '#ffde59';
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();

    if (player.swinging && player.anchor === anchor) {
      ctx.beginPath();
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = '#e8f2ff';
      ctx.moveTo(anchor.x - camera.x, anchor.y);
      ctx.lineTo(player.x - camera.x, player.y);
      ctx.stroke();
    }
  }
}

function drawGoal() {
  const x = goal.x - camera.x;
  const y = goal.y;
  ctx.fillStyle = '#ffc857';
  ctx.fillRect(x, y, goal.w, goal.h);
  ctx.fillStyle = '#fff4cf';
  ctx.fillRect(x + 10, y + 10, goal.w - 20, goal.h - 20);
}

function drawPlayer() {
  const x = player.x - camera.x;
  const y = player.y;

  ctx.save();
  ctx.translate(x, y);

  if (player.facing < 0) {
    ctx.scale(-1, 1);
  }

  ctx.fillStyle = '#1a1f2f';
  ctx.beginPath();
  ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#eb2f34';
  ctx.fillRect(-8, -18, 16, 20);

  ctx.fillStyle = '#0d1320';
  ctx.fillRect(-10, -22, 5, 18);
  ctx.fillRect(5, -22, 5, 18);

  ctx.fillStyle = '#2ab7ff';
  ctx.fillRect(-12, 2, 6, 18);
  ctx.fillRect(6, 2, 6, 18);

  ctx.fillStyle = '#f7d95c';
  ctx.fillRect(-3, -24, 6, 6);

  ctx.restore();
}

function draw() {
  drawBackground();
  drawPlatforms();
  drawGoal();
  drawAnchors();
  drawPlayer();
}

let lastTime = 0;
function gameLoop(time) {
  const delta = (time - lastTime) / 16.67 || 1;
  lastTime = time;

  update();
  draw();
  requestAnimationFrame(gameLoop);
}

function setKeyState(code, pressed) {
  if (code === 'ArrowLeft' || code === 'KeyA') controls.left = pressed;
  if (code === 'ArrowRight' || code === 'KeyD') controls.right = pressed;
  if (code === 'Space' || code === 'KeyW' || code === 'ArrowUp') {
    if (pressed) controls.jumpQueued = true;
  }
  if (code === 'KeyS' || code === 'ShiftLeft' || code === 'ShiftRight') {
    if (pressed) controls.swingQueued = true;
  }
}

document.addEventListener('keydown', (event) => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
    event.preventDefault();
  }
  setKeyState(event.code, true);
});

document.addEventListener('keyup', (event) => {
  if (event.code === 'ArrowLeft' || event.code === 'KeyA') controls.left = false;
  if (event.code === 'ArrowRight' || event.code === 'KeyD') controls.right = false;
});

document.querySelectorAll('.control-btn').forEach((button) => {
  const type = button.dataset.control;
  const queueAction = () => {
    if (type === 'left') controls.left = true;
    if (type === 'right') controls.right = true;
    if (type === 'jump') controls.jumpQueued = true;
    if (type === 'swing') controls.swingQueued = true;
  };

  const releaseAction = () => {
    if (type === 'left') controls.left = false;
    if (type === 'right') controls.right = false;
  };

  button.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    queueAction();
  });

  button.addEventListener('pointerup', releaseAction);
  button.addEventListener('pointerleave', releaseAction);
});

resetPlayer();
requestAnimationFrame(gameLoop);
