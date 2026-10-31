/* ============================================================
 * رضای چاق - UI Manager
 * اتصال لایه‌های HTML: HUD، نوار وزن، دکمه‌ها، صفحه‌ها
 * ============================================================ */
window.RC = window.RC || {};

(function () {
  'use strict';

  const CFG = RC.CONFIG;
  const $ = (id) => document.getElementById(id);

  const els = {};

  function cacheEls() {
    const ids = [
      'screen-loading', 'load-bar-fill', 'load-text', 'load-error',
      'screen-start', 'btn-start', 'btn-sound-start', 'best-val-start',
      'screen-pause', 'btn-resume', 'btn-home-pause', 'btn-sound-pause', 'btn-vibrate-pause',
      'screen-over', 'over-score', 'over-foods', 'over-combo', 'over-stage',
      'over-best', 'over-record', 'over-reaction', 'btn-retry', 'btn-home-over',
      'hud', 'coins-val', 'timer-val', 'score-val', 'btn-pause',
      'combo-box', 'combo-label', 'combo-fill',
      'belly-fill-wrap', 'belly-fill', 'belly-bar', 'stage-pips',
      'actions', 'btn-feed', 'btn-speed', 'btn-auto',
      'speed-badge', 'auto-badge', 'speed-timer', 'auto-timer',
      'banner', 'banner-text', 'game-canvas'
    ];
    for (const id of ids) els[id] = $(id);
  }

  function show(el, yes) {
    if (!el) return;
    el.classList.toggle('hidden', !yes);
  }

  function setText(el, text) {
    if (el && el.textContent !== text) el.textContent = text;
  }

  // ---------- صفحه‌ها ----------
  function showLoading(pct, err) {
    show(els['screen-loading'], true);
    if (els['load-bar-fill']) els['load-bar-fill'].style.width = Math.round(pct * 100) + '%';
    setText(els['load-text'], err ? CFG.FA.loadError : CFG.FA.loading + ' ' + RC.faNum(Math.round(pct * 100)) + '٪');
    show(els['load-error'], !!err);
  }
  function hideLoading() { show(els['screen-loading'], false); }

  function showStart(best) {
    setText(els['best-val-start'], RC.faNum(best || 0));
    show(els['screen-start'], true);
    show(els['screen-over'], false);
    show(els['screen-pause'], false);
    showHud(false);
  }
  function hideStart() { show(els['screen-start'], false); }

  function showPause() { show(els['screen-pause'], true); }
  function hidePause() { show(els['screen-pause'], false); }
  function hideOver() { show(els['screen-over'], false); }

  function setPauseScore(score) {
    setText(els['pause-score-lbl'], 'امتیاز فعلی: ' + RC.faNum(score));
  }

  function showHud(yes) {
    show(els['hud'], yes);
    show(els['belly-bar'], yes);
    show(els['actions'], yes);
    document.body.classList.toggle('playing', yes);
  }

  // ---------- HUD ----------
  function updateHud(g) {
    setText(els['score-val'], RC.faNum(g.score));
    setText(els['timer-val'], RC.faClock(g.timeLeft));
    setText(els['coins-val'], RC.faNum((g.persist.coins || 0) + Math.floor(g.score / 10)));
    // کمبو
    const comboVisible = g.combo >= 2 && g.comboRemaining > 0;
    show(els['combo-box'], comboVisible);
    if (comboVisible) {
      setText(els['combo-label'], CFG.FA.combo(g.combo));
      if (els['combo-fill']) {
        els['combo-fill'].style.width = Math.round(Math.max(0, Math.min(1, g.comboRemaining / CFG.GAMEPLAY.comboWindow)) * 100) + '%';
      }
      els['combo-box'].setAttribute('data-combo', String(g.combo));
    }
    // تایمر بحرانی
    if (els['timer-val']) {
      els['timer-val'].classList.toggle('danger', g.state === 'PLAYING' && g.timeLeft <= 5.5);
    }
  }

  // ---------- نوار وزن ----------
  function updateBelly(g) {
    const max = CFG.weightThresholds[4];
    const pct = Math.max(0, Math.min(1, g.weight / max));
    if (els['belly-fill']) els['belly-fill'].style.width = (pct * 100).toFixed(1) + '%';
    // pip های مرحله
    if (els['stage-pips']) {
      const pips = els['stage-pips'].children;
      for (let i = 0; i < pips.length; i++) {
        pips[i].classList.toggle('on', i <= g.stage);
      }
    }
    els['belly-bar'].classList.toggle('rush', !!g.rushActive);
    els['belly-bar'].classList.toggle('flash', !!g.bellyFlash);
  }

  // ---------- دکمه‌های اکشن ----------
  function updateButtons(g) {
    // شتاب
    const sp = g.powers.speed;
    els['btn-speed'].classList.toggle('active', sp.active);
    els['btn-speed'].disabled = sp.active || sp.usesLeft <= 0 || g.state !== 'PLAYING';
    setText(els['speed-badge'], RC.faNum(sp.usesLeft));
    setText(els['speed-timer'], sp.active ? RC.faNum(Math.ceil(sp.remaining)) : '');
    // خودخور
    const au = g.powers.auto;
    els['btn-auto'].classList.toggle('active', au.active);
    els['btn-auto'].disabled = au.active || au.usesLeft <= 0 || g.state !== 'PLAYING';
    setText(els['auto-badge'], RC.faNum(au.usesLeft));
    setText(els['auto-timer'], au.active ? RC.faNum(Math.ceil(au.remaining)) : '');
    // بخور
    els['btn-feed'].disabled = g.state !== 'PLAYING';
  }

  // ---------- بنر ----------
  let bannerTimer = null;
  function showBanner(text, cls, dur) {
    const b = els['banner'];
    if (!b) return;
    setText(els['banner-text'], text);
    b.className = 'banner show ' + (cls || '');
    if (bannerTimer) { clearTimeout(bannerTimer); bannerTimer = null; }
    bannerTimer = setTimeout(() => {
      b.classList.remove('show');
      bannerTimer = null;
    }, dur || 1500);
  }
  function clearBanner() {
    if (els['banner']) els['banner'].classList.remove('show');
    if (bannerTimer) { clearTimeout(bannerTimer); bannerTimer = null; }
  }

  // ---------- صفحه پایان ----------
  function showGameOver(g, isRecord) {
    setText(els['over-score'], RC.faNum(g.score));
    setText(els['over-foods'], RC.faNum(g.foodsEaten));
    setText(els['over-combo'], '×' + RC.faNum(g.maxCombo));
    setText(els['over-stage'], CFG.FA.stageNames[g.stage] || '-');
    setText(els['over-best'], RC.faNum(g.persist.best || 0));
    setText(els['over-reaction'], CFG.FA.stageReactions[g.stage] || '');
    show(els['over-record'], isRecord);
    show(els['screen-over'], true);
    showHud(false);
  }

  // ---------- دکمه صدا ----------
  function updateSoundBtn(on) {
    const b = els['btn-sound-start'];
    if (b) {
      b.classList.toggle('off', !on);
      b.setAttribute('aria-label', on ? CFG.FA.soundOn : CFG.FA.soundOff);
      setText(b.querySelector('.sound-label'), on ? CFG.FA.soundOn : CFG.FA.soundOff);
    }
    const bp = els['btn-sound-pause'];
    if (bp) {
      bp.classList.toggle('off', !on);
      setText(bp.querySelector('.sound-label'), on ? CFG.FA.soundOn : CFG.FA.soundOff);
    }
  }

  function updateVibrateBtn(on) {
    const b = els['btn-vibrate-pause'];
    if (b) {
      b.classList.toggle('off', !on);
      setText(b.querySelector('.sound-label'), on ? CFG.FA.vibrateOn : CFG.FA.vibrateOff);
    }
  }

  RC.ui = {
    cacheEls, showLoading, hideLoading, showStart, hideStart, showPause, hidePause, hideOver,
    setPauseScore, showHud, updateHud, updateBelly, updateButtons, showBanner, clearBanner,
    showGameOver, updateSoundBtn, updateVibrateBtn, els
  };
})();
