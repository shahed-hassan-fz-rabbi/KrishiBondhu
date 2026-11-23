"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, ChevronDown, Compass, Headphones, Map, MessageCircle, Pause, Play, SkipForward, Volume2, VolumeX, X } from "lucide-react";
import { BondhuMascot } from "@/components/mascot/BondhuMascot.js";
import { saveMascotPreferences, useMascotPreferences } from "@/components/mascot/mascotStore.js";
import { BONDHU_TOUR_STEPS, findEligibleTourStepIndex, getTourStepIndexForRoute, normalizeTourProgress } from "@/components/mascot/tourSteps.js";
import { useAuth } from "@/contexts/AuthContext.js";
import { useLang } from "@/lib/i18n/LanguageContext.js";
import { useVoiceOutput } from "@/hooks/useVoiceOutput.js";
import { chooseCompanionPosition, getCompanionPositionBounds, placeCompanionBubble } from "@/components/mascot/companionLayout.js";

const PLACES = [
  { href: "/crop-calendar", en: "Crop calendar", bn: "ফসল ক্যালেন্ডার" },
  { href: "/crop-rotation", en: "Crop rotation", bn: "ফসল পর্যায়" },
  { href: "/my-farm/plan", en: "Plan a crop", bn: "ফসল পরিকল্পনা" },
  { href: "/my-farm/reviews", en: "Officer review", bn: "কর্মকর্তার পর্যালোচনা" },
  { href: "/handoff", en: "Aman to mustard", bn: "আমন থেকে সরিষা" },
  { href: "/my-farm", en: "My Farm", bn: "আমার খামার" },
  { href: "/market", en: "Market & costs", bn: "বাজার ও খরচ" },
  { href: "/climate", en: "Weather & climate", bn: "আবহাওয়া ও জলবায়ু" },
  { href: "/assistant", en: "Farm assistant", bn: "কৃষি সহকারী" },
  { href: "/data-sources", en: "Data sources", bn: "তথ্যের উৎস" },
  { href: "/settings", en: "Account & alerts", bn: "অ্যাকাউন্ট ও সতর্কতা" },
];
const TOUR_STOPS = BONDHU_TOUR_STEPS.map((step) => step.route);

function measureCompanionObstacles() {
  const main = document.querySelector("main");
  if (!main) return [];
  const width = window.innerWidth;
  const height = window.innerHeight;
  const boundarySelector = 'article, aside, section, [role="region"], [data-bondhu-obstacle], [class*="-card"], [class*="-panel"], [class*="-strip"]';
  const boundaries = [...main.querySelectorAll(boundarySelector)]
    .filter((element) => !element.closest(".kb-mini-guide") && element.getAttribute("aria-hidden") !== "true")
    .filter((element) => ![...element.classList].some((name) => name.includes("stage")))
    .filter((element) => ![...element.classList].some((name) => name.includes("hero")))
    .filter((element) => {
      if (element.tagName !== "SECTION" || element.id === "home") return true;
      const style = window.getComputedStyle(element);
      const rounded = Number.parseFloat(style.borderTopLeftRadius) >= 8;
      const bordered = style.borderTopWidth !== "0px" && style.borderTopStyle !== "none";
      const colored = style.backgroundColor !== "transparent" && style.backgroundColor !== "rgba(0, 0, 0, 0)";
      return rounded && (bordered || colored);
    })
    .map((element) => ({ element, rect: element.getBoundingClientRect() }))
    .filter(({ rect }) => rect.width >= 100 && rect.height >= 76 && rect.bottom > 0 && rect.top < height)
    .sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height));
  const obstacles = [];
  for (const { element, rect } of boundaries) {
    if (boundaries.some((candidate) => candidate.element !== element && candidate.element.contains(element) && obstacles.some((obstacle) => obstacle.element === candidate.element))) continue;
    const gap = 10;
    obstacles.push({
      element,
      left: Math.max(0, rect.left - gap),
      right: Math.min(width, rect.right + gap),
      top: Math.max(0, rect.top - gap),
      bottom: Math.min(height, rect.bottom + gap),
      weight: 3,
      soft: true,
    });
  }
  const textAndControls = main.querySelectorAll("h1,h2,h3,p,span,label,strong,li,a,button,input,select,textarea,summary,[role=button]");
  for (const element of textAndControls) {
    if (element.closest(".kb-mini-guide,[aria-hidden='true']") || (element.closest("a,button,summary,[role=button]") && !/^(A|BUTTON|SUMMARY)$/.test(element.tagName) && element.getAttribute("role") !== "button")) continue;
    const interactive = /^(A|BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(element.tagName) || element.getAttribute("role") === "button";
    const gap = interactive ? 8 : 4;
    const range = document.createRange();
    range.selectNodeContents(element);
    const rects = interactive ? [element.getBoundingClientRect()] : [...range.getClientRects()];
    for (const rect of rects) {
      if (!rect.width || !rect.height || rect.bottom <= 0 || rect.top >= height) continue;
      obstacles.push({
        left: Math.max(0, rect.left - gap),
        right: Math.min(width, rect.right + gap),
        top: Math.max(0, rect.top - gap),
        bottom: Math.min(height, rect.bottom + gap),
        weight: interactive ? 5 : element.matches("h1,h2,h3") ? 3 : 1.5,
      });
    }
  }
  return obstacles.filter((obstacle) => obstacle.right > obstacle.left && obstacle.bottom > obstacle.top);
}

function measureCompanionSafeArea() {
  const area = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  for (const element of document.querySelectorAll("header, nav, aside, [role=banner], [data-bondhu-safe-edge]")) {
    if (element.closest(".kb-mini-guide") || element.getAttribute("aria-hidden") === "true") continue;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    const topHeader = element.tagName === "HEADER" || element.getAttribute("role") === "banner";
    const fixed = style.position === "fixed" || style.position === "sticky";
    if (rect.top <= 1 && rect.bottom <= window.innerHeight * 0.45 && (topHeader || fixed)) {
      const controls = topHeader ? [...element.querySelectorAll("button,a,[role=button],input,select")]
        .map((control) => control.getBoundingClientRect())
        .filter((controlRect) => controlRect.width && controlRect.height)
        .map((controlRect) => controlRect.bottom) : [];
      let textBottom = 0;
      if (topHeader) {
        const range = document.createRange();
        range.selectNodeContents(element);
        textBottom = Math.max(0, ...[...range.getClientRects()].filter((textRect) => textRect.width && textRect.height).map((textRect) => textRect.bottom));
      }
      const visibleControlBottom = fixed ? rect.bottom : controls.length || textBottom ? Math.max(...controls, textBottom) : rect.bottom;
      area.top = Math.max(area.top, Math.min(rect.bottom, visibleControlBottom));
    }
    if (!fixed && !topHeader) continue;
    if (rect.bottom >= window.innerHeight - 1 && rect.top >= window.innerHeight * 0.55) area.bottom = Math.min(area.bottom, rect.top);
    if (rect.left <= 1 && rect.right <= window.innerWidth * 0.4 && rect.height >= window.innerHeight * 0.55) area.left = Math.max(area.left, rect.right);
    if (rect.right >= window.innerWidth - 1 && rect.left >= window.innerWidth * 0.6 && rect.height >= window.innerHeight * 0.55) area.right = Math.min(area.right, rect.left);
  }
  return area;
}

function pageTip(pathname, bn) {
  if (pathname?.startsWith("/officer")) return bn
    ? { title: "কর্মকর্তার পর্যালোচনা ডায়েরি", text: "আপনার জেলার কৃষকদের পাঠানো ফসল পরিকল্পনার অনুরোধগুলো যাচাই করুন। মাটির আর্দ্রতা, জমির ধরন ও স্থানীয় আবহাওয়া বিবেচনা করে বাস্তবসম্মত বৈজ্ঞানিক পরামর্শ ও দিকনির্দেশনা দিন।" }
    : { title: "Agricultural Officer Review Queue", text: "Review farm planning requests submitted by local farmers in your district. Provide practical, crop-specific guidance based on soil moisture, land type, and local weather." };
  if (pathname === "/crop-calendar") return bn
    ? { title: "বাৎসরিক ফসল ক্যালেন্ডার", text: "আপনার জেলা ও ফসল নির্বাচন করে বপন, নিবিড় পরিচর্যা, সার প্রয়োগ ও কাটার সর্বোত্তম সময়সূচি জানুন। রবি, খরিফ-১ ও খরিফ-২ মৌসুমের সাথে মিলিয়ে মাঠের কাজের পরিকল্পনা করুন।" }
    : { title: "Annual Crop Calendar", text: "Select your district and crop to explore optimal sowing, crop care, fertilization, and harvest windows aligned with Bangladesh's Rabi, Kharif-1, and Kharif-2 cropping seasons." };
  if (["/crop-rotation", "/rotation-planner"].includes(pathname)) return bn
    ? { title: "ফসল পর্যায় ও মাটির স্বাস্থ্য", text: "পূর্ববর্তী ফসল এবং জমির উর্বরতা বিশ্লেষণ করে পরবর্তী লাভজনক ফসল নির্বাচন করুন। ফসল পর্যায় মাটির নাইট্রোজেন বজায় রাখে এবং ক্ষতিকারক পোকামাকড়ের বিস্তার রোধ করে।" }
    : { title: "Crop Rotation & Soil Nutrition", text: "Select the most beneficial succession crop based on previous cultivation and soil fertility. Smart crop rotation restores nitrogen balance and breaks destructive pest cycles." };
  if (pathname === "/my-farm/plan") return bn
    ? { title: "জমির জন্য কাস্টম ফসল পরিকল্পনা", text: "আপনার জমির ধরন, মাটির গঠন ও সেচ সুবিধার তথ্য দিন। আমাদের এআই ইঞ্জিন জলবায়ু উপগ্রহ ডেটা বিশ্লেষণ করে সর্বোচ্চ লাভজনক জাত ও সার সুপারিশ করবে।" }
    : { title: "Customized Field Crop Plan", text: "Enter your land category, soil characteristics, and irrigation setup. Our AI engine leverages satellite climate telemetry to recommend the highest-yielding crop varieties." };
  if (pathname === "/handoff") return bn
    ? { title: "আমন থেকে সরিষার ট্রানজিশন", text: "আমন ধান কাটার পর সরিষা বপনের মধ্যবর্তী ০, ৭ ও ১৪ দিনের বিরতি তুলনা করুন। মাটির আর্দ্রতা মেপে জমিতে সঠিক সময়ে হালকা চাষ ও বীজ বপন নিশ্চিত করুন।" }
    : { title: "Aman to Mustard Handoff", text: "Compare 0, 7, and 14-day turnaround windows between Aman harvest and mustard sowing. Evaluate residual soil moisture to guarantee timely land preparation and seeding." };
  if (pathname === "/my-farm/reviews") return bn
    ? { title: "কর্মকর্তার মতামত ও পর্যালোচনা", text: "আপনার প্রেরিত ফসল পরিকল্পনায় স্থানীয় উপসহকারী কৃষি কর্মকর্তার মূল্যায়িত পরামর্শ ও মাঠের বাস্তবসম্মত নির্দেশনা এখানে দেখতে পারবেন।" }
    : { title: "Extension Officer Advisory", text: "Track personalized reviews and field recommendations submitted by your local agricultural extension officer for your submitted crop plan." };
  if (pathname?.startsWith("/my-farm")) return bn
    ? { title: "আমার খামার ব্যবস্থাপনা", text: "নতুন খামার বা প্লট যুক্ত করুন, চলমান ফসলের পরিচর্যা ও সেচের কাজের তালিকা ট্র্যাক করুন। জরুরি আবহাওয়া ও রোগবালাই সংক্রান্ত নোটিফিকেশন পেতে সেটিংস থেকে SMS চালু রাখুন।" }
    : { title: "Farm Management & Operations", text: "Register your farm plots, track seasonal crop lifecycles, and monitor weekly field tasks. Keep SMS alerts enabled in settings for urgent local weather advisories." };
  if (pathname === "/market") return bn
    ? { title: "দৈনিক বাজারদর ও মার্জিন বিশ্লেষণ", text: "কৃষি বিপণন অধিদপ্তরের (DAM) দৈনিক পাইকারি ও খুচরা দর পর্যবেক্ষণ করুন। নিজের উৎপাদন খরচ বাদ দিয়ে প্রত্যাশিত লাভ ও ফসল বিক্রির সেরা সময় নির্ধারণ করুন।" }
    : { title: "Daily Market Intelligence & Margins", text: "Examine verified daily wholesale and retail agricultural market rates from the Department of Agricultural Marketing (DAM) to determine the most profitable sale window." };
  if (["/climate", "/rainfall", "/soil-moisture", "/vegetation", "/map"].includes(pathname)) return bn
    ? { title: "উপগ্রহ আবহাওয়া ও জলবায়ু পর্যবেক্ষণ", text: "নাসা পাওয়ার ও এসএমএপি উপগ্রহ থেকে আপনার জেলার ২৫ বছরের বৃষ্টিপাত, মূল অঞ্চলের মাটির আর্দ্রতা ও রোদ ঘণ্টার উপগ্রহ তথ্য সরাসরি যাচাই করুন।" }
    : { title: "Satellite Climate & Soil Telemetry", text: "Access high-resolution observations from NASA POWER and SMAP satellites, including 25-year rainfall trends, root-zone soil moisture, and solar radiation for your district." };
  if (pathname === "/assistant") return bn
    ? { title: "কৃষি বন্ধু এআই সহকারী", text: "ফসলের রোগবালাই, সার-কীটনাশকের সঠিক মাত্রা বা সেচ ব্যবস্থাপনা নিয়ে সরাসরি প্রশ্ন করুন। বাংলা বা ইংরেজিতে তাৎক্ষণিক বৈজ্ঞানিক পরামর্শ ও উৎস তথ্য জেনে নিন।" }
    : { title: "KrishiBondhu AI Farm Assistant", text: "Ask any agronomic questions regarding plant pathologies, optimal fertilizer dosages, or irrigation schedules in Bangla or English for instant, grounded advisory." };
  if (pathname === "/settings") return bn
    ? { title: "প্রোফাইল ও নোটিফিকেশন সেটিংস", text: "আপনার চাষের জেলা ও যোগাযোগের তথ্য হালনাগাদ রাখুন। উপগ্রহভিত্তিক খরা ও বৃষ্টির জরুরি সতর্কতা সরাসরি মোবাইলে পেতে ফোন নম্বর ভেরিফাই করুন।" }
    : { title: "Account & Alert Preferences", text: "Keep your preferred agricultural district and contact profile updated. Verify your phone number to receive critical satellite-triggered drought and weather SMS alerts." };
  if (pathname === "/data-sources") return bn
    ? { title: "তথ্যের নির্ভরযোগ্যতা ও বৈজ্ঞানিক উৎস", text: "কৃষিবন্ধুর সকল আবহাওয়া, উপগ্রহ ও বাজার তথ্যের নির্ভুল উৎস জানুন। নাসা, ওপেন-মেটিও ও বাংলাদেশ কৃষি বিপণন অধিদপ্তরের সমন্বয়ে এই প্ল্যাটফর্মটি পরিচালিত।" }
    : { title: "Scientific Data Provenance", text: "Verify the authentic sources powering KrishiBondhu. All telemetry is cross-calibrated using NASA Earthdata, Open-Meteo, and Bangladesh Department of Agricultural Marketing (DAM)." };
  if (pathname === "/dashboard") return bn
    ? { title: "আপনার আধুনিক কৃষি ড্যাশবোর্ড", text: "মাঠের সার্বিক পরিস্থিতি একনজরে দেখুন। মাটির আর্দ্রতা, ৩০ দিনের বৃষ্টিপাত ও রবি ২০২৬ মৌসুমের প্রস্তাবিত ফসলের জাত অনুযায়ী এই সপ্তাহের অগ্রাধিকারমূলক কাজ সম্পন্ন করুন।" }
    : { title: "Your Modern Agricultural Dashboard", text: "Review field operations at a glance. Prioritize weekly tasks based on root-zone soil moisture, 30-day rainfall anomalies, and season-specific crop recommendations." };
  return bn
    ? { title: "আমি বন্ধু, আপনার সার্বক্ষণিক কৃষি সঙ্গী", text: "উপগ্রহ প্রযুক্তি, আবহাওয়া পর্যবেক্ষণ ও বাজার তথ্যের শক্তিতে প্রতিটি পদক্ষেপে আপনার পাশে আছি। যেকোনো পাতায় চলুন বা আমার সাথে পুরো প্ল্যাটফর্ম ঘুরে দেখুন!" }
    : { title: "I’m Bondhu, Your Agricultural Guide", text: "I'm here to empower your farming decisions with satellite telemetry, weather forecasting, and market intelligence. Explore the platform with me anytime!" };
}

export function MiniGuide() {
  const router = useRouter();
  const pathname = usePathname();
  const { locale } = useLang();
  const { user, isLoading: authLoading } = useAuth();
  const isAuthenticated = Boolean(user);
  const bn = locale === "bn";
  const [open, setOpen] = useState(false);
  const [greeting, setGreeting] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [tourMode, setTourMode] = useState(false);
  const [tourIndex, setTourIndex] = useState(0);
  const [flying, setFlying] = useState(false);
  const [finished, setFinished] = useState(false);
  const [tourPaused, setTourPaused] = useState(false);
  const [targetRect, setTargetRect] = useState(null);
  const [tourNotice, setTourNotice] = useState("");
  const [facing, setFacing] = useState(1);
  const preferences = useMascotPreferences();
  const { animationEnabled, hidden, muted } = preferences;
  const [paused, setPaused] = useState(false);
  const [assistantState, setAssistantState] = useState("idle");
  const [pokeState, setPokeState] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [sleeping, setSleeping] = useState(false);
  const {
    stop: stopTourVoice,
    pause: pauseTourVoice,
    resume: resumeTourVoice,
    speak: speakTourVoice,
    isSpeaking: isTourVoiceSpeaking,
    isPaused: isTourVoicePaused,
    isSupported: isTourVoiceSupported,
    error: tourVoiceError,
  } = useVoiceOutput();
  const tourStep = BONDHU_TOUR_STEPS[tourIndex] || null;
  const eligibleTourSteps = BONDHU_TOUR_STEPS.filter((step) => isAuthenticated || !step.requiresAuth);
  const visibleTourIndex = eligibleTourSteps.findIndex((step) => step.id === tourStep?.id);
  const characterState = tourMode && tourPaused ? "idle" : flying ? "flying" : isDragging ? "dragging" : isTourVoiceSpeaking && !isTourVoicePaused ? "talking" : tourMode || pokeState ? "happy" : hovered ? "listening" : sleeping ? "sleeping" : assistantState;
  const [position, setPosition] = useState(null);
  const [contentPosition, setContentPosition] = useState(null);
  const [bubblePosition, setBubblePosition] = useState(null);
  const dragRef = useRef(null);
  const launcherRef = useRef(null);
  const bubbleRef = useRef(null);
  const bubbleHoveredRef = useRef(false);
  const draggedRef = useRef(false);
  const startTourRef = useRef(null);
  const timerRef = useRef(null);
  const flightTimerRef = useRef(null);
  const pokeTimerRef = useRef(null);
  const targetObserverRef = useRef(null);
  const tourRunRef = useRef(false);
  const lastTargetXRef = useRef(null);
  const tip = useMemo(() => pageTip(pathname, bn), [pathname, bn]);
  const places = user?.role === "extension_officer" || user?.role === "admin"
    ? [...PLACES, { href: "/officer/reviews", en: "Officer reviews", bn: "কর্মকর্তার পর্যালোচনা" }]
    : PLACES;

  const navigateTo = useCallback((href) => {
    setSleeping(false);
    setFlying(true);
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      router.push(href);
      if (!tourRunRef.current) setFlying(false);
    }, 360);
  }, [router]);

  useEffect(() => () => {
    window.clearTimeout(timerRef.current);
    window.clearTimeout(flightTimerRef.current);
    window.clearTimeout(pokeTimerRef.current);
    targetObserverRef.current?.disconnect();
    stopTourVoice();
  }, [stopTourVoice]);

  useEffect(() => {
    const onStartTour = (event) => startTourRef.current?.(event.detail?.restart === true);
    window.addEventListener("krishi:tour-start", onStartTour);
    return () => window.removeEventListener("krishi:tour-start", onStartTour);
  }, []);

  useEffect(() => {
    const updateAssistantState = (event) => {
      setAssistantState(event.detail?.state || "idle");
      setSleeping(false);
    };
    window.addEventListener("krishi:assistant-status", updateAssistantState);
    return () => window.removeEventListener("krishi:assistant-status", updateAssistantState);
  }, []);

  useEffect(() => {
    if (muted) stopTourVoice();
  }, [muted, stopTourVoice]);

  useEffect(() => {
    if (pathname !== "/" || hidden || authLoading) return undefined;
    const key = "krishibondhu.bondhu.welcome-seen";
    try { if (window.localStorage.getItem(key)) return undefined; } catch { return undefined; }
    const timer = window.setTimeout(() => {
      setGreeting(true);
      setOpen(true);
      try { window.localStorage.setItem(key, "1"); } catch { /* the greeting is optional */ }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [authLoading, hidden, pathname]);

  useEffect(() => {
    if (!open || !greeting || tourMode) return undefined;
    let timer;
    const dismissWhenIdle = () => {
      if (bubbleHoveredRef.current || bubbleRef.current?.contains(document.activeElement)) {
        timer = window.setTimeout(dismissWhenIdle, 1500);
        return;
      }
      setOpen(false);
    };
    timer = window.setTimeout(dismissWhenIdle, 14_000);
    return () => window.clearTimeout(timer);
  }, [open, greeting, tourMode, pathname, bn, finished]);

  useEffect(() => {
    if (open || tourMode || flying || isDragging || assistantState !== "idle" || hidden || !animationEnabled) return undefined;
    const timer = window.setTimeout(() => setSleeping(true), 45_000);
    return () => window.clearTimeout(timer);
  }, [open, tourMode, flying, isDragging, assistantState, hidden, animationEnabled]);

  const savePreferences = (updates) => {
    saveMascotPreferences(updates);
  };

  const savedPosition = useMemo(() => Number.isFinite(preferences.x) && Number.isFinite(preferences.y)
    ? { x: preferences.x, y: preferences.y }
    : null, [preferences.x, preferences.y]);
  const launcherBounds = () => {
    const current = launcherRef.current?.getBoundingClientRect();
    if (current?.width && current?.height) return { width: current.width, height: current.height };
    const compact = window.innerWidth <= 760;
    return { width: compact ? 132 : 160, height: compact ? 154 : 176 };
  };
  const defaultPosition = () => {
    const bounds = launcherBounds();
    const safeArea = measureCompanionSafeArea();
    const limits = getCompanionPositionBounds({ viewportWidth: window.innerWidth, viewportHeight: window.innerHeight, size: bounds, safeArea });
    return { x: limits.maxX, y: limits.maxY };
  };
  const visibleContentPosition = !tourMode && !hidden ? contentPosition : null;

  // Measure real card/control boundaries and keep Bondhu outside fixed navigation.
  // The landing hero stage is preferred only when it has enough measured free space.
  useLayoutEffect(() => {
    if (tourMode || hidden || isDragging) return undefined;
    let frame = 0;
    const place = () => {
      const size = launcherBounds();
      const safeArea = measureCompanionSafeArea();
      const obstacles = measureCompanionObstacles();
      const preferredPositions = [position, savedPosition, contentPosition].filter(Boolean);
      const candidatePositions = [];
      if (window.innerWidth > 780) {
        const stage = document.querySelector("#home .kb-hero2-card-stage");
        const stageRect = stage?.getBoundingClientRect();
        const content = stage?.querySelector(".kb-hero-path-card, article, [role=region]");
        const contentRect = content?.getBoundingClientRect();
        const freeBelowContent = stageRect && contentRect ? stageRect.bottom - Math.max(contentRect.bottom, stageRect.top) : 0;
        if (stageRect && stageRect.bottom > safeArea.top && stageRect.top < safeArea.bottom && freeBelowContent >= size.height + 12) {
          candidatePositions.push({
            x: stageRect.left + (stageRect.width - size.width) / 2,
            y: stageRect.bottom - size.height - 8,
          });
        }
      }
      const safe = chooseCompanionPosition({
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        size,
        collisionBounds: { x: 2, y: 0, width: Math.max(1, size.width - 4), height: Math.max(1, size.height - 12) },
        obstacles,
        preferredPositions,
        candidatePositions,
        safeArea,
      });
      if (position && (position.x !== safe.x || position.y !== safe.y)) {
        setPosition(safe);
        savePreferences(safe);
      } else if (!position && savedPosition && (savedPosition.x !== safe.x || savedPosition.y !== safe.y)) {
        setPosition(safe);
        savePreferences(safe);
      }
      setContentPosition((current) => current?.x === safe.x && current?.y === safe.y ? current : safe);
    };
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(place);
    };
    place();
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    const main = document.querySelector("main");
    const resizeObserver = typeof ResizeObserver === "undefined" || !main ? null : new ResizeObserver(schedule);
    if (main) resizeObserver?.observe(main);
    for (const element of main?.querySelectorAll('article, aside, section, [role="region"], [data-bondhu-obstacle], [class*="-card"], [class*="-panel"], [class*="-strip"]') || []) {
      if (![...element.classList].some((name) => name.includes("stage") || name.includes("hero"))) resizeObserver?.observe(element);
    }
    const mutationObserver = typeof MutationObserver === "undefined" || !main ? null : new MutationObserver(schedule);
    mutationObserver?.observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "aria-hidden"] });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [pathname, preferences.x, preferences.y, savedPosition, position, contentPosition, tourMode, hidden, isDragging]);

  useLayoutEffect(() => {
    if (!open || !launcherRef.current || !bubbleRef.current) {
      setBubblePosition(null);
      return undefined;
    }
    let frame = 0;
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const launcher = launcherRef.current?.getBoundingClientRect();
        const bubble = bubbleRef.current?.getBoundingClientRect();
        if (!launcher || !bubble) return;
        const visibleHeader = document.querySelector("[data-app-header], .kb-app-header, .kb-topbar, header");
        const headerRect = visibleHeader?.getBoundingClientRect();
        const headerBottom = headerRect && headerRect.bottom > 0 ? Math.max(0, headerRect.bottom) : 0;
        const target = tourMode && targetRect ? {
          left: targetRect.left - 8,
          right: targetRect.left + targetRect.width + 8,
          top: targetRect.top - 8,
          bottom: targetRect.top + targetRect.height + 8,
        } : null;
        const obstacles = [...document.querySelectorAll("main h1,main h2,main p,main a,main button,main input,main select,main textarea,header,nav")]
          .filter((element) => !element.closest(".kb-mini-guide") && element.getAttribute("aria-hidden") !== "true")
          .map((element) => {
            const rect = element.getBoundingClientRect();
            if (!rect.width || !rect.height || rect.bottom <= 0 || rect.top >= window.innerHeight) return null;
            const interactive = /^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(element.tagName);
            return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, weight: interactive ? 2.5 : 1 };
          }).filter(Boolean);
        const next = placeCompanionBubble({
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          launcher,
          bubble,
          target,
          obstacles,
          headerBottom,
          preferredSide: window.innerWidth <= 760 ? "above" : null,
        });
        setBubblePosition((current) => current && current.left === next.left && current.top === next.top && current.side === next.side ? current : next);
      });
    };
    update();
    window.addEventListener("resize", update, { passive: true });
    window.addEventListener("scroll", update, { capture: true, passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(bubbleRef.current);
    observer?.observe(launcherRef.current);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      observer?.disconnect();
    };
  }, [open, position, targetRect, tourMode, tourPaused, pathname, bn, finished, tourIndex]);

  const startDrag = (event) => {
    if (event.button !== 0) return;
    setSleeping(false);
    setIsDragging(true);
    const fallbackPosition = defaultPosition();
    const visualPosition = position || visibleContentPosition || savedPosition || fallbackPosition;
    dragRef.current = { pointerId: event.pointerId, offsetX: event.clientX - visualPosition.x, offsetY: event.clientY - visualPosition.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const drag = (event) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    const bounds = launcherBounds();
    const limits = getCompanionPositionBounds({ viewportWidth: window.innerWidth, viewportHeight: window.innerHeight, size: bounds, safeArea: measureCompanionSafeArea(), margin: 8 });
    const x = Math.max(limits.minX, Math.min(limits.maxX, event.clientX - dragRef.current.offsetX));
    const y = Math.max(limits.minY, Math.min(limits.maxY, event.clientY - dragRef.current.offsetY));
    const visualPosition = position || visibleContentPosition || savedPosition || fallbackPosition;
    if (Math.abs(x - visualPosition.x) + Math.abs(y - visualPosition.y) > 6) draggedRef.current = true;
    setPosition({ x, y });
  };

  const endDrag = () => {
    dragRef.current = null;
    setIsDragging(false);
    if (position) savePreferences(position);
  };

  const tapCompanion = (event) => {
    if (draggedRef.current) {
      draggedRef.current = false;
      event.preventDefault();
      return;
    }
    setSleeping(false);
    setGreeting(false);
    if (tourMode) setOpen(true);
    else setOpen((value) => !value);
    if (hidden) savePreferences({ hidden: false });
    setPokeState("happy");
    window.clearTimeout(pokeTimerRef.current);
    pokeTimerRef.current = window.setTimeout(() => setPokeState(""), 1150);
  };

  const moveWithKeyboard = (event) => {
    const offsets = { ArrowUp: [0, -24], ArrowDown: [0, 24], ArrowLeft: [-24, 0], ArrowRight: [24, 0] };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    const bounds = launcherBounds();
    const base = position || visibleContentPosition || savedPosition || defaultPosition();
    const limits = getCompanionPositionBounds({ viewportWidth: window.innerWidth, viewportHeight: window.innerHeight, size: bounds, safeArea: measureCompanionSafeArea(), margin: 8 });
    const next = { x: Math.max(limits.minX, Math.min(limits.maxX, base.x + offset[0])), y: Math.max(limits.minY, Math.min(limits.maxY, base.y + offset[1])) };
    setPosition(next);
    savePreferences(next);
  };

  const startTour = useCallback((restart = false) => {
    const contextualIndex = getTourStepIndexForRoute(pathname);
    const savedIndex = preferences.tourProgress == null ? null : normalizeTourProgress(preferences.tourProgress);
    const nextIndex = restart ? 0 : savedIndex ?? Math.max(0, contextualIndex);
    stopTourVoice();
    setTourIndex(nextIndex);
    setTourMode(true);
    setTourPaused(false);
    setPaused(false);
    setFinished(false);
    setGreeting(false);
    setOpen(true);
    setTourNotice("");
    setTargetRect(null);
    tourRunRef.current = true;
    savePreferences({ tourProgress: nextIndex });
    navigateTo(TOUR_STOPS[nextIndex]);
  }, [navigateTo, pathname, preferences.tourProgress, stopTourVoice]);

  useEffect(() => { startTourRef.current = startTour; }, [startTour]);

  const nextStop = useCallback(() => {
    const nextIndex = findEligibleTourStepIndex(tourIndex + 1, isAuthenticated, BONDHU_TOUR_STEPS, 1);
    if (nextIndex < 0) {
      tourRunRef.current = false;
      stopTourVoice();
      savePreferences({ tourProgress: null });
      setTourMode(false);
      setTargetRect(null);
      setFinished(true);
      return;
    }
    stopTourVoice();
    setTourIndex(nextIndex);
    savePreferences({ tourProgress: nextIndex });
    setTourPaused(false);
    setPaused(false);
    navigateTo(TOUR_STOPS[nextIndex]);
  }, [isAuthenticated, navigateTo, tourIndex, stopTourVoice]);

  const cancelTour = useCallback(() => {
    tourRunRef.current = false;
    stopTourVoice();
    setTourMode(false);
    setTargetRect(null);
    savePreferences({ tourProgress: tourIndex });
    setFinished(false);
  }, [tourIndex, stopTourVoice]);

  const toggleTourPause = () => {
    const nextPaused = !paused;
    setPaused(nextPaused);
    setTourPaused(nextPaused);
    if (nextPaused) pauseTourVoice();
    else resumeTourVoice();
  };

  const readTourStep = () => {
    if (!tourStep || muted || !isTourVoiceSupported) return;
    if (isTourVoiceSpeaking && !isTourVoicePaused) stopTourVoice();
    else speakTourVoice(bn ? tourStep.bn : tourStep.en, { id: "bondhu-tour-" + tourStep.id, preferredLang: bn ? "bn-BD" : "en-US" });
  };

  const readPageTip = () => {
    if (muted || !isTourVoiceSupported) return;
    if (isTourVoiceSpeaking && !isTourVoicePaused) {
      stopTourVoice();
    } else {
      const speechText = `${tip.title}। ${tip.text}`;
      speakTourVoice(speechText, {
        id: "bondhu-tip-" + (pathname ? pathname.replace(/\//g, "-") : "home"),
        preferredLang: bn ? "bn-BD" : "en-US",
      });
    }
  };

  const closeGuide = useCallback(() => {
    stopTourVoice();
    if (tourMode) cancelTour();
    setOpen(false);
    setGreeting(false);
    window.requestAnimationFrame(() => launcherRef.current?.focus({ preventScroll: true }));
  }, [cancelTour, stopTourVoice, tourMode]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") closeGuide();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeGuide, open]);

  useEffect(() => {
    if (!tourMode || paused || authLoading || !tourStep) return undefined;
    if (tourStep.requiresAuth && !isAuthenticated) {
      const timeout = window.setTimeout(nextStop, 450);
      return () => window.clearTimeout(timeout);
    }
    if (pathname !== tourStep.route) return undefined;

    let settled = false;
    let frame = 0;
    let timeout;
    let resizeObserver;
    const selector = '[data-tour-target="' + tourStep.target + '"]';
    const measure = () => {
      const target = document.querySelector(selector);
      if (!target?.isConnected || !target.getClientRects().length || target.closest('[aria-hidden="true"]')) return false;
      const visibility = window.getComputedStyle(target);
      if (visibility.display === "none" || visibility.visibility === "hidden" || Number(visibility.opacity) === 0) return false;
      target.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "center",
        inline: "nearest",
      });
      frame = window.requestAnimationFrame(() => {
        const rect = target.getBoundingClientRect();
        setFacing(rect.left >= (lastTargetXRef.current ?? rect.left) ? 1 : -1);
        lastTargetXRef.current = rect.left;
        setTargetRect({ left: rect.left, top: rect.top, width: rect.width, height: rect.height, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight });
        setFlying(false);
      });
      settled = true;
      resizeObserver?.disconnect();
      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(() => {
          const rect = target.getBoundingClientRect();
          setTargetRect({ left: rect.left, top: rect.top, width: rect.width, height: rect.height, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight });
        });
        resizeObserver.observe(target);
      }
      return true;
    };
    const discover = () => {
      if (settled) return;
      if (measure()) {
        observer.disconnect();
        if (targetObserverRef.current === observer) targetObserverRef.current = null;
      }
    };
    const observer = new MutationObserver(discover);
    targetObserverRef.current = observer;
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "hidden"] });
    discover();
    const refresh = () => {
      const target = document.querySelector(selector);
      if (!target?.isConnected) return;
      const rect = target.getBoundingClientRect();
      setTargetRect({ left: rect.left, top: rect.top, width: rect.width, height: rect.height, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight });
    };
    window.addEventListener("scroll", refresh, { capture: true, passive: true });
    window.addEventListener("resize", refresh, { passive: true });
    timeout = window.setTimeout(() => {
      if (settled || !tourRunRef.current) return;
      setTourNotice(bn ? "এই পাতার অংশটি পাওয়া যাচ্ছে না; পরের ধাপে যাচ্ছি।" : "That section is not available right now. Skipping to the next step.");
      nextStop();
    }, 5000);
    return () => {
      window.clearTimeout(timeout);
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      resizeObserver?.disconnect();
      if (targetObserverRef.current === observer) targetObserverRef.current = null;
      window.removeEventListener("scroll", refresh, true);
      window.removeEventListener("resize", refresh);
    };
  }, [authLoading, bn, isAuthenticated, nextStop, pathname, paused, tourIndex, tourMode, tourStep]);

  const launcherPosition = position || visibleContentPosition || contentPosition || savedPosition;
  const launcherStyle = launcherPosition ? { left: launcherPosition.x, top: launcherPosition.y, right: "auto", bottom: "auto" } : undefined;
  const tourPosition = tourMode && targetRect ? {
    left: (() => {
      if (window.innerWidth <= 760) return Math.max(8, window.innerWidth - 98);
      const size = window.innerWidth < 640 ? 92 : 132;
      const rightSide = targetRect.left + targetRect.width + 8;
      const leftSide = targetRect.left - size - 8;
      return rightSide + size <= window.innerWidth - 8 ? rightSide : leftSide >= 8 ? leftSide : Math.max(8, window.innerWidth - size - 8);
    })(),
      top: window.innerWidth <= 760
        ? Math.max(72, window.innerHeight - 250 - 100 - 12)
        : Math.min(Math.max(72, window.innerHeight - 212), Math.max(72, targetRect.top)),
    right: "auto",
    bottom: "auto",
  } : launcherStyle;
  const compactTourSheet = tourMode && typeof window !== "undefined" && window.innerWidth <= 760;
  const speechStyle = bubblePosition && !compactTourSheet ? { left: bubblePosition.left, top: bubblePosition.top, width: bubblePosition.width, right: "auto", bottom: "auto" } : undefined;

  return <>
    {tourMode && targetRect && pathname === tourStep?.route && <svg className="kb-tour-spotlight" aria-hidden="true" focusable="false" viewBox={"0 0 " + targetRect.viewportWidth + " " + targetRect.viewportHeight} preserveAspectRatio="none"><path fillRule="evenodd" d={"M0 0H" + targetRect.viewportWidth + "V" + targetRect.viewportHeight + "H0Z M" + (targetRect.left - 8) + " " + (targetRect.top - 8) + "H" + (targetRect.left + targetRect.width + 8) + "V" + (targetRect.top + targetRect.height + 8) + "H" + (targetRect.left - 8) + "Z"} /></svg>}
    {tourMode && targetRect && pathname === tourStep?.route && <div className="kb-tour-outline" aria-hidden="true" style={{ left: targetRect.left - 6, top: targetRect.top - 6, width: targetRect.width + 12, height: targetRect.height + 12 }} />}
  <div className={"kb-mini-guide" + (tourMode ? " is-tour-active" : "")} style={tourPosition}>
    {open && <section ref={bubbleRef} className={`kb-mini-bubble${tourMode ? " is-tour-bubble" : ""}`} data-side={bubblePosition?.side || "above"} style={speechStyle} role="dialog" aria-label={bn ? "বন্ধুর কৃষি নির্দেশনা" : "Bondhu’s farm guide"} aria-describedby={tourMode ? "bondhu-tour-description" : undefined} onPointerEnter={() => { bubbleHoveredRef.current = true; }} onPointerLeave={() => { bubbleHoveredRef.current = false; }}>
      <header className="kb-mini-bubble-head"><div className="kb-mini-kicker">{tourMode ? (bn ? `ধাপ ${visibleTourIndex + 1} / ${eligibleTourSteps.length}` : `STEP ${visibleTourIndex + 1} OF ${eligibleTourSteps.length}`) : (bn ? "বন্ধু · আপনার মাঠের সঙ্গী" : "BONDHU · YOUR FIELD GUIDE")}</div><button type="button" aria-label={bn ? "বন্ধ করুন" : "Close"} onClick={closeGuide} className="kb-mini-close"><X size={17}/></button></header>
      <div className="kb-mini-bubble-body">
        {tourMode ? <>
          <h2>{bn ? "বন্ধুর সাথে ঘুরে দেখুন" : "Explore with Bondhu"}</h2>
          <p id="bondhu-tour-description" className="kb-mini-tour-description" aria-live="polite">{bn ? tourStep?.bn : tourStep?.en}</p>
          {tourNotice && <p className="kb-mini-tour-notice" role="status">{tourNotice}</p>}
          {tourVoiceError && <p className="kb-mini-tour-notice" role="status">{bn ? "কণ্ঠে শোনা যাচ্ছে না। লেখা পড়ে এগিয়ে যান।" : "Voice playback is unavailable. Continue with the captions."}</p>}
        </> : finished ? <>
          <h2>{bn ? "ঘুরে দেখা শেষ!" : "Tour complete"}</h2>
          <p>{bn ? "যেকোনো সময় আবার ঘুরে দেখতে পারেন।" : "You can replay the tour any time."}</p>
        </> : <>
          <h2>{tip.title}</h2>
          <p>{tip.text}</p>
          <div className="kb-mini-audio-bar">
            <button
              type="button"
              onClick={readPageTip}
              disabled={muted || !isTourVoiceSupported}
              className={`kb-mini-voice-btn ${isTourVoiceSpeaking && !tourMode ? "is-speaking" : ""}`}
              aria-label={isTourVoiceSpeaking && !tourMode ? (bn ? "কণ্ঠ থামান" : "Stop listening") : (bn ? "কণ্ঠে শুনুন" : "Listen in voice")}
              title={isTourVoiceSpeaking && !tourMode ? (bn ? "কণ্ঠ থামান" : "Stop voice") : (bn ? "কণ্ঠে শুনুন" : "Listen in voice")}
            >
              {isTourVoiceSpeaking && !tourMode ? <VolumeX size={14} /> : <Volume2 size={14} />}
              <span>{isTourVoiceSpeaking && !tourMode ? (bn ? "কণ্ঠ থামান" : "Stop speaking") : (bn ? "কণ্ঠে শুনুন" : "Listen in voice")}</span>
            </button>
          </div>
        </>}
        {tourMode ? <div className="kb-mini-tour-actions"><button type="button" onClick={() => { const previous = findEligibleTourStepIndex(tourIndex - 1, isAuthenticated, BONDHU_TOUR_STEPS, -1); if (previous >= 0) { stopTourVoice(); setTourIndex(previous); savePreferences({ tourProgress: previous }); navigateTo(TOUR_STOPS[previous]); } }} disabled={paused || findEligibleTourStepIndex(tourIndex - 1, isAuthenticated, BONDHU_TOUR_STEPS, -1) < 0} className="kb-mini-quiet" aria-label={bn ? "আগের ধাপ" : "Previous step"}><ArrowLeft size={15}/>{bn ? "আগে" : "Previous"}</button><button type="button" onClick={nextStop} disabled={paused} className="kb-mini-primary">{tourIndex >= BONDHU_TOUR_STEPS.length-1 ? (bn ? "শেষ করুন" : "Finish") : (bn ? "পরের ধাপ" : "Next")}<ArrowRight size={15}/></button><button type="button" onClick={toggleTourPause} className="kb-mini-quiet" aria-label={paused ? (bn ? "আবার চালান" : "Resume tour") : (bn ? "বিরতি" : "Pause tour")}>{paused ? <Play size={15}/> : <Pause size={15}/>}<span className="sr-only">{paused ? (bn ? "চালান" : "Resume") : (bn ? "বিরতি" : "Pause")}</span></button><button type="button" onClick={readTourStep} disabled={muted || !isTourVoiceSupported} className={`kb-mini-quiet kb-mini-listen-btn ${isTourVoiceSpeaking && tourMode ? "is-speaking" : ""}`} aria-label={isTourVoiceSpeaking ? (bn ? "কণ্ঠ থামান" : "Stop speaking") : (bn ? "এই ধাপ শুনুন" : "Listen to this step")} title={isTourVoiceSpeaking ? (bn ? "কণ্ঠ থামান" : "Stop speaking") : (bn ? "এই ধাপ শুনুন" : "Listen to this step")}>{isTourVoiceSpeaking && tourMode ? <VolumeX size={15}/> : <Volume2 size={15}/>}<span>{isTourVoiceSpeaking && tourMode ? (bn ? "থামান" : "Stop") : (bn ? "শুনুন" : "Listen")}</span></button><button type="button" onClick={cancelTour} className="kb-mini-quiet"><SkipForward size={15}/>{bn ? "বাদ" : "Skip"}</button><button type="button" onClick={() => startTour(true)} className="kb-mini-quiet">{bn ? "আবার" : "Replay"}</button></div> : <>
          {!finished && <button type="button" onClick={startTour} className="kb-mini-primary kb-mini-start">{bn ? "বন্ধুর সাথে ঘুরে দেখুন" : preferences.tourProgress != null ? "Resume guided tour" : "Take a guided tour"}<Compass size={15}/></button>}
          <a className="kb-mini-ask" href="/assistant" onClick={(event)=>{event.preventDefault();setOpen(false);setFinished(false);navigateTo("/assistant");}}><MessageCircle size={14}/>{bn ? "কৃষি সহকারীর সাথে কথা বলুন" : "Open the farm assistant"}</a>
          <details className="kb-mini-more"><summary>{bn ? "আরও বিকল্প" : "More options"}<ChevronDown size={14}/></summary>
            <div className="kb-mini-more-body">
              <details className="kb-mini-places"><summary><Map size={15}/>{bn ? "একটি পাতা দেখান" : "Choose a page"}<ChevronDown size={15}/></summary><nav aria-label={bn ? "পাতা বেছে নিন" : "Choose a page"}>{places.map((place)=><button type="button" key={place.href} onClick={()=>{cancelTour();setFinished(false);setOpen(false);navigateTo(place.href);}} aria-current={pathname===place.href?"page":undefined}>{place[bn?"bn":"en"]}<ArrowRight size={13}/></button>)}</nav></details>
              <div className="kb-mini-preferences">
                <button type="button" role="switch" aria-checked={animationEnabled} onClick={() => { setSleeping(false); savePreferences({ animationEnabled: !animationEnabled }); }}>{animationEnabled ? (bn ? "অ্যানিমেশন" : "Motion on") : (bn ? "অ্যানিমেশন বন্ধ" : "Motion off")}</button>
                <button type="button" role="switch" aria-checked={muted} onClick={() => savePreferences({ muted: !muted })}>{muted ? (bn ? "কণ্ঠ বন্ধ" : "Voice muted") : (bn ? "কণ্ঠ চালু" : "Voice on")}</button>
                <button type="button" onClick={() => { setOpen(false); savePreferences({ hidden: true }); }}>{bn ? "লুকান" : "Hide"}</button>
              </div>
            </div>
          </details>
        </>}
      </div>
    </section>}
    <button ref={launcherRef} type="button" className={`kb-mini-launcher ${flying ? "is-flying" : ""} ${hidden ? "is-hidden" : ""}`} onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)} onPointerDown={startDrag} onPointerMove={drag} onPointerUp={endDrag} onPointerCancel={endDrag} onKeyDown={moveWithKeyboard} onClick={tapCompanion} aria-expanded={open} aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight" aria-label={bn ? (hidden ? "বন্ধুকে দেখান" : "বন্ধুর কাছে সাহায্য চান") : (hidden ? "Show Bondhu" : "Ask Bondhu for help")}>
      <BondhuMascot active={!hidden && animationEnabled} className="kb-mini-face" state={characterState} facing={facing} label={bn ? "বন্ধু, কৃষকের সহায়ক ড্রাগন" : "Bondhu, a friendly farmer companion"}/>
      {!hidden && <span className="kb-mini-hit-area" aria-hidden="true" />}
      {(hidden || tourMode) && <span>{hidden ? (bn ? "বন্ধুকে দেখান" : "Show Bondhu") : "Bondhu"}</span>}
    </button>
  </div>
  </>;
}
