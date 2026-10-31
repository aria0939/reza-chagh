/* ============================================================
 * رضای چاق - Game Core
 * State Manager: READY → PLAYING → PAUSED → GAME_OVER
 * تایمر، کمبو، وزن، قابلیت‌های ویژه، ورودی، رندر
 * ============================================================ */
window.RC = window.RC || {};

(function () {
  'use strict';

  const CFG = RC.CONFIG;

  const GS = {
    READY: 'READY',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    GAME_OVER: 'GAME_OVER'
  };

  // ---------- ذخیره‌سازی امن ----------
  function storageGet(key, def) {
    try {
      const v = localStorage.getItem(key);
      if (v == null) return def;
      const n = Number(JSON.parse(v));
      return isFinite(n) ? n : def;
    } catch (e) { return def; }
  }
  function storageSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* بی‌خطر */ }
  }

  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.state = GS.READY;

      this.view = { vw: 1080, vh: 1920, scale: 1, dpr: 1, cx: 540, baseY: 1152, charH: 998, tableTop: 1075 };

      // داده‌های پایدار
      this.persist = {
        best: storageGet(CFG.STORAGE_KEYS.best, 0),
        coins: storageGet(CFG.STORAGE_KEYS.coins, 0),
        sound: storageGet(CFG.STORAGE_KEYS.sound, 1),
        vibrate: storageGet(CFG.STORAGE_KEYS.vibrate, 1)
      };

      // وضعیت راند
      this.score = 0;
      this.weight = 0;
      this.stage = 0;
      this.combo = 0;
      this.maxCombo = 0;
      this.comboRemaining = 0;
      this.timeLeft = CFG.GAMEPLAY.roundSeconds;
      this.foodsEaten = 0;
      this.lastEatAt = -1e9;
      this.bellyFlash = 0;
      this.emptyTableTime = 0;
      this.lastTickSecond = -1;

      // قابلیت‌ها
      this.powers = {
        speed: { active: false, remaining: 0, usesLeft: CFG.POWERS.speedBoost.usesPerRound },
        auto: { active: false, remaining: 0, usesLeft: CFG.POWERS.autoFeed.usesPerRound, timer: 0 },
        rush: { active: false, remaining: 0 }
      };
      this.rushActive = false;

      this.character = new RC.Character();
      this.foods = new RC.FoodManager();
      this.effects = new RC.EffectsManager();

      this.feedCooldown = 0;
      this.now = 0;
      this.rafId = null;
      this.isNewRecord = false;
    }

    // ---------- چیدمان ----------
    resize() {
      const w = Math.max(1, window.innerWidth);
      const h = Math.max(1, window.innerHeight);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const aspect = h / w;

      let vw, vh;
      if (aspect >= CFG.DESIGN.H_MIN / CFG.DESIGN.W) {
        // صفحه بلندتر از 16:9 → عرض کامل، ارتفاع مجازی بیشتر (تا سقف)
        vw = CFG.DESIGN.W;
        vh = Math.min(CFG.DESIGN.H_MAX, Math.round(CFG.DESIGN.W * aspect));
      } else {
        // صفحه کوتاه‌تر/عریض‌تر → ارتفاع کامل، عرض مجازی بیشتر
        vh = CFG.DESIGN.H_MIN;
        vw = Math.min(2400, Math.round(vh / aspect));
      }
      // همیشه حداقل 16:9
      if (vh < CFG.DESIGN.H_MIN) vh = CFG.DESIGN.H_MIN;

      const scale = w / vw;
      this.view = {
        vw, vh, scale, dpr,
        cx: vw / 2,
        baseY: CFG.LAYOUT.charBaseY * vh,
        charH: CFG.LAYOUT.charH * vh,
        tableTop: CFG.LAYOUT.tableTopY * vh
      };

      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';

      // جایگاه غذاهای موجود باید به‌روز شود (نسبی)
      for (const f of this.foods.items) {
        if (f.slotIdx >= 0) {
          const slot = CFG.SLOTS[f.slotIdx];
          if (f.state === 'table' || f.state === 'returning') {
            f.homeX = slot.x * vw;
            f.homeY = slot.y * vh;
            if (f.state === 'table') { f.x = f.homeX; f.y = f.homeY; }
          }
        }
      }
    }

    toVirtual(clientX, clientY) {
      return {
        x: clientX / this.view.scale,
        y: clientY / this.view.scale
      };
    }

    // ---------- چرخه راند ----------
    startRound() {
      // پاک‌سازی کامل وضعیت (ضد باگ Restart)
      this.score = 0;
      this.weight = 0;
      this.stage = 0;
      this.combo = 0;
      this.maxCombo = 0;
      this.comboRemaining = 0;
      this.timeLeft = CFG.GAMEPLAY.roundSeconds;
      this.foodsEaten = 0;
      this.lastEatAt = -1e9;
      this.bellyFlash = 0;
      this.emptyTableTime = 0;
      this.isNewRecord = false;
      this.feedCooldown = 0;
      this.lastTickSecond = -1;

      this.powers.speed = { active: false, remaining: 0, usesLeft: CFG.POWERS.speedBoost.usesPerRound };
      this.powers.auto = { active: false, remaining: 0, usesLeft: CFG.POWERS.autoFeed.usesPerRound, timer: 0 };
      this.powers.rush = { active: false, remaining: 0 };
      this.rushActive = false;

      this.foods.reset();
      this.effects.reset();
      this.character.reset(0);
      RC.ui.clearBanner();

      this.state = GS.PLAYING;
      RC.ui.hideStart();
      RC.ui.hidePause();
      RC.ui.hideOver();
      RC.ui.showHud(true);
      RC.input.setEnabled(true);
      RC.audio.play('click');
    }

    pauseGame(auto) {
      if (this.state !== GS.PLAYING) return;
      this.state = GS.PAUSED;
      RC.input.clearAll();
      RC.ui.showPause();
      RC.ui.setPauseScore(this.score);
      if (!auto) RC.audio.play('click');
    }

    resumeGame() {
      if (this.state !== GS.PAUSED) return;
      this.state = GS.PLAYING;
      RC.ui.hidePause();
      RC.audio.play('click');
    }

    goHome() {
      this.state = GS.READY;
      this.foods.reset();
      this.effects.reset();
      this.character.reset(0);
      RC.ui.hidePause();
      RC.ui.clearBanner();
      RC.ui.showHud(false);
      RC.ui.showStart(this.persist.best);
      RC.audio.play('click');
    }

    endRound() {
      if (this.state !== GS.PLAYING) return;
      this.state = GS.GAME_OVER;
      RC.input.clearAll();

      // سکه و رکورد
      const earned = Math.floor(this.score / 10);
      this.persist.coins = (this.persist.coins || 0) + earned;
      storageSet(CFG.STORAGE_KEYS.coins, this.persist.coins);

      this.isNewRecord = this.score > (this.persist.best || 0) && this.score > 0;
      if (this.isNewRecord) {
        this.persist.best = this.score;
        storageSet(CFG.STORAGE_KEYS.best, this.score);
      }

      this.character.setFull();
      this.rushActive = false;
      this.effects.stopRush();
      RC.ui.clearBanner();
      RC.audio.play('timeUp');
      if (this.isNewRecord) {
        setTimeout(() => RC.audio.play('record'), 650);
      }
      RC.ui.showGameOver(this, this.isNewRecord);
    }

    // ---------- ورودی ----------
    onPointerDown(pid, x, y) {
      if (this.state !== GS.PLAYING) return;
      const f = this.foods.findAt(x, y);
      if (f) {
        if (f.startDrag(pid)) {
          RC.audio.play('select');
        }
      }
    }

    onPointerMove(pid, x, y) {
      if (this.state !== GS.PLAYING) return;
      for (const f of this.foods.items) {
        if (f.pointerId === pid) f.moveTo(x, y);
      }
    }

    onPointerUp(pid, x, y, moved, dtMs) {
      if (this.state !== GS.PLAYING) return;
      for (const f of this.foods.items) {
        if (f.pointerId === pid) {
          if (!moved && dtMs < 400) {
            // ضربه سریع → خوردن
            this.eatFood(f);
          } else {
            // رهاکردن درگ
            const mouth = this.character.mouthPos(this.view);
            f.release(mouth, this.view.tableTop);
          }
        }
      }
    }

    onPointerCancel(pid) {
      for (const f of this.foods.items) {
        if (f.pointerId === pid) f.cancelDrag();
      }
    }

    // شروع خوردن یک غذا (از همه مسیرها: ضربه، درگ، دکمه، خودکار)
    eatFood(f) {
      if (!f || (f.state !== 'table' && f.state !== 'dragging')) return false;
      const ok = f.startFly(this.character.mouthPos(this.view), this.powers.speed.active || this.rushActive);
      if (ok) {
        RC.audio.play('click');
      }
      return ok;
    }

    // رسیدن غذا به دهان
    consume(f) {
      // محاسبه امتیاز
      this.combo = (this.comboRemaining > 0) ? Math.min(CFG.GAMEPLAY.comboMax, this.combo + 1) : 1;
      this.comboRemaining = CFG.GAMEPLAY.comboWindow;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;

      const base = f.def.golden ? f.def.score * (f.def.scoreMult || 3) : f.def.score;
      const rushMult = this.rushActive ? CFG.POWERS.bellyRush.scoreMult : 1;
      const gained = Math.max(1, Math.round(base * this.combo * rushMult));
      this.score += gained;

      // وزن (جدا از امتیاز)
      const wg = f.def.golden ? f.def.weightGain * 2 : f.def.weightGain;
      this.weight = Math.min(9999, this.weight + wg);

      this.foodsEaten++;
      this.lastEatAt = this.now;

      // افکت‌ها
      const mouth = this.character.mouthPos(this.view);
      // پراکندگی افقی/عمودی بیشتر تا متن‌ها روی هم نیفتند
      const spreadX = 150, spreadY = 60;
      this.effects.addFloat(
        mouth.x + (Math.random() * spreadX - spreadX / 2),
        mouth.y - 30 - Math.random() * spreadY,
        '+' + RC.faNum(gained),
        f.def.golden
          ? { color: '#ffe14d', size: 78, dur: 1.15, rise: 190 }
          : { color: '#ffffff', size: 58, dur: 0.95 }
      );
      if (f.def.golden) {
        this.effects.addFloat(mouth.x, mouth.y - 190, CFG.FA.golden, { color: '#ffd23e', size: 52 });
        this.effects.burst(f.x, f.y, { img: RC.Assets.img(CFG.PATHS.particles.sparkle), count: 8, size: 60 });
        RC.audio.play('golden');
      }
      this.effects.crumbs(mouth.x, mouth.y, ['#e8a33d', '#d1442f', '#f5d76e', '#8a4b2d']);
      RC.audio.play('eat');
      if (this.combo >= 2) RC.audio.play('combo', this.combo);
      else RC.audio.play('score');

      // واکنش شخصیت
      this.character.onFoodArrived(this.powers.speed.active);

      // لرزش لمسی
      if (this.persist.vibrate && navigator.vibrate) {
        try {
          if (this.combo >= 3) navigator.vibrate(18);
          else if (f.def.golden) navigator.vibrate(24);
        } catch (e) { /* بی‌خطر */ }
      }

      // کمبو ×۵ → شکم انفجاری
      if (this.combo >= CFG.GAMEPLAY.comboMax && !this.rushActive) {
        this.startRush();
      }

      // ارتقای مرحله وزن
      this.checkStageUp();
    }

    checkStageUp() {
      let changed = false;
      while (this.stage < 4 && this.weight >= CFG.weightThresholds[this.stage + 1]) {
        this.stage++;
        changed = true;
      }
      if (!changed) return;

      this.character.setStage(this.stage);
      this.character.triggerHappy();
      this.bellyFlash = 0.9;

      const v = this.view;
      const cx = v.cx, cy = v.baseY - v.charH * 0.45;
      this.effects.addFloat(cx, v.baseY - v.charH * 0.92, CFG.FA.fatter, {
        color: '#ffd23e', size: 92, dur: 1.5, rise: 130, stroke: '#5b2a00'
      });
      const star = RC.Assets.img(CFG.PATHS.particles.sparkle);
      const heart = RC.Assets.img(CFG.PATHS.particles.heart);
      this.effects.burst(cx, cy, { img: star, count: 12, size: 72, spread: 320 });
      this.effects.burst(cx, cy - 120, { img: heart, count: 4, size: 60, spread: 180, g: 220 });
      this.effects.triggerShake(9);
      RC.audio.play('stageUp');
      RC.ui.showBanner(CFG.FA.fatter, 'gold', 1400);
      if (this.persist.vibrate && navigator.vibrate) {
        try { navigator.vibrate([30, 40, 30]); } catch (e) { /* بی‌خطر */ }
      }
    }

    startRush() {
      this.rushActive = true;
      this.powers.rush.active = true;
      this.powers.rush.remaining = CFG.POWERS.bellyRush.duration;
      const v = this.view;
      this.effects.startRush(v.cx, v.baseY - v.charH * 0.5);
      this.character.triggerPowerup();
      RC.audio.play('rush');
      RC.ui.showBanner(CFG.FA.bellyRush, 'rush', 1800);
      if (this.persist.vibrate && navigator.vibrate) {
        try { navigator.vibrate([40, 30, 40, 30, 60]); } catch (e) { /* بی‌خطر */ }
      }
    }

    endRush() {
      this.rushActive = false;
      this.powers.rush.active = false;
      this.powers.rush.remaining = 0;
      this.effects.stopRush();
      this.character.endPowerup();
    }

    // ---------- دکمه‌ها ----------
    feedNearest() {
      if (this.state !== GS.PLAYING) return;
      if (this.feedCooldown > 0) return;
      const f = this.foods.selectedFood() || this.foods.nearestToMouth();
      if (f && this.eatFood(f)) {
        this.feedCooldown = 0.18;
      }
    }

    activateSpeed() {
      if (this.state !== GS.PLAYING) return;
      const p = this.powers.speed;
      if (p.active || p.usesLeft <= 0) return;   // ضد فعال‌سازی همزمان
      p.active = true;
      p.remaining = CFG.POWERS.speedBoost.duration;
      p.usesLeft--;
      RC.audio.play('rush');
      RC.ui.showBanner('شتاب سرعت!', 'speed', 1100);
    }

    activateAuto() {
      if (this.state !== GS.PLAYING) return;
      const p = this.powers.auto;
      if (p.active || p.usesLeft <= 0) return;   // ضد فعال‌سازی همزمان
      p.active = true;
      p.remaining = CFG.POWERS.autoFeed.duration;
      p.usesLeft--;
      p.timer = 0.15;
      RC.audio.play('combo', 4);
      RC.ui.showBanner('خودخور فعال شد!', 'auto', 1100);
    }

    toggleSound() {
      this.persist.sound = this.persist.sound ? 0 : 1;
      storageSet(CFG.STORAGE_KEYS.sound, this.persist.sound);
      RC.audio.setEnabled(!!this.persist.sound);
      RC.ui.updateSoundBtn(!!this.persist.sound);
      RC.audio.unlock();
      RC.audio.play('click');
    }

    toggleVibrate() {
      this.persist.vibrate = this.persist.vibrate ? 0 : 1;
      storageSet(CFG.STORAGE_KEYS.vibrate, this.persist.vibrate);
      RC.ui.updateVibrateBtn(!!this.persist.vibrate);
      RC.audio.play('click');
      if (this.persist.vibrate && navigator.vibrate) {
        try { navigator.vibrate(20); } catch (e) { /* بی‌خطر */ }
      }
    }

    // ---------- به‌روزرسانی ----------
    update(dt) {
      this.now += dt;
      const g = this;

      if (g.state === GS.READY || g.state === GS.GAME_OVER) {
        g.character.update(dt, g);
        g.effects.update(dt, { x: g.view.cx, y: g.view.baseY - g.view.charH * 0.45 });
        return;
      }
      if (g.state === GS.PAUSED) return; // توقف کامل

      // ---- تایمر ----
      g.timeLeft -= dt;
      if (g.timeLeft <= 0) {
        g.timeLeft = 0;
        g.endRound();
        return;
      }
      // صدای تیک ۵ ثانیه آخر
      const sec = Math.ceil(g.timeLeft);
      if (sec <= 5 && sec !== g.lastTickSecond) {
        g.lastTickSecond = sec;
        RC.audio.play('tick');
      }

      // ---- کمبو ----
      if (g.comboRemaining > 0) {
        g.comboRemaining -= dt;
        if (g.comboRemaining <= 0) {
          g.comboRemaining = 0;
          g.combo = 0;
        }
      }

      // ---- قابلیت‌ها ----
      const sp = g.powers.speed;
      if (sp.active) {
        sp.remaining -= dt;
        if (sp.remaining <= 0) { sp.active = false; sp.remaining = 0; }
      }
      const au = g.powers.auto;
      if (au.active) {
        au.remaining -= dt;
        au.timer -= dt;
        if (au.timer <= 0) {
          au.timer = CFG.POWERS.autoFeed.interval;
          // نزدیک‌ترین غذای میز را خودکار بخور
          const f = g.foods.nearestToMouth();
          if (f) g.eatFood(f);
        }
        if (au.remaining <= 0) { au.active = false; au.remaining = 0; }
      }
      if (g.rushActive) {
        g.powers.rush.remaining -= dt;
        if (g.powers.rush.remaining <= 0) g.endRush();
      }

      if (g.feedCooldown > 0) g.feedCooldown -= dt;
      if (g.bellyFlash > 0) g.bellyFlash -= dt;

      // ---- تولید غذا ----
      let interval = CFG.GAMEPLAY.spawnInterval;
      if (sp.active) interval *= CFG.POWERS.speedBoost.spawnFactor;
      if (g.rushActive) interval *= CFG.POWERS.bellyRush.spawnFactor;

      const mouth = g.character.mouthPos(g.view);
      const eatenNow = g.foods.update(dt, mouth, interval, CFG.GAMEPLAY.maxVisibleFood, g.view);

      // رسیدن غذاها به دهان (هر غذا فقط یک‌بار - از لیست حذف شده است)
      for (const f of eatenNow) {
        g.consume(f);
      }

      // ---- گرسنگی ----
      if (g.foods.tableCount === 0) {
        g.emptyTableTime += dt;
        if (g.emptyTableTime > CFG.GAMEPLAY.hungryAfter && g.character.state === RC.CharacterState.IDLE) {
          g.character.state = RC.CharacterState.HUNGRY;
          g.effects.addFloat(g.view.cx, g.view.baseY - g.view.charH * 0.95, CFG.FA.hungry, {
            color: '#ff8a65', size: 46, dur: 1.4
          });
        }
      } else {
        g.emptyTableTime = 0;
        if (g.character.state === RC.CharacterState.HUNGRY) g.character.state = RC.CharacterState.IDLE;
      }

      // ---- شخصیت و افکت‌ها ----
      g.character.update(dt, g);
      g.effects.update(dt, { x: g.view.cx, y: g.view.baseY - g.view.charH * 0.45 });
    }

    // ---------- رندر ----------
    render() {
      const ctx = this.ctx;
      const v = this.view;
      const A = RC.Assets;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      // پس‌زمینه بیرون صحنه
      ctx.fillStyle = '#160b26';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      const s = v.dpr * v.scale;
      ctx.setTransform(s, 0, 0, s, 0, 0);

      ctx.save();
      this.effects.applyShake(ctx);

      // ۱) پس‌زمینه رستوران
      const bg = A.img(CFG.PATHS.bgNeon);
      if (bg) {
        const bgX = (v.vw - CFG.DESIGN.W) / 2;
        ctx.drawImage(bg, bgX, 0, CFG.DESIGN.W, Math.min(v.vh, CFG.DESIGN.H_MIN));
        if (v.vh > CFG.DESIGN.H_MIN) {
          // ادامه رنگ کف برای صفحات بلندتر
          ctx.fillStyle = '#241631';
          ctx.fillRect(0, CFG.DESIGN.H_MIN - 2, v.vw, v.vh - CFG.DESIGN.H_MIN + 2);
        }
        if (v.vw > CFG.DESIGN.W) {
          ctx.fillStyle = '#1a0f2b';
          ctx.fillRect(0, 0, bgX, v.vh);
          ctx.fillRect(bgX + CFG.DESIGN.W, 0, v.vw - bgX - CFG.DESIGN.W, v.vh);
        }
      } else {
        ctx.fillStyle = '#2a1745';
        ctx.fillRect(0, 0, v.vw, v.vh);
      }

      // ۲) شخصیت (پشت میز)
      this.character.render(ctx, v);

      // ۳) درخشش حالت ویژه زیر شخصیت
      if (this.rushActive) {
        const g2 = ctx.createRadialGradient(v.cx, v.baseY - v.charH * 0.4, 80, v.cx, v.baseY - v.charH * 0.4, v.charH * 0.75);
        g2.addColorStop(0, 'rgba(255,200,40,0.14)');
        g2.addColorStop(1, 'rgba(255,200,40,0)');
        ctx.fillStyle = g2;
        ctx.fillRect(0, 0, v.vw, v.vh);
      }

      // ۴) میز
      const table = A.img(CFG.PATHS.table);
      if (table) {
        const tw = v.vw;
        const th = v.vh - v.tableTop + 30;
        ctx.drawImage(table, 0, v.tableTop, tw, th);
      } else {
        ctx.fillStyle = '#7b4a2d';
        ctx.fillRect(0, v.tableTop, v.vw, v.vh - v.tableTop);
      }

      // ۵) بشقاب‌ها و غذاها
      this.foods.renderPlates(ctx, v);
      this.foods.render(ctx, v);

      // ۶) افکت‌ها
      this.effects.render(ctx);

      ctx.restore();
    }

    // فریم کامل (از حلقه اصلی)
    frame(dt) {
      this.update(dt);
      this.render();
      RC.ui.updateHud(this);
      RC.ui.updateBelly(this);
      RC.ui.updateButtons(this);
    }
  }

  RC.Game = Game;
  RC.GameState = GS;
})();
