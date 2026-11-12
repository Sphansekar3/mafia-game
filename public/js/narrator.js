/**
 * narrator.js — Audio player for Christopher Neural AI Narrator
 * Plays studio-quality pre-rendered / streamed audio with automatic fallback.
 */

const narrator = (() => {
  let audioEl = null;

  function init() {
    audioEl = new Audio();
  }

  /**
   * Play narration audio using ChristopherNeural.
   * If audioUrl is provided, it plays the high-fidelity MP3.
   * Otherwise falls back gracefully.
   */
  function speak(text, id = 'test', audioUrl = null) {
    return new Promise((resolve) => {
      if (audioUrl) {
        if (!audioEl) audioEl = new Audio();
        audioEl.src = audioUrl;

        audioEl.onended = () => resolve();
        audioEl.onerror = (e) => {
          console.warn('[narrator] audio playback error', e);
          _speechFallback(text, resolve);
        };

        const playPromise = audioEl.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            console.warn('[narrator] play prevented by browser autoplay policy:', err);
            _speechFallback(text, resolve);
          });
        }
        return;
      }

      _speechFallback(text, resolve);
    });
  }

  function _speechFallback(text, resolve) {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 0.85;
      utter.pitch = 0.7;
      utter.onend = () => resolve();
      utter.onerror = () => resolve();
      window.speechSynthesis.speak(utter);
    } else {
      setTimeout(resolve, 2500);
    }
  }

  return { init, speak };
})();
