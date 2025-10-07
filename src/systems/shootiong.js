import { angleTo, fromAngle } from '../math.js';


export function update(G, dt){
const p = G.player; const mouse = G.input.mouse;
if(G.input.mouse.down && p.fireCooldown<=0){
const ang = angleTo(p.x, p.y, mouse.x, mouse.y);
const dir = fromAngle(ang, p.stats.bulletSpeed);
const spawned = G.pools.bullets.spawn(b=>{
b.x=p.x; b.y=p.y; b.vx=dir.x; b.vy=dir.y; b.r=3; b.life=1.2; b.damage=p.stats.damage; b.pierce=p.stats.pierce;
});
if(spawned){ p.fireCooldown = 1/Math.max(1e-3, p.fireRate); }
}
}