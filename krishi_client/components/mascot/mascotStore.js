"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "krishibondhu.krishu.preferences";
const DEFAULT_PREFERENCES = { animationEnabled: true, hidden: false, muted: false, x: null, y: null };
let snapshot = DEFAULT_PREFERENCES;
let loaded = false;

function subscribe(callback) {
  window.addEventListener("krishi:mascot-preferences", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("krishi:mascot-preferences", callback);
    window.removeEventListener("storage", callback);
  };
}

function getSnapshot() {
  if (loaded) return snapshot;
  loaded = true;
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    snapshot = {
      animationEnabled: saved.animationEnabled !== false,
      hidden: saved.hidden === true,
      muted: saved.muted === true,
      x: Number.isFinite(saved.x) ? saved.x : null,
      y: Number.isFinite(saved.y) ? saved.y : null,
    };
  } catch { /* preferences are optional */ }
  return snapshot;
}

function getServerSnapshot() { return DEFAULT_PREFERENCES; }

export function useMascotPreferences() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function saveMascotPreferences(updates) {
  snapshot = { ...getSnapshot(), ...updates };
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)); } catch { /* preferences are optional */ }
  window.dispatchEvent(new Event("krishi:mascot-preferences"));
  window.dispatchEvent(new CustomEvent("krishi:voice-muted", { detail: { muted: snapshot.muted } }));
}
