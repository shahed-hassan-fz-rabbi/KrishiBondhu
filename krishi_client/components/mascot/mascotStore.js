"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "krishibondhu.bondhu.preferences";
const LEGACY_STORAGE_KEY = "krishibondhu.krishu.preferences";
const DEFAULT_PREFERENCES = { animationEnabled: true, hidden: false, muted: false, x: null, y: null, tourProgress: null };
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
    const current = window.localStorage.getItem(STORAGE_KEY);
    const legacy = current === null ? window.localStorage.getItem(LEGACY_STORAGE_KEY) : null;
    snapshot = parseMascotPreferences(current, legacy);
    if (current === null && legacy !== null) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    }
  } catch { /* preferences are optional */ }
  return snapshot;
}

export function parseMascotPreferences(currentValue, legacyValue = null) {
  try {
    const value = JSON.parse(currentValue ?? legacyValue ?? "{}");
    return {
      animationEnabled: value.animationEnabled !== false,
      hidden: value.hidden === true,
      muted: value.muted === true,
      x: Number.isFinite(value.x) ? value.x : null,
      y: Number.isFinite(value.y) ? value.y : null,
      tourProgress: Number.isInteger(value.tourProgress) && value.tourProgress >= 0 ? value.tourProgress : null,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
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

export function isMascotVoiceMuted() {
  return getSnapshot().muted;
}
