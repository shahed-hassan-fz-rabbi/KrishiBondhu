"use client";

import { Suspense } from "react";
import { ThemeProvider } from "../../contexts/ThemeContext.js";
import { LanguageProvider } from "../../lib/i18n/LanguageContext.js";
import { AuthProvider } from "../../contexts/AuthContext.js";
import { LocationProvider } from "../../contexts/LocationContext.js";
import { FarmDisplayProvider } from "../../contexts/FarmDisplayContext.js";
import { MiniGuide } from "../MiniGuide.js";

/** Single wrapper around all client-side UI providers. */
export function AppProviders({ children }) {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <LocationProvider><FarmDisplayProvider>{children}<Suspense fallback={null}><MiniGuide /></Suspense></FarmDisplayProvider></LocationProvider>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
