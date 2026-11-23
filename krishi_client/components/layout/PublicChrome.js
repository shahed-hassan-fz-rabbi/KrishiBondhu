"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowRight,
  Bookmark,
  ChevronDown,
  CloudSun,
  Layers,
  Leaf,
  LogOut,
  MapPin,
  Menu,
  MessageSquare,
  MessageSquareText,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Sprout,
  Store,
  TrendingUp,
  UserRound,
  X,
} from "lucide-react";

import { BrandMark } from "@/components/layout/BrandMark.js";
import { NotificationCenter } from "@/components/NotificationCenter.js";
import { LanguageSwitcher, ThemeSwitcher } from "@/components/layout/Switchers.js";
import { Button } from "@/components/ui/Button.js";
import { useLang } from "@/lib/i18n/LanguageContext.js";
import { useAuth } from "@/contexts/AuthContext.js";
import { useLocation } from "@/contexts/LocationContext.js";

const links = [
  { href: "/", key: "common.home" },
  { href: "/crop-rotation", key: "publicHeader.cropRotation" },
  { href: "/market", key: "publicHeader.market" },
  { href: "/climate", key: "publicHeader.climateData" },
  { href: "/#how-it-works", key: "common.howItWorks" },
  { href: "/#about", key: "common.about" },
];

const authLinks = [
  { href: "/login", key: "auth.login" },
];

function subscribeHash(callback) {
  window.addEventListener("hashchange", callback);
  window.addEventListener("popstate", callback);
  return () => {
    window.removeEventListener("hashchange", callback);
    window.removeEventListener("popstate", callback);
  };
}
const getHash = () => window.location.hash;
const getServerHash = () => "";

/** Public navigation with organized dropdown, location chip, and auth actions. */
export function PublicHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const hash = useSyncExternalStore(subscribeHash, getHash, getServerHash);
  const { t, locale } = useLang();
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const { selectedDistrict, districts } = useLocation();

  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);

  const profileRef = useRef(null);
  const servicesRef = useRef(null);

  const currentDistrictObj = districts?.find((d) => d.code === selectedDistrict);
  const districtName = locale === "bn"
    ? currentDistrictObj?.nameBn || "কুমিল্লা"
    : currentDistrictObj?.nameEn || "Cumilla";

  const isActive = (href) => {
    if (href.includes("#")) return pathname === "/" && hash === href.slice(1);
    if (href === "/") return pathname === "/" && !["#how-it-works", "#about", "#services", "#data", "#outlook"].includes(hash);
    if (href === "/climate") return ["/climate", "/rainfall", "/soil-moisture", "/vegetation", "/map", "/crop-calendar"].includes(pathname);
    return pathname === href || pathname?.startsWith(`${href}/`);
  };

  const navClass = (href) =>
    `inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs xl:text-sm font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald ${
      isActive(href)
        ? "bg-[#247A4B]/15 text-[#123D2A] font-bold shadow-xs dark:bg-emerald-950/60 dark:text-emerald-300"
        : "text-muted hover:text-content hover:bg-surface-2"
    }`;

  const handleNavClick = (event, href) => {
    setOpen(false);
    setServicesOpen(false);
    if (pathname === "/" && href.startsWith("/#") && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      window.location.assign(href);
    }
  };

  useEffect(() => {
    const closeOnOutside = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) setProfileOpen(false);
      if (servicesRef.current && !servicesRef.current.contains(event.target)) setServicesOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setProfileOpen(false);
        setServicesOpen(false);
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const handleLogout = async () => {
    setProfileOpen(false);
    setOpen(false);
    await logout();
    router.push("/");
  };

  const displayName = user?.name?.trim() || user?.email || t("publicHeader.account");
  const avatarInitial = displayName.charAt(0).toLocaleUpperCase(locale === "bn" ? "bn-BD" : "en-US");

  const profileItems = [
    { href: "/settings", label: t("publicHeader.myProfile"), Icon: UserRound },
    { href: "/my-farm", label: t("nav.myFarm"), Icon: Sprout },
    { href: "/assistant", label: t("publicHeader.chatHistory"), Icon: MessageSquareText },
    { href: "/saved-advisories", disabled: true, label: t("publicHeader.savedAdvisories"), Icon: Bookmark },
    { href: "/settings", label: t("publicHeader.alertPreferences"), Icon: SlidersHorizontal },
    { href: "/settings", label: t("publicHeader.accountSettings"), Icon: Settings2 },
  ];

  const servicesMenu = [
    {
      href: "/market",
      title: locale === "bn" ? "বাজারদর ও দামের পূর্বাভাস" : "Market Prices & Forecasts",
      desc: locale === "bn" ? "বাজার প্রতিবেদন ও পাইকারি-খুচরা ব্যবধান" : "Market price reports & wholesale margins",
      icon: Store,
      badge: locale === "bn" ? "দাম" : "Prices",
    },
    {
      href: "/crop-rotation",
      title: locale === "bn" ? "ফসল চক্র ও ৭ডি বিশ্লেষণ" : "Crop Rotation & 7D Analysis",
      desc: locale === "bn" ? "পানি ও খরচের সাশ্রয়ী মৌসুমি শস্যবিন্যাস" : "Water and cost-saving seasonal crop sequences",
      icon: Sprout,
      badge: locale === "bn" ? "পরিকল্পনা" : "Plan",
    },
    {
      href: "/climate",
      title: locale === "bn" ? "আবহাওয়া ও মাটির আর্দ্রতা" : "Weather & Soil Moisture",
      desc: locale === "bn" ? "৭ দিনের পূর্বাভাস ও উপগ্রহ মাটির রস" : "7-day forecast & satellite moisture",
      icon: CloudSun,
      badge: locale === "bn" ? "আবহাওয়া" : "Weather",
    },
    {
      href: "/map",
      title: locale === "bn" ? "দেশের কৃষি মানচিত্র" : "National Agricultural Map",
      desc: locale === "bn" ? "জেলা ও উপজেলা ভিত্তিক স্তরভিত্তিক জিআইএস" : "District and upazila GIS mapping",
      icon: MapPin,
      badge: locale === "bn" ? "মানচিত্র" : "GIS",
    },
    {
      href: "/assistant",
      title: locale === "bn" ? "এআই কৃষি সহকারী" : "AI Farm Assistant",
      desc: locale === "bn" ? "বাংলায় সরাসরি মুখে বা লিখে পরামর্শ নিন" : "Natural voice & chat guidance in Bangla",
      icon: MessageSquare,
      badge: locale === "bn" ? "এআই" : "AI",
    },
  ];

  const dashboardLabel = isAuthenticated
    ? t("publicHeader.myDashboard")
    : t("publicHeader.exploreDashboard");

  const renderProfileItems = (onNavigate = () => {}) => (
    <>
      {profileItems.map(({ href, label, Icon, disabled }) =>
        disabled ? (
          <span
            key={label}
            role="menuitem"
            aria-disabled="true"
            title={t("publicHeader.unavailable")}
            className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted/70"
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
            <span className="min-w-0 flex-1">{label}</span>
            <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">{t("publicHeader.soon")}</span>
          </span>
        ) : (
          <Link
            key={label}
            href={href}
            role="menuitem"
            onClick={onNavigate}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-content transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald"
          >
            <Icon className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.8} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        )
      )}
    </>
  );

  return (
    <header className="sticky top-2 z-40 mx-auto w-full min-w-0 max-w-7xl rounded-2xl border border-line/90 bg-surface/95 px-3 py-2 shadow-km-sm backdrop-blur-md transition-shadow duration-200">
      <div className="flex h-14 w-full min-w-0 items-center justify-between gap-1 px-2 sm:gap-3 sm:px-4">
        {/* Left: Brand + Geographic context pill */}
        <div className="flex items-center gap-3">
          <BrandMark tone="light" />

          {/* Regional Context Chip (inspired by reference location breadcrumb) */}
          <div className="hidden items-center gap-1.5 rounded-full border border-line bg-surface-2/80 px-2.5 py-1 text-xs text-muted xl:inline-flex">
            <MapPin className="h-3.5 w-3.5 text-[#247A4B] dark:text-[#56B870]" />
            <span className="font-semibold text-content">{districtName}</span>
            <span className="text-[10px] text-muted">• {locale === "bn" ? "সক্রিয় জেলা" : "Active District"}</span>
          </div>
        </div>

        {/* Center: Desktop Navigation with Services Dropdown */}
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
          <Link
            href="/"
            onClick={(e) => handleNavClick(e, "/")}
            aria-current={isActive("/") ? "page" : undefined}
            className={`kb-nav-link ${navClass("/")}`}
          >
            {t("common.home")}
          </Link>

          {/* Services Dropdown */}
          <div className="relative" ref={servicesRef}>
            <button
              type="button"
              aria-expanded={servicesOpen}
              aria-haspopup="true"
              onClick={() => setServicesOpen((v) => !v)}
              className={`kb-nav-link inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs xl:text-sm font-medium transition-all duration-200 cursor-pointer ${
                servicesOpen || ["/crop-rotation", "/market", "/climate", "/map", "/assistant"].includes(pathname)
                  ? "bg-[#247A4B]/15 text-[#123D2A] font-bold dark:bg-emerald-950/60 dark:text-emerald-300"
                  : "text-muted hover:text-content hover:bg-surface-2"
              }`}
            >
              <span>{locale === "bn" ? "সেবাসমূহ" : "Services"}</span>
              <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${servicesOpen ? "rotate-180" : ""}`} />
            </button>

            {servicesOpen && (
              <div
                role="menu"
                className="absolute left-0 top-full z-50 mt-2.5 w-80 rounded-2xl border border-line bg-surface p-2 shadow-xl animate-in fade-in slide-in-from-top-2 duration-150"
              >
                <div className="px-3 py-2 border-b border-line mb-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#247A4B] dark:text-[#56B870]">
                    {locale === "bn" ? "কৃষিবন্ধুর মূল সেবাসমূহ" : "KrishiBondhu Services"}
                  </p>
                </div>
                {servicesMenu.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    role="menuitem"
                    onClick={() => setServicesOpen(false)}
                    className="flex items-start gap-3 rounded-xl p-2.5 transition-colors hover:bg-surface-2 group"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald/10 text-[#247A4B] group-hover:bg-[#247A4B] group-hover:text-white transition-colors dark:bg-emerald-950/60 dark:text-emerald-300">
                      <item.icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-xs font-bold text-content group-hover:text-[#247A4B] dark:group-hover:text-emerald-300 transition-colors">
                          {item.title}
                        </p>
                        <span className="rounded-full bg-surface-2 px-1.5 py-0.2 text-[9px] font-semibold text-muted">
                          {item.badge}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted line-clamp-1">{item.desc}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <Link
            href="/crop-rotation"
            onClick={(e) => handleNavClick(e, "/crop-rotation")}
            aria-current={isActive("/crop-rotation") ? "page" : undefined}
            className={`kb-nav-link ${navClass("/crop-rotation")}`}
          >
            {t("publicHeader.cropRotation")}
          </Link>

          <Link
            href="/market"
            onClick={(e) => handleNavClick(e, "/market")}
            aria-current={isActive("/market") ? "page" : undefined}
            className={`kb-nav-link ${navClass("/market")}`}
          >
            {t("publicHeader.market")}
          </Link>

          <Link
            href="/climate"
            onClick={(e) => handleNavClick(e, "/climate")}
            aria-current={isActive("/climate") ? "page" : undefined}
            className={`kb-nav-link ${navClass("/climate")}`}
          >
            {t("publicHeader.climateData")}
          </Link>

          <Link
            href="/#how-it-works"
            onClick={(e) => handleNavClick(e, "/#how-it-works")}
            aria-current={isActive("/#how-it-works") ? "location" : undefined}
            className={`kb-nav-link ${navClass("/#how-it-works")}`}
          >
            {t("common.howItWorks")}
          </Link>

          <Link
            href="/#about"
            onClick={(e) => handleNavClick(e, "/#about")}
            aria-current={isActive("/#about") ? "location" : undefined}
            className={`kb-nav-link ${navClass("/#about")}`}
          >
            {t("common.about")}
          </Link>
        </nav>

        {/* Right: Language, Theme, Auth / Profile */}
        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-1.5 sm:flex">
            <LanguageSwitcher />
            <ThemeSwitcher />
          </div>

          <div className="hidden h-5 w-px bg-line/80 mx-0.5 sm:block" />

          {/* User actions */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {isAuthenticated && user ? (
              <>
                <Button href="/dashboard" size="sm" variant="primary" className="h-9 rounded-full px-4 text-xs font-bold shadow-xs">
                  {dashboardLabel}
                </Button>

                {/* Profile dropdown */}
                <div className="relative" ref={profileRef}>
                  <button
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={profileOpen}
                    aria-label={t("publicHeader.profileMenu")}
                    onClick={() => setProfileOpen((v) => !v)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface p-1 pr-2.5 text-xs text-content shadow-xs transition-colors hover:border-emerald/40 hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald cursor-pointer"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#123D2A] text-[11px] font-bold text-white shadow-xs">
                      {avatarInitial}
                    </span>
                    <span className="max-w-20 sm:max-w-24 truncate font-semibold">{displayName}</span>
                    <ChevronDown className={`h-3 w-3 shrink-0 text-muted transition-transform duration-200 ${profileOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                  </button>

                  {profileOpen && (
                    <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-line bg-surface p-2 shadow-xl animate-in fade-in duration-150">
                      <div className="mb-2 border-b border-line px-3 py-2">
                        <p className="truncate text-sm font-semibold text-content">{displayName}</p>
                        {user.email ? <p className="truncate text-xs text-muted">{user.email}</p> : null}
                      </div>
                      {renderProfileItems(() => setProfileOpen(false))}
                      <div className="my-1 border-t border-line" />
                      <button
                        type="button"
                        role="menuitem"
                        onClick={handleLogout}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/5 cursor-pointer"
                      >
                        <LogOut className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                        {t("auth.logout")}
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : !isLoading ? (
              <div className="flex items-center gap-2">
                <Button href="/login" size="sm" variant="primary" className="h-9 rounded-full px-4 text-xs font-bold">
                  {t("auth.login")}
                </Button>
                <Link
                  href="/register"
                  className="hidden rounded-full border border-line px-3.5 py-1.5 text-xs font-semibold text-content transition-colors hover:bg-surface-2 sm:inline-block"
                >
                  {locale === "bn" ? "নিবন্ধন" : "Register"}
                </Link>
              </div>
            ) : null}

            {isAuthenticated && user ? <NotificationCenter /> : null}
          </div>

          {/* Mobile hamburger button */}
          <button
            type="button"
            aria-expanded={open}
            aria-controls="public-mobile-navigation"
            aria-label={open ? (locale === "bn" ? "মেনু বন্ধ করুন" : "Close menu") : (locale === "bn" ? "মেনু খুলুন" : "Open menu")}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-content transition-colors hover:bg-surface-2 lg:hidden cursor-pointer"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {open && (
        <div id="public-mobile-navigation" className="mt-3 border-t border-line bg-surface pt-3 pb-2 px-2 lg:hidden animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="mb-3 flex items-center justify-between rounded-xl bg-surface-2/80 p-2.5 text-xs">
            <span className="flex items-center gap-1.5 font-semibold text-content">
              <MapPin className="h-3.5 w-3.5 text-[#247A4B]" />
              {districtName}
            </span>
            <div className="flex items-center gap-2">
              <LanguageSwitcher />
              <ThemeSwitcher />
            </div>
          </div>

          <nav className="flex flex-col gap-1" aria-label="Mobile">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={(e) => handleNavClick(e, l.href)}
                aria-current={isActive(l.href) ? (l.href.includes("#") ? "location" : "page") : undefined}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                  isActive(l.href)
                    ? "bg-[#247A4B]/15 text-[#123D2A] dark:text-emerald-300"
                    : "text-muted hover:bg-surface-2 hover:text-content"
                }`}
              >
                {t(l.key)}
              </Link>
            ))}

            {/* Quick access to all services in mobile */}
            <div className="my-2 border-t border-line pt-2">
              <p className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-muted">
                {locale === "bn" ? "অন্যান্য সেবা" : "More Services"}
              </p>
              <div className="grid grid-cols-2 gap-1.5 pt-1">
                <Link
                  href="/map"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 rounded-xl bg-surface-2/70 p-2.5 text-xs font-semibold text-content hover:bg-surface-2"
                >
                  <MapPin className="h-4 w-4 text-[#247A4B]" />
                  <span>{locale === "bn" ? "কৃষি মানচিত্র" : "National Map"}</span>
                </Link>
                <Link
                  href="/assistant"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 rounded-xl bg-surface-2/70 p-2.5 text-xs font-semibold text-content hover:bg-surface-2"
                >
                  <MessageSquare className="h-4 w-4 text-[#247A4B]" />
                  <span>{locale === "bn" ? "এআই সহকারী" : "AI Assistant"}</span>
                </Link>
              </div>
            </div>

            {/* Auth actions in mobile */}
            {isAuthenticated && user ? (
              <div className="mt-2 rounded-xl border border-line bg-surface-2 p-3">
                <div className="mb-2 flex items-center gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#123D2A] text-sm font-bold text-white">
                    {avatarInitial}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-content">{displayName}</p>
                    {user.email ? <p className="truncate text-xs text-muted">{user.email}</p> : null}
                  </div>
                </div>
                <div className="grid gap-0.5">{renderProfileItems(() => setOpen(false))}</div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="mt-2 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-danger hover:bg-danger/5"
                >
                  <LogOut className="h-4 w-4" />
                  {t("auth.logout")}
                </button>
              </div>
            ) : !isLoading ? (
              <div className="mt-3 grid grid-cols-2 gap-2 pt-2 border-t border-line">
                <Button href="/login" size="sm" variant="primary" className="w-full text-xs font-bold">
                  {t("auth.login")}
                </Button>
                <Button href="/register" size="sm" variant="outline" className="w-full text-xs font-bold">
                  {locale === "bn" ? "নিবন্ধন" : "Register"}
                </Button>
              </div>
            ) : null}

            {isAuthenticated && user ? (
              <div className="mt-3">
                <Button href="/dashboard" size="sm" className="w-full font-bold">
                  {dashboardLabel}
                </Button>
              </div>
            ) : null}
          </nav>
        </div>
      )}
    </header>
  );
}

/** Professional multi-column footer inspired by reference layout and data honesty. */
export function PublicFooter() {
  const { t, locale } = useLang();

  return (
    <footer className="relative isolate overflow-hidden border-t border-emerald-900/40 bg-gradient-to-b from-[#03261a] via-[#021f15] to-[#01140e] text-sidebar-text">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_left,rgba(52,211,153,0.12),transparent_60%)]" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,rgba(16,185,129,0.08),transparent_50%)]" />

      <div className="relative mx-auto max-w-7xl px-4 pb-20 pt-12 sm:px-6 sm:pb-24 lg:px-8 lg:pt-16">
        {/* Balanced layout: brand block fixed width, columns share remaining space evenly */}
        <div className="grid gap-12 sm:grid-cols-[minmax(0,1fr)_auto] lg:gap-16 items-start">
          {/* Brand + description + transparency note */}
          <div className="flex flex-col items-start space-y-5 max-w-sm shrink-0">
            <BrandMark tone="dark" />

            <p className="text-sm leading-relaxed text-[#c0d2c5]">
              {t("footer.description")}
            </p>

            {/* Grounded-in-data note (no fake newsletter or false numbers) */}
            <div className="flex flex-col gap-1.5 w-full pt-1">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-300/90">
                {locale === "bn" ? "তথ্যের স্বচ্ছতা ও সততা" : "Grounded in Real Data"}
              </p>
              <p className="text-sm leading-relaxed text-[#c0d2c5]">
                {locale === "bn"
                  ? "প্রতিটি তথ্যের উৎস, পর্যবেক্ষণের তারিখ ও সীমাবদ্ধতা সরাসরি প্রদর্শিত হয়।"
                  : "Every figure shows its source, observation date, and methodology limitations."}
              </p>
              <Link
                href="/data-sources"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#c2e994] hover:underline underline-offset-4"
              >
                {locale === "bn" ? "সবগুলো ডেটাসেট দেখুন" : "See the datasets"}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          {/* Link columns */}
          <div className="flex flex-wrap gap-x-12 gap-y-10 sm:gap-x-16">
            {/* Quick / Explore Links */}
            <div className="min-w-[130px]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-300/90 mb-4">
                {t("footer.explore")}
              </h3>
              <ul className="space-y-3">
                {links.map(({ href, key }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="text-sm font-medium text-[#c0d2c5] transition-colors hover:text-[#c2e994] hover:underline underline-offset-4"
                    >
                      {t(key)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Agricultural Services */}
            <div className="min-w-[140px]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-300/90 mb-4">
                {locale === "bn" ? "কৃষি সেবা" : "Farm Services"}
              </h3>
              <ul className="space-y-3 text-sm text-[#c0d2c5]">
                <li>
                  <Link href="/market" className="transition-colors hover:text-[#c2e994] hover:underline underline-offset-4">
                    {locale === "bn" ? "বাজারের তথ্য ও দর" : "Market Prices"}
                  </Link>
                </li>
                <li>
                  <Link href="/crop-rotation" className="transition-colors hover:text-[#c2e994] hover:underline underline-offset-4">
                    {locale === "bn" ? "শস্য পর্যায় ও বিকল্প" : "Crop Rotation"}
                  </Link>
                </li>
                <li>
                  <Link href="/climate" className="transition-colors hover:text-[#c2e994] hover:underline underline-offset-4">
                    {locale === "bn" ? "আবহাওয়া ও মাটির আর্দ্রতা" : "Weather & Soil"}
                  </Link>
                </li>
                <li>
                  <Link href="/map" className="transition-colors hover:text-[#c2e994] hover:underline underline-offset-4">
                    {locale === "bn" ? "দেশের কৃষি মানচিত্র" : "National GIS Map"}
                  </Link>
                </li>
                <li>
                  <Link href="/my-farm" className="transition-colors hover:text-[#c2e994] hover:underline underline-offset-4">
                    {locale === "bn" ? "আমার খামার পরিচর্যা" : "My Farm Planner"}
                  </Link>
                </li>
              </ul>
            </div>

            {/* Data Sources & Verification */}
            <div className="min-w-[150px]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-300/90 mb-4">
                {locale === "bn" ? "তথ্যের উৎস" : "Data sources"}
              </h3>
              <ul className="space-y-3 text-sm text-[#c0d2c5]">
                <li>
                  <Link href="/data-sources" className="transition-colors hover:text-[#c2e994] hover:underline underline-offset-4">
                    DAM market reports
                  </Link>
                </li>
                <li>
                  <span className="text-emerald-100/70">DAE / BAMIS</span>
                </li>
                <li>
                  <span className="text-emerald-100/70">Open-Meteo weather</span>
                </li>
                <li>
                  <span className="text-emerald-100/70">Satellite context · source and dates shown</span>
                </li>
              </ul>
            </div>

            {/* Help & Support */}
            <div className="min-w-[140px]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-300/90 mb-4">
                {locale === "bn" ? "সহায়তা ও পরামর্শ" : "Support"}
              </h3>
              <div className="space-y-3 text-sm text-[#c0d2c5]">
                <p className="text-xs text-emerald-100/70">
                  {locale === "bn" ? "কৃষি কল সেন্টার: ১৬১২৩" : "Krishi Call Centre: 16123"}
                </p>
                <p className="text-xs font-medium text-emerald-200">
                  {locale === "bn" ? "বীজ থেকে বাজারে—আপনার পাশে" : "By your side, from seed to market"}
                </p>
                <div className="pt-1">
                  <Link
                    href="/assistant"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-950/40 px-3 py-1.5 text-xs font-semibold text-[#c2e994] transition-all hover:bg-emerald-900/50"
                  >
                    <span>{locale === "bn" ? "কৃষি সহকারী" : "Ask Assistant"}</span>
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Silhouette landscape */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-[url('/images/footer-landscape.svg')] bg-[length:100%_100%] bg-no-repeat opacity-30 sm:h-20" />
      </div>

      {/* Bottom copyright bar */}
      <div className="border-t border-emerald-900/50 bg-black/35 px-4 py-4 text-xs leading-relaxed text-[#c0d2c5] sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 text-center sm:flex-row sm:text-left">
          <p>{t("footer.copyright")}</p>
          <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] text-[#a4bba9]">
            <Link href="/climate" className="transition-colors hover:text-white">
              {locale === "bn" ? "আবহাওয়া ও মাটি" : "Weather & Soil"}
            </Link>
            <span>•</span>
            <Link href="/crop-rotation" className="transition-colors hover:text-white">
              {locale === "bn" ? "শস্য পর্যায়" : "Crop Rotation"}
            </Link>
            <span>•</span>
            <Link href="/market" className="transition-colors hover:text-white">
              {locale === "bn" ? "কৃষি বাজার" : "Market"}
            </Link>
            <span>•</span>
            <span>{locale === "bn" ? "বীজ থেকে বাজার · কৃষিবন্ধু" : "From Seed to Market · KrishiBondhu"}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
