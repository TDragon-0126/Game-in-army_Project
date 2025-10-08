// DOF(Dev_Option_Functions)

/* ===================== [dev_option] ===================== */
  async function toggleDev(on){
  const want = (on!==undefined) ? on : !state.devOn;
  const el = document.getElementById('dev');
  if(!el) return;

  if(want){
    // 잠금 확인·검증(사용 중인 해시 검증 넣으세요)
    if(!state.devUnlocked){
      const wait = devLockCheck();
      if(wait>0){ alert(`잠금 중: ${Math.ceil(wait/1000)}초 후 다시 시도하세요.`); return; }

      const pwd = prompt('개발자 모드 비밀번호를 입력하세요.');
      if(pwd==null) return;

      const cand = await sha256Hex(DEV_PWD_PEPPER_PREFIX + pwd + DEV_PWD_PEPPER_SUFFIX);
      if(cand !== DEV_PWD_HASH_HEX){
        const backoff = devLockFailBackoff();
        alert('비밀번호가 올바르지 않습니다.');
        return;
      }
      devLockReset();
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
