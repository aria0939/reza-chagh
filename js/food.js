/* ============================================================
 * رضای چاغ - Food System
 * تولید غذا در جایگاه‌های میز، حرکت به دهان، جلوگیری از امتیاز تکراری
 * ============================================================ */
window.RC = window.RC || {};

(function () {
  'use strict';

  const CFG = RC.CONFIG;

  const FOOD_STATE = {
    TABLE: 'table',       // روی میز
    DRAGGING: 'dragging', // در حال کشیده‌شدن
    FLYING: 'flying',     // در پرواز به دهان
    RETURNING: 'returning', // برگشت به جایگاه
    EATEN: 'eaten',
    EXPIRED: 'expired'
  };

  let nextFoodUid = 1;

  class FoodItem {
    constructor(def, slotIdx, pos) {
      this.uid = nextFoodUid++;
      this.def = def;                 // {id, file, score, weightGain, golden, scoreMult}
      this.slotIdx = slotIdx;
      this.x = pos.x;
      this.y = pos.y;
      this.homeX = pos.x;
      this.homeY = pos.y;
      this.state = FOOD_STATE.TABLE;
      this.age = 0;
      this.life = def.golden ? CFG.GAMEPLAY.goldenLifetime : CFG.GAMEPLAY.foodLifetime;
      this.fade = 1;                  // ۱ = نمایان
      this.scale = 0;                 // Spawn با پاپ
      this.popIn = 1;                 // Tween ظاهرشدن
      this.selected = false;
      this.flyT = 0;
      this.flyDur = CFG.GAMEPLAY.flyTime;
      this.fromX = 0; this.fromY = 0;
      this.rot = 0;
      this.rotSpeed = (Math.random() * 2 - 1) * 1.6;
      this.wobble = Math.random() * Math.PI * 2;
      this.pointerId = null;
      // بشقاب سفید/کاسه - بشقاب قرمز روی میز چاک‌دار قرمز دیده نمی‌شود
      this.plate = Math.random() < 0.7 ? 'white' : 'bowl';
      this.arrived = false;           // ضد امتیاز تکراری
    }

    get path() {
      return this.def.golden
        ? CFG.PATHS.powerupsDir + this.def.file
        : CFG.PATHS.foodsDir + this.def.file;
    }

    get radius() {
      // شعاع لمس - بزرگ‌تر از تصویر برای لمس راحت موبایل
      return this.def.golden ? 108 : 96;
    }

    isOnTable() {
      return this.state === FOOD_STATE.TABLE || this.state === FOOD_STATE.DRAGGING;
    }

    update(dt, mouth) {
      this.age += dt;
      this.wobble += dt * 2.2;

      // ظاهرشدن با پاپ
      if (this.popIn > 0) this.popIn = Math.max(0, this.popIn - dt * 4);

      switch (this.state) {
        case FOOD_STATE.TABLE:
          // انقضا
          if (this.age > this.life) {
            this.fade -= dt * 2.2;
            if (this.fade <= 0) { this.state = FOOD_STATE.EXPIRED; this.fade = 0; }
          }
          break;

        case FOOD_STATE.DRAGGING:
          break;

        case FOOD_STATE.FLYING: {
          this.flyT += dt / this.flyDur;
          const t = Math.min(1, this.flyT);
          // ease-in به سمت دهان
          const e = t * t * (3 - 2 * t);
          const mx = mouth ? mouth.x : this.homeX;
          const my = mouth ? mouth.y : this.homeY;
          this.x = this.fromX + (mx - this.fromX) * e;
          this.y = this.fromY + (my - this.fromY) * e;
          this.rot += this.rotSpeed * dt * 3;
          // کوچک‌شدن در لحظه رسیدن
          this.scale = t > 0.75 ? Math.max(0.25, 1 - (t - 0.75) * 2.6) : 1;
          if (t >= 1 && !this.arrived) {
            this.arrived = true;
            this.state = FOOD_STATE.EATEN;
          }
          break;
        }

        case FOOD_STATE.RETURNING: {
          this.flyT += dt / 0.22;
          const t = Math.min(1, this.flyT);
          const e = 1 - (1 - t) * (1 - t);
          this.x = this.fromX + (this.homeX - this.fromX) * e;
          this.y = this.fromY + (this.homeY - this.fromY) * e;
          if (t >= 1) this.state = FOOD_STATE.TABLE;
          break;
        }
      }
    }

    // شروع پرواز به دهان - فقط یک‌بار قابل اجراست
    startFly(mouth, fast) {
      if (this.state !== FOOD_STATE.TABLE && this.state !== FOOD_STATE.DRAGGING) return false;
      if (this.arrived) return false;
      this.state = FOOD_STATE.FLYING;
      this.flyT = 0;
      this.flyDur = fast ? CFG.GAMEPLAY.flyTimeBoost : CFG.GAMEPLAY.flyTime;
      this.fromX = this.x;
      this.fromY = this.y;
      this.selected = false;
      this.pointerId = null;
      return true;
    }

    startDrag(pid) {
      if (this.state !== FOOD_STATE.TABLE) return false;
      this.state = FOOD_STATE.DRAGGING;
      this.pointerId = pid;
      this.selected = true;
      return true;
    }

    moveTo(x, y) {
      if (this.state !== FOOD_STATE.DRAGGING) return;
      this.x = x; this.y = y;
    }

    release(mouth, dropZoneTop) {
      if (this.state !== FOOD_STATE.DRAGGING) return false;
      this.pointerId = null;
      // اگر نزدیک دهان یا بالای میز رها شد → خوردن
      const nearMouth = mouth && Math.hypot(this.x - mouth.x, this.y - mouth.y) < 300;
      const aboveTable = this.y < dropZoneTop;
      if (nearMouth || aboveTable) {
        return this.startFly(mouth, true);
      }
      // برگشت به جایگاه
      this.state = FOOD_STATE.RETURNING;
      this.flyT = 0;
      this.fromX = this.x; this.fromY = this.y;
      this.selected = false;
      return false;
    }

    cancelDrag() {
      if (this.state !== FOOD_STATE.DRAGGING) return;
      this.state = FOOD_STATE.RETURNING;
      this.flyT = 0;
      this.fromX = this.x; this.fromY = this.y;
      this.selected = false;
      this.pointerId = null;
    }

    render(ctx, view) {
      const im = RC.Assets.img(this.path);
      if (!im) return;

      let size = this.def.golden ? 205 : 178; // پیکسل مجازی
      if (view.vw < 1080) size *= view.vw / 1080;

      let a = this.fade;
      // پاپ ظاهرشدن
      let s = 1 - this.popIn * 0.6;

      let dx = this.x, dy = this.y;
      let rot = 0;

      if (this.state === FOOD_STATE.TABLE) {
        dy += Math.sin(this.wobble) * 4;
        if (this.selected) s *= 1.12;
      }
      if (this.state === FOOD_STATE.FLYING) {
        s *= this.scale;
        rot = this.rot;
      }
      if (this.def.golden && this.isOnTable()) {
        // پالس طلایی
        s *= 1 + Math.sin(this.wobble * 1.7) * 0.06;
      }

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, a));
      ctx.translate(dx, dy);
      if (rot) ctx.rotate(rot);

      // درخشش انتخاب/طلایی
      if (this.selected || (this.def.golden && this.isOnTable())) {
        ctx.shadowColor = this.def.golden ? 'rgba(255,200,0,0.95)' : 'rgba(255,255,255,0.85)';
        ctx.shadowBlur = 34;
      }

      const w = size * s, h = size * s;
      ctx.drawImage(im, -w / 2, -h / 2, w, h);
      ctx.restore();
    }

    renderPlate(ctx, view) {
      // بشقاب زیر غذا - فقط وقتی روی میز است
      if (!this.isOnTable() && this.state !== FOOD_STATE.RETURNING) return;
      const p = RC.Assets.img(CFG.PATHS.plates[this.plate === 'bowl' ? 'bowl' : this.plate] || CFG.PATHS.plates.white);
      if (!p) return;
      const w = 235, h = 118;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, this.fade)) * 0.98;
      const py = this.state === FOOD_STATE.DRAGGING ? this.homeY : this.y;
      const px = this.state === FOOD_STATE.DRAGGING ? this.homeX : this.x;
      ctx.drawImage(p, px - w / 2, py - h / 2 + 26, w, h);
      ctx.restore();
    }
  }

  // ---------- مدیر غذاها ----------
  class FoodManager {
    constructor() {
      this.items = [];
      this.spawnTimer = 0.6;
      this.slotFoods = new Array(CFG.SLOTS.length).fill(null);
      this.view = null; // از Game به‌روزرسانی می‌شود
    }

    reset() {
      this.items.length = 0;
      this.slotFoods.fill(null);
      this.spawnTimer = 0.6;
    }

    get tableCount() {
      let n = 0;
      for (const f of this.items) if (f.isOnTable()) n++;
      return n;
    }

    get activeCount() {
      return this.items.length;
    }

    freeSlots() {
      const out = [];
      for (let i = 0; i < this.slotFoods.length; i++) {
        if (!this.slotFoods[i]) out.push(i);
      }
      return out;
    }

    // انتخاب تعریف غذا: طلایی با احتمال کم
    pickDef() {
      if (Math.random() < CFG.GAMEPLAY.goldenFrequency) {
        return RC.POWERUPS[(Math.random() * RC.POWERUPS.length) | 0];
      }
      return RC.FOODS[(Math.random() * RC.FOODS.length) | 0];
    }

    spawn(def, slotIdx) {
      const free = this.freeSlots();
      if (!free.length) return null;
      const view = this.view || (RC.game && RC.game.view);
      if (!view) return null;
      const idx = slotIdx != null && this.slotFoods[slotIdx] == null ? slotIdx : free[(Math.random() * free.length) | 0];
      const slot = CFG.SLOTS[idx];
      // جیتر کوچک
      const jx = (Math.random() * 2 - 1) * 14;
      const jy = (Math.random() * 2 - 1) * 10;
      const d = def || this.pickDef();
      const f = new FoodItem(d, idx, {
        x: slot.x * view.vw + jx,
        y: slot.y * view.vh + jy
      });
      this.items.push(f);
      this.slotFoods[idx] = f;
      return f;
    }

    findAt(x, y) {
      // نزدیک‌ترین غذای قابل لمس
      let best = null, bestD = Infinity;
      for (const f of this.items) {
        if (f.state !== FOOD_STATE.TABLE) continue;
        const d = Math.hypot(f.x - x, f.y - y);
        if (d < f.radius && d < bestD) { best = f; bestD = d; }
      }
      return best;
    }

    nearestToMouth(mouthX) {
      let best = null, bestY = Infinity;
      for (const f of this.items) {
        if (f.state !== FOOD_STATE.TABLE) continue;
        if (f.y < bestY) { best = f; bestY = f.y; }
      }
      return best;
    }

    selectedFood() {
      for (const f of this.items) if (f.selected && f.state === FOOD_STATE.TABLE) return f;
      return null;
    }

    update(dt, mouth, spawnInterval, maxVisible, view) {
      if (view) this.view = view;
      const justEaten = [];
      // تولید غذا
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        if (this.tableCount < maxVisible && this.freeSlots().length > 0) {
          this.spawn();
        }
        this.spawnTimer = spawnInterval * (0.82 + Math.random() * 0.36);
      }

      // به‌روزرسانی آیتم‌ها
      for (let i = this.items.length - 1; i >= 0; i--) {
        const f = this.items[i];
        f.update(dt, mouth);
        if (f.state === FOOD_STATE.EATEN) {
          justEaten.push(f);
          if (f.slotIdx >= 0 && this.slotFoods[f.slotIdx] === f) this.slotFoods[f.slotIdx] = null;
          this.items.splice(i, 1);
        } else if (f.state === FOOD_STATE.EXPIRED) {
          if (f.slotIdx >= 0 && this.slotFoods[f.slotIdx] === f) this.slotFoods[f.slotIdx] = null;
          this.items.splice(i, 1);
        }
      }
      return justEaten;
    }

    renderPlates(ctx, view) {
      for (const f of this.items) f.renderPlate(ctx, view);
    }

    render(ctx, view) {
      // اول غذاهای روی میز، بعد پروازکننده‌ها (روی شخصیت)
      for (const f of this.items) if (f.state !== FOOD_STATE.FLYING) f.render(ctx, view);
      for (const f of this.items) if (f.state === FOOD_STATE.FLYING) f.render(ctx, view);
    }
  }

  RC.FoodManager = FoodManager;
  RC.FoodState = FOOD_STATE;
})();
