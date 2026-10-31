/* ============================================================
 * رضای چاق - Main Bootstrap
 * راه‌اندازی، حلقه بازی، رویدادها، API دیباگ برای تست
 * ============================================================ */
window.RC = window.RC || {};

(function () {
  'use strict';

  const CFG = RC.CONFIG;

  let game = null;
  let rafStarted = false;
  let lastFrameTime = 0;
  const DEBUG = new URLSearchParams(location.search).has('debug');

  // ---------- حلقه اصلی (فقط یک‌بار اجرا می‌شود) ----------
  function loop(ts) {
    if (!game) return;
    if (!lastFrameTime) lastFrameTime = ts;
    let dt = (ts - lastFrameTime) / 1000;
    lastFrameTime = ts;
    // محدود کردن dt برای جلوگیری از پرش بعد از تعویض تب
    if (!isFinite(dt) || dt < 0) dt = 0;
    if (dt > 0.1) dt = 0.1;
    try {
      game.frame(dt);
    } catch (e) {
      console.error('[Game] خطای فریم:', e);
    }
    requestAnimationFrame(loop);
  }

  // ---------- اتصال دکمه‌ها ----------
  function bindButtons() {
    const on = (id, fn) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('click', (ev) => {
        ev.preventDefault();
        RC.audio.unlock();
        fn();
      });
      // جلوگیری از دوبار فعال‌شدن با لمس+کلیک
      el.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    };

    on('btn-start', () => game.startRound());
    on('btn-retry', () => { RC.ui.showHud(false); document.getElementById('screen-over').classList.add('hidden'); game.startRound(); });
    on('btn-home-over', () => game.goHome());
    on('btn-resume', () => game.resumeGame());
    on('btn-home-pause', () => game.goHome());
    on('btn-pause', () => game.pauseGame(false));
    on('btn-feed', () => game.feedNearest());
    on('btn-speed', () => game.activateSpeed());
    on('btn-auto', () => game.activateAuto());
    on('btn-sound-start', () => game.toggleSound());
    on('btn-sound-pause', () => game.toggleSound());
    on('btn-vibrate-pause', () => game.toggleVibrate());
    on('load-error', () => location.reload());
  }

  // ---------- رویدادهای صفحه ----------
  function bindWindowEvents() {
    // Resize با debounce سبک
    let resizeTimer = null;
    function doResize() {
      if (game) {
        game.resize();
        game.render();
      }
    }
    window.addEventListener('resize', () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(doResize, 80);
    });
    window.addEventListener('orientationchange', () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(doResize, 150);
    });

    // توقف خودکار وقتی تب مخفی می‌شود
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && game && game.state === RC.GameState.PLAYING) {
        game.pauseGame(true);
      }
    });
    window.addEventListener('blur', () => {
      if (game && game.state === RC.GameState.PLAYING) game.pauseGame(true);
    });
  }

  // ---------- API دیباگ (فقط با ?debug=1) ----------
  function installDebugApi() {
    const api = {
      state: () => ({
        state: game.state,
        score: game.score,
        weight: game.weight,
        stage: game.stage,
        combo: game.combo,
        maxCombo: game.maxCombo,
        timeLeft: game.timeLeft,
        foodsEaten: game.foodsEaten,
        tableFoods: game.foods.tableCount,
        charState: game.character.state,
        rush: game.rushActive,
        speed: { ...game.powers.speed },   // snapshot نه مرجع زنده
        auto: { ...game.powers.auto },
        best: game.persist.best
      }),
      // تب‌پوینت‌های غذا برای تست لمس
      foodPositions: () => game.foods.items.filter(f => f.state === 'table').map(f => ({
        uid: f.uid,
        css: { x: f.x * game.view.scale, y: f.y * game.view.scale },
        virtual: { x: f.x, y: f.y },
        def: f.def.id,
        golden: !!f.def.golden
      })),
      start: () => game.startRound(),
      pause: () => game.pauseGame(false),
      resume: () => game.resumeGame(),
      restart: () => game.startRound(),
      home: () => game.goHome(),
      feed: () => game.feedNearest(),
      speed: () => game.activateSpeed(),
      auto: () => game.activateAuto(),
      spawn: (defId, slot) => {
        let def = null;
        if (defId) {
          def = RC.FOODS.find(f => f.id === defId) || RC.POWERUPS.find(f => f.id === defId);
        }
        return game.foods.spawn(def || null, slot != null ? slot : null);
      },
      addWeight: (w) => { game.weight = Math.min(9999, Math.max(0, game.weight + w)); game.checkStageUp(); },
      setWeight: (w) => {
        game.weight = Math.max(0, w | 0);
        // بازمحاسبه کامل مرحله (برای تست - در گیم‌پلی وزن فقط زیاد می‌شود)
        let st = 0;
        while (st < 4 && game.weight >= CFG.weightThresholds[st + 1]) st++;
        game.stage = st;
        game.character.setStage(st);
      },
      setTime: (t) => { game.timeLeft = Math.max(0.05, Math.min(3600, t)); },
      // شبیه‌سازی مستقیم لمس روی Canvas (مختصات CSS)
      tapAt: (cssX, cssY) => {
        const v = game.toVirtual(cssX, cssY);
        game.onPointerDown(999, v.x, v.y);
        game.onPointerUp(999, v.x, v.y, false, 50);
      },
      // خوردن سریع بدون انیمیشن ورودی
      eatTableFood: () => {
        const f = game.foods.nearestToMouth();
        return f ? game.eatFood(f) : false;
      },
      view: () => ({ ...game.view })
    };
    window.__REZA = api;
  }

  // ---------- شروع ----------
  async function init() {
    const canvas = document.getElementById('game-canvas');
    RC.ui.cacheEls();

    game = new RC.Game(canvas);
    RC.game = game;
    game.resize();

    // صدا از تنظیمات ذخیره‌شده
    RC.audio.setEnabled(!!game.persist.sound);
    RC.ui.updateSoundBtn(!!game.persist.sound);
    RC.ui.updateVibrateBtn(!!game.persist.vibrate);

    // ورودی
    RC.input.attach(canvas, (cx, cy) => game.toVirtual(cx, cy));

    bindButtons();
    bindWindowEvents();
    if (DEBUG) installDebugApi();

    // بارگذاری Assetهای ضروری
    RC.ui.showLoading(0, false);
    const ok = await RC.Assets.loadCritical((p) => {
      RC.ui.showLoading(p, false);
    });

    if (!ok) {
      RC.ui.showLoading(1, true);
      console.error('[Assets] فایل‌های بارگذاری‌نشده:', RC.Assets.errors);
      return;
    }

    RC.ui.hideLoading();
    RC.ui.showStart(game.persist.best);

    // Assetهای اختیاری در پس‌زمینه
    RC.Assets.loadLazy();

    // حلقه بازی - فقط یک‌بار
    if (!rafStarted) {
      rafStarted = true;
      requestAnimationFrame(loop);
    }

    // پیش‌بارگذاری فونت برای متن Canvas
    if (document.fonts && document.fonts.load) {
      try { document.fonts.load('900 64px Vazirmatn'); } catch (e) { /* بی‌خطر */ }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
