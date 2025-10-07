import { randRange } from '../math.js';


let spawnTimer = 0;
export function update(G, dt){
spawnTimer -= dt;
const t = G.time;
const interval = Math.max(0.2, 1.2 - t*0.02); // 시간 지날수록 더 자주 스폰
if(spawnTimer <= 0){
spawnTimer = interval;
spawnEnemy(G);
}
}


function spawnEnemy(G){
const W = G.canvas.width/(window.devicePixelRatio||1); const H = G.canvas.height/(window.devicePixelRatio||1);
const margin = 24; // 화면 밖 스폰
const edge = Math.floor(G.rng()*4);
let x,y; if(edge===0){ x = randRange(G.rng,-margin, W+margin); y = -margin; }
else if(edge===1){ x = W+margin; y = randRange(G.rng,-margin, H+margin); }
else if(edge===2){ x = randRange(G.rng,-margin, W+margin); y = H+margin; }
else { x = -margin; y = randRange(G.rng,-margin, H+margin); }


const hpScale = 1 + G.time*0.05;
const spScale = 70 + G.time*2;
G.pools.enemies.spawn(e=>{ e.x=x; e.y=y; e.hp = Math.round(3*hpScale); e.speed = spScale; e.r = 12; });
}