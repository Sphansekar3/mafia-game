/**
 * soundManager.js — Calibrated atmospheric sound effects
 * Customized with user's curated selection:
 * 1. Night: Merged Summer Crickets + Low Atmospheric Drone
 * 2. Murder: Deep Whoosh Riser (/sfx/death-whoosh.mp3)
 * 3. Elimination: Heavy Trailer Sub Slam (/sfx/gavel-impact.mp3)
 * 4. Doctor Save: Celestial Harmonic Chord (Synthesized)
 * 5. Mafia Victory / Town Victory Fanfares
 */

const soundManager = (() => {
  let ctx = null;
  let cricketsAudio = null;
  let nightOsc = null;
  let nightGain = null;

  function getCtx() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) ctx = new AudioCtx();
    }
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  // 1. NIGHT AMBIENCE: Merged Crickets (MP3) + Low Atmospheric Drone (Synth)
  function startNightAmbience() {
    // A: Crickets recording
    if (!cricketsAudio) {
      cricketsAudio = new Audio('/sfx/night-crickets.mp3');
      cricketsAudio.loop = true;
      cricketsAudio.volume = 0.45;
    }
    cricketsAudio.currentTime = 0;
    cricketsAudio.play().catch(() => {});

    // B: Low atmospheric tension drone
    const c = getCtx();
    if (c && !nightOsc) {
      const now = c.currentTime;
      nightOsc = c.createOscillator();
      nightGain = c.createGain();

      nightOsc.type = 'triangle';
      nightOsc.frequency.setValueAtTime(55, now); // Low A

      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(140, now);

      nightGain.gain.setValueAtTime(0.001, now);
      nightGain.gain.linearRampToValueAtTime(0.20, now + 2.0);

      nightOsc.connect(filter);
      filter.connect(nightGain);
      nightGain.connect(c.destination);

      nightOsc.start(now);
    }
  }

  function stopNightAmbience() {
    // Fade out crickets
    if (cricketsAudio) {
      cricketsAudio.pause();
      cricketsAudio.currentTime = 0;
    }

    // Fade out synth drone
    if (nightGain && nightOsc) {
      const c = getCtx();
      if (c) {
        const now = c.currentTime;
        nightGain.gain.linearRampToValueAtTime(0.001, now + 1.2);
        setTimeout(() => {
          if (nightOsc) {
            try { nightOsc.stop(); } catch (_) {}
            nightOsc = null;
            nightGain = null;
          }
        }, 1300);
      } else {
        nightOsc = null;
        nightGain = null;
      }
    }
  }

  // 2. MORNING MURDER HIT: Option C: Deep Whoosh Riser
  function playDeathHit() {
    const audio = new Audio('/sfx/death-whoosh.mp3');
    audio.volume = 0.85;
    audio.play().catch(() => {});
  }

  // 3. VOTING ELIMINATION: Option A: Heavy Trailer Sub Slam
  function playGavelStrike() {
    const audio = new Audio('/sfx/gavel-impact.mp3');
    audio.volume = 0.90;
    audio.play().catch(() => {});
  }

  // 4. DOCTOR SAVE / MIRACLE: Option B: Celestial Harmonic Chord
  function playMiracleChime() {
    const c = getCtx();
    if (!c) return;
    const now = c.currentTime;
    const freqs = [523.25, 659.25, 783.99, 1046.50]; // C Major arpeggio

    freqs.forEach((freq, idx) => {
      const osc = c.createOscillator();
      const gain = c.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.12);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.setValueAtTime(0.30, now + idx * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.12 + 2.0);

      osc.connect(gain);
      gain.connect(c.destination);

      osc.start(now + idx * 0.12);
      osc.stop(now + idx * 0.12 + 2.2);
    });
  }

  // 5. MAFIA VICTORY: Dark Minor Ominous Triumph
  function playMafiaVictory() {
    const c = getCtx();
    if (!c) return;
    const now = c.currentTime;
    const freqs = [146.83, 174.61, 220.00, 293.66]; // D minor chords

    freqs.forEach((freq) => {
      const osc = c.createOscillator();
      const gain = c.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 3.2);

      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(500, now);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(c.destination);

      osc.start(now);
      osc.stop(now + 3.4);
    });
  }

  // 6. TOWN VICTORY: Triumphant Major Fanfare
  function playTownVictory() {
    const c = getCtx();
    if (!c) return;
    const now = c.currentTime;
    const melody = [
      { f: 523.25, d: 0.2, t: 0 },
      { f: 659.25, d: 0.2, t: 0.2 },
      { f: 783.99, d: 0.2, t: 0.4 },
      { f: 1046.50, d: 1.5, t: 0.6 }
    ];

    melody.forEach((note) => {
      const osc = c.createOscillator();
      const gain = c.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(note.f, now + note.t);

      gain.gain.setValueAtTime(0.35, now + note.t);
      gain.gain.exponentialRampToValueAtTime(0.001, now + note.t + note.d);

      osc.connect(gain);
      gain.connect(c.destination);

      osc.start(now + note.t);
      osc.stop(now + note.t + note.d + 0.1);
    });
  }

  return {
    init: getCtx,
    startNightAmbience,
    stopNightAmbience,
    playDeathHit,
    playGavelStrike,
    playMiracleChime,
    playMafiaVictory,
    playTownVictory
  };
})();
