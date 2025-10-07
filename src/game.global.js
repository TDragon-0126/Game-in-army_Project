(function(){
  const Game = window.Game = {};
  // ====== Config ======
  const W=960,H=540,FIXED_DT=1/60;

  // ====== RNG ======
  function XorShift32(seed){ let x = seed|0 || 123456789; return function(){ x^=x<<13; x^=x>>>17; x^=x<<5; return (x>>>0)/4294967296; }; }
  const RNG = { range:(r,a,b)=>a+(b-a)*r(), int:(r,a,b)=> a+((b-a+1)*r()|0), pick:(r,arr)=>arr[(arr.length*r())|0], chance:(r,p)=> r()<p };

  // ====== Input ======
  const Input={ k:{}, mx:0,my:0, m:false };
  addEventListener('keydown',e=>Input.k[e.code]=true);
  addEventListener('keyup',e=>Input.k[e.code]=false);
  addEventListener('mousedown',()=>Input.m=true);
  addEventListener('mouseup',()=>Input.m=false);

  // ====== Canvas ======
  const cvs = document.getElementById('game');
  const ctx = cvs.getContext('2d');
  cvs.addEventListener('mousemove',e=>{ const r=cvs.getBoundingClientRect(); Input.mx=e.clientX-r.left; Input.my=e.clientY-r.top; });

  // ====== Math util ======
  const TAU = Math.PI*2; const clamp=(v,a,b)=> v<a?a: v>b?b:v;

  // ====== Pool ======
  function makePool(factory, size){
    const raw=new Array(size); const free=[];
    for(let i=0;i<size;i++){ raw[i]=factory(); raw[i].alive=false; free.push(raw[i]); }
    return {
      spawn(init){ if(!free.length) return null; const o=free.pop(); init(o); o.alive=true; return o; },
      release(o){ if(!o.alive) return; o.alive=false; free.push(o); },
      each(fn){ for(const o of raw) if(o.alive) fn(o); },
      reset(){ free.length=0; for(const o of raw){ o.alive=false; free.push(o); } },
      raw, free
    };
  }


  // ====== Quadtree ======
  class Quad{
    constructor(x,y,w,h,cap=12,depth=0,maxDepth=6){ Object.assign(this,{x,y,w,h,cap,depth,maxDepth}); this.items=[]; this.divided=false; }
    _sub(){ const {x,y,w,h,depth,maxDepth,cap}=this; const hw=w/2, hh=h/2; this.nw=new Quad(x,y,hw,hh,cap,depth+1,maxDepth); this.ne=new Quad(x+hw,y,hw,hh,cap,depth+1,maxDepth); this.sw=new Quad(x,y+hh,hw,hh,cap,depth+1,maxDepth); this.se=new Quad(x+hw,y+hh,hw,hh,cap,depth+1,maxDepth); this.divided=true; }
    _contains(a, o){ return o.x>=a.x && o.x<a.x+a.w && o.y>=a.y && o.y<a.y+a.h; }
    insert(o){ if(!this._contains(this,o)) return false; if(this.items.length<this.cap || this.depth>=this.maxDepth){ this.items.push(o); return true; }
      if(!this.divided) this._sub(); return this.nw.insert(o)||this.ne.insert(o)||this.sw.insert(o)||this.se.insert(o);
    }
    query(range, out){ if(!(range.x>this.x+this.w || range.x+range.w<this.x || range.y>this.y+this.h || range.y+range.h<this.y)){
        for(const it of this.items) if(it.alive && it.x>=range.x && it.x<range.x+range.w && it.y>=range.y && it.y<range.y+range.h) out.push(it);
        if(this.divided){ this.nw.query(range,out); this.ne.query(range,out); this.sw.query(range,out); this.se.query(range,out); }
      }
      return out;
    }
    clear(){ this.items.length=0; if(this.divided){ this.nw.clear(); this.ne.clear(); this.sw.clear(); this.se.clear(); this.divided=false; }
    }
  }

  // ====== Entities ======
  const bullets = makePool(()=>({type:'b',alive:false,x:0,y:0,vx:0,vy:0,r:3,life:0,team:1,pierce:0, dmg:1}), 4000);
  const enemies = makePool(()=>({type:'e',alive:false,x:0,y:0,vx:0,vy:0,r:12,hp:3,maxHp:3, slowMul:1, slowTimer:0, t:0}), 800);
  const drops   = makePool(()=>({type:'d',alive:false,x:0,y:0,vx:0,vy:0,r:6,kind:'xp'}), 400);
  const player = {x:W/2,y:H/2,r:10,hp:5,maxHp:5, ifr:0, fireCD:0, speed:210, dmg:1, pierce:0};

  // ====== State ======
  const state = { seed: Date.now()|0, r:null, time:0, wave:1, xp:0, lvl:1, nextLvl:10, alive:true, score:0 };
  state.r = XorShift32(state.seed);

  // ====== Systems ======
  function update(dt){
    if(!state.alive) return;
    state.time += dt;
    inputSystem(dt); bulletSystem(dt); enemySystem(dt); collisionSystem(); cleanupSystem();
  }

  function inputSystem(dt){
    const ax = (Input.k['KeyD']?1:0) - (Input.k['KeyA']?1:0);
    const ay = (Input.k['KeyS']?1:0) - (Input.k['KeyW']?1:0);
    const len = Math.hypot(ax,ay)||1; player.x = clamp(player.x + (ax/len)*player.speed*dt, player.r, W-player.r);
    player.y = clamp(player.y + (ay/len)*player.speed*dt, player.r, H-player.r);

    // fire
    player.fireCD -= dt;
    if(Input.m && player.fireCD<=0){
      const dx = Input.mx - player.x, dy = Input.my - player.y; const L = Math.hypot(dx,dy)||1; const sp=420;
      bullets.spawn(o=>{ o.x=player.x; o.y=player.y; o.vx=dx/L*sp; o.vy=dy/L*sp; o.life=1.4; o.team=0; o.pierce=player.pierce; o.dmg=player.dmg; });
      player.fireCD = 0.12;
    }
    if(player.ifr>0) player.ifr-=dt;
  }

  function bulletSystem(dt){
    bullets.each(o=>{ o.x+=o.vx*dt; o.y+=o.vy*dt; o.life-=dt; if(o.x<-20||o.x>W+20||o.y<-20||o.y>H+20||o.life<=0) bullets.release(o); });
  }

  // enemySystem 관련 부분
  function enemySystem(dt){
    // enemySpawn 주기 설정
    if(state.time<600){
      // every 0.6s spawn small pack
      if(((state.time*10)|0)!==(((state.time-dt)*10)|0)) {
        const n = 3 + ((state.time/20)|0);
        for(let i=0;i<n;i++) spawnEnemy();
      }
    }
    // enemy에 대한 player 추격 로직
    enemies.each(e=>{
      e.t+=dt; // orbit move
      const baseSp = 40 + Math.min(140, state.time*0.8);
      const sp = baseSp * e.slowMul;
      const dx = player.x - e.x, dy = player.y - e.y; const L=Math.hypot(dx,dy)||1;
      e.vx = dx/L*sp; e.vy = dy/L*sp; e.x+=e.vx*dt; e.y+=e.vy*dt;
    });
  }

  function spawnEnemy(){
    const side = RNG.int(state.r,0,3);
    let x=0,y=0; if(side===0){x=RNG.range(state.r,0,W); y=-16;}else if(side===1){x=W+16; y=RNG.range(state.r,0,H);}else if(side===2){x=RNG.range(state.r,0,W); y=H+16;}else{ x=-16; y=RNG.range(state.r,0,H);}
    const hp = 3 + ((state.time/30)|0);
    enemies.spawn(e=>{ e.x=x; e.y=y; e.hp=hp; e.maxHp=hp; e.t=0; e.slowMul=1; e.slowTimer=0; });
  }

  // ====== Collision (Quadtree) ======
  const qt = new Quad(0,0,W,H,10,0,6);
  function collisionSystem(){
    qt.clear();
    enemies.each(e=>qt.insert(e));
    // enemy contact damage
    let touched = false;
    enemies.each(e=>{
      const dx = player.x - e.x, dy = player.y - e.y;
      const rr = player.r + e.r;
      if (dx*dx + dy*dy <= rr*rr) {
        touched = true;
        // 선택: 약한 밀어내기
        const L = Math.hypot(dx,dy)||1;
        const push = 60; // 가벼운 반발
        player.x += (dx/L) * (push*FIXED_DT);
        player.y += (dy/L) * (push*FIXED_DT);
      }
    });
    if (touched && player.ifr<=0) {
      player.hp--; 
      player.ifr = 0.6; // 무적 프레임
    }
    // bullets vs enemies
    bullets.each(b=>{
      if(b.team!==0) return;
      const range = {x:b.x-16,y:b.y-16,w:32,h:32};
      const cand=[]; qt.query(range,cand);
      for(const e of cand){
        const dx=e.x-b.x, dy=e.y-b.y; const rr=(e.r+b.r);
        if(dx*dx+dy*dy <= rr*rr){
          // 피해
          e.hp -= b.dmg;
          // 둔화 부여: 0.25s 동안 속도 0.8배
          e.slowMul = 0.8; 
          e.slowTimer = 0.25;

          // 관통 처리
          if(b.pierce>0){ b.pierce--; } else { bullets.release(b); }

          // 사망 처리
          if(e.hp<=0){
            enemies.release(e);
            state.score += 10;
            drops.spawn(d=>{
              d.x=e.x; d.y=e.y; d.vx=RNG.range(state.r,-20,20); d.vy=RNG.range(state.r,-30,-10); d.kind='xp';
            });
          }
          break;
        }
      }
    });
    // drops vs player
    drops.each(d=>{ const dx=player.x-d.x, dy=player.y-d.y; const rr=player.r+d.r; if(dx*dx+dy*dy<=rr*rr){ drops.release(d); state.xp++; if(state.xp>=state.nextLvl){ state.xp=0; state.lvl++; state.nextLvl = Math.floor(state.nextLvl*1.25); /* TODO: 레벨업 선택 UI */ } }
    });
  }

  function cleanupSystem(){
    drops.each(d=>{ d.vy += 30*FIXED_DT; d.x+=d.vx*FIXED_DT; d.y+=d.vy*FIXED_DT; if(d.y>H+20) drops.release(d); });
    if(player.hp<=0) state.alive=false;
  }

  // ====== Render ======
  function render(){
    ctx.clearRect(0,0,W,H);
    // background grid
    ctx.globalAlpha=0.15; ctx.strokeStyle='#223';
    for(let x=0;x<=W;x+=30){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
    for(let y=0;y<=H;y+=30){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
    ctx.globalAlpha=1;

    // drops
    ctx.fillStyle='#7dd3fc'; drops.each(d=>{ ctx.beginPath(); ctx.arc(d.x,d.y,d.r,0,TAU); ctx.fill(); });
    // bullets
    ctx.fillStyle='#fda4af'; bullets.each(b=>{ ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,TAU); ctx.fill(); });
    // enemies
    ctx.fillStyle='#a7f3d0'; enemies.each(e=>{ if(e.slowTimer>0) ctx.fillStyle='#86efac'; else ctx.fillStyle='#a7f3d0'; ctx.beginPath(); ctx.arc(e.x,e.y,e.r,0,TAU); ctx.fill(); });
    // player
    if(player.ifr>0) ctx.globalAlpha=0.5; ctx.fillStyle='#fef3c7'; ctx.beginPath(); ctx.arc(player.x,player.y,player.r,0,TAU); ctx.fill(); ctx.globalAlpha=1;

    // UI
    const info = document.getElementById('info');
    info.textContent = `HP ${player.hp}/${player.maxHp} | XP ${state.xp}/${state.nextLvl} | LV ${state.lvl} | Score ${state.score}`;

    // HUD
    const hud = document.getElementById('hud');
    hud.textContent = `seed:${state.seed} time:${state.time.toFixed(1)} ents(b/e/d):${bullets.raw.length-bullets.free.length}/${enemies.raw.length-enemies.free.length}/${drops.raw.length-drops.free.length}`;
  }

  // ====== Main loop ======
  let acc=0, last=performance.now();
  function tick(now){ acc += Math.min(0.25,(now-last)/1000); last=now; while(acc>=FIXED_DT){ update(FIXED_DT); acc-=FIXED_DT; } render(); requestAnimationFrame(tick); }

  // ====== Save/Load ======
  function save(){ const payload={ best:Math.max(state.score, (load()?.best||0)), unlocks:load()?.unlocks||[], options:load()?.options||{}, lastSeed:state.seed }; localStorage.setItem('rbh_save', JSON.stringify(payload)); }
  function load(){ try{ return JSON.parse(localStorage.getItem('rbh_save')||'null'); }catch(e){ return null; } }

  // ====== UI Bindings ======
  document.getElementById('btnStart').onclick=()=>{ resetRun(); };
  document.getElementById('btnExport').onclick=()=>{ const s=localStorage.getItem('rbh_save')||'{}'; navigator.clipboard?.writeText(s); alert('저장 JSON을 클립보드에 복사했습니다.'); };
  document.getElementById('btnImport').onclick=()=>{ const s=prompt('저장 JSON 붙여넣기'); if(s){ try{ localStorage.setItem('rbh_save', s); alert('불러오기 완료'); }catch(e){ alert('잘못된 JSON'); } } };

  function resetRun(){
  const seed=(load()?.lastSeed ?? (Date.now()|0));
  state.seed=seed; state.r=XorShift32(seed);
  state.time=0; state.wave=1; state.xp=0; state.lvl=1; state.nextLvl=10; state.alive=true; state.score=0;
  player.hp=player.maxHp;

  bullets.reset(); enemies.reset(); drops.reset();
}

  // autostart preview
  requestAnimationFrame(tick);
  // expose for console debug
  Game.state=state; Game.player=player; Game.enemies=enemies; Game.bullets=bullets; Game.drops=drops; Game.save=save; Game.load=load;
})();