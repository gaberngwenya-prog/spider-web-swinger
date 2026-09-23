const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const installBtn = document.getElementById('installBtn');

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}));
}

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event;
  if (installBtn) installBtn.hidden = false;
});
if (installBtn) {
  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.hidden = true;
  });
}

const world = { width: 2200, groundY: 500, gravity: 0.55 };
const controls = { left: false, right: false, jump: false, web: false };
const platforms = [
  { x: 0, y: 500, w: 2200, h: 80 },
  { x: 190, y: 420, w: 210, h: 16 }, { x: 500, y: 330, w: 170, h: 16 },
  { x: 820, y: 390, w: 240, h: 16 }, { x: 1180, y: 300, w: 200, h: 16 },
  { x: 1490, y: 380, w: 240, h: 16 }, { x: 1810, y: 260, w: 300, h: 16 },
];
const anchors = [
  { x: 240, y: 350 }, { x: 610, y: 260 }, { x: 930, y: 300 },
  { x: 1280, y: 220 }, { x: 1600, y: 290 }, { x: 1930, y: 190 },
];
const goal = { x: 2085, y: 145, w: 52, h: 80 };
const player = { x: 90, y: 420, r: 18, vx: 0, vy: 0, ground: false, swinging: false, anchor: null, rope: 0, angle: 0, angular: 0, facing: 1 };
const camera = { x: 0 };

function clamp(n, min, max) { return Math.min(Math.max(n, min), max); }
function reset() { Object.assign(player, { x: 90, y: 420, vx: 0, vy: 0, ground: false, swinging: false, anchor: null, rope: 0, angle: 0, angular: 0, facing: 1 }); }

function nearestAnchor() {
  let result = null;
  for (const anchor of anchors) {
    const distance = Math.hypot(player.x - anchor.x, player.y - anchor.y);
    if (!result || distance < result.distance) result = { anchor, distance };
  }
  return result;
}

function attachWeb() {
  const nearest = nearestAnchor();
  // The old range was 120px, but the player starts about 165px from the first anchor.
  // A 230px range makes the first web reachable and is much easier on touch screens.
  if (!nearest || nearest.distance > 230) {
    statusEl.textContent = 'Move or jump closer to a yellow anchor';
    return;
  }
  player.anchor = nearest.anchor;
  player.rope = Math.max(70, nearest.distance);
  player.angle = Math.atan2(player.y - nearest.anchor.y, player.x - nearest.anchor.x);
  player.angular = 0.018;
  player.swinging = true;
  player.vx = 0;
  player.vy = 0;
  statusEl.textContent = 'Web attached — hold ◀ or ▶ to pump the swing';
}

function releaseWeb() {
  if (!player.swinging) return;
  const a = player.angle;
  player.swinging = false;
  player.anchor = null;
  player.vx = Math.cos(a) * 9;
  player.vy = Math.sin(a) * 9 + 1;
  player.rope = 0;
}

function update() {
  if (controls.web) {
    controls.web = false;
    if (player.swinging) releaseWeb(); else attachWeb();
  }
  if (controls.jump && player.ground && !player.swinging) {
    player.vy = -13;
    player.ground = false;
    controls.jump = false;
  }

  if (player.swinging) {
    if (controls.left) player.angular -= 0.025;
    if (controls.right) player.angular += 0.025;
    player.angular *= 0.99;
    player.angle += player.angular;
    const oldX = player.x;
    const oldY = player.y;
    player.x = player.anchor.x + Math.cos(player.angle) * player.rope;
    player.y = player.anchor.y + Math.sin(player.angle) * player.rope;
    player.vx = (player.x - oldX) * 0.8;
    player.vy = (player.y - oldY) * 0.8;
    if (player.y > world.groundY || player.x < 0 || player.x > world.width) releaseWeb();
  } else {
    const axis = (controls.left ? -1 : 0) + (controls.right ? 1 : 0);
    if (axis) { player.vx += axis * 0.65; player.facing = axis; } else player.vx *= 0.8;
    player.vx = clamp(player.vx, -7.5, 7.5);
    player.vy = clamp(player.vy + world.gravity, -18, 18);
    player.x += player.vx;
    player.y += player.vy;
    player.ground = false;
    for (const p of platforms) {
      const over = player.x + player.r > p.x && player.x - player.r < p.x + p.w;
      if (over && player.vy >= 0 && player.y + player.r >= p.y && player.y + player.r <= p.y + 26) {
        player.y = p.y - player.r; player.vy = 0; player.ground = true; break;
      }
    }
    if (player.y + player.r > world.groundY) { player.y = world.groundY - player.r; player.vy = 0; player.ground = true; }
    if (player.y > canvas.height + 60) reset();
    player.x = clamp(player.x, player.r, world.width - player.r);
  }
  camera.x = clamp(player.x - canvas.width * 0.38, 0, world.width - canvas.width);
  const won = player.x + player.r > goal.x && player.x - player.r < goal.x + goal.w && player.y + player.r > goal.y && player.y - player.r < goal.y + goal.h;
  if (won) statusEl.textContent = 'Mission complete!';
  else if (player.swinging) statusEl.textContent = 'Web attached — release Web to launch';
  else if (player.ground) statusEl.textContent = 'Jump near a yellow anchor, then tap Web';
}

function draw() {
  const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, '#14a2ff'); sky.addColorStop(0.55, '#bce6ff'); sky.addColorStop(1, '#edf8ff');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 24; i++) { const x = i * 110 - (camera.x * 0.5 % 110); const h = 70 + i % 6 * 40; ctx.fillStyle = 'rgba(29,50,76,.72)'; ctx.fillRect(x, world.groundY - h, 65, h); }
  for (const p of platforms) { ctx.fillStyle = '#29466d'; ctx.fillRect(p.x - camera.x, p.y, p.w, p.h); }
  for (const a of anchors) { ctx.fillStyle = '#ffde59'; ctx.beginPath(); ctx.arc(a.x - camera.x, a.y, 9, 0, Math.PI * 2); ctx.fill(); }
  if (player.swinging) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(player.anchor.x - camera.x, player.anchor.y); ctx.lineTo(player.x - camera.x, player.y); ctx.stroke(); }
  ctx.fillStyle = '#ffc857'; ctx.fillRect(goal.x - camera.x, goal.y, goal.w, goal.h);
  const x = player.x - camera.x, y = player.y;
  ctx.fillStyle = '#1a1f2f'; ctx.beginPath(); ctx.arc(x, y, player.r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#eb2f34'; ctx.fillRect(x - 8, y - 18, 16, 20);
  ctx.fillStyle = '#2ab7ff'; ctx.fillRect(x - 12, y + 2, 6, 18); ctx.fillRect(x + 6, y + 2, 6, 18);
}

function loop() { update(); draw(); requestAnimationFrame(loop); }
function key(code, down) {
  if (code === 'ArrowLeft' || code === 'KeyA') controls.left = down;
  if (code === 'ArrowRight' || code === 'KeyD') controls.right = down;
  if (down && (code === 'Space' || code === 'ArrowUp' || code === 'KeyW')) controls.jump = true;
  if (down && (code === 'KeyS' || code === 'ShiftLeft' || code === 'ShiftRight')) controls.web = true;
}
document.addEventListener('keydown', e => { key(e.code, true); if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault(); });
document.addEventListener('keyup', e => key(e.code, false));

document.querySelectorAll('.control-btn').forEach(button => {
  const type = button.dataset.control;
  const press = e => { e.preventDefault(); if (type === 'left') controls.left = true; if (type === 'right') controls.right = true; if (type === 'jump') controls.jump = true; if (type === 'swing') controls.web = true; };
  const release = () => { if (type === 'left') controls.left = false; if (type === 'right') controls.right = false; };
  button.addEventListener('pointerdown', press, { passive: false });
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('pointerleave', release);
});

reset();
requestAnimationFrame(loop);
