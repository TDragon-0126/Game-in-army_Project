// PRNG: mulberry32 — 재현성 보장
export function mulberry32(seed){
let t = seed >>> 0;
return function(){
t += 0x6D2B79F5;
let x = Math.imul(t ^ (t >>> 15), 1 | t);
x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
};
}

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a,b,t)=> a + (b-a)*t;
export const randRange = (rng, a, b) => a + rng() * (b-a);
export const randInt = (rng, a, b) => a + Math.floor(rng() * (b-a+1));
export function angleTo(ax, ay, bx, by){ return Math.atan2(by-ay, bx-ax); }
export function fromAngle(theta, len=1){ return { x: Math.cos(theta)*len, y: Math.sin(theta)*len }; }
export function dist2(ax,ay,bx,by){ const dx=ax-bx, dy=ay-by; return dx*dx + dy*dy; }