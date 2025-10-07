import { mulberry32, randRange, clamp } from './math.js';
import { setupInput } from './input.js';
import { makePool } from './ecs.js';
import { QuadTree, aabbFromCircle } from './quadtree.js';
import * as Movement from './systems/movement.js';
import * as Shooting from './systems/shooting.js';
import * as Collision from './systems/collision.js';
import * as Render from './systems/render.js';
import * as Waves from './systems/waves.js';
import * as Drops from './systems/drops.js';

// ----- 캔버스 & 해상도 -----
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const hud = document.getElementById('hud');

// DPI 스케일 적용
function fit() {
const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
const w = Math.floor(window.innerWidth);
const h = Math.floor(window.innerHeight);
const targetW = 960; const targetH = 540; // 기본 해상도 비율 16:9
// 화면에 맞춰 최대한 크게, 비율 유지
const scale = Math.min(w / targetW, h / targetH);
const vw = Math.floor(targetW * scale); const vh = Math.floor(targetH * scale);
canvas.style.width = vw + 'px';
canvas.style.height = vh + 'px';
canvas.width = Math.floor(targetW * dpr);
canvas.height = Math.floor(targetH * dpr);
ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // 좌표계를 CSS 픽셀 기준으로 맞춤
}
window.addEventListener('resize', fit);
fit();

// ----- RNG 시드 -----
function seedFromURLorDefault() {
const url = new URL(window.location.href);
const s = url.searchParams.get('seed');
if (s) return Number(s) >>> 0;
const saved = Number(localStorage.getItem('lastSeed')) || 0;
if (saved) return saved >>> 0;
const gen = (Date.now() & 0xffffffff) >>> 0;
localStorage.setItem('lastSeed', String(gen));
return gen;
}
const seed = seedFromURLorDefault();
const rng = mulberry32(seed);

// ----- 입력 -----
const input = setupInput(canvas);

// ----- 풀 구성 -----
const bullets = makePool(2000, () => ({
alive:false, x:0, y:0, vx:0, vy:0, r:3, life:0, damage:1, pierce:0
}));
const enemies = makePool(200, () => ({
alive:false, x:0, y:0, vx:0, vy:0, r:12, hp:3, speed:70
}));
const drops = makePool(128, () => ({ alive:false, x:0, y:0, r:6, type:'xp' }));

// ----- 기본 플레이어 -----
const player = {
x: canvas.width / (window.devicePixelRatio||1) / 2,
y: canvas.height / (window.devicePixelRatio||1) / 2,
r: 10,
speed: 240,
hp: 5,
fireRate: 6, // 초당
fireCooldown: 0,
stats: { damage:1, bulletSpeed: 640, pierce:0 }
};

// ----- 게임 상태 -----
const G = {
seed, rng, input, canvas, ctx, hud,
player,
pools: { bullets, enemies, drops },
time: 0, elapsed: 0,
score: 0, waveTime: 0,
quadtree: null,
};

// ----- 루프: 고정 업데이트, 가변 렌더 -----
let last = 0, acc = 0; const FIXED = 1000/60;
function update(dt) {
G.time += dt; G.waveTime += dt; G.player.fireCooldown = Math.max(0, G.player.fireCooldown - dt);


// 시스템 실행 순서
Movement.update(G, dt);
Shooting.update(G, dt);
Waves.update(G, dt);


// 충돌 전 트리 리빌드
G.quadtree = new QuadTree({ x:0, y:0, w:canvas.width/(window.devicePixelRatio||1), h:canvas.height/(window.devicePixelRatio||1) }, 8, 0, 6);
for(const e of enemies.arr) if (e.alive) G.quadtree.insert(e);
Collision.update(G, dt);


Drops.update(G, dt);
}
function render(alpha) {
Render.draw(G, alpha);
hud.textContent = `seed:${G.seed} score:${G.score}`;
}
function frame(t){
const delta = Math.min(32, t - (last||t)); last = t; acc += delta;
while(acc >= FIXED){ update(FIXED/1000); acc -= FIXED; }
render(acc/FIXED);
requestAnimationFrame(frame);
}
requestAnimationFrame(frame);


// 디버그 노출 (원하시면 제거)
window.G = G;