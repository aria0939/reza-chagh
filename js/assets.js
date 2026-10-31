/* ============================================================
 * رضای چاق - Asset Loader
 * بارگذاری تصاویر با پیشرفت، مدیریت خطا، تفکیک ضروری/اختیاری
 * ============================================================ */
window.RC = window.RC || {};

(function () {
  'use strict';

  const CFG = RC.CONFIG;
  const images = {};        // path -> HTMLImageElement | null(خطا)
  const loadErrors = [];
  let loadedCount = 0, totalCount = 0;

  function img(path) {
    const im = images[path];
    return (im && im.ok) ? im.el : null;
  }

  function loadOne(path) {
    return new Promise((resolve) => {
      if (images[path]) { resolve(); return; }
      const el = new Image();
      el.decoding = 'async';
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        loadedCount++;
        images[path] = { el, ok };
        if (!ok) {
          loadErrors.push(path);
          console.warn('[Assets] خطا در بارگذاری:', path);
        }
        resolve();
      };
      el.onload = () => finish(true);
      el.onerror = () => finish(false);
      el.src = path;
    });
  }

  // ساخت لیست فایل‌های ضروری برای شروع بازی
  function criticalList() {
    const list = [
      CFG.PATHS.bgNeon,
      CFG.PATHS.table,
      CFG.PATHS.plates.white,
      CFG.PATHS.plates.red,
      CFG.PATHS.particles.sparkle,
      CFG.PATHS.particles.heart,
      CFG.PATHS.icons.coin,
      CFG.PATHS.icons.pause,
      CFG.PATHS.icons.trophy,
      CFG.PATHS.icons.crown
    ];
    // مراحل وزن
    for (let s = 0; s < 5; s++) list.push(CFG.PATHS.weight(s));
    // انیمیشن خوردن برای هر ۵ مرحله (۹ فریم)
    for (let s = 0; s < 5; s++)
      for (let f = 0; f < 9; f++) list.push(CFG.PATHS.eatByWeight(s, f));
    // ستاره‌ها
    for (let f = 0; f < 8; f++) list.push(CFG.PATHS.starFrames(f));
    // غذاها از Manifest
    for (const fd of RC.FOODS) list.push(CFG.PATHS.foodsDir + fd.file);
    for (const p of RC.POWERUPS) list.push(CFG.PATHS.powerupsDir + p.file);
    return list;
  }

  // منابع غیرضروری - بعد از نمایش منوی شروع بارگذاری می‌شوند
  function lazyList() {
    return [
      'assets/environment/backgrounds/diner_day_1080x1920.png',
      'assets/environment/backgrounds/diner_midnight_1080x1920.png',
      'assets/effects/particles/dust.png',
      'assets/environment/tableware/bowl.png',
      'assets/effects/score/plus_10.png',
      'assets/effects/score/plus_50.png',
      'assets/effects/score/plus_100.png',
      'assets/ui/icon_buttons/settings.png',
      'assets/ui/icon_buttons/sound.png',
      'assets/ui/icon_buttons/play.png'
    ];
  }

  async function fetchLiveManifest() {
    // تلاش برای خواندن Manifest زنده (در سرور محلی) و ادغام با نسخه Embedded
    try {
      const r = await fetch('assets/asset_manifest.json', { cache: 'no-cache' });
      if (!r.ok) return false;
      const live = await r.json();
      if (live && Array.isArray(live.assets) && live.assets.length) {
        RC.LIVE_MANIFEST = live;
        return true;
      }
    } catch (e) { /* file:// یا آفلاین - مشکلی نیست */ }
    return false;
  }

  async function loadCritical(onProgress) {
    await fetchLiveManifest();
    const list = criticalList();
    totalCount = list.length;
    loadedCount = 0;
    // بارگذاری موازی با محدودیت همزمانی (۸)
    const CONC = 8;
    let idx = 0;
    async function worker() {
      while (idx < list.length) {
        const p = list[idx++];
        await loadOne(p);
        if (onProgress) onProgress(loadedCount / totalCount, p);
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONC, list.length) }, worker));
    return loadErrors.length === 0;
  }

  async function loadLazy() {
    const list = lazyList();
    await Promise.all(list.map(loadOne));
  }

  RC.Assets = {
    img, loadCritical, loadLazy,
    get errors() { return loadErrors.slice(); },
    get progress() { return totalCount ? loadedCount / totalCount : 0; }
  };
})();
