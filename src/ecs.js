export function makePool(capacity, factory){
const arr = Array.from({length:capacity}, factory);
const dead = arr.slice();
function spawn(init){ if(!dead.length) return null; const e = dead.pop(); init(e); e.alive = true; return e; }
function kill(e){ if(!e.alive) return; e.alive=false; dead.push(e); }
return { arr, dead, spawn, kill };
}