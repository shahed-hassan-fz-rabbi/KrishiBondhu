"use client";

import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from "react";
import { prepareSpokenText, detectLanguage } from "@/lib/speechTextHelper.js";
import { generateAssistantSpeech } from "@/services/api.js";

const subscribeToBrowserSupport = () => () => {};
const getSpeechSynthesisSupport = () =>
  typeof window !== "undefined" && ("speechSynthesis" in window || "Audio" in window);
const getServerSupport = () => false;

/** Reused Bengali sentences (greetings, tour captions) are generated once per session. */
const banglaAudioCache = new Map();
const BANGLA_CACHE_LIMIT = 60;

function readBanglaAudio(text) {
  return banglaAudioCache.get(text) || null;
}

function writeBanglaAudio(text, blob) {
  if (!text || !blob) return blob;
  if (banglaAudioCache.size >= BANGLA_CACHE_LIMIT) {
    const oldest = banglaAudioCache.keys().next().value;
    if (oldest) banglaAudioCache.delete(oldest);
  }
  banglaAudioCache.set(text, blob);
  return blob;
}

function splitForSpeech(text, maxLength = 240) {
  const sentences = text.match(/[^.!?।]+(?:[.!?।]+(?=\s|$)|$)/g) || [text];
  const chunks = [];
  let current = "";
  for (const sentence of sentences) {
    const part = sentence.trim();
    if (!part) continue;
    if (part.length > maxLength) {
      if (current) chunks.push(current);
      current = "";
      for (let i = 0; i < part.length; i += maxLength) chunks.push(part.slice(i, i + maxLength));
    } else if (current && `${current} ${part}`.length > maxLength) {
      chunks.push(current);
      current = part;
    } else {
      current = current ? `${current} ${part}` : part;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * useVoiceOutput
 *
 * Web Speech / audio playback for KrishiBondhu with low perceived latency:
 * - Uses a local Bangla browser voice when one exists (no network round trip).
 * - Falls back to cached server TTS for Bangla, generating only on a cache miss.
 * - English uses the browser speech engine directly.
 * - Avoids the Chrome cancel/speak race that delays or drops queued audio.
 * - Single-audio concurrency, pause/resume/stop, unmount cleanup, SSR safety.
 */
export function useVoiceOutput() {
  const isSupported = useSyncExternalStore(
    subscribeToBrowserSupport,
    getSpeechSynthesisSupport,
    getServerSupport
  );
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  const [availableVoices, setAvailableVoices] = useState([]);
  const [error, setError] = useState(null);
  const [errorDetails, setErrorDetails] = useState("");

  const utteranceRef = useRef(null);
  const isComponentMounted = useRef(true);
  const playbackTokenRef = useRef(0);
  const audioRef = useRef(null);
  const audioUrlRef = useRef(null);
  const startTimerRef = useRef(null);

  // Load voices as soon as possible; retry on voiceschanged (Chrome loads them async).
  useEffect(() => {
    isComponentMounted.current = true;

    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const loadVoices = () => {
      try {
        const voices = window.speechSynthesis.getVoices() || [];
        if (isComponentMounted.current && voices.length) setAvailableVoices(voices);
      } catch (e) {
        console.warn("[useVoiceOutput] Failed to retrieve speech synthesis voices:", e);
      }
    };

    loadVoices();
    window.speechSynthesis.addEventListener?.("voiceschanged", loadVoices);

    return () => {
      isComponentMounted.current = false;
      if (typeof window !== "undefined" && window.speechSynthesis) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          // Ignore
        }
        window.speechSynthesis.removeEventListener?.("voiceschanged", loadVoices);
      }
      if (startTimerRef.current) clearTimeout(startTimerRef.current);
      audioRef.current?.pause();
      audioRef.current = null;
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    };
  }, []);

  /** Select the highest quality matching voice. Never falls back to English for Bangla. */
  const findBestVoice = useCallback((targetLang, voices) => {
    if (!voices || voices.length === 0) return null;
    const isBengali = targetLang.toLowerCase().startsWith("bn");

    if (isBengali) {
      let match = voices.find(
        (v) => v.lang.toLowerCase() === "bn-bd" || v.lang.toLowerCase() === "bn_bd"
      );
      if (match) return match;
      match = voices.find((v) => v.lang.toLowerCase().startsWith("bn"));
      if (match) return match;
      match = voices.find((v) => {
        const name = (v.name || "").toLowerCase();
        return name.includes("bengali") || name.includes("bangla");
      });
      return match || null;
    }

    let match = voices.find(
      (v) => v.lang.toLowerCase() === "en-us" || v.lang.toLowerCase() === "en_us"
    );
    if (match) return match;
    match = voices.find((v) => v.lang.toLowerCase().startsWith("en"));
    if (match) return match;
    return voices.find((v) => v.default) || voices[0] || null;
  }, []);

  /** Stop playback immediately. */
  const stop = useCallback(() => {
    playbackTokenRef.current += 1;
    if (startTimerRef.current) clearTimeout(startTimerRef.current);
    if (typeof window !== "undefined" && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore
      }
    }
    audioRef.current?.pause();
    audioRef.current = null;
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
    setIsSpeaking(false);
    setIsPaused(false);
    setCurrentId(null);
  }, []);

  const pause = useCallback(() => {
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      setIsPaused(true);
      return;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      try {
        window.speechSynthesis.pause();
        setIsPaused(true);
      } catch {
        // Ignore
      }
    }
  }, []);

  const resume = useCallback(() => {
    if (audioRef.current?.paused) {
      audioRef.current.play().then(() => setIsPaused(false)).catch(() => setError("PLAYBACK_ERROR"));
      return;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      try {
        window.speechSynthesis.resume();
        setIsPaused(false);
      } catch {
        // Ignore
      }
    }
  }, []);

  /** Play a Blob as audio with full lifecycle + concurrency control. */
  const playBlob = useCallback((blob, { token, id }) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audioUrlRef.current = url;
    audioRef.current = audio;
    audio.preload = "auto";
    audio.onended = () => {
      if (token !== playbackTokenRef.current) return;
      URL.revokeObjectURL(url);
      audioRef.current = null;
      audioUrlRef.current = null;
      setIsSpeaking(false);
      setIsPaused(false);
      setCurrentId(null);
    };
    audio.onerror = () => {
      if (token !== playbackTokenRef.current) return;
      setError("PLAYBACK_ERROR");
      setErrorDetails("Audio could not be played by this browser.");
      setIsSpeaking(false);
      setIsPaused(false);
      setCurrentId(null);
    };
    audio.play().catch((err) => {
      if (token !== playbackTokenRef.current) return;
      setError("PLAYBACK_ERROR");
      setErrorDetails(err.message || "Audio playback failed");
      setIsSpeaking(false);
      setCurrentId(null);
    });
  }, []);

  /** Speak via the browser engine (instant, no network). Used for English and local Bangla voices. */
  const speakWithBrowserVoice = useCallback((text, { voice, lang, id, token, rate }) => {
    const chunks = splitForSpeech(text);
    let chunkIndex = 0;

    const speakNextChunk = () => {
      if (!isComponentMounted.current || token !== playbackTokenRef.current) return;
      if (chunkIndex >= chunks.length) {
        setIsSpeaking(false);
        setIsPaused(false);
        setCurrentId(null);
        return;
      }
      try {
        const utterance = new SpeechSynthesisUtterance(chunks[chunkIndex++]);
        utterance.lang = voice?.lang || lang;
        if (voice) utterance.voice = voice;
        utterance.rate = rate;
        utterance.pitch = 1.0;
        utterance.onstart = () => {
          if (isComponentMounted.current && token === playbackTokenRef.current) {
            setIsSpeaking(true);
            setIsPaused(false);
            setCurrentId(id);
          }
        };
        utterance.onend = speakNextChunk;
        utterance.onerror = (e) => {
          if (!isComponentMounted.current || token !== playbackTokenRef.current) return;
          if (e.error !== "canceled" && e.error !== "interrupted") {
            console.warn("[useVoiceOutput] Speech synthesis error event:", e.error);
            setError("PLAYBACK_ERROR");
            setErrorDetails(e.error || "Speech playback failed");
          }
          setIsSpeaking(false);
          setIsPaused(false);
          setCurrentId(null);
        };
        utterance.onpause = () => token === playbackTokenRef.current && setIsPaused(true);
        utterance.onresume = () => token === playbackTokenRef.current && setIsPaused(false);
        utteranceRef.current = utterance;
        window.speechSynthesis.speak(utterance);
        // Chrome workaround: resume() right after speak() prevents a queued/delayed first chunk.
        try {
          window.speechSynthesis.resume();
        } catch {
          // Ignore
        }
        // A few browsers need a nudge to process the queue.
        startTimerRef.current = setTimeout(() => {
          if (token === playbackTokenRef.current && !window.speechSynthesis.speaking) {
            try { window.speechSynthesis.resume(); } catch { /* Ignore */ }
          }
        }, 120);
      } catch (err) {
        console.error("[useVoiceOutput] speak invocation failed:", err);
        setError("PLAYBACK_ERROR");
        setErrorDetails(err.message || "Failed to start speech");
        setIsSpeaking(false);
        setIsPaused(false);
        setCurrentId(null);
      }
    };

    speakNextChunk();
  }, []);

  /** Speak text with a message id and optional preferred language. */
  const speak = useCallback(
    (rawText, { id = null, preferredLang = null } = {}) => {
      setError(null);
      setErrorDetails("");

      const text = prepareSpokenText(rawText);
      if (!text) {
        setError("EMPTY_TEXT");
        return;
      }

      const targetLang = preferredLang || detectLanguage(text);
      const isBengali = targetLang.toLowerCase().startsWith("bn");
      if (typeof window === "undefined" || (!isBengali && !("speechSynthesis" in window))) {
        setError("UNSUPPORTED");
        return;
      }

      const playbackToken = ++playbackTokenRef.current;
      if (startTimerRef.current) clearTimeout(startTimerRef.current);
      audioRef.current?.pause();
      audioRef.current = null;
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;

      const hasSpeechSynthesis = "speechSynthesis" in window;
      const browserVoices = hasSpeechSynthesis ? window.speechSynthesis.getVoices() || [] : [];
      const voices = browserVoices.length > 0 ? browserVoices : availableVoices;

      if (hasSpeechSynthesis) {
        try { window.speechSynthesis.cancel(); } catch { /* Ignore */ }
      }

      // 1) Prefer a local Bangla voice: zero network delay, works offline.
      const banglaVoice = isBengali ? findBestVoice("bn-BD", voices) : null;
      if (banglaVoice) {
        setIsSpeaking(true);
        setIsPaused(false);
        setCurrentId(id);
        speakWithBrowserVoice(text, { voice: banglaVoice, lang: targetLang, id, token: playbackToken, rate: 0.95 });
        return;
      }

      // 2) Bengali without a local voice: play cached server audio, or generate once.
      if (isBengali) {
        setIsSpeaking(true);
        setIsPaused(false);
        setCurrentId(id);
        const cached = readBanglaAudio(text);
        if (cached) {
          playBlob(cached, { token: playbackToken, id });
          return;
        }
        generateAssistantSpeech(text).then((result) => {
          if (playbackToken !== playbackTokenRef.current) return;
          if (!result.success) {
            setError("PLAYBACK_ERROR");
            setErrorDetails(result.error?.message || "Bangla voice generation failed");
            setIsSpeaking(false);
            setCurrentId(null);
            return;
          }
          playBlob(writeBanglaAudio(text, result.data), { token: playbackToken, id });
        }).catch((err) => {
          if (playbackToken !== playbackTokenRef.current) return;
          setError("PLAYBACK_ERROR");
          setErrorDetails(err.message || "Bangla voice generation failed");
          setIsSpeaking(false);
          setCurrentId(null);
        });
        return;
      }

      // 3) English: browser speech engine, avoiding the cancel/speak race with a tick delay.
      const voice = findBestVoice(targetLang, voices);
      setIsSpeaking(true);
      setIsPaused(false);
      setCurrentId(id);
      startTimerRef.current = setTimeout(() => {
        if (playbackToken !== playbackTokenRef.current) return;
        speakWithBrowserVoice(text, { voice, lang: targetLang, id, token: playbackToken, rate: 1.0 });
      }, 60);
    },
    [availableVoices, findBestVoice, playBlob, speakWithBrowserVoice]
  );

  const clearError = useCallback(() => {
    setError(null);
    setErrorDetails("");
  }, []);

  return {
    isSupported,
    isSpeaking,
    isPaused,
    currentId,
    availableVoices,
    error,
    errorDetails,
    speak,
    pause,
    resume,
    stop,
    clearError,
  };
}
