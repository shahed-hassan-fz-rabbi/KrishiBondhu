"use client";

import { useEffect, useRef, useState } from "react";
import { fetchGoogleAuthStatus, getGoogleAuthEndpoint, verifyGoogleIdTokenDirect } from "@/services/api.js";
import { AUTH_RETURN_KEY, safeReturnTo } from "@/lib/access.js";

const GIS_SCRIPT_URL = "https://accounts.google.com/gsi/client";

export default function GoogleSignInButton({ onSuccess, onError, label = "Continue with Google", redirectLabel = "Try Google sign-in another way", redirectTo = "/dashboard" }) {
  const buttonRef = useRef(null);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [googleConfigured, setGoogleConfigured] = useState(false);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
  }, [onSuccess, onError]);

  useEffect(() => {
    let active = true;
    let script = null;
    let onScriptLoad;
    let onScriptError;
    let appendScript = false;
    let scriptLoadTimer;

    const showError = (text) => {
      if (!active) return;
      window.clearTimeout(scriptLoadTimer);
      setMessage(text);
      setLoading(false);
      onErrorRef.current?.(text);
    };

    const renderGoogleButton = (clientId) => {
      if (!active || !buttonRef.current || !window.google?.accounts?.id) return;
      window.clearTimeout(scriptLoadTimer);
      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async (response) => {
            if (!response?.credential || !active) return;
            setBusy(true);
            setMessage("");
            try {
              const result = await verifyGoogleIdTokenDirect(response.credential);
              if (!active) return;
              if (!result.success) {
                showError(result.error?.message || "Google sign-in failed. Please try again.");
                return;
              }
              onSuccessRef.current?.(result.data?.user);
            } catch {
              showError("Could not reach the sign-in service. Please try again.");
            } finally {
              if (active) setBusy(false);
            }
          },
          cancel_on_tap_outside: true,
        });
        window.google.accounts.id.renderButton(buttonRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          width: String(Math.max(240, Math.min(buttonRef.current.clientWidth || 360, 420))),
          locale: document.documentElement.lang || "en",
        });
        setMessage("");
        setLoading(false);
      } catch {
        showError("Google sign-in could not initialize. Try the alternate sign-in option below.");
      }
    };

    const initialize = async () => {
      try {
        const status = await fetchGoogleAuthStatus();
        if (!active) return;
        if (!status.success || !status.data?.configured || !status.data?.clientId) {
          showError("Google sign-in is not configured on the server.");
          return;
        }
        setGoogleConfigured(true);
        if (window.google?.accounts?.id) {
          renderGoogleButton(status.data.clientId);
          return;
        }
        script = document.querySelector("script[data-krishibondhu-google-identity]");
        if (!script) {
          script = document.createElement("script");
          script.src = GIS_SCRIPT_URL;
          script.async = true;
          script.defer = true;
          script.dataset.krishibondhuGoogleIdentity = "true";
          appendScript = true;
        }
        onScriptLoad = () => renderGoogleButton(status.data.clientId);
        onScriptError = () => showError("Google sign-in could not load. Check your connection and try again.");
        script.addEventListener("load", onScriptLoad, { once: true });
        script.addEventListener("error", onScriptError, { once: true });
        if (appendScript) document.head.appendChild(script);
        scriptLoadTimer = window.setTimeout(() => showError("Google sign-in is taking too long to load. Try the alternate sign-in option below."), 12000);
      } catch {
        showError("Could not reach the sign-in service. Please try again.");
      }
    };

    void initialize();
    return () => {
      active = false;
      window.clearTimeout(scriptLoadTimer);
      if (script) {
        if (onScriptLoad) script.removeEventListener("load", onScriptLoad);
        if (onScriptError) script.removeEventListener("error", onScriptError);
      }
    };
  }, []);

  const beginRedirectSignIn = () => {
    try {
      window.sessionStorage.setItem(AUTH_RETURN_KEY, safeReturnTo(redirectTo));
    } catch {
      // The OAuth redirect still works when browser storage is unavailable.
    }
    window.location.assign(getGoogleAuthEndpoint());
  };

  return (
    <div className="w-full">
      <div aria-label={label} aria-busy={loading || busy} className={`flex min-h-[44px] w-full items-center justify-center overflow-hidden transition-opacity ${loading || busy ? "pointer-events-none opacity-60" : ""}`}>
        <div ref={buttonRef} className="w-full" />
      </div>
      {loading || busy ? <p className="mt-1 text-center text-xs text-muted">{busy ? "Signing in…" : "Loading Google sign-in…"}</p> : null}
      {message ? <p role="status" className="mt-2 text-center text-xs text-amber-strong">{message}</p> : null}
      {googleConfigured ? <button type="button" onClick={beginRedirectSignIn} className="mx-auto mt-2 block min-h-10 rounded-lg px-3 text-xs font-medium text-emerald underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald">{redirectLabel}</button> : null}
    </div>
  );
}
