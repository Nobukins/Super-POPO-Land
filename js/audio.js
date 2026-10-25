// チップチューン風の効果音と BGM (WebAudio の矩形波・三角波・ノイズだけで鳴らす)
(() => {
  "use strict";

  let ac = null;
  let master = null;
  let musicGain = null;
  let sfxGain = null;
  let noiseBuf = null;
  let muted = false;
  try { muted = localStorage.getItem("popo.muted") === "1"; } catch (e) { /* storage unavailable */ }

  function ensure() {
    if (ac) {
      if (ac.state === "suspended") ac.resume();
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.22;
    master.connect(ac.destination);
    musicGain = ac.createGain();
    musicGain.gain.value = 0.55;
    musicGain.connect(master);
    sfxGain = ac.createGain();
    sfxGain.gain.value = 0.9;
    sfxGain.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  function tone(type, freq, start, dur, vol, dest, slideTo) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
    g.gain.setValueAtTime(vol, start);
    g.gain.setValueAtTime(vol, start + dur * 0.7);
    g.gain.linearRampToValueAtTime(0.0001, start + dur);
    o.connect(g);
    g.connect(dest);
    o.start(start);
    o.stop(start + dur + 0.02);
  }

  function noise(start, dur, vol, dest, hp = 1000) {
    const s = ac.createBufferSource();
    s.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = hp;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.001, start + dur);
    s.connect(f);
    f.connect(g);
    g.connect(dest);
    s.start(start);
    s.stop(start + dur + 0.02);
  }

  const NOTE_INDEX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function freqOf(name) {
    const m = /^([A-G])([#b]?)(\d)$/.exec(name);
    if (!m) return 0;
    let n = NOTE_INDEX[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
    const midi = (Number(m[3]) + 1) * 12 + n;
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  // 連続した音符を鳴らす (効果音用ジングル)
  function seq(notes, step, type = "square", vol = 0.3) {
    const t = ac.currentTime;
    notes.forEach((n, i) => {
      if (n) tone(type, freqOf(n), t + i * step, step * 0.95, vol, sfxGain);
    });
  }

  const SFX = {
    jump() { tone("square", 260, ac.currentTime, 0.16, 0.25, sfxGain, 720); },
    coin() {
      const t = ac.currentTime;
      tone("square", 988, t, 0.06, 0.25, sfxGain);
      tone("square", 1319, t + 0.06, 0.28, 0.25, sfxGain);
    },
    stomp() {
      const t = ac.currentTime;
      tone("square", 420, t, 0.09, 0.3, sfxGain, 120);
      noise(t, 0.06, 0.25, sfxGain, 2000);
    },
    kick() { tone("square", 700, ac.currentTime, 0.06, 0.25, sfxGain, 300); },
    bump() { tone("triangle", 160, ac.currentTime, 0.1, 0.5, sfxGain, 90); },
    brick() {
      const t = ac.currentTime;
      noise(t, 0.25, 0.4, sfxGain, 400);
      tone("square", 200, t, 0.12, 0.2, sfxGain, 60);
    },
    appear() { tone("square", 300, ac.currentTime, 0.45, 0.2, sfxGain, 1200); },
    powerup() { seq(["C5", "E5", "G5", "C6", "E6", "G6", "C7"], 0.055, "square", 0.22); },
    star() { seq(["G5", "C6", "E6", "G6", "C7", "E7"], 0.05, "square", 0.2); },
    oneup() { seq(["E6", "G6", "E7", "C7", "D7", "G7"], 0.09, "square", 0.22); },
    hurt() { tone("square", 900, ac.currentTime, 0.4, 0.25, sfxGain, 120); },
    die() { seq(["B5", "F6", null, "F6", "F6", "E6", "D6", "C6", null, "G5", null, "C5"], 0.11, "square", 0.25); },
    flag() { tone("square", 1400, ac.currentTime, 0.9, 0.2, sfxGain, 200); },
    clear() { seq(["G5", "C6", "E6", "G6", null, "E6", "G6", null, null, "A6", "A6", "A6", "B6", "C7"], 0.1, "square", 0.22); },
    gameover() { seq(["C6", null, "G5", null, "E5", "A5", "B5", "A5", "G#5", "A#5", "G#5", "G5", "F5", "G5"], 0.13, "triangle", 0.4); },
    pause() { seq(["E6", "C6", "E6", "C6"], 0.07, "square", 0.2); },
    select() { tone("square", 880, ac.currentTime, 0.08, 0.2, sfxGain, 1320); },
    check() { seq(["C6", "E6", "G6", "C7"], 0.07, "square", 0.2); },
    hurry() { seq(["C6", "G5", "C6", "G5", "C6", "G5"], 0.07, "square", 0.2); },
    tick() { tone("square", 1760, ac.currentTime, 0.02, 0.12, sfxGain); },
  };

  // ------------------------------------------------------------- BGM (すべてオリジナル曲)
  // 1 トークン = 8 分音符。"-" は前の音を伸ばす、"." は休符
  const SONGS = {
    grass: {
      bpm: 144,
      lead: "E5 . G5 E5 C5 . D5 E5 F5 . E5 D5 C5 . . . D5 . F5 D5 B4 . C5 D5 E5 . D5 C5 G4 . . . " +
        "E5 . G5 E5 C6 . B5 A5 G5 . E5 G5 A5 . F5 A5 G5 . E5 C5 D5 . E5 D5 C5 . . G4 C5 . . .",
      bass: "C3 . G3 . C3 . G3 . F3 . C4 . F3 . C4 . G3 . D4 . G3 . D4 . C3 . G3 . E3 . G3 . " +
        "C3 . G3 . A3 . E3 . F3 . C4 . D3 . A3 . G3 . G3 . G3 . B3 . C3 . G3 . C3 . . .",
      drums: "k . h . s . h . k . h . s . h h",
    },
    cave: {
      bpm: 112,
      lead: "A4 . C5 . E5 . D5 C5 B4 - - - G4 - - . A4 . C5 . E5 . G5 F5 E5 - - - - - - . " +
        "F5 . E5 . D5 . C5 . B4 . C5 . D5 - - . E5 . C5 . A4 . B4 . A4 - - - - - - .",
      bass: "A2 . A2 . E3 . A2 . G2 . G2 . D3 . G2 . F2 . F2 . C3 . F2 . E2 . E2 . B2 . E2 . " +
        "D3 . D3 . A2 . D3 . G2 . G2 . B2 . G2 . C3 . E3 . A2 . E2 . A2 . E3 . A2 . . .",
      drums: "k . . h s . . h",
    },
    sky: {
      bpm: 152,
      lead: "C5 F5 A5 C6 A5 F5 G5 A5 Bb5 - A5 G5 F5 - - . D5 G5 Bb5 D6 Bb5 G5 A5 Bb5 C6 - Bb5 A5 G5 - - . " +
        "A5 . C6 . F5 . A5 . G5 . Bb5 . E5 . G5 . F5 A5 G5 E5 F5 . C5 . F5 - - - - - - .",
      bass: "F3 . C4 . F3 . C4 . Bb2 . F3 . Bb2 . F3 . G2 . D3 . G2 . D3 . C3 . G3 . C3 . G3 . " +
        "F3 . C4 . D3 . A3 . Bb2 . F3 . C3 . G3 . F3 . C3 . F3 . C3 . F3 . C3 . F2 . . .",
      drums: "k h h h s h h h",
    },
    castle: {
      bpm: 160,
      lead: "D5 D5 . D5 F5 . E5 D5 C#5 - - - A4 - - . D5 D5 . D5 G5 . F5 E5 F5 - - - E5 - - . " +
        "Bb5 . A5 . G5 . F5 . E5 . F5 . G5 . A5 . D6 . C6 . Bb5 . A5 . C#5 . E5 . A5 - - .",
      bass: "D3 D3 D3 D3 D3 D3 D3 D3 A2 A2 A2 A2 A2 A2 A2 A2 Bb2 Bb2 Bb2 Bb2 Bb2 Bb2 Bb2 Bb2 A2 A2 A2 A2 C3 C3 C3 C3 " +
        "G2 G2 G2 G2 G2 G2 G2 G2 C3 C3 C3 C3 C3 C3 C3 C3 Bb2 Bb2 Bb2 Bb2 G2 G2 G2 G2 A2 A2 A2 A2 A2 A2 A2 A2",
      drums: "k h s h k k s h",
    },
    star: {
      bpm: 180,
      lead: "C6 . C6 . C6 . D6 C6 . C6 . D6 C6 . E6 . B5 . B5 . B5 . C6 B5 . B5 . C6 B5 . D6 .",
      bass: "C3 C4 C3 C4 C3 C4 C3 C4 C3 C4 C3 C4 C3 C4 C3 C4 G2 G3 G2 G3 G2 G3 G2 G3 G2 G3 G2 G3 G2 G3 G2 G3",
      drums: "k h s h k h s h",
    },
    title: {
      bpm: 128,
      lead: "G5 . E5 . C5 . E5 G5 C6 - - . B5 - A5 . G5 . E5 . F5 . A5 . G5 - - - - - - . " +
        "A5 . F5 . D5 . F5 A5 B5 - - . A5 - G5 . E5 . G5 . C6 . B5 . C6 - - - - - - .",
      bass: "C3 . G3 . C3 . G3 . A2 . E3 . A2 . E3 . F2 . C3 . F2 . C3 . G2 . D3 . G2 . D3 . " +
        "D3 . A3 . D3 . A3 . G2 . D3 . G2 . D3 . C3 . G3 . G2 . D3 . C3 . G3 . C3 . . .",
      drums: "k . h . s . h .",
    },
  };

  function parseTrack(str) {
    return str.trim().split(/\s+/);
  }

  let current = null; // { name, song, step, nextTime, timer }

  function scheduleStep(song, step, time) {
    const eighth = 60 / song.bpm / 2;
    const voices = [["lead", "square", 0.16], ["bass", "triangle", 0.4]];
    for (const [key, type, vol] of voices) {
      const track = song[key];
      const tok = track[step % track.length];
      if (tok === "." || tok === "-") continue;
      let len = 1;
      while (track[(step + len) % track.length] === "-" && len < track.length) len++;
      tone(type, freqOf(tok), time, eighth * len * 0.92, vol, musicGain);
    }
    const dr = song.drums[step % song.drums.length];
    if (dr === "k") tone("triangle", 140, time, 0.08, 0.5, musicGain, 50);
    else if (dr === "s") noise(time, 0.08, 0.18, musicGain, 1500);
    else if (dr === "h") noise(time, 0.025, 0.08, musicGain, 6000);
  }

  function playMusic(name) {
    if (!ensure()) return;
    if (current && current.name === name) return;
    stopMusic();
    const raw = SONGS[name];
    if (!raw) return;
    const song = { bpm: raw.bpm, lead: parseTrack(raw.lead), bass: parseTrack(raw.bass), drums: parseTrack(raw.drums) };
    current = { name, song, step: 0, nextTime: ac.currentTime + 0.08 };
    const eighth = 60 / song.bpm / 2;
    current.timer = setInterval(() => {
      if (!current) return;
      while (current.nextTime < ac.currentTime + 0.15) {
        scheduleStep(current.song, current.step, current.nextTime);
        current.step++;
        current.nextTime += eighth;
      }
    }, 25);
  }

  function stopMusic() {
    if (current) clearInterval(current.timer);
    current = null;
  }

  function play(name) {
    if (!ensure() || !SFX[name]) return;
    SFX[name]();
  }

  function setMuted(m) {
    muted = m;
    try { localStorage.setItem("popo.muted", m ? "1" : "0"); } catch (e) { /* storage unavailable */ }
    if (master) master.gain.value = m ? 0 : 0.22;
  }

  window.PopoAudio = {
    unlock: ensure,
    play,
    playMusic,
    stopMusic,
    toggleMute() { setMuted(!muted); return muted; },
    get muted() { return muted; },
    get music() { return current ? current.name : null; },
  };
})();
