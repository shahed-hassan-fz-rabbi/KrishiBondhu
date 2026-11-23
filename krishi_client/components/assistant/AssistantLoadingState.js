import { LoaderCircle, MessageCircle } from "lucide-react";

export function AssistantLoadingState({ label }) {
  return (
    <section
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="mx-auto flex min-h-[min(28rem,calc(100dvh-15rem))] w-full max-w-5xl items-center justify-center rounded-3xl border border-line bg-surface px-6 py-10 text-content shadow-sm sm:px-10"
    >
      <div className="flex max-w-md flex-col items-center text-center">
        <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200">
          <MessageCircle className="h-7 w-7" aria-hidden="true" />
        </span>
        <LoaderCircle className="mb-3 h-5 w-5 animate-spin text-emerald" aria-hidden="true" />
        <span className="text-sm font-medium text-content">{label}</span>
      </div>
    </section>
  );
}
