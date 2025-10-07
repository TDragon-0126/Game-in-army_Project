// 이동과 수명 감소 등 기본 처리
export function update(G, dt){
const p = G.player;
const k = G.input.keys;
let ax = 0, ay = 0;
if(k['KeyW']||k['ArrowUp']) ay -= 1;
if(k['KeyS']||k['ArrowDown']) ay += 1;
if(k['KeyA']||k['ArrowLeft']) ax -= 1;
if(k['KeyD']||k['ArrowRight']) ax += 1;
if(ax||ay){ const len = Math.hypot(ax,ay); ax/=len; ay/=len; }
p.x += ax * p.speed * dt;
p.y += ay * p.speed * dt;
// 화면 경계 클램프
const W = G.canvas.width/(window.devicePixelRatio||1);
const H = G.canvas.height/(window.devicePixelRatio||1);
p.x = Math.max(p.r, Math.min(W-p.r, p.x));
p.y = Math.max(p.r, Math.min(H-p.r, p.y));


// 총알 이동과 수명
for(const b of G.pools.bullets.arr){ if(!b.alive) continue; b.x += b.vx*dt; b.y += b.vy*dt; b.life -= dt; if(b.life<=0) G.pools.bullets.kill(b); }
// 적 이동
for(const e of G.pools.enemies.arr){ if(!e.alive) continue; const dx = G.player.x - e.x, dy = G.player.y - e.y; const d = Math.hypot(dx,dy)||1; const sp = e.speed; e.vx = dx/d*sp; e.vy = dy/d*sp; e.x += e.vx*dt; e.y += e.vy*dt; }
}