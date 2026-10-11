import { useEffect, useState } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { supabase } from "./supabase";
import { saveAuditRun } from "./saveAudit";
import type { AuditData } from "./Dashboard";

const API_URL = "https://web-production-b2168.up.railway.app";

/* A project is a brand. Everything already hangs off the brand — audits,
   tracked prompts — so introducing a separate entity would add a concept
   without adding a capability. */

type AuditRow = {
  id: string | number;
  brand: string;
  created_at: string;
  visibility_score: number | null;
  total_prompts: number | null;
  country: string | null;
  language: string | null;
  brand_size: string | null;
  payload: AuditData | null;
};

type Project = { brand: string; runs: AuditRow[] };

type Strings = {
  title: string; sub: string; back: string;
  empty: string; loading: string;
  runs: (n: number) => string;
  lastRun: string; score: string; prompts: string;
  open: string; rerun: string; rerunning: string;
  noPayload: string; failed: string;
  samePrompts: (n: number) => string;
};

const STR: Record<"en" | "ru", Strings> = {
  en: {
    title: "Your projects", sub: "One project per brand. Opening a past audit costs nothing — nothing is measured again until you ask.",
    back: "Back", empty: "No audits yet. Run one and it will appear here.",
    loading: "Loading…", runs: (n) => `${n} audit${n === 1 ? "" : "s"}`,
    lastRun: "Last run", score: "Visibility", prompts: "prompts",
    open: "Open", rerun: "Run again", rerunning: "Measuring…",
    noPayload: "Saved before results were kept — this one cannot be reopened.",
    failed: "Could not run it. Try again.",
    samePrompts: (n) => `Runs the same ${n} prompt${n === 1 ? "" : "s"} as last time, so the two are comparable.`,
  },
  ru: {
    title: "Ваши проекты", sub: "Проект — это бренд. Открыть прошлый аудит бесплатно: ничего не меряется заново, пока вы не попросите.",
    back: "Назад", empty: "Аудитов пока нет. Прогоните один — он появится здесь.",
    loading: "Загружаем…", runs: (n) => `${n} ${n === 1 ? "аудит" : n < 5 ? "аудита" : "аудитов"}`,
    lastRun: "Последний прогон", score: "Видимость", prompts: "промптов",
    open: "Открыть", rerun: "Прогнать заново", rerunning: "Измеряем…",
    noPayload: "Сохранён до того, как мы начали хранить результаты — этот открыть нельзя.",
    failed: "Не удалось прогнать. Попробуйте ещё раз.",
    samePrompts: (n) => `Прогонит те же ${n} ${n === 1 ? "промпт" : n < 5 ? "промпта" : "промптов"}, что и в прошлый раз — чтобы результаты можно было сравнить.`,
  },
};

export function Projects({ lang = "en", onBack, onOpen }: {
  lang?: "en" | "ru";
  onBack: () => void;
  onOpen: (data: AuditData, auditId: string | number | null) => void;
}) {
  const t = STR[lang];
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [promptCounts, setPromptCounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { if (!cancelled) setProjects([]); return; }
        const { data: rows } = await supabase
          .from("audits")
          .select("id, brand, created_at, visibility_score, total_prompts, country, language, brand_size, payload")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(200);

        const byBrand = new Map<string, AuditRow[]>();
        for (const r of (rows || []) as AuditRow[]) {
          const key = (r.brand || "").trim();
          if (!key) continue;
          if (!byBrand.has(key)) byBrand.set(key, []);
          byBrand.get(key)!.push(r);
        }
        if (!cancelled) setProjects(Array.from(byBrand, ([brand, runs]) => ({ brand, runs })));

        /* How many prompts the latest run of each brand used. This is what a
           re-run repeats: a freshly generated set would measure different
           questions and the two numbers could not be compared. */
        const latest = Array.from(byBrand.values()).map((runs) => runs[0]?.id).filter(Boolean);
        if (latest.length) {
          const { data: prompts } = await supabase
            .from("audit_prompts")
            .select("audit_id, prompt")
            .in("audit_id", latest as (string | number)[]);
          const counts: Record<string, number> = {};
          const seen: Record<string, Set<string>> = {};
          for (const row of (prompts || []) as { audit_id: string | number; prompt: string }[]) {
            const k = String(row.audit_id);
            (seen[k] ||= new Set()).add(row.prompt);
          }
          for (const k of Object.keys(seen)) counts[k] = seen[k].size;
          if (!cancelled) setPromptCounts(counts);
        }
      } catch {
        if (!cancelled) setProjects([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(lang === "ru" ? "ru-RU" : "en-GB",
      { day: "numeric", month: "short", year: "numeric" });

  const rerun = async (project: Project) => {
    const last = project.runs[0];
    setBusy(project.brand);
    setError("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("not signed in");

      // The same questions as last time, in the same order they were stored.
      const { data: rows } = await supabase
        .from("audit_prompts")
        .select("prompt")
        .eq("audit_id", last.id)
        .order("id", { ascending: true });
      const prompts = Array.from(new Set(
        ((rows || []) as { prompt: string }[]).map((r) => r.prompt)));
      if (prompts.length === 0) { setError(t.noPayload); return; }

      const rivals = (last.payload?.competitor_ranking || [])
        .filter((c) => !c.is_your_brand)
        .map((c) => ({ name: c.name, website: c.domain ? `https://${c.domain}` : "" }));

      const res = await fetch(`${API_URL}/audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand: project.brand,
          competitor_list: rivals,
          website: last.payload?.brand_domain ? `https://${last.payload.brand_domain}` : "",
          country: last.country || "US",
          language: last.language || "",
          brand_size: last.brand_size || "",
          models: last.payload?.models_run || [],
          custom_prompts: prompts,
        }),
      });
      const fresh = await res.json();
      if (!res.ok || !Array.isArray(fresh?.results)) { setError(fresh?.detail || t.failed); return; }

      const id = await saveAuditRun({
        userId: user.id, brand: project.brand,
        country: last.country || "US", language: last.language || "",
        brandSize: last.brand_size || "", data: fresh,
      });
      onOpen(fresh, id);
    } catch {
      setError(t.failed);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <header className="sticky top-0 z-40 border-b border-neutral-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <button onClick={onBack} className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900">
            <ArrowLeft className="h-4 w-4" /> {t.back}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-2xl font-bold">{t.title}</h1>
        <p className="mt-1 text-sm text-neutral-500">{t.sub}</p>
        {error && <p className="mt-4 rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {projects === null ? (
          <p className="mt-8 text-sm text-neutral-400">{t.loading}</p>
        ) : projects.length === 0 ? (
          <p className="mt-8 rounded-xl border border-dashed border-neutral-200 p-6 text-center text-sm text-neutral-400">{t.empty}</p>
        ) : (
          <div className="mt-8 space-y-4">
            {projects.map((p) => {
              const last = p.runs[0];
              const count = promptCounts[String(last.id)] || 0;
              return (
                <div key={p.brand} className="rounded-2xl border border-neutral-150 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-base font-semibold">{p.brand}</p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {t.runs(p.runs.length)} · {t.lastRun} {fmt(last.created_at)}
                        {last.total_prompts ? ` · ${last.total_prompts} ${t.prompts}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-xs uppercase tracking-widest text-neutral-400">{t.score}</p>
                        <p className="text-2xl font-bold tabular-nums">{last.visibility_score ?? "—"}%</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {last.payload ? (
                      <button onClick={() => onOpen(last.payload as AuditData, last.id)}
                        className="rounded-lg bg-neutral-900 px-4 py-2 text-xs font-medium text-white hover:bg-neutral-800">
                        {t.open}
                      </button>
                    ) : (
                      <span className="text-xs text-neutral-400">{t.noPayload}</span>
                    )}
                    {count > 0 && (
                      <button onClick={() => rerun(p)} disabled={busy === p.brand}
                        className="rounded-lg border border-neutral-200 px-4 py-2 text-xs font-medium text-neutral-600 hover:border-neutral-900 hover:text-neutral-900 disabled:opacity-50">
                        {busy === p.brand ? t.rerunning : t.rerun}
                      </button>
                    )}
                  </div>
                  {count > 0 && <p className="mt-2 text-xs text-neutral-400">{t.samePrompts(count)}</p>}

                  {p.runs.length > 1 && (
                    <div className="mt-4 divide-y divide-neutral-100 border-t border-neutral-100 pt-2">
                      {p.runs.slice(1).map((r) => (
                        <button key={String(r.id)}
                          onClick={() => r.payload && onOpen(r.payload, r.id)}
                          disabled={!r.payload}
                          className="flex w-full items-center justify-between py-2 text-left text-xs text-neutral-500 hover:text-neutral-900 disabled:opacity-50">
                          <span>{fmt(r.created_at)}{r.total_prompts ? ` · ${r.total_prompts} ${t.prompts}` : ""}</span>
                          <span className="flex items-center gap-1 tabular-nums">
                            {r.visibility_score ?? "—"}% {r.payload && <ChevronRight className="h-3 w-3" />}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
