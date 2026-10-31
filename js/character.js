/* ============================================================
 * رضای چاق - Character
 * ماشین حالت: IDLE, EAT, CHEW, HAPPY, HUNGRY, POWERUP, FULL
 * انیمیشن خوردن مخصوص هر مرحله وزن + Tween نفس‌کشیدن
 * ============================================================ */
window.RC = window.RC || {};

(function () {
  'use strict';

  const CFG = RC.CONFIG;

  // حالت‌های شخصیت (مستقل از حالت بازی)
  const STATE = {
    IDLE: 'IDLE',
    EAT: 'EAT',
    CHEW: 'CHEW',
    HAPPY: 'HAPPY',
    HUNGRY: 'HUNGRY',
    POWERUP: 'POWERUP',
    FULL: 'FULL'
  };

  const EAT_FRAMES = 9;    // از Manifest
  const CHEW_FRAMES = [4, 5]; // فریم‌های جویدن داخل انیمیشن eat

  class Character {
    constructor() {
      this.state = STATE.IDLE;
      this.stage = 0;              // مرحله وزن فعلی 0..4
      this.animStage = 0;          // مرحله‌ای که انیمیشن جاری با آن شروع شده (ضدتداخل)
      this.frame = 0;
      this.frameTimer = 0;
      this.fps = CFG.GAMEPLAY.eatFps;
      this.lastEatAt = -1e9;
      this.t = 0;                  // زمان کلی برای Tweenها
      this.bounce = 0;             // Tween Bounce (۰..۱)
      this.bounceDir = 0;          // ۰=غیرفعال
      this.squash = 0;             // له‌شدن لحظه‌ای گاز زدن
      this.powerPulse = 0;         // پالس حالت ویژه
      this.visible = true;
      this.auraPhase = 0;
    }

    reset(stage) {
      this.state = STATE.IDLE;
      this.stage = Number(stage) || 0;
      this.animStage = this.stage;
      this.frame = 0;
      this.frameTimer = 0;
      this.lastEatAt = -1e9;
      this.bounce = 0;
      this.bounceDir = 0;
      this.squash = 0;
      this.powerPulse = 0;
    }

    // موقعیت دهان در مختصات مجازی
    mouthPos(view) {
      const L = CFG.LAYOUT;
      const h = view.charH;
      const drawX = view.cx - h / 2;
      const drawY = view.baseY - 0.953 * h;
      const m = CFG.MOUTH_FRAC[Math.min(4, Math.max(0, this.stage))];
      return { x: drawX + m.x * h, y: drawY + m.y * h };
    }

    setStage(s) {
      s = Math.min(4, Math.max(0, s | 0));
      if (s === this.stage) return false;
      this.stage = s;
      // اگر وسط انیمیشن هستیم، انیمیشن فعلی با فریم‌های مرحله قبل تا انتها می‌ماند
      // و انیمیشن بعدی از مرحله جدید پخش می‌شود (ضدتداخل فریم)
      return true;
    }

    // ورود غذا به دهان
    onFoodArrived(speedBoostActive) {
      this.lastEatAt = this.t;
      this.squash = 1;
      this.startEat(speedBoostActive);
    }

    startEat(speedBoostActive) {
      this.animStage = this.stage;   // قفل مرحله برای این پخش
      this.state = STATE.EAT;
      this.frame = 0;
      this.frameTimer = 0;
      this.fps = speedBoostActive ? CFG.GAMEPLAY.eatFpsBoost : CFG.GAMEPLAY.eatFps;
    }

    triggerHappy() {
      this.bounce = 1;       // Bounce بزرگ‌شدن
      this.bounceDir = 1;
      // اگر در حال خوردن نیستیم، یک انیمیشن eat کوتاه برای واکنش چهره
      if (this.state === STATE.IDLE || this.state === STATE.HUNGRY) {
        this.startEat(false);
      }
    }

    triggerPowerup() {
      this.state = STATE.POWERUP;
      this.powerPulse = 1;
    }

    endPowerup() {
      if (this.state === STATE.POWERUP) this.state = STATE.IDLE;
    }

    setFull() { this.state = STATE.FULL; }

    update(dt, gameCtx) {
      this.t += dt;
      // Tweenها
      if (this.bounceDir) {
        this.bounce -= dt * 2.2;
        if (this.bounce <= 0) { this.bounce = 0; this.bounceDir = 0; }
      }
      this.squash = Math.max(0, this.squash - dt * 5.5);
      this.auraPhase += dt;

      const now = this.t;
      const recentEat = (now - this.lastEatAt) < 1.0;

      switch (this.state) {
        case STATE.EAT: {
          this.frameTimer += dt;
          const frameDur = 1 / this.fps;
          while (this.frameTimer >= frameDur) {
            this.frameTimer -= frameDur;
            this.frame++;
            if (this.frame >= EAT_FRAMES) {
              // پایان انیمیشن خوردن
              if (recentEat && gameCtx && gameCtx.state === RC.GameState.PLAYING) {
                this.state = STATE.CHEW;
                this.frame = CHEW_FRAMES[0];
                this.frameTimer = 0;
                RC.audio.play('chew');   // صدای جویدن
              } else {
                this.state = STATE.IDLE;
                this.frame = 0;
              }
              break;
            }
          }
          break;
        }
        case STATE.CHEW: {
          this.frameTimer += dt;
          const frameDur = 1 / CFG.GAMEPLAY.chewFps;
          while (this.frameTimer >= frameDur) {
            this.frameTimer -= frameDur;
            this.frame++;
            if (this.frame > CHEW_FRAMES[1]) this.frame = CHEW_FRAMES[0];
          }
          if ((now - this.lastEatAt) > 1.35) {
            this.state = STATE.IDLE;
          }
          break;
        }
        case STATE.HUNGRY:
        case STATE.IDLE:
        case STATE.HAPPY:
        case STATE.POWERUP:
        case STATE.FULL:
          // حالت‌های Tweenمحور - در render انیمیت می‌شوند
          break;
      }
    }

    // دریافت تصویر فعلی برای رسم
    currentSprite() {
      const A = RC.Assets;
      if (this.state === STATE.EAT || this.state === STATE.CHEW || this.state === STATE.FULL) {
        // FULL: فریم آخر (pat شکم) از مرحله فعلی
        const f = this.state === STATE.FULL ? EAT_FRAMES - 1 : Math.min(EAT_FRAMES - 1, this.frame);
        const st = this.state === STATE.FULL ? this.stage : this.animStage;
        const im = A.img(CFG.PATHS.eatByWeight(st, f));
        if (im) return im;
      }
      // تصویر پایه مرحله فعلی (پایه Idle)
      return A.img(CFG.PATHS.weight(this.stage));
    }

    render(ctx, view) {
      const im = this.currentSprite();
      if (!im) return; // تصویر در دسترس نیست - شخصیت رسم نمی‌شود (خطای Load جداگانه گزارش شده)

      const h = view.charH;
      let x = view.cx - h / 2;
      let y = view.baseY - 0.953 * h;

      // ----- Tweenها -----
      let scaleX = 1, scaleY = 1, rot = 0;

      // نفس‌کشیدن آرام (همه حالت‌ها)
      const br = Math.sin(this.t * 2.1);
      scaleY *= 1 + 0.009 * br;
      scaleX *= 1 - 0.006 * br;

      if (this.state === STATE.IDLE || this.state === STATE.FULL) {
        const sp = this.state === STATE.FULL ? 1.4 : 2.1;
        y += Math.sin(this.t * sp) * (h * 0.004);
        rot = Math.sin(this.t * 1.05) * 0.006;
      }

      // گرسنگی: لرزش و خم‌شدن ملایم
      if (this.state === STATE.HUNGRY) {
        rot += Math.sin(this.t * 9) * 0.006 + 0.02;
        y += Math.abs(Math.sin(this.t * 9)) * h * 0.004;
      }

      // حالت ویژه: پالس هیجان
      if (this.state === STATE.POWERUP) {
        const p = 1 + Math.sin(this.auraPhase * 10) * 0.018;
        scaleX *= p; scaleY *= p;
        y -= Math.abs(Math.sin(this.auraPhase * 8)) * h * 0.008;
      }

      // Bounce مرحله جدید وزن
      if (this.bounce > 0) {
        const b = 1 + Math.sin(this.bounce * Math.PI) * 0.14;
        scaleX *= b; scaleY *= b;
      }

      // له‌شدن گاز
      if (this.squash > 0) {
        scaleX *= 1 + this.squash * 0.03;
        scaleY *= 1 - this.squash * 0.025;
      }

      const w = h; // اسپرایت مربعی
      const cx = x + w / 2;
      const by = y + 0.953 * h; // نقطه پایه (کف اسپرایت)

      ctx.save();
      ctx.translate(cx, by);
      if (rot) ctx.rotate(rot);
      ctx.scale(scaleX, scaleY);
      ctx.translate(-w / 2, -0.953 * h);

      // هاله طلایی حالت ویژه
      if (this.state === STATE.POWERUP) {
        this.renderAura(ctx, w, h);
      }

      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(im, 0, 0, w, h);
      ctx.restore();
    }

    renderAura(ctx, w, h) {
      const r = w * (0.52 + Math.sin(this.auraPhase * 6) * 0.02);
      const g = ctx.createRadialGradient(w / 2, h * 0.55, r * 0.55, w / 2, h * 0.55, r);
      g.addColorStop(0, 'rgba(255, 214, 0, 0.30)');
      g.addColorStop(0.7, 'rgba(255, 170, 0, 0.15)');
      g.addColorStop(1, 'rgba(255, 170, 0, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(w / 2, h * 0.55, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  RC.Character = Character;
  RC.CharacterState = STATE;
})();
