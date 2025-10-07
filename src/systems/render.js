let fps=0, _last=performance.now();
export function draw(G, alpha){
const now=performance.now(); fps = 1000/Math.max(1, now-_last); _last=now;
const ctx = G.ctx; const dpr = window.devicePixelRatio||1;
const W = G.canvas.width/dpr; const H = G.canvas.height/dpr;
// 배경
ctx.setTransform(dpr,0,0,dpr,0,0);
ctx.clearRect(0,0,W,H);
ctx.fillStyle = '#0b0b0f'; ctx.fillRect(0,0,W,H);


// 그리드(진단용)
ctx.globalAlpha = 0.1; ctx.strokeStyle = '#ffffff';
for(let x=0;x<W;x+=48){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
for(let y=0;y<H;y+=48){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
ctx.globalAlpha = 1;


// 적
ctx.fillStyle = '#ef4444';
for(const e of G.pools.enemies.arr){ if(!e.alive) continue; circle(ctx, e.x, e.y, e.r); }


// 총알
ctx.fillStyle = '#e5e7eb';
for(const b of G.pools.bullets.arr){ if(!b.alive) continue; circle(ctx, b.x, b.y, b.r); }


// 플레이어
ctx.fillStyle = '#22c55e'; circle(ctx, G.player.x, G.player.y, G.player.r);
ctx.strokeStyle = '#064e3b'; ctx.lineWidth = 2; ring(ctx, G.player.x, G.player.y, G.player.r+3);


// 조준선
ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.moveTo(G.player.x, G.player.y); ctx.lineTo(G.input.mouse.x, G.input.mouse.y); ctx.stroke();


// HUD 텍스트
ctx.fillStyle = '#cbd5e1'; ctx.font = '12px ui-monospace, monospace';
ctx.fillText(`FPS:${fps.toFixed(0)} seed:${G.seed} score:${G.score}`, 8, 16);
ctx.fillText(`pos:${G.player.x.toFixed(0)},${G.player.y.toFixed(0)} mouse:${G.input.mouse.x.toFixed(0)},${G.input.mouse.y.toFixed(0)}`, 8, 32);
}


function circle(ctx,x,y,r){ ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); }
function ring(ctx,x,y,r){ ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.stroke(); }