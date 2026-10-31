/* ============================================================
 * رضای چاق | REZA CHAGH - Game Configuration
 * همه مقادیر کلیدی از asset_manifest.json خوانده و ایمن‌سازی شده‌اند
 * ============================================================ */
window.RC = window.RC || {};

(function () {
  'use strict';

  const M = (RC.EMBEDDED_MANIFEST && RC.EMBEDDED_MANIFEST.gameplay) || {};

  // ---------- کمکی: عدد امن ----------
  function num(v, def) {
    const n = Number(v);
    return isFinite(n) && n >= 0 ? n : def;
  }

  // ---------- ابعاد طراحی ----------
  const DESIGN = {
    W: 1080,                 // عرض مجازی ثابت
    H_MIN: 1920,             // حداقل ارتفاع مجازی (16:9)
    H_MAX: 2400              // حداکثر ارتفاع مجازی (نسبت‌های بلندتر مثل 9:20)
  };

  // ---------- چیدمان (نرمال‌شده از Manifest) ----------
  const P = (RC.EMBEDDED_MANIFEST && RC.EMBEDDED_MANIFEST.positions_normalized) || {};
  const LAYOUT = {
    charCx: num(P.character_center && P.character_center[0], 0.5),
    charBaseY: num(P.character_base_y, 0.60),
    tableTopY: num(P.table_top_y, 0.56),
    spawnZone: {
      xMin: num(P.food_spawn_zone && P.food_spawn_zone.x_min, 0.13),
      xMax: num(P.food_spawn_zone && P.food_spawn_zone.x_max, 0.87),
      yMin: num(P.food_spawn_zone && P.food_spawn_zone.y_min, 0.65),
      yMax: num(P.food_spawn_zone && P.food_spawn_zone.y_max, 0.78)
    },
    // HTML layers
    hudTopY: 0.022,
    bellyBarY: 0.795,
    buttonsY: 0.885,
    // اندازه شخصیت (نسبت ارتفاع صفحه)
    charH: 0.52
  };

  // جایگاه‌های غذا روی میز: ۲ ردیف × ۴ ستون داخل ناحیه Spawn
  const SLOTS = [];
  (function buildSlots() {
    const z = LAYOUT.spawnZone;
    const cols = [0.175, 0.392, 0.608, 0.825];
    const rows = [0.665, 0.770];
    for (const ry of rows) for (const cx of cols) {
      SLOTS.push({
        x: Math.min(Math.max(cx, z.xMin + 0.045), z.xMax - 0.045),
        y: Math.min(Math.max(ry, z.yMin + 0.025), z.yMax - 0.025),
        occupied: false
      });
    }
  })();

  // ---------- گیم‌پلی ----------
  const GAMEPLAY = {
    roundSeconds: num(M.round_seconds, 60),
    spawnInterval: num(M.food_spawn_interval_seconds, 1.5),
    maxVisibleFood: Math.max(1, Math.floor(num(M.max_visible_food, 6))),
    comboWindow: num(M.combo_window_seconds, 1.2),
    comboMax: Math.max(1, Math.floor(num(M.combo_multiplier_max, 5))),
    goldenFrequency: Math.min(0.5, num(M.special_food_frequency, 0.1)),
    foodLifetime: 10.0,          // ثانیه ماندن غذا روی میز
    goldenLifetime: 6.5,         // غذای طلایی زودتر می‌پرد
    flyTime: 0.26,               // زمان پرواز غذا به دهان (ثانیه)
    flyTimeBoost: 0.12,          // در حالت شتاب
    hungryAfter: 3.5,            // ثانیه خالی ماندن میز → گرسنگی
    eatFps: 10,                  // از Manifest: eat fps
    eatFpsBoost: 16,
    chewFps: 8
  };

  // ---------- وزن ----------
  const CW = (RC.EMBEDDED_MANIFEST && RC.EMBEDDED_MANIFEST.character) || {};
  const weightThresholds = Array.isArray(CW.stages_at_total_weight_gain)
    ? CW.stages_at_total_weight_gain.map(v => num(v, 0)).slice(0, 5)
    : [0, 100, 250, 450, 700];
  while (weightThresholds.length < 5) {
    weightThresholds.push(weightThresholds[weightThresholds.length - 1] + 250);
  }

  // موقعیت دهان هر مرحله (کسری از اسپرایت ۵۱۲×۵۱۲) - استخراج پیکسلی از Assetها
  // pivot اسپرایت: (0.5, 0.953)
  const MOUTH_FRAC = [
    { x: 276 / 512, y: 295 / 512 },
    { x: 279 / 512, y: 284 / 512 },
    { x: 267 / 512, y: 276 / 512 },
    { x: 278 / 512, y: 260 / 512 },
    { x: 263 / 512, y: 250 / 512 }
  ];

  // ---------- غذاها از Manifest ----------
  // foods: [{id, file, score, weight_gain, hunger_restore}]
  const rawFoods = (RC.EMBEDDED_MANIFEST && RC.EMBEDDED_MANIFEST.foods) || [];
  const FOODS = [];
  for (const f of rawFoods) {
    if (!f || !f.file) continue;
    FOODS.push({
      id: String(f.id || f.name || 'food'),
      file: String(f.file),
      score: Math.round(num(f.score != null ? f.score : f.points, 20)),
      weightGain: num(f.weight_gain, 15),
      golden: false
    });
  }
  if (!FOODS.length) FOODS.push({ id: 'burger', file: 'foods/items/burger.png', score: 25, weightGain: 18.75, golden: false });

  // غذاهای طلایی از پوشه powerups (score_multiplier از Manifest)
  const POWERUPS = [];
  const rawAssets = (RC.EMBEDDED_MANIFEST && RC.EMBEDDED_MANIFEST.assets) || [];
  for (const a of rawAssets) {
    if (!a || !a.file || !String(a.file).startsWith('foods/powerups/')) continue;
    POWERUPS.push({
      id: 'golden_' + String(a.file).split('/').pop().replace('.png', ''),
      file: String(a.file),              // مسیر کامل از ریشه assets
      score: 40,                          // امتیاز پایه متوسط
      weightGain: 30,                     // وزن بالا
      golden: true,
      scoreMult: num(a.score_multiplier, 3)
    });
  }
  if (!POWERUPS.length) {
    POWERUPS.push({ id: 'golden_burger', file: 'foods/powerups/golden_burger.png', score: 40, weightGain: 30, golden: true, scoreMult: 3 });
  }

  RC.FOODS = FOODS;
  RC.POWERUPS = POWERUPS;

  // ---------- قابلیت‌های ویژه ----------
  const POWERS = {
    speedBoost: { duration: 8.0, usesPerRound: 2, spawnFactor: 0.45 },
    autoFeed: { duration: 5.0, usesPerRound: 1, interval: 0.4 },
    bellyRush: { duration: 5.0, scoreMult: 2, spawnFactor: 0.8 }
  };

  // ---------- ذخیره‌سازی ----------
  const STORAGE_KEYS = {
    best: 'rezaChagh.bestScore',
    coins: 'rezaChagh.coins',
    sound: 'rezaChagh.sound',
    vibrate: 'rezaChagh.vibrate'
  };

  // ---------- متن‌های فارسی ----------
  const FA = {
    title: 'رضای چاق',
    tagline: 'رضا رو خوراک بده و چاقش کن!',
    start: 'شروع بازی',
    resume: 'ادامه بازی',
    restart: 'دوباره بازی کن',
    home: 'خانه',
    score: 'امتیاز',
    best: 'بهترین رکورد',
    newRecord: 'رکورد جدید!',
    combo: (n) => 'کمبو ×' + RC.faNum(n),
    fatter: 'چاق‌تر شدی!',
    bellyRush: 'شکم انفجاری!',
    golden: 'طلایی!',
    timeUp: 'وقت تمام شد!',
    foodsEaten: 'غذاهای خورده‌شده',
    maxCombo: 'بیشترین کمبو',
    weightStage: 'مرحله چاقی',
    stageNames: ['معمولی', 'کمی چاق', 'چاق', 'خیلی چاق', 'فوق‌العاده چاق'],
    stageReactions: [
      'رضا هنوز گرسنه‌ست! بیشتر بخورون!',
      'رضا کمی پر شد، ولی هنوز جا داره!',
      'رضا حسابی پر شد! هودی داره تنگ می‌شه!',
      'رضا دیگه جا نداره! هودی داره پاره می‌شه!',
      'رضا تبدیل به غول شد! رستوران ترسید!'
    ],
    feed: 'بخور',
    speed: 'شتاب',
    auto: 'خودخور',
    soundOn: 'صدا: روشن',
    soundOff: 'صدا: خاموش',
    vibrateOn: 'لرزش: روشن',
    vibrateOff: 'لرزش: خاموش',
    loading: 'در حال بارگذاری...',
    loadError: 'خطا در بارگذاری فایل‌های بازی',
    retry: 'تلاش دوباره',
    ready: 'آماده‌ای؟',
    coins: 'سکه',
    earnedCoins: (n) => '+' + RC.faNum(n) + ' سکه',
    hungry: 'گرسنه‌ام!',
    paused: 'بازی متوقف شد',
    settings: 'تنظیمات'
  };

  // ---------- تبدیل عدد فارسی ----------
  const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  RC.faNum = function (n) {
    n = Math.round(Number(n) || 0);
    const s = String(n).replace(/\d/g, d => FA_DIGITS[+d]);
    return s.length > 3 ? s.replace(/\B(?=(\d{3})+(?!\d))/g, '٬') : s;
  };
  RC.faTime = function (sec) {
    sec = Math.max(0, Math.ceil(Number(sec) || 0));
    const m = Math.floor(sec / 60), s = sec % 60;
    return RC.faNum(m * 100 + s).padStart(2, '۰'); // مانند ۰۰:۵۹
  };
  // فرمت ۰۰:۵۹ دقیقه:ثانیه
  RC.faClock = function (sec) {
    sec = Math.max(0, Math.ceil(Number(sec) || 0));
    const m = Math.floor(sec / 60), s = sec % 60;
    const two = (v) => String(v).padStart(2, '0').replace(/\d/g, d => FA_DIGITS[+d]);
    return two(m) + ':' + two(s);
  };

  // ---------- مسیر Assetها ----------
  const PATHS = {
    weight: (s) => 'assets/characters/weight/stage_' + String(s).padStart(2, '0') + '.png',
    eatByWeight: (s, f) => 'assets/characters/animations/eat_by_weight/stage_' + String(s).padStart(2, '0') + '/frame_' + String(f).padStart(2, '0') + '.png',
    bgNeon: 'assets/environment/backgrounds/diner_neon_1080x1920.png',
    table: 'assets/environment/foreground/wood_table_1080x750.png',
    plates: {
      white: 'assets/environment/tableware/white_plate.png',
      red: 'assets/environment/tableware/red_plate.png',
      bowl: 'assets/environment/tableware/bowl.png'
    },
    particles: {
      sparkle: 'assets/effects/particles/sparkle.png',
      heart: 'assets/effects/particles/floating_heart.png',
      dust: 'assets/effects/particles/dust.png'
    },
    starFrames: (f) => 'assets/effects/animations/star/frame_' + String(f).padStart(2, '0') + '.png',
    icons: {
      coin: 'assets/ui/icons/gold_coin.png',
      trophy: 'assets/ui/icons/trophy.png',
      pause: 'assets/ui/icon_buttons/pause.png',
      play: 'assets/ui/icon_buttons/play.png',
      sound: 'assets/ui/icon_buttons/sound.png',
      settings: 'assets/ui/icon_buttons/settings.png',
      crown: 'assets/ui/icons/crown.png'
    },
    foodsDir: 'assets/',
    powerupsDir: 'assets/'
  };

  RC.CONFIG = {
    DESIGN, LAYOUT, SLOTS, GAMEPLAY, weightThresholds, MOUTH_FRAC,
    POWERS, STORAGE_KEYS, FA, PATHS
  };
})();
