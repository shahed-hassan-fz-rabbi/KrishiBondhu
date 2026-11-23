"use client";
import { useSyncExternalStore } from "react";
import { Check, MessageCircle, ShieldCheck } from "lucide-react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext.js";
import { useLang } from "@/lib/i18n/LanguageContext.js";
import { isPrivatePath } from "@/lib/access.js";
import { Button } from "@/components/ui/Button.js";
import { AssistantLoadingState } from "@/components/assistant/AssistantLoadingState.js";

const subscribe = () => () => {};

export function PrivateAccess({ children }) {
  const pathname = usePathname();
  const { user, isLoading } = useAuth();
  const { t } = useLang();
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const isAssistant = pathname === "/assistant";
  if (!hydrated || (isPrivatePath(pathname) && isLoading)) {
    return isAssistant
      ? <AssistantLoadingState label={t("common.loading")} />
      : <p role="status" className="p-8 text-muted">{t("common.loading")}</p>;
  }
  if (!isPrivatePath(pathname)) return children;
  if (user) return children;
  const assistantFeatures = t("access.assistantFeatures");
  if (isAssistant) {
    return (
      <div className="mx-auto grid w-full max-w-5xl gap-4 xl:grid-cols-[minmax(0,1.12fr)_minmax(18rem,0.88fr)] xl:items-stretch">
        <section className="relative overflow-hidden rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-surface to-lime-50 p-5 shadow-sm dark:border-emerald-900 dark:from-emerald-950/35 dark:via-surface dark:to-lime-950/20 sm:p-9">
          <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full border border-emerald-200/60 dark:border-emerald-800/60" aria-hidden="true" />
          <div className="relative">
            <div className="mb-4 flex items-center gap-3 sm:mb-6">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800 dark:bg-emerald-900/70 dark:text-emerald-200">
                <MessageCircle className="h-6 w-6" aria-hidden="true" />
              </span>
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800 dark:text-emerald-300">
                {t("assistant.title")}
              </span>
            </div>
            <h1 className="max-w-xl text-3xl font-semibold leading-tight tracking-tight text-content sm:text-4xl">
              {t("access.assistantTitle")}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted sm:mt-4 sm:text-base sm:leading-7">
              {t("access.assistantBody")}
            </p>
            <ul className="mt-4 grid gap-1.5 sm:mt-7 sm:grid-cols-2 sm:gap-3" aria-label={t("assistant.title")}>
              {Array.isArray(assistantFeatures) && assistantFeatures.map((feature) => (
                <li key={feature} className="flex items-start gap-2 rounded-xl px-1 py-1 text-xs leading-5 text-content sm:gap-2.5 sm:rounded-2xl sm:border sm:border-emerald-200/80 sm:bg-white/70 sm:p-3 sm:text-sm sm:leading-6 dark:sm:border-emerald-900 dark:sm:bg-surface/60">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-emerald" aria-hidden="true" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <p className="mt-5 hidden text-xs leading-5 text-muted sm:block xl:hidden">{t("access.assistantPrivacyBody")}</p>
            <div className="mt-5 grid grid-cols-2 gap-2 sm:mt-8 sm:flex sm:flex-wrap sm:gap-3">
              <Button href={`/login?redirect=${encodeURIComponent(pathname)}`} size="lg" className="min-h-12 w-full">
                {t("access.assistantLogin")}
              </Button>
              <Button href={`/register?redirect=${encodeURIComponent(pathname)}`} variant="outline" size="lg" className="min-h-12 w-full">
                {t("auth.register")}
              </Button>
              <Button href="/crop-rotation" variant="ghost" size="lg" className="col-span-2 hidden min-h-11 w-full sm:inline-flex sm:col-span-1 sm:w-auto">
                {t("access.demo")}
              </Button>
            </div>
          </div>
        </section>

        <aside className="hidden flex-col justify-between gap-6 rounded-3xl border border-line bg-surface p-6 shadow-sm xl:flex xl:p-8">
          <div>
            <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-forest/10 text-forest dark:bg-emerald-950/60 dark:text-emerald-300">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 className="text-lg font-semibold text-content">{t("access.assistantPrivacyTitle")}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{t("access.assistantPrivacyBody")}</p>
          </div>
          <div className="rounded-2xl border border-line bg-surface-2/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{t("assistant.sourcePanelTitle")}</p>
            <p className="mt-2 text-sm leading-6 text-content">{t("assistant.sourcePanelDescription")}</p>
            <p className="mt-3 border-t border-line pt-3 text-xs leading-5 text-muted">{t("assistant.caveatLimits")}</p>
          </div>
        </aside>
      </div>
    );
  }
  return <section className="mx-auto max-w-xl rounded-3xl border border-line bg-surface p-6 sm:p-10">
    <h1 className="text-2xl font-semibold text-content">{t("access.title")}</h1>
    <p className="my-4 leading-relaxed text-muted">{t("access.body")}</p>
    <div className="flex flex-wrap gap-3">
      <Button href={`/login?redirect=${encodeURIComponent(pathname)}`}>{t("auth.login")}</Button>
      <Button href="/crop-rotation" variant="outline">{t("access.demo")}</Button>
    </div>
  </section>;
}
