/* ============================================================
 * رضای چاق - Effects
 * متن شناور امتیاز، ذرات، ستاره، لرزش دوربین، بنر
 * ============================================================ */
window.RC = window.RC || {};

(function () {
  'use strict';

  const CFG = RC.CONFIG;

  // ---------- متن شناور ----------
  class FloatText {
    constructor(x, y, text, opts) {
      opts = opts || {};
      this.x = x; this.y = y;
      this.text = text;
      this.t = 0;
      this.dur = opts.dur || 1.0;
      this.size = opts.size || 64;
      this.color = opts.color || '#ffd23e';
      this.stroke = opts.stroke || '#3a1c00';
      this.rise = opts.rise || 150;
      this.pop = opts.pop !== false;
    }
    update(dt) { this.t += dt; }
    get dead() { return this.t >= this.dur; }
    render(ctx) {
      const p = this.t / this.dur;
      const a = p < 0.75 ? 1 : 1 - (p - 0.75) / 0.25;
      let s = 1;
      if (this.pop && p < 0.22) s = 0.4 + (p / 0.22) * 0.75;
      else if (this.pop) s = 1.15 - Math.min(0.15, (p - 0.22) * 0.4);
      const y = this.y - this.rise * (p * p * (3 - 2 * p));
      ctx.save();
      ctx.globalAlpha = Math.max(0, a);
      ctx.font = '900 ' + Math.round(this.size * s) + 'px Vazirmatn, Tahoma, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(6, this.size * 0.16);
      ctx.strokeStyle = this.stroke;
      ctx.strokeText(this.text, this.x, y);
      ctx.fillStyle = this.color;
      ctx.fillText(this.text, this.x, y);
      ctx.restore();
    }
  }

  // ---------- ذره تصویری (ستاره/قلب/جرقه) ----------
  class SpriteParticle {
    constructor(x, y, img, opts) {
      opts = opts || {};
      this.x = x; this.y = y;
      this.img = img;
      this.vx = opts.vx || 0;
      this.vy = opts.vy || -220;
      this.g = opts.g != null ? opts.g : 420;
      this.size = opts.size || 70;
      this.rot = opts.rot || 0;
      this.vr = opts.vr || (Math.random() * 4 - 2);
      this.t = 0;
      this.dur = opts.dur || 1.1;
      this.fadeOut = opts.fadeOut !== false;
    }
    update(dt) {
      this.t += dt;
      this.vy += this.g * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.rot += this.vr * dt;
    }
    get dead() { return this.t >= this.dur; }
    render(ctx) {
      if (!this.img) return;
      const p = this.t / this.dur;
      const a = this.fadeOut ? (p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3) : 1;
      const s = this.size * (p < 0.15 ? 0.3 + (p / 0.15) * 0.7 : 1);
      ctx.save();
      ctx.globalAlpha = Math.max(0, a);
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rot);
      ctx.drawImage(this.img, -s / 2, -s / 2, s, s);
      ctx.restore();
    }
  }

  // ---------- ذره دایره‌ای (خرده غذا) ----------
  class Crumb {
    constructor(x, y, color) {
      this.x = x; this.y = y;
      const ang = Math.random() * Math.PI * 2;
      const sp = 130 + Math.random() * 260;
      this.vx = Math.cos(ang) * sp;
      this.vy = Math.sin(ang) * sp - 130;
      this.r = 5 + Math.random() * 7;
      this.color = color;
      this.t = 0;
      this.dur = 0.55 + Math.random() * 0.3;
    }
    update(dt) {
      this.t += dt;
      this.vy += 900 * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
    }
    get dead() { return this.t >= this.dur; }
    render(ctx) {
      const a = 1 - this.t / this.dur;
      ctx.save();
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r * (0.6 + a * 0.4), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // ---------- ستاره چرخان دور شخصیت (حالت ویژه) ----------
  class OrbitStar {
    constructor(cx, cy) {
      this.cx = cx; this.cy = cy;
      this.ang = Math.random() * Math.PI * 2;
      this.speed = 2.2 + Math.random() * 1.6;
      this.rx = 330 + Math.random() * 60;
      this.ry = 200 + Math.random() * 60;
      this.size = 46 + Math.random() * 26;
    }
    update(dt, cx, cy) {
      this.ang += this.speed * dt;
      this.cx = cx; this.cy = cy;
    }
    render(ctx, img) {
      const x = this.cx + Math.cos(this.ang) * this.rx;
      const y = this.cy + Math.sin(this.ang) * this.ry;
      if (!img) return;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(this.ang * 1.4);
      ctx.drawImage(img, -this.size / 2, -this.size / 2, this.size, this.size);
      ctx.restore();
    }
  }

  // ---------- مدیر افکت‌ها ----------
  class EffectsManager {
    constructor() {
      this.floats = [];
      this.particles = [];
      this.orbitStars = [];
      this.shake = 0;          // شدت لرزش باقی‌مانده
      this.shakeT = 0;
      this.rushGlow = 0;
    }

    reset() {
      this.floats.length = 0;
      this.particles.length = 0;
      this.orbitStars.length = 0;
      this.shake = 0;
      this.rushGlow = 0;
    }

    addFloat(x, y, text, opts) {
      // حداکثر ۱۲ متن همزمان - قدیمی‌ها حذف
      if (this.floats.length > 12) this.floats.shift();
      this.floats.push(new FloatText(x, y, text, opts));
    }

    burst(x, y, opts) {
      opts = opts || {};
      const n = opts.count || 6;
      for (let i = 0; i < n; i++) {
        this.particles.push(new SpriteParticle(x, y, opts.img, {
          vx: (Math.random() * 2 - 1) * (opts.spread || 200),
          vy: -(120 + Math.random() * 260),
          g: opts.g != null ? opts.g : 480,
          size: opts.size || 64,
          dur: 0.8 + Math.random() * 0.5
        }));
      }
    }

    crumbs(x, y, colors) {
      const n = 7;
      for (let i = 0; i < n; i++) {
        this.particles.push(new Crumb(x, y, colors[(Math.random() * colors.length) | 0]));
      }
    }

    startRush(cx, cy) {
      this.orbitStars.length = 0;
      for (let i = 0; i < 5; i++) this.orbitStars.push(new OrbitStar(cx, cy));
      this.rushGlow = 1;
    }

    stopRush() {
      this.orbitStars.length = 0;
      this.rushGlow = 0;
    }

    triggerShake(amount) {
      this.shake = Math.min(26, Math.max(this.shake, amount));
    }

    update(dt, charCenter) {
      for (let i = this.floats.length - 1; i >= 0; i--) {
        this.floats[i].update(dt);
        if (this.floats[i].dead) this.floats.splice(i, 1);
      }
      for (let i = this.particles.length - 1; i >= 0; i--) {
        this.particles[i].update(dt);
        if (this.particles[i].dead) this.particles.splice(i, 1);
      }
      const starImg = RC.Assets.img(CFG.PATHS.particles.sparkle);
      for (const s of this.orbitStars) s.update(dt, charCenter ? charCenter.x : 540, charCenter ? charCenter.y : 700);
      if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 34);
    }

    applyShake(ctx) {
      if (this.shake <= 0.1) return;
      const s = this.shake;
      ctx.translate((Math.random() * 2 - 1) * s, (Math.random() * 2 - 1) * s * 0.7);
    }

    render(ctx) {
      for (const p of this.particles) p.render(ctx);
      const sparkle = RC.Assets.img(CFG.PATHS.particles.sparkle);
      for (const s of this.orbitStars) s.render(ctx, sparkle);
      for (const f of this.floats) f.render(ctx);
    }
  }

  RC.EffectsManager = EffectsManager;
})();
