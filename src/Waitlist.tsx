import { useState } from "react";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { supabase } from "./supabase";

/* The public call to action while the service is not open.

   Every anonymous visitor who used to press "Start free audit" signed in and
   spent real OpenAI credit on a brand we will never hear about again. This
   collects the address instead, and the people who are already signed in keep
   the audit button — so the owner and any invited pilot are unaffected.

   The row is written with the publishable key, which ships in the bundle, so
   the table's RLS must allow INSERT and nothing else. There is deliberately no
   read-back after the insert: a .select() here would need a SELECT policy, and
   that policy would hand the whole list to anyone who opened the console. */

type Lang = "en" | "ru";

const T = {
  en: {
    cta: "Add me to the waiting list",
    placeholder: "you@company.com",
    join: "Join",
    done: "You're on the list.",
    doneSub: "We'll write when your invite is ready. No newsletter.",
    already: "You're already on the list.",
    invalid: "That doesn't look like an email address.",
    failed: "Could not save that. Try again in a moment.",
    privacy: "We store your email to send one invite. Nothing else.",
    privacyLink: "Privacy",
    privacyHref: "/legal/privacy",
  },
  ru: {
    cta: "Записаться в лист ожидания",
    placeholder: "you@company.com",
    join: "Записаться",
    done: "Вы в списке.",
    doneSub: "Напишем, когда откроем доступ. Рассылки не будет.",
    already: "Вы уже в списке.",
    invalid: "Это не похоже на адрес почты.",
    failed: "Не удалось сохранить. Попробуйте ещё раз.",
    privacy: "Храним адрес, чтобы один раз прислать приглашение. Больше ничего.",
    privacyLink: "Приватность",
    privacyHref: "/ru/legal/privacy",
  },
} as const;

/* Deliberately loose. A strict pattern rejects real addresses (new TLDs,
   plus-addressing, unicode domains) and the only thing being prevented here is
   an obvious typo — the address is verified by the invite arriving or not. */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function WaitlistForm({ lang, source, className = "", id }:
  { lang: Lang; source: string; className?: string; id?: string }) {
  const t = T[lang];
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "done" | "already">("idle");
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!LOOKS_LIKE_EMAIL.test(value)) { setError(t.invalid); return; }
    setError("");
    setState("saving");

    const { error: err } = await supabase.from("waitlist").insert({
      email: value,
      // Which page and language the person came from. Worth knowing before
      // deciding which market to open first.
      source,
      locale: lang,
    });

    if (!err) { setState("done"); return; }
    // 23505 is the unique index on the address. Signing up twice is not an
    // error the person should be shown as one.
    if (err.code === "23505") { setState("already"); return; }
    console.error("waitlist insert failed", err);
    setError(t.failed);
    setState("idle");
  };

  if (state === "done" || state === "already") {
    return (
      <div id={id} className={`flex items-start gap-2 ${className}`}>
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-900">
          <Check className="h-3 w-3 text-white" />
        </span>
        <div>
          <p className="text-sm font-medium">{state === "already" ? t.already : t.done}</p>
          <p className="mt-0.5 text-xs text-neutral-400">{t.doneSub}</p>
        </div>
      </div>
    );
  }

  return (
    <div id={id} className={className}>
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (error) setError(""); }}
          placeholder={t.placeholder}
          aria-label={t.cta}
          className="h-12 w-full rounded-lg border border-neutral-200 px-4 text-sm outline-none focus:border-neutral-900 sm:w-72"
        />
        <button
          type="submit"
          disabled={state === "saving"}
          className="flex h-12 items-center justify-center gap-2 rounded-lg bg-neutral-900 px-6 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {state === "saving"
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <>{t.join} <ArrowRight className="h-4 w-4" /></>}
        </button>
      </form>
      {error
        ? <p className="mt-2 text-xs text-red-600">{error}</p>
        : <p className="mt-3 text-xs text-neutral-400">
            {t.privacy} <a href={t.privacyHref} className="underline hover:text-neutral-600">{t.privacyLink}</a>
          </p>}
    </div>
  );
}
