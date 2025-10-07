import { dist2 } from '../math.js';
import { aabbFromCircle } from '../quadtree.js';


export function update(G, dt){
    const { bullets, enemies } = G.pools;
    for(const b of bullets.arr){ if(!b.alive) continue;
        const range = aabbFromCircle(b);
        const cands = G.quadtree.query(range, []);
        for(const e of cands){ if(!e.alive) continue; // 원-원 판정
            const r = b.r + e.r; if(dist2(b.x,b.y,e.x,e.y) <= r*r){
                e.hp -= b.damage; b.pierce -= 1;
                if(e.hp <= 0){ enemies.kill(e); G.score += 1; }
                if(b.pierce < 0){ bullets.kill(b); break; }
            }
        }
    }
}