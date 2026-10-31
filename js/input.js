/* ============================================================
 * رضای چاق - Input Manager
 * Pointer Events + لمس چندنقطه‌ای امن + جلوگیری از ورودی تکراری
 * ============================================================ */
window.RC = window.RC || {};

(function () {
  'use strict';

  const CFG = RC.CONFIG;

  // هر Pointer فعال: {id, startX, startY, x, y, foodId, moved, downAt}
  const pointers = new Map();
  let canvasEl = null, toVirtual = null;
  let enabled = false;

  // جلوگیری از اسکرول/زوم مرورگر در ناحیه بازی
  function preventGestures(ev) {
    if (ev.cancelable) ev.preventDefault();
  }

  function onPointerDown(ev) {
    if (!enabled) return;
    if (ev.cancelable) ev.preventDefault();
    RC.audio.unlock();
    const v = toVirtual(ev.clientX, ev.clientY);
    pointers.set(ev.pointerId, {
      id: ev.pointerId,
      sx: v.x, sy: v.y,
      x: v.x, y: v.y,
      moved: false,
      downAt: performance.now(),
      foodId: null
    });
    if (RC.game && RC.game.onPointerDown) {
      RC.game.onPointerDown(ev.pointerId, v.x, v.y);
    }
    try { canvasEl.setPointerCapture(ev.pointerId); } catch (e) { /* بی‌خطر */ }
  }

  function onPointerMove(ev) {
    if (!enabled) return;
    const p = pointers.get(ev.pointerId);
    if (!p) return;
    if (ev.cancelable) ev.preventDefault();
    const v = toVirtual(ev.clientX, ev.clientY);
    p.x = v.x; p.y = v.y;
    if (Math.abs(p.x - p.sx) > 14 || Math.abs(p.y - p.sy) > 14) p.moved = true;
    if (RC.game && RC.game.onPointerMove) RC.game.onPointerMove(ev.pointerId, v.x, v.y, p.moved);
  }

  function onPointerUp(ev) {
    const p = pointers.get(ev.pointerId);
    if (!p) { return; }
    pointers.delete(ev.pointerId);
    if (!enabled) return;
    const v = toVirtual(ev.clientX, ev.clientY);
    const dt = performance.now() - p.downAt;
    if (RC.game && RC.game.onPointerUp) {
      RC.game.onPointerUp(ev.pointerId, v.x, v.y, p.moved, dt);
    }
  }

  function onPointerCancel(ev) {
    const p = pointers.get(ev.pointerId);
    pointers.delete(ev.pointerId);
    if (p && RC.game && RC.game.onPointerCancel) {
      RC.game.onPointerCancel(ev.pointerId);
    }
  }

  function attach(canvas, converter) {
    canvasEl = canvas;
    toVirtual = converter;
    canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
    canvas.addEventListener('pointermove', onPointerMove, { passive: false });
    canvas.addEventListener('pointerup', onPointerUp, { passive: false });
    canvas.addEventListener('pointercancel', onPointerCancel, { passive: false });
    canvas.addEventListener('lostpointercapture', onPointerCancel);
    // جلوگیری از منوی لمس طولانی و انتخاب
    canvas.addEventListener('contextmenu', preventGestures);
    document.addEventListener('touchmove', preventGestures, { passive: false });
    document.addEventListener('gesturestart', preventGestures);
    document.addEventListener('dblclick', preventGestures);
    enabled = true;
  }

  function setEnabled(v) {
    enabled = !!v;
    if (!enabled) clearAll();
  }

  function clearAll() {
    if (RC.game && RC.game.onPointerCancel) {
      for (const id of pointers.keys()) RC.game.onPointerCancel(id);
    }
    pointers.clear();
  }

  RC.input = { attach, setEnabled, clearAll, get activeCount() { return pointers.size; } };
})();
