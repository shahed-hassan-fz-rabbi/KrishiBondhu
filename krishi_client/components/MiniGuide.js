"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, ChevronDown, Compass, Map, MessageCircle, X } from "lucide-react";
import { BondhuMascot } from "@/components/mascot/BondhuMascot.js";
import { saveMascotPreferences, useMascotPreferences } from "@/components/mascot/mascotStore.js";
import { useAuth } from "@/contexts/AuthContext.js";
import { useLang } from "@/lib/i18n/LanguageContext.js";

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

const TOUR_STOPS = ["/crop-calendar", "/crop-rotation", "/my-farm/plan", "/handoff", "/my-farm", "/market", "/climate", "/assistant"];

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
    : { title: "I’m Bondhu, your farm guide", text: "Tell me where you want to go—from crop calendars to market prices. I’ll take you there and explain how to use the page." };
}

export function MiniGuide() {
  const router = useRouter();
  const pathname = usePathname();
  const { locale } = useLang();
  const { user } = useAuth();
  const bn = locale === "bn";
  const [open, setOpen] = useState(false);
  const [tourMode, setTourMode] = useState(false);
  const [tourIndex, setTourIndex] = useState(0);
  const [flying, setFlying] = useState(false);
  const [finished, setFinished] = useState(false);
  const preferences = useMascotPreferences();
  const { animationEnabled, hidden, muted } = preferences;
  const [paused, setPaused] = useState(false);
  const [assistantState, setAssistantState] = useState("idle");
  const [isDragging, setIsDragging] = useState(false);
  const [sleeping, setSleeping] = useState(false);
  const characterState = flying ? "flying" : isDragging ? "dragging" : tourMode ? "happy" : sleeping ? "sleeping" : assistantState;
  const [position, setPosition] = useState(null);
  const dragRef = useRef(null);
  const draggedRef = useRef(false);
  const startTourRef = useRef(null);
  const timerRef = useRef(null);
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
      setFlying(false);
    }, 360);
    }, [router]);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

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

  const startDrag = (event) => {
    if (event.button !== 0) return;
    setSleeping(false);
    setIsDragging(true);
    dragRef.current = { pointerId: event.pointerId, offsetX: event.clientX - (currentPosition?.x ?? window.innerWidth - 160), offsetY: event.clientY - (currentPosition?.y ?? window.innerHeight - 90) };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const drag = (event) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    const maxX = Math.max(8, window.innerWidth - Math.min(365, window.innerWidth - 20));
    const x = Math.max(8, Math.min(maxX, event.clientX - dragRef.current.offsetX));
    const y = Math.max(8, Math.min(window.innerHeight - 80, event.clientY - dragRef.current.offsetY));
    if (Math.abs(x - (currentPosition?.x ?? window.innerWidth - 160)) + Math.abs(y - (currentPosition?.y ?? window.innerHeight - 90)) > 6) draggedRef.current = true;
    setPosition({ x, y });
  };

  const endDrag = () => {
    dragRef.current = null;
    setIsDragging(false);
    if (position) savePreferences(position);
  };

  const moveWithKeyboard = (event) => {
    const offsets = { ArrowUp: [0, -24], ArrowDown: [0, 24], ArrowLeft: [-24, 0], ArrowRight: [24, 0] };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    const base = currentPosition || { x: window.innerWidth - 160, y: window.innerHeight - 90 };
    const maxX = Math.max(8, window.innerWidth - Math.min(365, window.innerWidth - 20));
    const next = { x: Math.max(8, Math.min(maxX, base.x + offset[0])), y: Math.max(8, Math.min(window.innerHeight - 80, base.y + offset[1])) };
    setPosition(next);
    savePreferences(next);
  };

  const startTour = useCallback((restart = false) => {
    const currentIndex = TOUR_STOPS.findIndex((href) => pathname === href || pathname?.startsWith(`${href}/`));
    const nextIndex = !restart && currentIndex >= 0 ? currentIndex : 0;
    setTourIndex(nextIndex);
    setTourMode(true);
    setPaused(false);
    setFinished(false);
    setOpen(true);
    navigateTo(TOUR_STOPS[nextIndex]);
  }, [navigateTo, pathname]);

  useEffect(() => { startTourRef.current = startTour; }, [startTour]);

  const nextStop = () => {
    if (tourIndex >= TOUR_STOPS.length - 1) {
      setTourMode(false);
      setFinished(true);
      return;
    }
    const nextIndex = tourIndex + 1;
    setTourIndex(nextIndex);
    navigateTo(TOUR_STOPS[nextIndex]);
  };

  const cancelTour = () => {
    setTourMode(false);
    setFinished(false);
  };

  const launcherStyle = currentPosition ? { left: currentPosition.x, top: currentPosition.y, right: "auto", bottom: "auto" } : undefined;

  return <div className="kb-mini-guide" style={launcherStyle}>
    {open && <section className="kb-mini-panel" role="dialog" aria-label={bn ? "বন্ধুর কৃষি নির্দেশনা" : "Bondhu’s farm guide"}>
      <header className="kb-mini-panel-head"><span className="kb-mini-avatar" aria-hidden="true"><span className="kb-bondhu-monogram">B</span></span><div><strong>বন্ধু <span>· BONDHU</span></strong><small>{bn ? "আপনার মাঠের সঙ্গী" : "Your field guide"}</small></div><button type="button" aria-label={bn ? "বন্ধ করুন" : "Close"} onClick={()=>setOpen(false)} className="kb-mini-close"><X size={17}/></button></header>
      <div className="kb-mini-panel-body">
        {tourMode && <p className="kb-mini-step">{bn ? `পরিচিতি ${tourIndex+1} / ${TOUR_STOPS.length}` : `TOUR STOP ${tourIndex+1} OF ${TOUR_STOPS.length}`}</p>}
        {finished ? <><h2>{bn ? "ভালো হয়েছে—এখন নিজে ঘুরে দেখুন!" : "You’re ready to explore!"}</h2><p>{bn ? "যেকোনো সময় মিনি খুলে এই পাতার নির্দেশনা বা অন্য জায়গার পথ নিতে পারবেন।" : "Open Mini any time for help on this page or a shortcut to another part of KrishiBondhu."}</p></> : <><h2>{tip.title}</h2><p>{tip.text}</p></>}
        {tourMode ? <div className="kb-mini-tour-actions"><button type="button" onClick={() => { const previous = Math.max(0, tourIndex - 1); setTourIndex(previous); navigateTo(TOUR_STOPS[previous]); }} disabled={tourIndex === 0 || paused} className="kb-mini-quiet">{bn ? "আগের জায়গা" : "Previous"}</button><button type="button" onClick={nextStop} disabled={paused} className="kb-mini-primary">{tourIndex === TOUR_STOPS.length-1 ? (bn ? "পরিচিতি শেষ" : "Finish tour") : (bn ? "পরের জায়গা" : "Next place")}<ArrowRight size={15}/></button><button type="button" onClick={() => setPaused((value) => !value)} className="kb-mini-quiet">{paused ? (bn ? "আবার শুরু" : "Resume") : (bn ? "বিরতি" : "Pause")}</button><button type="button" onClick={startTour} className="kb-mini-quiet">{bn ? "আবার শুরু" : "Restart"}</button><button type="button" onClick={cancelTour} className="kb-mini-quiet">{bn ? "এখন থাক" : "Skip tour"}</button></div> : <button type="button" onClick={startTour} className="kb-mini-primary kb-mini-start">{bn ? "বন্ধুর সাথে ঘুরে দেখুন" : "Take a guided tour with Bondhu"}<Compass size={15}/></button>}
        <details className="kb-mini-places"><summary><Map size={15}/>{bn ? "যেখানে যেতে চান" : "Take me somewhere"}<ChevronDown size={15}/></summary><nav aria-label={bn ? "পাতা বেছে নিন" : "Choose a page"}>{places.map((place)=><button type="button" key={place.href} onClick={()=>{cancelTour();setFinished(false);navigateTo(place.href);}} aria-current={pathname===place.href?"page":undefined}>{place[bn?"bn":"en"]}<ArrowRight size={13}/></button>)}</nav></details>
        <a className="kb-mini-ask" href="/assistant" onClick={(event)=>{event.preventDefault();cancelTour();setFinished(false);navigateTo("/assistant");}}><MessageCircle size={14}/>{bn ? "ফসল নিয়ে প্রশ্ন আছে? সহকারীকে জিজ্ঞেস করুন" : "Have a crop question? Ask the farm assistant"}</a>
        <div className="kb-mini-preferences">
          <button type="button" role="switch" aria-checked={animationEnabled} onClick={() => { setSleeping(false); savePreferences({ animationEnabled: !animationEnabled }); }}>{animationEnabled ? (bn ? "অ্যানিমেশন বন্ধ করুন" : "Turn animation off") : (bn ? "অ্যানিমেশন চালু করুন" : "Turn animation on")}</button>
          <button type="button" role="switch" aria-checked={muted} onClick={() => savePreferences({ muted: !muted })}>{muted ? (bn ? "কণ্ঠ চালু করুন" : "Unmute voice") : (bn ? "কণ্ঠ বন্ধ করুন" : "Mute voice")}</button>
          <button type="button" onClick={() => { setOpen(false); savePreferences({ hidden: true }); }}>{bn ? "বন্ধুকে ছোট করুন" : "Hide Bondhu"}</button>
        </div>
      </div>
    </section>}
    <button type="button" className={`kb-mini-launcher ${flying ? "is-flying" : ""} ${hidden ? "is-hidden" : ""}`} onPointerDown={startDrag} onPointerMove={drag} onPointerUp={endDrag} onPointerCancel={endDrag} onKeyDown={moveWithKeyboard} onClick={(event)=>{if(draggedRef.current){draggedRef.current=false;event.preventDefault();return;}setSleeping(false);setOpen((value)=>!value);if(hidden){savePreferences({hidden:false});}}} aria-expanded={open} aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight" aria-label={bn ? (hidden ? "বন্ধুকে দেখান" : "বন্ধুর কাছে সাহায্য চান") : (hidden ? "Show Bondhu" : "Ask Bondhu for help")}>
      <BondhuMascot active={!hidden && animationEnabled} className="kb-mini-face" state={characterState} label={bn ? "বন্ধু, কৃষকের সহায়ক ড্রাগন" : "Bondhu, a friendly farmer companion"}/><span>{hidden ? (bn ? "বন্ধুকে দেখান" : "Show Bondhu") : (open ? (bn ? "বন্ধ" : "Close") : (bn ? "বন্ধু" : "Bondhu"))}</span>
    </button>
  </div>;
}
