export function draw(G, alpha){
const ctx = G.ctx; const W = G.canvas.width/(window.devicePixelRatio||1); const H = G.canvas.height/(window.devicePixelRatio||1);
// 배경 클리어
ctx.clearRect(0,0,W,H);
ctx.fillStyle = '#0b0b0f'; ctx.fillRect(0,0,W,H);


// 적
ctx.fillStyle = '#ef4444';
for(const e of G.pools.enemies.arr){ if(!e.alive) continue; circle(ctx, e.x, e.y, e.r); }


// 총알
ctx.fillStyle = '#e5e7eb';
for(const b of G.pools.bullets.arr){ if(!b.alive) continue; circle(ctx, b.x, b.y, b.r); }


// 플레이어
ctx.fillStyle = '#22c55e'; circle(ctx, G.player.x, G.player.y, G.player.r);


// 간단 조준선
ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.moveTo(G.player.x, G.player.y); ctx.lineTo(G.input.mouse.x, G.input.mouse.y); ctx.stroke();
}


function circle(ctx,x,y,r){ ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); }