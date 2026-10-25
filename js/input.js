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
  window.addEventListener("blur", () => {
    BUTTONS.forEach((b) => { keyState[b] = false; touchState[b] = false; });
  });

  // ---- タッチ: ボタン上を指でスライドしても追従するように pointer ごとに判定
  const pointers = new Map();
  function setupTouch(root) {
    if (!root) return;
    const recompute = () => {
      BUTTONS.forEach((b) => { touchState[b] = false; });
      for (const btns of pointers.values()) btns.forEach((b) => { touchState[b] = true; });
      root.querySelectorAll("[data-btn]").forEach((el) => {
        const names = el.dataset.btn.split(" ");
        el.classList.toggle("on", names.every((n) => touchState[n]));
      });
    };
    const hit = (e) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const btn = el && el.closest ? el.closest("[data-btn]") : null;
      return btn ? btn.dataset.btn.split(" ") : [];
    };
    root.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      try { root.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
      pointers.set(e.pointerId, hit(e));
      pointers.get(e.pointerId).forEach((b) => { tapped[b] = true; });
      recompute();
      listeners.forEach((fn) => fn("any"));
    });
    root.addEventListener("pointermove", (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, hit(e));
      recompute();
    });
    const end = (e) => {
      pointers.delete(e.pointerId);
      recompute();
    };
    root.addEventListener("pointerup", end);
    root.addEventListener("pointercancel", end);
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
