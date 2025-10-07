// 간단 AABB-원 교차로 후보 줄이기
export class QuadTree{
constructor(bounds, cap=8, depth=0, maxDepth=6){ Object.assign(this,{bounds,cap,depth,maxDepth,pts:[],div:null}); }
insert(obj){ if(!intersects(this.bounds, obj)) return false;
if(this.pts.length < this.cap || this.depth>=this.maxDepth){ this.pts.push(obj); return true; }
if(!this.div) this.subdivide();
return this.div[0].insert(obj) || this.div[1].insert(obj) || this.div[2].insert(obj) || this.div[3].insert(obj);
}
query(range, out){ if(!intersects(this.bounds, range)) return out;
for(const p of this.pts){ if(intersects(range,p)) out.push(p); }
if(this.div){ this.div[0].query(range,out); this.div[1].query(range,out); this.div[2].query(range,out); this.div[3].query(range,out); }
return out;
}
subdivide(){ const {x,y,w,h}=this.bounds, hw=w/2, hh=h/2;
this.div=[
new QuadTree({x,y,w:hw,h:hh}, this.cap, this.depth+1, this.maxDepth),
new QuadTree({x:x+hw,y,w:hw,h:hh}, this.cap, this.depth+1, this.maxDepth),
new QuadTree({x,y:y+hh,w:hw,h:hh}, this.cap, this.depth+1, this.maxDepth),
new QuadTree({x:x+hw,y:y+hh,w:hw,h:hh}, this.cap, this.depth+1, this.maxDepth)
];
}
}
export function aabbFromCircle(c){ return { x:c.x-c.r, y:c.y-c.r, w:c.r*2, h:c.r*2 }; }
function intersects(a,b){ // a: AABB, b: 원 또는 AABB
if(b.r!=null){ // circle vs AABB
return !(b.x+b.r < a.x || b.x-b.r > a.x+a.w || b.y+b.r < a.y || b.y-b.r > a.y+a.h);
}
// AABB vs AABB
return !(b.x+b.w < a.x || b.x > a.x+a.w || b.y+b.h < a.y || b.y > a.y+a.h);
}