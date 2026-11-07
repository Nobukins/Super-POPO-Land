// 入力: キーボード / ゲームパッド / タッチボタンを共通のボタン状態にまとめる
(() => {
  "use strict";

  const BUTTONS = ["left", "right", "up", "down", "jump", "run", "start"];
  const KEYMAP = {
    ArrowLeft: "left", KeyA: "left",
    ArrowRight: "right", KeyD: "right",
    ArrowUp: "up", KeyW: "up",
    ArrowDown: "down", KeyS: "down",
    Space: "jump", KeyZ: "jump", KeyK: "jump",
    KeyX: "run", ShiftLeft: "run", ShiftRight: "run", KeyJ: "run",
    Enter: "start", Escape: "start", KeyP: "start",
  };

  const keyState = {};
  const tapped = {}; // 1 フレーム内に押して離した入力も取りこぼさない
  const touchState = {};
  const padState = {};
  const prev = {};
  const now = {};
  const listeners = [];

  window.addEventListener("keydown", (e) => {
    const b = KEYMAP[e.code];
    if (b) {
      e.preventDefault();
      if (!e.repeat) tapped[b] = true;
      keyState[b] = true;
    }
    if (e.code === "KeyM" && !e.repeat) listeners.forEach((fn) => fn("mute"));
    listeners.forEach((fn) => fn("any"));
  });
  window.addEventListener("keyup", (e) => {
    const b = KEYMAP[e.code];
    if (b) keyState[b] = false;
  });
  // ---- タッチボタン
  // iPhone では指を離したイベント (pointerup) が届かないことがあり、ボタンが押しっぱなしになる。
  // そこでタッチ操作は「いま画面に触れている指の一覧 (e.touches)」から毎回作り直す。
  // どれか 1 本でも指が動いたり離れたりすれば、取りこぼした分も自動で元に戻る。
  let padRoot = null;
  const mouse = new Map(); // パソコンでマウスクリックしたとき用 (pointerId → ボタン)

  function buttonsAt(x, y) {
    const el = document.elementFromPoint(x, y);
    const btn = el && el.closest ? el.closest("[data-btn]") : null;
    return btn && padRoot && padRoot.contains(btn) ? btn.dataset.btn.split(" ") : [];
  }

  function applyTouch(active) {
    for (const b of BUTTONS) {
      if (active.has(b) && !touchState[b]) tapped[b] = true;
      touchState[b] = active.has(b);
    }
    if (!padRoot) return;
    padRoot.querySelectorAll("[data-btn]").forEach((el) => {
      el.classList.toggle("on", el.dataset.btn.split(" ").every((n) => touchState[n]));
    });
  }

  function syncTouches(touchList) {
    const active = new Set();
    for (const t of touchList) buttonsAt(t.clientX, t.clientY).forEach((b) => active.add(b));
    for (const btns of mouse.values()) btns.forEach((b) => active.add(b));
    applyTouch(active);
  }

  function releaseAll() {
    BUTTONS.forEach((b) => { keyState[b] = false; });
    mouse.clear();
    applyTouch(new Set());
  }

  window.addEventListener("blur", releaseAll);
  window.addEventListener("pagehide", releaseAll);
  document.addEventListener("visibilitychange", () => { if (document.hidden) releaseAll(); });

  function setupTouch(root) {
    if (!root) return;
    padRoot = root;
    for (const type of ["touchstart", "touchmove", "touchend", "touchcancel"]) {
      document.addEventListener(type, (e) => {
        syncTouches(e.touches);
        if (type === "touchstart") listeners.forEach((fn) => fn("any"));
        // ボタンの上ではスクロールや拡大をさせない
        if (root.contains(e.target) && e.cancelable) e.preventDefault();
      }, { passive: false });
    }
    // マウス (パソコン) で押したときだけ pointer イベントを使う
    root.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse") return;
      e.preventDefault();
      mouse.set(e.pointerId, buttonsAt(e.clientX, e.clientY));
      syncTouches([]);
      listeners.forEach((fn) => fn("any"));
    });
    window.addEventListener("pointermove", (e) => {
      if (!mouse.has(e.pointerId)) return;
      mouse.set(e.pointerId, buttonsAt(e.clientX, e.clientY));
      syncTouches([]);
    });
    const end = (e) => {
      if (!mouse.delete(e.pointerId)) return;
      syncTouches([]);
    };
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    root.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  function pollPad() {
    BUTTONS.forEach((b) => { padState[b] = false; });
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const btn = (i) => p.buttons[i] && p.buttons[i].pressed;
      const ax = p.axes[0] || 0;
      const ay = p.axes[1] || 0;
      padState.left ||= ax < -0.4 || btn(14);
      padState.right ||= ax > 0.4 || btn(15);
      padState.up ||= ay < -0.5 || btn(12);
      padState.down ||= ay > 0.5 || btn(13);
      padState.jump ||= btn(0) || btn(1);
      padState.run ||= btn(2) || btn(3) || btn(7);
      padState.start ||= btn(9);
    }
  }

  // 1 フレームに 1 回呼ぶ
  function update() {
    pollPad();
    for (const b of BUTTONS) {
      prev[b] = now[b];
      now[b] = !!(keyState[b] || touchState[b] || padState[b] || tapped[b]);
      tapped[b] = false;
    }
  }

  window.PopoInput = {
    setupTouch,
    update,
    held: (b) => !!now[b],
    pressed: (b) => !!now[b] && !prev[b],
    released: (b) => !now[b] && !!prev[b],
    on: (fn) => listeners.push(fn),
  };
})();
