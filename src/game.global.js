(function(){
  const Game = window.Game = {};
  // ====== Config ======
  const W=960,H=540,FIXED_DT=1/60;
  const MAX_ENEMIES        = 60;   // 동시 적 상한
  const SPAWN_BASE_COOLDOWN= 1.2;  // 기본 스폰 주기(초) 1.2s
  const SPAWN_MIN_COOLDOWN = 0.6;  // 최소 주기(난이도 상승 시 하한)
  const SPAWN_PACK_BASE    = 2;    // 한 번에 스폰 수 시작값
  const SPAWN_PACK_PER_MIN = 1;    // 분당 스폰 수 증가량
  const SPAWN_GRACE_TIME   = 3.0;
  const ENEMY_ACCEL = 600;
  const SEP_PAD = 2;          // 약간의 겹침 허용
  const SEP_ITER_AABB = 24;   // 이 범위 안만 이웃 검사

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
  const state = { seed: Date.now()|0, r:null, time:0, wave:1, xp:0, lvl:1, nextLvl:10, alive:true, score:0, spawnCD: 0 };
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
    // ---- Spawn Scheduler ----
  state.spawnCD -= dt;

  // 동시 적 수 체크
  const activeEnemies = enemies.raw.length - enemies.free.length;
  if (activeEnemies < MAX_ENEMIES && state.time > SPAWN_GRACE_TIME && state.spawnCD <= 0){
    // 경과 시간 기반 난이도 스케일
    const minutes = Math.floor(state.time / 60);

    // 한 번에 스폰 수 = 기본 + 분당 증가
    const pack = Math.min(5, SPAWN_PACK_BASE + SPAWN_PACK_PER_MIN * minutes); // 상한 5

    // 스폰 실행
    for(let i=0;i<pack;i++){
      if (enemies.free.length === 0) break; // 풀 고갈 보호
      spawnEnemy();
    }

    // 다음 스폰까지의 쿨다운: 시간이 지날수록 조금 빨라짐
    const cd = Math.max(SPAWN_MIN_COOLDOWN, SPAWN_BASE_COOLDOWN - minutes * 0.1);
    state.spawnCD = cd;
  }
    // enemy에 대한 player 추격 로직
    enemies.each(e=>{
      e.t += dt;
      if (e.slowTimer > 0){ e.slowTimer -= dt; if (e.slowTimer <= 0) e.slowMul = 1; }
      if (e.hitTimer  > 0){ e.hitTimer  -= dt; }

      const baseSp = 70 + Math.min(110, state.time*0.8);
      const sp = baseSp * e.slowMul;  // 목표 속도
      const dx = player.x - e.x, dy = player.y - e.y;
      const L = Math.hypot(dx,dy)||1;
      const vxTarget = dx/L * sp, vyTarget = dy/L * sp;

      // 가속 한계로 목표속도에 수렴
      const ax = Math.max(Math.min(vxTarget - e.vx, ENEMY_ACCEL*dt), -ENEMY_ACCEL*dt);
      const ay = Math.max(Math.min(vyTarget - e.vy, ENEMY_ACCEL*dt), -ENEMY_ACCEL*dt);
      e.vx += ax; e.vy += ay;

      // 속도 캡(수학적 최대 sp 유지)
      const vL = Math.hypot(e.vx,e.vy);
      if (vL > sp){ e.vx = e.vx/vL * sp; e.vy = e.vy/vL * sp; }

      e.x += e.vx * dt; e.y += e.vy * dt;
    });
    qt.clear();
    enemies.each(e=>qt.insert(e))
    enemies.each(e=>{
      const cand = [];
      qt.query({x:e.x-SEP_ITER_AABB, y:e.y-SEP_ITER_AABB, w:SEP_ITER_AABB*2, h:SEP_ITER_AABB*2}, cand);
      for(const n of cand){
        if(n===e) continue;
        const dx = e.x - n.x, dy = e.y - n.y;
        const dist = Math.hypot(dx,dy);
        const minDist = (e.r + n.r) - SEP_PAD;   // 목표 최소거리
        if(dist>0 && dist < minDist){
          const push = (minDist - dist) * 0.5;   // 반반 분배
          const nx = dx/dist, ny = dy/dist;
          e.x += nx * push; e.y += ny * push;
          n.x -= nx * push; n.y -= ny * push;
        }
      }
    })
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
            drops.spawn(d=>{ d.x=e.x; d.y=e.y; d.vx=0; d.vy=0; d.kind='xp'; });
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
    // --- Drops update: 고정 + 자기장 흡입만 ---
    const MAG_R = 30;      // 흡입 시작 반경
    const MAG_ACC = 10000;    // 가속도
    const MAG_MAX = 2000;    // 최대 속도

    drops.each(d=>{
      const dx = player.x - d.x, dy = player.y - d.y;
      const dist = Math.hypot(dx, dy);

      if (dist < MAG_R) {
        // 반경 안에서만 끌림
        const ax = (dx / (dist || 1)) * MAG_ACC * FIXED_DT;
        const ay = (dy / (dist || 1)) * MAG_ACC * FIXED_DT;
        d.vx = Math.max(Math.min(d.vx + ax, MAG_MAX), -MAG_MAX);
        d.vy = Math.max(Math.min(d.vy + ay, MAG_MAX), -MAG_MAX);
        d.x += d.vx * FIXED_DT;
        d.y += d.vy * FIXED_DT;
      }
      // dist ≥ MAG_R이면 아무 것도 하지 않음 → 그 자리 고정
    });
    // gameover
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
  state.spawnCD = SPAWN_BASE_COOLDOWN;
}

  // autostart preview
  requestAnimationFrame(tick);
  // expose for console debug
  Game.state=state; Game.player=player; Game.enemies=enemies; Game.bullets=bullets; Game.drops=drops; Game.save=save; Game.load=load;
})();