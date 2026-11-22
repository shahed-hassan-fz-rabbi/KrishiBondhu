"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, ChevronDown, Compass, Headphones, Map, MessageCircle, Pause, Play, SkipForward, X } from "lucide-react";
import { BondhuMascot } from "@/components/mascot/BondhuMascot.js";
import { saveMascotPreferences, useMascotPreferences } from "@/components/mascot/mascotStore.js";
import { BONDHU_TOUR_STEPS, findEligibleTourStepIndex, getTourStepIndexForRoute, normalizeTourProgress } from "@/components/mascot/tourSteps.js";
import { useAuth } from "@/contexts/AuthContext.js";
import { useLang } from "@/lib/i18n/LanguageContext.js";
import { useVoiceOutput } from "@/hooks/useVoiceOutput.js";
import { placeCompanionBubble } from "@/components/mascot/companionLayout.js";

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

function pageTip(pathname, bn) {
  if (pathname?.startsWith("/officer")) return bn
    ? { title: "কর্মকর্তার পর্যালোচনা", text: "কৃষকের জেলার অনুরোধ খুলে পরিকল্পনা ও প্রশ্ন পড়ুন। মাঠের বাস্তবতা বিবেচনা করে লিখিত পরামর্শ দিন।" }
    : { title: "Officer review queue", text: "Open a request for your district, read the crop context and farmer’s question, then record practical field advice." };
  if (pathname === "/crop-calendar") return bn
    ? { title: "ফসল ক্যালেন্ডার", text: "আপনার জেলা ও ফসল বেছে বপন, পরিচর্যা ও কাটার সময় দেখুন। ক্যালেন্ডারের উৎস ও মৌসুম মিলিয়ে নিন।" }
    : { title: "Crop calendar", text: "Choose a district and crop to see sowing, care and harvest windows. Check the source and season before using a calendar." };
  if (["/crop-rotation", "/rotation-planner"].includes(pathname)) return bn
    ? { title: "ফসল পর্যায়", text: "আগের ফসল, জমি ও মৌসুম অনুযায়ী পরের ফসল তুলনা করুন। ফলন নিশ্চিত ধরে নেবেন না—স্থানীয় অবস্থা মিলিয়ে নিন।" }
    : { title: "Crop rotation", text: "Compare a next crop using field and seasonal context. Treat suitability as a screening result, then check local conditions." };
  if (pathname === "/my-farm/plan") return bn
    ? { title: "জমির জন্য ফসল পরিকল্পনা", text: "জেলা, জমির ধরন, মাটি ও পানির তথ্য দিন। প্রস্তাবের কারণ ও সীমাবদ্ধতা দেখে প্রয়োজনে কৃষি কর্মকর্তার পর্যালোচনা চান।" }
    : { title: "Plan for your field", text: "Enter your district, land, soil and water details. Review each option’s reasons and limits; you can ask an officer to review the plan." };
  if (pathname === "/handoff") return bn
    ? { title: "আমন থেকে সরিষা", text: "কাটার পর ০, ৭ বা ১৪ দিনের ব্যবধান তুলনা করুন। বৃষ্টি ও ফসলের ক্যালেন্ডার দেখে জমির প্রস্তুতি ঠিক করুন।" }
    : { title: "Aman to mustard", text: "Compare 0, 7 and 14-day handoff windows. Use rainfall context and the crop calendar while planning field preparation." };
  if (pathname === "/my-farm/reviews") return bn
    ? { title: "কর্মকর্তার পর্যালোচনা", text: "আপনার পাঠানো ফসল পরিকল্পনার অবস্থা দেখুন। কর্মকর্তা উত্তর দিলে পরামর্শ এখানে পড়তে পারবেন।" }
    : { title: "Officer review", text: "Track your crop plan requests here. When an agricultural officer responds, you can read their advice on this page." };
  if (pathname?.startsWith("/my-farm")) return bn
    ? { title: "আমার খামার", text: "খামার যোগ করুন, সক্রিয় ফসল ও মাঠের কাজ দেখুন। কাজ শেষ হলে আপডেট করুন, আর সতর্কতা সেটিংস থেকে SMS পছন্দ নিয়ন্ত্রণ করুন।" }
    : { title: "My Farm", text: "Add a farm, track active crops and field tasks, then mark work complete. Manage SMS consent and alerts in settings." };
  if (pathname === "/market") return bn
    ? { title: "বাজার ও নিজের হিসাব", text: "সরকারি দৈনিক রিপোর্ট খুলুন। নিজের বিক্রয়দর ও উৎপাদন খরচ লিখে লক্ষ্যদরের সাথে তুলনা করুন।" }
    : { title: "Market and your costs", text: "Open the official daily report, then enter your own quote and production costs to compare against a target price." };
  if (["/climate", "/rainfall", "/soil-moisture", "/vegetation", "/map"].includes(pathname)) return bn
    ? { title: "আবহাওয়া ও জলবায়ু", text: "জেলা বেছে পর্যবেক্ষণের তারিখ, একক ও ডেটার কভারেজ দেখুন। এগুলো এলাকার পর্যবেক্ষণ—আপনার জমির সরাসরি মাপ নয়।" }
    : { title: "Weather and climate", text: "Choose a district and check observation dates, units and coverage. These are area observations, not direct measurements of your plot." };
  if (pathname === "/assistant") return bn
    ? { title: "কৃষি সহকারী", text: "বাংলা বা ইংরেজিতে প্রশ্ন করুন। উত্তর যে তথ্যের ওপর ভিত্তি করে এবং যেখানে সীমাবদ্ধ—সেটা যাচাই করুন।" }
    : { title: "Farm assistant", text: "Ask in Bangla or English. Check which information supports the answer and where its limits are." };
  if (pathname === "/settings") return bn
    ? { title: "প্রোফাইল ও সতর্কতা", text: "প্রোফাইল ও জেলা ঠিক রাখুন। SMS চালু করার আগে নিজের ফোন যাচাই ও সম্মতি সম্পন্ন করুন।" }
    : { title: "Profile and alerts", text: "Keep your profile and district current. Verify your phone and give consent before enabling SMS alerts." };
  if (pathname === "/data-sources") return bn
    ? { title: "তথ্যের উৎস", text: "কোন উৎস, সময়কাল ও একক ব্যবহার হয়েছে তা দেখুন—কোনো ফসল সিদ্ধান্তে যাওয়ার আগে ডেটার সীমাবদ্ধতাও পড়ুন।" }
    : { title: "Data sources", text: "Review the sources, time periods and units, including data limits, before using an observation in a crop decision." };
  if (pathname === "/dashboard") return bn
    ? { title: "আপনার কৃষি ড্যাশবোর্ড", text: "জেলা ও সাম্প্রতিক কৃষি তথ্য দেখুন। বিস্তারিত ফসল পরিকল্পনা, আবহাওয়া, বাজার বা খামারের কাজে যেতে নিচের পথগুলো ব্যবহার করুন।" }
    : { title: "Your farming dashboard", text: "Review your district and recent agricultural context. Use the shortcuts below to continue to crop planning, weather, market or My Farm." };
  return bn
    ? { title: "আমি বন্ধু, আপনার কৃষি সঙ্গী", text: "ফসলের ক্যালেন্ডার থেকে বাজারদর—যেখানে যেতে চান বলুন। আমি সেই পাতায় নিয়ে গিয়ে কীভাবে ব্যবহার করবেন দেখাব।" }
    : { title: "I’m Bondhu, your farm guide", text: "I can show you around or take you straight to a farm page. Start with a quick tour if you like." };
}

export function MiniGuide() {
  const router = useRouter();
  const pathname = usePathname();
  const { locale } = useLang();
  const { user, isLoading: authLoading } = useAuth();
  const isAuthenticated = Boolean(user);
  const bn = locale === "bn";
  const [open, setOpen] = useState(false);
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
  const characterState = tourMode && tourPaused ? "idle" : flying ? "flying" : isDragging ? "dragging" : tourMode && isTourVoiceSpeaking && !isTourVoicePaused ? "talking" : tourMode || pokeState ? "happy" : hovered ? "listening" : sleeping ? "sleeping" : assistantState;
  const [position, setPosition] = useState(null);
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
      setOpen(true);
      try { window.localStorage.setItem(key, "1"); } catch { /* the greeting is optional */ }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [authLoading, hidden, pathname]);

  useEffect(() => {
    if (!open || tourMode) return undefined;
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
  }, [open, tourMode, pathname, bn, finished]);

  useEffect(() => {
    if (open || tourMode || flying || isDragging || assistantState !== "idle" || hidden || !animationEnabled) return undefined;
    const timer = window.setTimeout(() => setSleeping(true), 45_000);
    return () => window.clearTimeout(timer);
  }, [open, tourMode, flying, isDragging, assistantState, hidden, animationEnabled]);

  const savePreferences = (updates) => {
    saveMascotPreferences(updates);
  };

  const savedPosition = Number.isFinite(preferences.x) && Number.isFinite(preferences.y)
    ? { x: preferences.x, y: preferences.y }
    : null;
  const currentPosition = position || savedPosition;
  const launcherBounds = () => {
    const compact = window.innerWidth <= 760;
    return { width: compact ? 104 : 170, height: compact ? 122 : 182, right: compact ? 8 : 20, bottom: compact ? 76 : 20 };
  };
  const defaultPosition = () => {
    const bounds = launcherBounds();
    return { x: window.innerWidth - bounds.width - bounds.right, y: window.innerHeight - bounds.height - bounds.bottom };
  };

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
        const stickyHeader = document.querySelector("[data-app-header], .kb-app-header, .kb-topbar");
        const headerBottom = stickyHeader && ["sticky", "fixed"].includes(getComputedStyle(stickyHeader).position)
          ? Math.max(0, stickyHeader.getBoundingClientRect().bottom)
          : 0;
        const target = tourMode && targetRect ? {
          left: targetRect.left - 8,
          right: targetRect.left + targetRect.width + 8,
          top: targetRect.top - 8,
          bottom: targetRect.top + targetRect.height + 8,
        } : null;
        const next = placeCompanionBubble({
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          launcher,
          bubble,
          target,
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
    dragRef.current = { pointerId: event.pointerId, offsetX: event.clientX - (currentPosition?.x ?? fallbackPosition.x), offsetY: event.clientY - (currentPosition?.y ?? fallbackPosition.y) };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const drag = (event) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    const fallbackPosition = defaultPosition();
    const bounds = launcherBounds();
    const maxX = Math.max(8, window.innerWidth - bounds.width - 8);
    const maxY = Math.max(8, window.innerHeight - bounds.height - 8);
    const x = Math.max(8, Math.min(maxX, event.clientX - dragRef.current.offsetX));
    const y = Math.max(8, Math.min(maxY, event.clientY - dragRef.current.offsetY));
    if (Math.abs(x - (currentPosition?.x ?? fallbackPosition.x)) + Math.abs(y - (currentPosition?.y ?? fallbackPosition.y)) > 6) draggedRef.current = true;
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
    const base = currentPosition || defaultPosition();
    const maxX = Math.max(8, window.innerWidth - bounds.width - 8);
    const maxY = Math.max(8, window.innerHeight - bounds.height - 8);
    const next = { x: Math.max(8, Math.min(maxX, base.x + offset[0])), y: Math.max(8, Math.min(maxY, base.y + offset[1])) };
    setPosition(next);
    savePreferences(next);
  };

  useEffect(() => {
    const resize = () => {
      const base = position || (Number.isFinite(preferences.x) && Number.isFinite(preferences.y)
        ? { x: preferences.x, y: preferences.y }
        : null);
      if (!base) return;
      const bounds = launcherBounds();
      const next = {
        x: Math.max(8, Math.min(Math.max(8, window.innerWidth - bounds.width - 8), base.x)),
        y: Math.max(8, Math.min(Math.max(8, window.innerHeight - bounds.height - 8), base.y)),
      };
      if (next.x !== base.x || next.y !== base.y) {
        setPosition(next);
        savePreferences(next);
      }
    };
    window.addEventListener("resize", resize, { passive: true });
    return () => window.removeEventListener("resize", resize);
  }, [position, preferences.x, preferences.y]);

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

  const closeGuide = useCallback(() => {
    if (tourMode) cancelTour();
    setOpen(false);
    window.requestAnimationFrame(() => launcherRef.current?.focus({ preventScroll: true }));
  }, [cancelTour, tourMode]);

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

  const launcherStyle = currentPosition ? { left: currentPosition.x, top: currentPosition.y, right: "auto", bottom: "auto" } : undefined;
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
        {tourMode ? <><h2>{bn ? "বন্ধুর সাথে ঘুরে দেখুন" : "Explore with Bondhu"}</h2><p id="bondhu-tour-description" className="kb-mini-tour-description" aria-live="polite">{bn ? tourStep?.bn : tourStep?.en}</p>{tourNotice && <p className="kb-mini-tour-notice" role="status">{tourNotice}</p>}{tourVoiceError && <p className="kb-mini-tour-notice" role="status">{bn ? "কণ্ঠে শোনা যাচ্ছে না। লেখা পড়ে এগিয়ে যান।" : "Voice playback is unavailable. Continue with the captions."}</p>}</> : finished ? <><h2>{bn ? "ঘুরে দেখা শেষ!" : "Tour complete"}</h2><p>{bn ? "যেকোনো সময় আবার ঘুরে দেখতে পারেন।" : "You can replay the tour any time."}</p></> : <><h2>{tip.title}</h2><p>{tip.text}</p></>}
        {tourMode ? <div className="kb-mini-tour-actions"><button type="button" onClick={() => { const previous = findEligibleTourStepIndex(tourIndex - 1, isAuthenticated, BONDHU_TOUR_STEPS, -1); if (previous >= 0) { stopTourVoice(); setTourIndex(previous); savePreferences({ tourProgress: previous }); navigateTo(TOUR_STOPS[previous]); } }} disabled={paused || findEligibleTourStepIndex(tourIndex - 1, isAuthenticated, BONDHU_TOUR_STEPS, -1) < 0} className="kb-mini-quiet" aria-label={bn ? "আগের ধাপ" : "Previous step"}><ArrowLeft size={15}/>{bn ? "আগে" : "Previous"}</button><button type="button" onClick={nextStop} disabled={paused} className="kb-mini-primary">{tourIndex >= BONDHU_TOUR_STEPS.length-1 ? (bn ? "শেষ করুন" : "Finish") : (bn ? "পরের ধাপ" : "Next")}<ArrowRight size={15}/></button><button type="button" onClick={toggleTourPause} className="kb-mini-quiet" aria-label={paused ? (bn ? "আবার চালান" : "Resume tour") : (bn ? "বিরতি" : "Pause tour")}>{paused ? <Play size={15}/> : <Pause size={15}/>}<span className="sr-only">{paused ? (bn ? "চালান" : "Resume") : (bn ? "বিরতি" : "Pause")}</span></button><button type="button" onClick={readTourStep} disabled={muted || !isTourVoiceSupported} className="kb-mini-quiet" aria-label={isTourVoiceSpeaking ? (bn ? "কণ্ঠ থামান" : "Stop speaking") : (bn ? "এই ধাপ শুনুন" : "Listen to this step")}><Headphones size={15}/></button><button type="button" onClick={cancelTour} className="kb-mini-quiet"><SkipForward size={15}/>{bn ? "বাদ" : "Skip"}</button><button type="button" onClick={() => startTour(true)} className="kb-mini-quiet">{bn ? "আবার" : "Replay"}</button></div> : <>
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
      <BondhuMascot active={!hidden && animationEnabled} className="kb-mini-face" state={characterState} facing={facing} label={bn ? "বন্ধু, কৃষকের সহায়ক ড্রাগন" : "Bondhu, a friendly farmer companion"}/>{(hidden || tourMode) && <span>{hidden ? (bn ? "বন্ধুকে দেখান" : "Show Bondhu") : "Bondhu"}</span>}
    </button>
  </div>
  </>;
}
