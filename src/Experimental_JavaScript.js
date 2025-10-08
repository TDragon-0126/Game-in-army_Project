/* =====================================================
   Roguelite Bullet Hell — game.global.js (섹터 정리본)
   섹터 구분: [dev_option][config][rng][input][state][weapon][items]
            [pool][quad][entity:bullet][entity:enemy][entity:drop]
            [functions][systems][render][bootstrap]
   ===================================================== */
(function(){

  /* ===================== [dev_option] ===================== */
  async function toggleDev(on){
  const want = (on!==undefined) ? on : !state.devOn;
  const el = document.getElementById('dev');
  if(!el) return;

  if(want){
    // 잠금 확인·검증(사용 중인 해시 검증 넣으세요)
    if(!state.devUnlocked){
      const pwd = prompt('개발자 모드 비밀번호를 입력하세요.');
      if(!pwd) return;
      // ...해시 검증 통과 시:
      state.devUnlocked = true;
    }
    state.devOn = true;
    el.style.display = 'block';
    fillDev();

    // ▶ 일시정지 진입
    if(!state.paused){ state.devHold = true; state.paused = true; }
    // 안전 보정
    player.ifr = Math.max(player.ifr, 0.3);

  }else{
    state.devOn = false;
    el.style.display = 'none';

    // ▶ 개발자 모드로 멈췄던 경우만 재개
    if(state.devHold){
      state.devHold = false;
      state.paused = false;
      state.resumeDelay = 0.3;           // 재개 간극
      player.ifr = Math.max(player.ifr, 0.3); // 재개 무적
    }
  }
}

  addEventListener('keydown', (e)=>{ if(e.code==='F1'){ e.preventDefault(); toggleDev(); }});
  document.getElementById('devClose')?.addEventListener('click', ()=>toggleDev(false));

  function fillDev(){
    // 값 반영
    const g=(id)=>document.getElementById(id);
    g('p_hp').value     = player.hp;
    g('p_maxhp').value  = player.maxHp;
    g('p_dmg').value    = player.dmg;
    g('p_rate').value   = player.fireRate.toFixed(2);

    g('w_lin').value    = weapon.linearLv;
    g('w_rad').value    = weapon.radialLv;
    g('w_pierce').value = weapon.pierceLv;
    g('w_expl').value   = weapon.explosiveLv;

    g('d_maxE').value   = DIFF.maxEnemiesEnd;
    g('d_cd_base').value= DIFF.spawnBaseCD;
    g('d_cd_min').value = DIFF.spawnMinCD;
    g('d_pack').value   = DIFF.packBase;
    g('d_spd').value    = DIFF.enemyBaseSp;
    g('d_hp').value     = DIFF.hpBase;
  }

  function bindDev(){
    const g=(id)=>document.getElementById(id);
    if(!g('dev')) return; // 패널 미존재 시 스킵

    // Player
    g('p_heal').onclick = ()=>{ player.hp = player.maxHp; };
    g('p_hp').onchange = (e)=>{ player.hp = Math.max(1, Math.min(player.maxHp, +e.target.value||player.hp)); };
    g('p_maxhp').onchange = (e)=>{ player.maxHp = Math.max(1, +e.target.value||player.maxHp); player.hp = Math.min(player.hp, player.maxHp); };
    g('p_dmg').onchange = (e)=>{ player.dmg = Math.max(1, +e.target.value||player.dmg); };
    g('p_rate').onchange= (e)=>{ const v=Math.max(0.03, +e.target.value||player.fireRate); player.fireRate=v; };

    // Weapon
    g('w_lin').onchange   = (e)=>{ weapon.linearLv   = Math.max(0, +e.target.value|0); };
    g('w_rad').onchange   = (e)=>{ weapon.radialLv   = Math.max(0, +e.target.value|0); };
    g('w_pierce').onchange= (e)=>{ weapon.pierceLv   = Math.max(0, +e.target.value|0); };
    g('w_expl').onchange  = (e)=>{ weapon.explosiveLv= Math.max(0, +e.target.value|0); player.fireRate = 0.12*(weapon.explosiveLv>0? WPN.explosiveFireRateMul:1); };

    // Diff/Spawn
    g('d_apply').onclick = ()=>{
      DIFF.maxEnemiesEnd = Math.max(5, +g('d_maxE').value|0);
      DIFF.spawnBaseCD   = Math.max(0.05, +g('d_cd_base').value||DIFF.spawnBaseCD);
      DIFF.spawnMinCD    = Math.max(0.05, +g('d_cd_min').value||DIFF.spawnMinCD);
      DIFF.packBase      = Math.max(1, +g('d_pack').value|0);
      DIFF.enemyBaseSp   = Math.max(10, +g('d_spd').value|0);
      DIFF.hpBase        = Math.max(1, +g('d_hp').value|0);
      // 즉시 체감하도록 다음 스폰까지 대기시간 리셋
      state.spawnCD = 0.1;
    };
    g('d_spawn').onclick = ()=>{ for(let i=0;i<packCountNow();i++){ if(enemies.free.length) spawnEnemy(); } };
    g('d_xp').onclick    = ()=>{ state.xp = state.nextLvl-1; }; // 드랍 하나 주우면 레벨업

    fillDev();
  };

  /* ===================== [config] ===================== */
  const W=960, H=540, FIXED_DT=1/60, TAU=Math.PI*2;
  const ENEMY_ACCEL=600, ENEMY_TURN=6.0;           // 회전·가속 제한
  const SEP_RANGE=24, SEP_K=1200;                  // 적-적 분리 강도
  const MAG_R=30, MAG_ACC=10000, MAG_MAX=5000;     // 드랍 마그넷
  const LINEAR_LANE_SPACING = 10;                  // 병렬 탄 간격(px)
  const SPAWN_SAFE_ENEMY_R = 28;                   // 다른 적과 최소 거리
  const SPAWN_SAFE_PLAYER_R = 120;                 // 플레이어와 최소 거리
  const ENEMY_WARMUP = 0.18;                       // 스폰 후 웜업(초)
  const SEP_MAX_IMP = 400;                         // 프레임당 최대 분리 임펄스(px/s)
  const DEV_PWD_HASH_HEX = '89c0df90148e88f4fa0cf18444e087aa41cb7ecf6b6f220c75fa870f57f6f7ee';
  const DEV_PWD_PEPPER_PREFIX = 'MadeBy:';         // HASH_HEX PEPPER_PREFIX
  const DEV_PWD_PEPPER_SUFFIX = ':TDragon';        // HASH_HEX PEPPER_SUFFIX

  // 스폰·난이도(간단형)
  // [config] DIFF 교체
  const DIFF = {
    grace: 4.0,                 // 시작 유예
    // 동시 적 수: 0→8분 선형 22→58
    maxEnemiesStart: 22,
    maxEnemiesEnd:   58,
    // 스폰 주기: 0→8분 1.6s → 0.7s
    spawnBaseCD: 1.6,
    spawnMinCD:  0.7,
    packBase:    2,             // 팩 시작 수
    packPerMin:  1,             // 분당 +1 (상한 5)
    packMax:     5,

    // 속도: 0→8분 70→170
    enemyBaseSp: 70,
    enemySpPerMin: 12.5,
    enemySpMax:  170,

    // HP: 0→8분 4→10
    hpBase: 4,
    hpPerMin: 0.75,
    hpMax:   10
  };


  /* ======================= [rng] ====================== */
  function XorShift32(seed){ let x=seed|0||123456789; return ()=>{ x^=x<<13; x^=x>>>17; x^=x<<5; return (x>>>0)/4294967296; }; }
  const RNGU={ range:(r,a,b)=>a+(b-a)*r(), int:(r,a,b)=> a+((b-a+1)*r()|0) };

  /* ====================== [input] ===================== */
  const Input={ k:{}, mx:0, my:0, m:false };
  addEventListener('keydown',e=>Input.k[e.code]=true);
  addEventListener('keyup',e=>Input.k[e.code]=false);
  addEventListener('mousedown',()=>Input.m=true);
  addEventListener('mouseup',()=>Input.m=false);

  /* ====================== [state] ===================== */
  const cvs=document.getElementById('game');
  const ctx=cvs.getContext('2d');
  cvs.addEventListener('mousemove',e=>{ const r=cvs.getBoundingClientRect(); Input.mx=e.clientX-r.left; Input.my=e.clientY-r.top; });
  const state={ seed:Date.now()|0, r:null, time:0, wave:1, xp:0, lvl:1, nextLvl:10,
                alive:false, score:0, spawnCD:0, paused:false, resumeDelay:0,
                shakeT:0, shakeAmp:0, devOn: false, devUnlocked:false, devHold:false };

  /* ===================== [weapon] ===================== */
  const WPN={ spreadDegPerPellet:10, dmgFallPerPierce:0.75, explosiveRadiusBase:48, explosiveRadiusPerLv:10, explosiveSelfDmgMul:0.5, explosiveFireRateMul:1.25 };
  const weapon={ linearLv:0, radialLv:0, pierceLv:0, explosiveLv:0 };

  /* ======================= [items] ==================== */
  const ITEMS=[
    {id:'lin+1', name:'직선 탄수 +1', onPick:()=>{ weapon.linearLv++; }},
    {id:'rad+1', name:'방사형 탄수 +1', onPick:()=>{ weapon.radialLv++; }},
    {id:'pierce+1', name:'관통 +1(감쇠)', onPick:()=>{ weapon.pierceLv++; }},
    {id:'explosive+1', name:'폭발탄 +1', onPick:()=>{ weapon.explosiveLv++; player.fireRate=0.12*WPN.explosiveFireRateMul; }}
  ];

  /* ======================= [pool] ===================== */
  function makePool(factory, size){
    const raw=new Array(size), free=[]; for(let i=0;i<size;i++){ raw[i]=factory(); raw[i].alive=false; free.push(raw[i]); }
    return { raw, free,
      spawn(init){ if(!free.length) return null; const o=free.pop(); init(o); o.alive=true; return o; },
      release(o){ if(!o.alive) return; o.alive=false; free.push(o); },
      each(fn){ for(const o of raw) if(o.alive) fn(o); },
      reset(){ free.length=0; for(const o of raw){ o.alive=false; free.push(o);} }
    };
  }

  /* ======================= [quad] ===================== */
  class Quad{
    constructor(x,y,w,h,cap=12,depth=0,maxDepth=6){ Object.assign(this,{x,y,w,h,cap,depth,maxDepth}); this.items=[]; this.divided=false; }
    _sub(){ const {x,y,w,h,cap,depth,maxDepth}=this, hw=w/2, hh=h/2; this.nw=new Quad(x,y,hw,hh,cap,depth+1,maxDepth); this.ne=new Quad(x+hw,y,hw,hh,cap,depth+1,maxDepth); this.sw=new Quad(x,y+hh,hw,hh,cap,depth+1,maxDepth); this.se=new Quad(x+hw,y+hh,hw,hh,cap,depth+1,maxDepth); this.divided=true; }
    _contains(a,o){ return o.x>=a.x && o.x<a.x+a.w && o.y>=a.y && o.y<a.y+a.h; }
    insert(o){ if(!this._contains(this,o)) return false; if(this.items.length<this.cap || this.depth>=this.maxDepth){ this.items.push(o); return true; } if(!this.divided) this._sub(); return this.nw.insert(o)||this.ne.insert(o)||this.sw.insert(o)||this.se.insert(o); }
    query(r,out){ if(r.x>this.x+this.w||r.x+r.w<this.x||r.y>this.y+this.h||r.y+r.h<this.y) return out; for(const it of this.items) if(it.alive && it.x>=r.x && it.x<r.x+r.w && it.y>=r.y && it.y<r.y+r.h) out.push(it); if(this.divided){ this.nw.query(r,out); this.ne.query(r,out); this.sw.query(r,out); this.se.query(r,out);} return out; }
    clear(){ this.items.length=0; if(this.divided){ this.nw.clear(); this.ne.clear(); this.sw.clear(); this.se.clear(); this.divided=false; } }
  }
  const qt=new Quad(0,0,W,H,10,0,6);

  /* =================== [entity:player] ================= */
  const player={ x:W/2,y:H/2,r:10,hp:5,maxHp:5, ifr:0, fireCD:0, fireRate:0.12, speed:210, dmg:1, pierce:0 };

  /* =================== [entity:bullet] ================= */
  const bullets=makePool(()=>({alive:false,type:'b',x:0,y:0,vx:0,vy:0,r:3,life:1.2,team:0,dmg:1,pierce:0,dmgFall:0.75, explosive:false, explRadius:48}), 4000);

  /* ==================== [entity:enemy] ================= */
  const enemies=makePool(()=>({alive:false,type:'e',x:0,y:0,vx:0,vy:0,r:12,hp:4,maxHp:4,t:0, slowMul:1,slowTimer:0, hitTimer:0}), 800);

  /* ==================== [entity:drop] ================== */
  const drops=makePool(()=>({alive:false,type:'d',x:0,y:0,vx:0,vy:0,r:6,kind:'xp'}), 400);

  /* =============== [entity:fx sparks/rings] ============ */
  const sparks=makePool(()=>({alive:false,x:0,y:0,vx:0,vy:0,r:2,life:0}),600);
  const rings =makePool(()=>({alive:false,x:0,y:0,r:0,life:0,max:18}),200);

  /* ===================== [functions] =================== */
  const $=(s)=>document.querySelector(s);
  function minutes(){ return Math.floor(state.time/60); }
  function clamp(v,a,b){ return v<a?a : v>b?b : v; }
  function safeNorm(x,y){ const L=Math.hypot(x,y); return L? [x/L,y/L] : [0,0]; }
  function maxEnemiesNow(){
    const t = clamp(minutes()/8, 0, 1);
    return Math.round(DIFF.maxEnemiesStart + (DIFF.maxEnemiesEnd - DIFF.maxEnemiesStart)*t);
  }
  function spawnCooldownNow(){
    const t = clamp(minutes()/8, 0, 1);
    return Math.max(DIFF.spawnMinCD, DIFF.spawnBaseCD - t*(DIFF.spawnBaseCD-DIFF.spawnMinCD));
  }
  function packCountNow(){ return Math.min(DIFF.packMax, DIFF.packBase + minutes()*DIFF.packPerMin); }
  function enemySpeedNow(){ return Math.min(DIFF.enemySpMax, DIFF.enemyBaseSp + DIFF.enemySpPerMin*minutes()); }
  function enemyHpNow(){ return Math.min(DIFF.hpMax, Math.round(DIFF.hpBase + DIFF.hpPerMin*minutes())); }
  function addShake(t=0.15, amp=6){ state.shakeT=Math.max(state.shakeT,t); state.shakeAmp=Math.max(state.shakeAmp,amp); }

  // 레벨업 선택
  function rollChoices(){ const r=XorShift32(state.seed ^ (state.lvl*0x9e3779b9)); const pool=[...ITEMS], out=[]; for(let i=0;i<3&&pool.length;i++){ const idx=(pool.length*r()|0); out.push(pool.splice(idx,1)[0]); } return out; }
  function openLevelUp(){ state.paused=true; const wrap=$('#choices'); wrap.innerHTML=''; for(const it of rollChoices()){ const btn=document.createElement('button'); btn.textContent=it.name; btn.style.cssText='text-align:left;padding:10px;border-radius:10px;background:#1b2330;color:#e5ecf6;border:1px solid #31415a'; btn.onclick=()=>{ it.onPick&&it.onPick(); closeLevelUp(); state.resumeDelay=0.25; player.ifr=Math.max(player.ifr,0.25); }; wrap.appendChild(btn);} $('#levelup').style.display='flex'; }
  function closeLevelUp(){ $('#levelup').style.display='none'; state.paused=false; }

  // 발사(무기 시스템)
  function fireWeapon(ax,ay){
    const dirA = Math.atan2(ay, ax);

    // 탄수 계산
    const linearCount = 1 + weapon.linearLv;   // 병렬 레인 수
    const radialCount = 1 + weapon.radialLv;   // 방사 펠릿 수
    const stepRad = (WPN.spreadDegPerPellet * Math.PI/180);

    // 방향 벡터와 수직(노멀) 벡터
    const dx = ax, dy = ay;
    const nx = -dy, ny = dx; // 단위 노멀(이미 ax,ay가 단위라 수치 안정)

    // 방사형 각도 생성 → 각 각도마다 병렬 레인 생성
    const centerPellet = (radialCount-1)/2;
    for(let p=0; p<radialCount; p++){
      const offA = (radialCount>1) ? (p - centerPellet) * stepRad : 0;
      const a = dirA + offA;
      const vxDir = Math.cos(a), vyDir = Math.sin(a);

      // 병렬 레인 오프셋(좌우 대칭)
      const centerLane = (linearCount-1)/2;
      for(let l=0; l<linearCount; l++){
        const laneOff = (l - centerLane) * LINEAR_LANE_SPACING;
        const sx = player.x + nx * laneOff;  // 시작점을 수직 방향으로 이동
        const sy = player.y + ny * laneOff;

        const sp = 420; // 탄속
        bullets.spawn(b=>{
          b.x = sx; b.y = sy;
          b.vx = vxDir * sp; b.vy = vyDir * sp;
          b.life = 1.1 - Math.min(0.5, weapon.explosiveLv*0.15);
          b.team = 0; b.r = 3;
          b.dmg = player.dmg;
          b.pierce = player.pierce + weapon.pierceLv;
          b.dmgFall = WPN.dmgFallPerPierce;
          b.explosive = (weapon.explosiveLv>0);
          b.explRadius = WPN.explosiveRadiusBase + WPN.explosiveRadiusPerLv*Math.max(0,weapon.explosiveLv-1);
        });
      }
    }

    // 연사 간격
    player.fireCD = player.fireRate * (weapon.explosiveLv>0 ? WPN.explosiveFireRateMul : 1);
  }

  // 폭발 처리
  function explodeAt(x,y,radius,baseDmg){
    const area={x:x-radius,y:y-radius,w:radius*2,h:radius*2};
    const cand=[]; qt.query(area,cand);
    for(const e of cand){ const dx=e.x-x, dy=e.y-y; if(dx*dx+dy*dy<=radius*radius){ e.hp -= Math.max(1, Math.floor(baseDmg*0.9)); e.hitTimer=0.08; e.slowMul=0.8; e.slowTimer=0.25; if(e.hp<=0){ enemies.release(e); state.score+=10; drops.spawn(d=>{ d.x=e.x; d.y=e.y; d.vx=0; d.vy=0; d.kind='xp'; }); rings.spawn(g=>{ g.x=e.x; g.y=e.y; g.r=6; g.life=0.25; g.max=radius; }); }} }
    const pdx=player.x-x, pdy=player.y-y; if(pdx*pdx+pdy*pdy<=radius*radius && player.ifr<=0){ player.hp -= Math.max(1, Math.floor(baseDmg*WPN.explosiveSelfDmgMul)); player.ifr=0.6; addShake(0.2,10); }
    rings.spawn(g=>{ g.x=x; g.y=y; g.r=6; g.life=0.25; g.max=radius; });
  }

  // 적 스폰
  function maxEnemiesNow(){ const m=minutes(); const t=clamp(m/8,0,1); return Math.round(DIFF.maxEnemiesStart + (DIFF.maxEnemiesEnd-DIFF.maxEnemiesStart)*t); }
  function spawnCooldownNow(){ const m=minutes(); return Math.max(DIFF.spawnMinCD, DIFF.spawnBaseCD - m*0.1); }
  function packCountNow(){ const m=minutes(); return Math.min(DIFF.packMax, DIFF.packBase + DIFF.packPerMin*m); }
  function enemySpeedNow(){ const m=minutes(); return Math.min(DIFF.enemySpMax, DIFF.enemyBaseSp + DIFF.enemySpPerMin*m); }
  function enemyHpNow(){ const m=minutes(); return Math.min(DIFF.hpMax, Math.round(DIFF.hpBase + DIFF.hpPerMin*m)); }
  function spawnEnemy(){
    const side=RNGU.int(state.r,0,3); let x=0,y=0;
    if(side===0){x=RNGU.range(state.r,0,W); y=-16;} else if(side===1){x=W+16; y=RNGU.range(state.r,0,H);} else if(side===2){x=RNGU.range(state.r,0,W); y=H+16;} else {x=-16; y=RNGU.range(state.r,0,H);} 
    enemies.spawn(e=>{
      e.x=x; e.y=y; e.hp=enemyHpNow(); e.maxHp=e.hp;
      e.t=0; e.slowMul=1; e.slowTimer=0; e.hitTimer=0; e.vx=0; e.vy=0; e.warm=ENEMY_WARMUP;
      // 플레이어와 너무 가까우면 밖으로 밀어 배치
      const dx=player.x-e.x, dy=player.y-e.y, d=Math.hypot(dx,dy);
      if(d < SPAWN_SAFE_PLAYER_R){ const nx=dx/(d||1), ny=dy/(d||1); const k=SPAWN_SAFE_PLAYER_R-d; e.x-=nx*k; e.y-=ny*k; }
    });
  }

  // 조향(회전/가속 제한)
  function steer(e,dt,sp,tx,ty){
    const va=Math.atan2(e.vy||0,e.vx||0), ta=Math.atan2(ty,tx);
    let da=ta-va; while(da>Math.PI) da-=TAU; while(da<-Math.PI) da+=TAU;
    const maxTurn=ENEMY_TURN*dt; const na=va + Math.max(-maxTurn, Math.min(maxTurn, da));
    const vMag=Math.hypot(e.vx,e.vy), vTarget=sp; const dv=Math.max(-ENEMY_ACCEL*dt, Math.min(ENEMY_ACCEL*dt, vTarget - vMag));
    const newMag=Math.max(0, vMag+dv); e.vx=Math.cos(na)*newMag; e.vy=Math.sin(na)*newMag;
  }

  async function sha256Hex(str){
    const enc = new TextEncoder().encode(str);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }

  function devLockCheck(){
    const now = Date.now();
    const until = +(localStorage.getItem('dev_fail_until')||0);
    return now < until ? until - now : 0;
  }
  function devLockFailBackoff(){
    const tries = 1 + +(localStorage.getItem('dev_fail_tries')||0);
    localStorage.setItem('dev_fail_tries', String(tries));
    const waitMs = Math.min(60000, 10000 * tries * tries); // 10s, 40s, 90s...
    localStorage.setItem('dev_fail_until', String(Date.now()+waitMs));
    return waitMs;
  }
  function devLockReset(){
    localStorage.removeItem('dev_fail_tries');
    localStorage.removeItem('dev_fail_until');
  }


  /* ======================= [systems] ================== */
  function update(dt){
    if(!state.alive) return;
    if(state.paused) return;
    if(state.resumeDelay>0){ state.resumeDelay-=dt; return; }
    state.time += dt;
    inputSystem(dt); bulletSystem(dt); enemySystem(dt); collisionSystem(); cleanupSystem();
  }

  /* -------------------- [player/input] ---------------- */
  function inputSystem(dt){
    const ax=(Input.k['KeyD']?1:0) - (Input.k['KeyA']?1:0);
    const ay=(Input.k['KeyS']?1:0) - (Input.k['KeyW']?1:0);
    const len=Math.hypot(ax,ay)||1;
    player.x = clamp(player.x + (ax/len)*player.speed*dt, player.r, W-player.r);
    player.y = clamp(player.y + (ay/len)*player.speed*dt, player.r, H-player.r);

    player.fireCD -= dt;
    if(Input.m && state.resumeDelay<=0 && player.fireCD<=0){
      const dx=Input.mx-player.x, dy=Input.my-player.y; const L=Math.hypot(dx,dy)||1; fireWeapon(dx/L, dy/L);
    }
    if(player.ifr>0) player.ifr=Math.max(0, player.ifr-dt);
  }

  /* -------------------- [bullet] ---------------------- */
  function bulletSystem(dt){
    bullets.each(b=>{
      b.x+=b.vx*dt; b.y+=b.vy*dt; b.life-=dt;
      if(b.life<=0 || b.x<-20||b.x>W+20||b.y<-20||b.y>H+20){ if(b.explosive) explodeAt(b.x,b.y,b.explRadius,b.dmg); bullets.release(b); }
    });
  }

  /* -------------------- [enemy] ----------------------- */
  function enemySystem(dt){
    // Spawn
    state.spawnCD -= dt;
    const activeEnemies = enemies.raw.length - enemies.free.length;
    if(state.time>DIFF.grace && state.spawnCD<=0 && activeEnemies < maxEnemiesNow()){
      const pack=packCountNow(); for(let i=0;i<pack;i++){ if(!enemies.free.length) break; spawnEnemy(); }
      state.spawnCD = spawnCooldownNow();
    }
    // Move
    qt.clear(); enemies.each(e=>qt.insert(e));
    enemies.each(e=>{
      e.t += dt;
      if(e.warm>0) e.warm = Math.max(0, e.warm - dt);
      if(e.slowTimer>0){ e.slowTimer -= dt; if(e.slowTimer<=0) e.slowMul=1; }
      if(e.hitTimer>0)  e.hitTimer  -= dt;

      const sp = enemySpeedNow() * e.slowMul;
      const dx = player.x - e.x, dy = player.y - e.yconst 
      const [ux,uy] = safeNorm(dx,dy);
      steer(e, dt, enemySpeedNow()*(e.warm>0?0.6:1.0)*e.slowMul, ux, uy);

      e.x += e.vx*dt; e.y += e.vy*dt;
    });
    // Soft separation (속도 임펄스)
    enemies.each(e=>{
      const cand=[]; qt.query({x:e.x-SEP_RANGE,y:e.y-SEP_RANGE,w:SEP_RANGE*2,h:SEP_RANGE*2}, cand);
      for(const n of cand){
        if(n===e) continue;
        const dx=e.x-n.x, dy=e.y-n.y, dist=Math.hypot(dx,dy);
        const minDist=(e.r+n.r)-2;
        if(dist>0 && dist<minDist){
          const nx=dx/dist, ny=dy/dist;
          // 웜업 중이면 분리 강도 50%
          const k = (e.warm>0 || n.warm>0) ? 0.5 : 1.0;
          const acc = Math.min(SEP_K*(minDist-dist)*k, SEP_MAX_IMP/Math.max(1e-6,dt));
          e.vx += nx * acc * dt; e.vy += ny * acc * dt;
          n.vx -= nx * acc * dt; n.vy -= ny * acc * dt;
        }
      }
    });
    enemies.each(e=>{
      const spCap = enemySpeedNow()*e.slowMul*(e.warm>0 ? 0.6 : 1.0);
      const vL = Math.hypot(e.vx,e.vy);
      if(vL > spCap){ e.vx = e.vx/vL * spCap; e.vy = e.vy/vL * spCap; }
    });
  }

  /* -------------------- [collision] ------------------- */
  function collisionSystem(){
    // bullets vs enemies (쿼드트리 재사용)
    qt.clear(); enemies.each(e=>qt.insert(e));
    bullets.each(b=>{ if(b.team!==0) return; const cand=[]; qt.query({x:b.x-24,y:b.y-24,w:48,h:48}, cand); for(const e of cand){ const dx=e.x-b.x, dy=e.y-b.y; const rr=e.r+b.r; if(dx*dx+dy*dy<=rr*rr){
          // 히트
          e.hp -= b.dmg; e.slowMul=0.8; e.slowTimer=0.25; e.hitTimer=0.08;
          // 이펙트
          for(let k=0;k<6;k++){ sparks.spawn(p=>{ const a=Math.random()*TAU, sp=60+Math.random()*120; p.x=e.x; p.y=e.y; p.vx=Math.cos(a)*sp; p.vy=Math.sin(a)*sp; p.r=1+Math.random()*1.5; p.life=0.18; }); }
          addShake(0.05,3);
          // 폭발탄
          if(b.explosive){ explodeAt(b.x,b.y,b.explRadius,b.dmg); bullets.release(b); if(e.hp<=0){ killEnemy(e); } break; }
          // 관통 처리
          if(b.pierce>0){ b.pierce--; b.dmg=Math.max(0, b.dmg*(b.dmgFall||0.75)); } else { bullets.release(b); }
          if(e.hp<=0){ killEnemy(e); }
          break; } }
    });

    // enemy contact damage
    let touched=false; enemies.each(e=>{ const dx=player.x-e.x, dy=player.y-e.y; const rr=player.r+e.r; if(dx*dx+dy*dy<=rr*rr){ touched=true; const L=Math.hypot(dx,dy)||1; const push=60; player.x+= (dx/L)*push*FIXED_DT; player.y+= (dy/L)*push*FIXED_DT; }});
    if(touched && player.ifr<=0){ player.hp--; player.ifr=0.6; addShake(0.2,8); }

    // drops vs player
    drops.each(d=>{ const dx=player.x-d.x, dy=player.y-d.y; const rr=player.r+d.r; if(dx*dx+dy*dy<=rr*rr){ drops.release(d); state.xp++; if(state.xp>=state.nextLvl){ state.xp=0; state.lvl++; state.nextLvl=Math.floor(state.nextLvl*1.25); openLevelUp(); } }});
  }
  function killEnemy(e){ enemies.release(e); state.score+=10; rings.spawn(g=>{ g.x=e.x; g.y=e.y; g.r=4; g.life=0.22; g.max=18; }); drops.spawn(d=>{ d.x=e.x; d.y=e.y; d.vx=0; d.vy=0; d.kind='xp'; }); }

  /* -------------------- [cleanup] --------------------- */
  function cleanupSystem(){
    // drops: 고정 + 마그넷
    drops.each(d=>{ const dx=player.x-d.x, dy=player.y-d.y; const dist=Math.hypot(dx,dy); if(dist<MAG_R){ const ax=(dx/(dist||1))*MAG_ACC*FIXED_DT; const ay=(dy/(dist||1))*MAG_ACC*FIXED_DT; d.vx = Math.max(Math.min(d.vx+ax, MAG_MAX), -MAG_MAX); d.vy = Math.max(Math.min(d.vy+ay, MAG_MAX), -MAG_MAX); d.x+=d.vx*FIXED_DT; d.y+=d.vy*FIXED_DT; } });
    // sparks
    sparks.each(p=>{ p.life-=FIXED_DT; p.x+=p.vx*FIXED_DT; p.y+=p.vy*FIXED_DT; p.vx*=0.92; p.vy*=0.92; if(p.life<=0) sparks.release(p); });
    // rings
    rings.each(g=>{ g.life-=FIXED_DT; g.r += (g.max-g.r)*0.35; if(g.life<=0) rings.release(g); });
    if(player.hp<=0) state.alive=false;
  }

  /* ======================= [render] =================== */
  function render(){
    // screen shake
    if(state.shakeT>0){ state.shakeT-=1/60; const k=Math.max(0,state.shakeT); const s=state.shakeAmp*k*k; const ox=(Math.random()*2-1)*s, oy=(Math.random()*2-1)*s; ctx.save(); ctx.translate(ox,oy); }
    ctx.clearRect(0,0,W,H);
    // bg grid
    ctx.globalAlpha=0.15; ctx.strokeStyle='#223'; for(let x=0;x<=W;x+=30){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); } for(let y=0;y<=H;y+=30){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); } ctx.globalAlpha=1;

    // drops
    ctx.fillStyle='#7dd3fc'; drops.each(d=>{ ctx.beginPath(); ctx.arc(d.x,d.y,d.r,0,TAU); ctx.fill(); });
    // bullets
    ctx.fillStyle='#fda4af'; bullets.each(b=>{ ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,TAU); ctx.fill(); });
    // enemies
    enemies.each(e=>{ if(e.hitTimer>0) ctx.fillStyle='#ffffff'; else if(e.slowTimer>0) ctx.fillStyle='#86efac'; else ctx.fillStyle='#a7f3d0'; ctx.beginPath(); ctx.arc(e.x,e.y,e.r,0,TAU); ctx.fill(); });
    // player
    if(player.ifr>0) ctx.globalAlpha=0.5; ctx.fillStyle='#fef3c7'; ctx.beginPath(); ctx.arc(player.x,player.y,player.r,0,TAU); ctx.fill(); ctx.globalAlpha=1;
    // FX
    ctx.globalAlpha=0.9; ctx.fillStyle='#ffe08a'; sparks.each(p=>{ ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,TAU); ctx.fill(); }); ctx.globalAlpha=1;
    rings.each(g=>{ const a=Math.max(0,g.life/0.22); ctx.strokeStyle=`rgba(255,255,255,${a})`; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(g.x,g.y,g.r,0,TAU); ctx.stroke(); });

    // UI text
    const info=document.getElementById('info'); if(info) info.textContent=`HP ${player.hp}/${player.maxHp} | XP ${state.xp}/${state.nextLvl} | LV ${state.lvl} | Score ${state.score}`;

    if(!state.alive){ ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(0,0,W,H); ctx.fillStyle='#fff'; ctx.font='bold 42px system-ui'; ctx.textAlign='center'; ctx.fillText('GAME OVER', W/2, H/2); }

    if(state.shakeT>0) ctx.restore();
  }

  /* ====================== [bootstrap] ================= */
  function save(){ const payload={ best:Math.max(state.score, (load()?.best||0)), unlocks:load()?.unlocks||[], options:load()?.options||{}, lastSeed:state.seed }; localStorage.setItem('rbh_save', JSON.stringify(payload)); }
  function load(){ try{ return JSON.parse(localStorage.getItem('rbh_save')||'null'); }catch(e){ return null; } }
  function resetRun(){ const seed=(load()?.lastSeed ?? (Date.now()|0)); state.seed=seed; state.r=XorShift32(seed); state.time=0; state.wave=1; state.xp=0; state.lvl=1; state.nextLvl=10; state.alive=true; state.score=0; state.spawnCD=DIFF.spawnBaseCD; state.paused=false; state.resumeDelay=0; state.shakeT=0; state.shakeAmp=0; player.x=W/2; player.y=H/2; player.hp=player.maxHp=5; player.ifr=0; player.fireCD=0; player.fireRate=(weapon.explosiveLv>0?0.12*WPN.explosiveFireRateMul:0.12); player.speed=210; player.dmg=1; player.pierce=0; weapon.linearLv=0; weapon.radialLv=0; weapon.pierceLv=0; weapon.explosiveLv=0; bullets.reset(); enemies.reset(); drops.reset(); sparks.reset(); rings.reset(); state.spawnCD = DIFF.spawnBaseCD; state.time = 0; }

  document.getElementById('btnStart')?.addEventListener('click', ()=> resetRun());
  document.getElementById('btnExport')?.addEventListener('click', ()=>{ const s=localStorage.getItem('rbh_save')||'{}'; navigator.clipboard?.writeText(s); alert('저장 JSON을 클립보드에 복사했습니다.'); });
  document.getElementById('btnImport')?.addEventListener('click', ()=>{ const s=prompt('저장 JSON 붙여넣기'); if(s){ try{ localStorage.setItem('rbh_save', s); alert('불러오기 완료'); }catch(e){ alert('잘못된 JSON'); } } });

  let acc=0, last=performance.now();
  function tick(now){ acc+=Math.min(0.25,(now-last)/1000); last=now; while(acc>=FIXED_DT){ update(FIXED_DT); acc-=FIXED_DT; } render(); requestAnimationFrame(tick); }

  // 시작
  requestAnimationFrame(tick);
  // Dev panel는 엔티티 초기화 이후에 호출
  bindDev();
  // window debug
  window.Game={state,player,enemies,bullets,drops,save,load,resetRun,weapon};
})();