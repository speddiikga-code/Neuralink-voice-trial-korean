/*
 * NeuroVoice — speech in and out
 * Speaker: the browser's speech synthesis, Korean voice when one exists.
 * Listener: the browser's speech recognition for the conversation partner,
 * one utterance at a time (it stops by itself when they stop talking).
 * Both degrade quietly where the browser or the page lacks the API.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(null);
  else { root.NV = root.NV || {}; Object.assign(root.NV, factory(root)); }
})(typeof self !== 'undefined' ? self : this, function (win) {
  'use strict';

  const synth = win && 'speechSynthesis' in win ? win.speechSynthesis : null;
  let koVoice = null;

  function pickVoice() {
    if (!synth) return null;
    const voices = synth.getVoices();
    koVoice = voices.find((v) => /^ko(?:[-_]|$)/i.test(v.lang)) || null;
    return koVoice;
  }
  if (synth) {
    pickVoice();
    if (typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', pickVoice);
  }

  const Speaker = {
    get supported() { return !!synth; },
    get speaking() { return !!synth && synth.speaking; },

    speak(text, { rate = 1, onstart, onend } = {}) {
      if (!synth || !text) return false;
      synth.cancel();
      const u = new win.SpeechSynthesisUtterance(text);
      u.lang = 'ko-KR';
      u.rate = rate;
      const voice = koVoice || pickVoice();
      if (voice) u.voice = voice;
      if (onstart) u.onstart = onstart;
      if (onend) { u.onend = onend; u.onerror = onend; }
      synth.speak(u);
      return true;
    },

    cancel() { if (synth) synth.cancel(); },
  };

  const Recognition = win ? win.SpeechRecognition || win.webkitSpeechRecognition : null;

  const Listener = {
    get supported() { return !!Recognition; },

    /** Listen for one utterance. Returns the recognizer (call .stop() to end early) or null. */
    listen({ onPartial, onFinal, onError, onEnd } = {}) {
      if (!Recognition) { if (onError) onError('unsupported'); return null; }
      const rec = new Recognition();
      rec.lang = 'ko-KR';
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 1;
      rec.onresult = (e) => {
        let interim = '';
        let final = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) final += r[0].transcript;
          else interim += r[0].transcript;
        }
        if (interim && onPartial) onPartial(interim.trim());
        if (final && onFinal) onFinal(final.trim());
      };
      rec.onerror = (e) => { if (onError) onError(e.error || 'error'); };
      rec.onend = () => { if (onEnd) onEnd(); };
      try {
        rec.start();
      } catch (err) {
        if (onError) onError('start-failed');
        return null;
      }
      return rec;
    },
  };

  return { Speaker, Listener };
});
