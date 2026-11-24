"use client";

import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from "react";
import { transcribeAssistantAudio } from "@/services/api.js";

const subscribeToBrowserSupport = () => () => {};
const getSupport = () => typeof window !== "undefined" && Boolean(
  (window.MediaRecorder && navigator.mediaDevices?.getUserMedia) ||
  window.SpeechRecognition || window.webkitSpeechRecognition
);
const getServerSupport = () => false;
const MAX_RECORDING_MS = 25_000;
const MAX_AUDIO_BYTES = 2_500_000;

/** Uses live browser speech recognition when available, with recorded transcription as a fallback. */
export function useVoiceInput({ onFinalTranscript, onInterimTranscript, uiLanguage = "bn" } = {}) {
  const isSupported = useSyncExternalStore(subscribeToBrowserSupport, getSupport, getServerSupport);
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [errorCode, setErrorCode] = useState(null);
  const [errorDetails, setErrorDetails] = useState("");
  const recorderRef = useRef(null);
  const finalTranscriptRef = useRef("");
  const liveTranscriptRef = useRef("");
  const deliveredTranscriptRef = useRef("");
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timeoutRef = useRef(null);
  const onFinalRef = useRef(onFinalTranscript);
  const onInterimRef = useRef(onInterimTranscript);

  useEffect(() => { onFinalRef.current = onFinalTranscript; onInterimRef.current = onInterimTranscript; }, [onFinalTranscript, onInterimTranscript]);

  const releaseStream = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const startBrowserRecognition = useCallback(() => {
    const SpeechRecognition = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SpeechRecognition) {
      return;
    }
    try {
      const recognition = new SpeechRecognition();
      recognition.lang = uiLanguage === "bn" ? "bn-BD" : "en-US";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 3;
      finalTranscriptRef.current = "";
      liveTranscriptRef.current = "";
      deliveredTranscriptRef.current = "";
      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (event) => {
        const finalParts = [];
        const interimParts = [];
        for (let i = 0; i < event.results.length; i += 1) {
          const result = event.results[i];
          const transcript = result[0]?.transcript?.trim();
          if (!transcript) continue;
          if (result.isFinal) finalParts.push(transcript);
          else interimParts.push(transcript);
        }
        finalTranscriptRef.current = finalParts.join(" ").replace(/\s+/g, " ").trim();
        const interim = interimParts.join(" ").replace(/\s+/g, " ").trim();
        const liveTranscript = [finalTranscriptRef.current, interim].filter(Boolean).join(" ");
        liveTranscriptRef.current = liveTranscript;
        setInterimTranscript(interim);
        if (liveTranscript) onInterimRef.current?.(liveTranscript);
      };
      recognition.onerror = (event) => {
        if (event.error === "aborted") return;
        const code = event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "PERMISSION_DENIED"
          : event.error === "no-speech"
          ? "NO_SPEECH"
          : event.error === "audio-capture"
          ? "AUDIO_CAPTURE"
          : event.error === "language-not-supported"
          ? "UNSUPPORTED"
          : "NETWORK";
        setErrorCode(code);
        setErrorDetails(event.message || event.error || "Speech recognition failed.");
      };
      recognition.onend = () => {
        setIsListening(false);
        setInterimTranscript("");
        const finalTranscript = finalTranscriptRef.current.trim();
        if (finalTranscript) {
          if (deliveredTranscriptRef.current !== finalTranscript) {
            deliveredTranscriptRef.current = finalTranscript;
            onFinalRef.current?.(finalTranscript);
          }
        } else if (liveTranscriptRef.current) {
          // Preserve any recognized words if the browser ends unexpectedly mid-utterance.
          onFinalRef.current?.(liveTranscriptRef.current.trim());
        }
      };
      recorderRef.current = recognition;
      recognition.start();
    } catch (error) {
      setErrorCode(error.name === "NotAllowedError" ? "PERMISSION_DENIED" : "UNKNOWN");
      setErrorDetails(error.message || "Could not start speech recognition.");
      setIsListening(false);
    }
  }, [uiLanguage]);

  const transcribeRecording = useCallback(async (blob, mimeType) => {
    if (!blob.size) { setErrorCode("NO_SPEECH"); setIsTranscribing(false); return; }
    if (blob.size > MAX_AUDIO_BYTES) { setErrorCode("AUDIO_TOO_LARGE"); setIsTranscribing(false); return; }
    setIsTranscribing(true);
    setInterimTranscript(uiLanguage === "bn" ? "আপনার কথা লিখে নেওয়া হচ্ছে…" : "Transcribing your voice…");
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Could not read microphone recording."));
        reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
        reader.readAsDataURL(blob);
      });
      const result = await transcribeAssistantAudio({ audioBase64: base64, mimeType: mimeType.split(";")[0] });
      if (!result.success || !result.data?.transcript) {
        const code = result.error?.code;
        setErrorCode(code === "NO_SPEECH" ? "NO_SPEECH" : code === "VOICE_TRANSCRIPTION_UNAVAILABLE" ? "TRANSCRIPTION_UNAVAILABLE" : "NETWORK");
        setErrorDetails(result.error?.message || "Could not transcribe the recording.");
        return;
      }
      onFinalRef.current?.(result.data.transcript);
      setErrorCode(null);
      setErrorDetails("");
    } catch (error) {
      setErrorCode("NETWORK");
      setErrorDetails(error.message || "Voice transcription failed.");
    } finally {
      setIsTranscribing(false);
      setInterimTranscript("");
    }
  }, [uiLanguage]);

  const startListening = useCallback(async () => {
    setErrorCode(null);
    setErrorDetails("");
    setInterimTranscript("");
    finalTranscriptRef.current = "";
    liveTranscriptRef.current = "";
    deliveredTranscriptRef.current = "";
    if (typeof window === "undefined") return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      startBrowserRecognition();
      return;
    }
    if (!window.MediaRecorder || !navigator.mediaDevices?.getUserMedia) {
      setErrorCode("UNSUPPORTED");
      setErrorDetails("This browser does not support live speech recognition or microphone recording.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      streamRef.current = stream;
      const supportedMime = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported?.(type));
      const recorder = new MediaRecorder(stream, supportedMime ? { mimeType: supportedMime } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data?.size) chunksRef.current.push(event.data); };
      recorder.onerror = (event) => {
        setErrorCode("UNKNOWN");
        setErrorDetails(event.error?.message || "Microphone recording failed.");
        setIsListening(false);
        releaseStream();
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const mimeType = recorder.mimeType || "audio/webm";
        chunksRef.current = [];
        recorderRef.current = null;
        releaseStream();
        setIsListening(false);
        transcribeRecording(blob, mimeType);
      };
      recorderRef.current = recorder;
      recorder.start(250);
      setIsListening(true);
      setInterimTranscript(uiLanguage === "bn"
        ? "বাংলা বা English-এ বলুন; শেষ হলে মাইক্রোফোন চাপুন।"
        : "Speak in Bangla or English, then press the microphone to finish.");
      timeoutRef.current = setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, MAX_RECORDING_MS);
    } catch (error) {
      releaseStream();
      setIsListening(false);
      setErrorCode(error.name === "NotAllowedError" || error.name === "PermissionDeniedError" ? "PERMISSION_DENIED" : "AUDIO_CAPTURE");
      setErrorDetails(error.message || "Could not access the microphone.");
    }
  }, [releaseStream, startBrowserRecognition, transcribeRecording, uiLanguage]);

  const stopListening = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
      return;
    }
    if (recorderRef.current?.stop) {
      try { recorderRef.current.stop(); } catch { /* already stopped */ }
    }
    setIsListening(false);
  }, []);

  const abortListening = useCallback(() => {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder?.state === "recording") { recorder.onstop = null; recorder.stop(); }
    else if (recorder?.abort) recorder.abort();
    chunksRef.current = [];
    releaseStream();
    setIsListening(false);
    setIsTranscribing(false);
    setInterimTranscript("");
  }, [releaseStream]);

  const toggleListening = useCallback(() => {
    if (isListening) stopListening();
    else if (!isTranscribing) startListening();
  }, [isListening, isTranscribing, startListening, stopListening]);

  useEffect(() => () => {
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") { recorder.onstop = null; try { recorder.stop(); } catch { /* ignore teardown */ } }
    if (recorder?.abort) recorder.abort();
    releaseStream();
  }, [releaseStream]);

  const clearError = useCallback(() => { setErrorCode(null); setErrorDetails(""); }, []);
  return { isSupported, isListening, isTranscribing, lang: "auto", setLang: () => {}, interimTranscript, errorCode, errorDetails, startListening, stopListening, abortListening, toggleListening, clearError };
}
