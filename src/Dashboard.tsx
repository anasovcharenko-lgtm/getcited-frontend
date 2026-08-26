import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronRight, Lock } from "lucide-react";
import { supabase } from "./supabase";

/* ────────────────────────────────────────────────────────────────
   Types — match the current backend response shape (api.py).
   Perplexity / Claude / AI Overview / search-volume / accuracy-check
   are not returned by the API yet — the UI below degrades gracefully
   until those exist (see TODO markers).
   ──────────────────────────────────────────────────────────────── */

export type ModelMentionInfo = {
  mentioned: boolean;
  mentioned_with_link: boolean;
  mentioned_without_link: boolean;
  competitors_found: string[];
  competitors_with_link: string[];
  competitors_without_link: string[];
};

export type AuditResult = {
  prompt: string;
  gemini: ModelMentionInfo;
  chatgpt: ModelMentionInfo;
};

export type CompetitorStat = {
  name: string;
  is_your_brand: boolean;
  gemini_mentions: number;
  chatgpt_mentions: number;
  total_mentions: number;
  mention_rate: number;
  mentions_with_link: number;
  mentions_without_link: number;
  rank: number;
};

export type Citation = {
  url: string;
  domain: string;
  gemini_count: number;
  chatgpt_count: number;
  total: number;
  prompt: string;
};

export type AuditData = {
  brand: string;
  category: string;
  brand_domain?: string;
  visibility_score: number;
  gemini_score: number;
  chatgpt_score: number;
  total_prompts: number;
  mentions_score: number;
  citations_score: number;
  results: AuditResult[];
  competitor_ranking: CompetitorStat[];
  citations: Citation[];
  sample_quote?: string;
  recommendations: string;
};

type ModelKey = "all" | "chatgpt" | "gemini" | "perplexity" | "claude" | "ai_overview";
type Lang = "en" | "ru";
type View = "overview" | "recommendations" | "uncovered" | "covered";

/* ────────────────────────────────────────────────────────────────
   Copy
   ──────────────────────────────────────────────────────────────── */

interface Strings {
  back: string;
  lastRun: string;
  aiVisibilityScore: string;
  vsCompetitorsAvg: (n: number) => string;
  totalMentions: string;
  mentionsSub: string;
  totalCitations: string;
  citationsSub: string;
  proOnly: string;
  proTooltip: string;
  comparedTo: string;
  seeUncovered: string;
  you: string;
  howToFix: string;
  landscapeTitle: string;
  landscapeSub: string;
  landscapeXAxis: string;
  landscapeYAxis: string;
  bestCoveredTitle: string;
  bestCoveredEmpty: string;
  seeCompetitorsDoBetter: string;
  seeResultsWithPrompts: string;
  distributionTitle: string;
  modelPerformance: string;
  history: string;
  historyChange: string;
  historyNotEnough: string;
  historyNotEnoughSub: string;
  whatAiSays: string;
  whatAiSaysEmpty: string;
  seeHowAccurate: string;
  citationsTable: string;
  viewAllCitations: (n: number) => string;
  showLess: string;
  colPrompt: string;
  colSV: string;
  colModel: string;
  colPage: string;
  svPending: string;
  mentionedPrompts: string;
  viewRecommendations: string;
  recommendationsTitle: string;
  recommendationsSub: string;
  backToDashboard: string;
  catMentions: string;
  catMentionsDesc: string;
  catTechnical: string;
  catTechnicalDesc: string;
  catContent: string;
  catContentDesc: string;
  catAuthority: string;
  catAuthorityDesc: string;
  catKeywords: string;
  catKeywordsDesc: string;
  noRecsYet: string;
  high: string;
  medium: string;
  low: string;
  uncoveredTitle: string;
  uncoveredSub: (n: number) => string;
  uncoveredEmpty: string;
  mentionedBy: (names: string) => string;
  withLink: string;
  withoutLink: string;
  covered: string;
  notCovered: string;
}

const STR: Record<Lang, Strings> = {
  en: {
    back: "← Back",
    lastRun: "Last run: today",
    aiVisibilityScore: "AI visibility score",
    vsCompetitorsAvg: (n) => `vs competitors avg ${n}%`,
    totalMentions: "Total mentions",
    mentionsSub: "with link to your site",
    totalCitations: "Total citations",
    citationsSub: "named, no link · click to see",
    proOnly: "Pro",
    proTooltip: "Available on paid plans",
    comparedTo: "Where you stand vs competitors",
    seeUncovered: "See uncovered prompts",
    you: "you",
    howToFix: "How to fix this →",
    landscapeTitle: "Competitive landscape",
    landscapeSub: "Mentions vs citations · bubble size = total appearances",
    landscapeXAxis: "Mentions (with link)",
    landscapeYAxis: "Citations (no link)",
    bestCoveredTitle: "Your best covered topics",
    bestCoveredEmpty: "No strongly covered topics yet.",
    seeCompetitorsDoBetter: "See where competitors do better →",
    seeResultsWithPrompts: "See results with prompts",
    distributionTitle: "Distribution by LLM",
    modelPerformance: "Which model performs better",
    history: "Visibility history",
    historyChange: "vs previous audit",
    historyNotEnough: "Not enough data yet",
    historyNotEnoughSub: "Run a few more audits for this brand and the trend will appear here.",
    whatAiSays: "What AI says about your brand",
    whatAiSaysEmpty: "No direct quote captured yet — run another audit to try again.",
    seeHowAccurate: "See how accurate this is →",
    citationsTable: "Citations — AI responses that name you without a link",
    viewAllCitations: (n) => `View all ${n} →`,
    showLess: "Show less",
    colPrompt: "Prompt",
    colSV: "Demand",
    colModel: "Model",
    colPage: "Page cited",
    svPending: "—",
    mentionedPrompts: "Prompts where you're mentioned",
    viewRecommendations: "View actionable recommendations",
    recommendationsTitle: "Actionable recommendations",
    recommendationsSub: "Prioritised fixes to close the gap with your competitors",
    backToDashboard: "← Back to dashboard",
    catMentions: "Mentions — off-page",
    catMentionsDesc: "Close the gaps where AI models rely on outside sources to know about you.",
    catTechnical: "Technical",
    catTechnicalDesc: "Fixes AI crawlers and search engines need to read your site correctly.",
    catContent: "Content improving",
    catContentDesc: "Sharpen existing pages so AI models quote you more often.",
    catAuthority: "Building topical authority",
    catAuthorityDesc: "Create new content or pages for opportunities you're not covering.",
    catKeywords: "Keywords to add",
    catKeywordsDesc: "Terms and phrases to work into your site so AI models associate you with them.",
    noRecsYet: "No recommendations for this category yet.",
    high: "High priority",
    medium: "Medium priority",
    low: "Low priority",
    uncoveredTitle: "Prompts you don't cover",
    uncoveredSub: (n) => `${n} prompts where competitors show up and you don't`,
    uncoveredEmpty: "You're covered on every prompt we checked — nice work.",
    mentionedBy: (names) => `Mentioned: ${names}`,
    withLink: "with link",
    withoutLink: "no link",
    covered: "Covered",
    notCovered: "Not covered",
  },
  ru: {
    back: "← Назад",
    lastRun: "Последний запуск: сегодня",
    aiVisibilityScore: "AI visibility score",
    vsCompetitorsAvg: (n) => `в среднем у конкурентов ${n}%`,
    totalMentions: "Всего упоминаний",
    mentionsSub: "со ссылкой на ваш сайт",
    totalCitations: "Всего цитирований",
    citationsSub: "названы, без ссылки · нажмите, чтобы увидеть",
    proOnly: "Pro",
    proTooltip: "Доступно на платных тарифах",
    comparedTo: "Как вы выглядите на фоне конкурентов",
    seeUncovered: "Смотреть непокрытые промпты",
    you: "вы",
    howToFix: "Как это исправить →",
    landscapeTitle: "Конкурентный ландшафт",
    landscapeSub: "Упоминания и цитирования · размер пузыря = всего появлений",
    landscapeXAxis: "Упоминания (со ссылкой)",
    landscapeYAxis: "Цитирования (без ссылки)",
    bestCoveredTitle: "Лучше всего покрытые темы",
    bestCoveredEmpty: "Пока нет уверенно покрытых тем.",
    seeCompetitorsDoBetter: "Смотреть, где конкуренты лучше →",
    seeResultsWithPrompts: "Смотреть промпты",
    distributionTitle: "Распределение по моделям",
    modelPerformance: "Какая модель работает лучше",
    history: "История видимости",
    historyChange: "к прошлому аудиту",
    historyNotEnough: "Пока недостаточно данных",
    historyNotEnoughSub: "Запустите ещё несколько аудитов этого бренда — и здесь появится динамика.",
    whatAiSays: "Что AI говорит о вашем бренде",
    whatAiSaysEmpty: "Пока не удалось выделить цитату — попробуйте запустить аудит ещё раз.",
    seeHowAccurate: "Проверить точность →",
    citationsTable: "Цитирования — ответы AI, где вас называют без ссылки",
    viewAllCitations: (n) => `Показать все ${n} →`,
    showLess: "Свернуть",
    colPrompt: "Промпт",
    colSV: "Спрос",
    colModel: "Модель",
    colPage: "Цитируемая страница",
    svPending: "—",
    mentionedPrompts: "Промпты, где вас упоминают",
    viewRecommendations: "Смотреть рекомендации",
    recommendationsTitle: "Рекомендации к действию",
    recommendationsSub: "Приоритетные шаги, чтобы догнать конкурентов",
    backToDashboard: "← Назад к дашборду",
    catMentions: "Упоминания — вне сайта",
    catMentionsDesc: "Закройте пробелы там, где AI полагается на внешние источники, чтобы узнать о вас.",
    catTechnical: "Техническое",
    catTechnicalDesc: "Правки, которые нужны AI-краулерам и поисковикам, чтобы правильно читать сайт.",
    catContent: "Улучшение контента",
    catContentDesc: "Доработайте существующие страницы, чтобы AI чаще их цитировал.",
    catAuthority: "Тематический авторитет",
    catAuthorityDesc: "Создайте новый контент или страницы под темы, которые вы пока не закрываете.",
    catKeywords: "Ключевые слова",
    catKeywordsDesc: "Термины и формулировки, которые стоит добавить на сайт, чтобы AI ассоциировал их с вами.",
    noRecsYet: "Пока нет рекомендаций в этой категории.",
    high: "Высокий приоритет",
    medium: "Средний приоритет",
    low: "Низкий приоритет",
    uncoveredTitle: "Промпты, которые вы не покрываете",
    uncoveredSub: (n) => `${n} промптов, где конкуренты есть, а вас нет`,
    uncoveredEmpty: "Вы покрыты по всем проверенным промптам — отличная работа.",
    mentionedBy: (names) => `Упомянуты: ${names}`,
    withLink: "со ссылкой",
    withoutLink: "без ссылки",
    covered: "Покрыто",
    notCovered: "Не покрыто",
  },
} as const;

const MODEL_TABS: { key: ModelKey; label: string; available: boolean }[] = [
  { key: "all", label: "All models", available: true },
  { key: "chatgpt", label: "ChatGPT", available: true },
  { key: "gemini", label: "Gemini", available: true },
  { key: "perplexity", label: "Perplexity", available: false },
  { key: "claude", label: "Claude", available: false },
  { key: "ai_overview", label: "AI Overview", available: false },
];

function categorize(text: string): "mentions" | "technical" | "content" | "authority" | "keywords" {
  const t = text.toLowerCase();
  if (/keyword/.test(t)) return "keywords";
  if (/schema|robots\.txt|sitemap|llms\.txt|crawl|meta tag|structured data|page speed|indexing|technical/.test(t)) return "technical";
  if (/topical authority|pillar page|comprehensive guide|content cluster|topic cluster/.test(t)) return "authority";
  if (/backlink|press|directory|review site|reddit|forum|off-page|listing|wikipedia|third-party/.test(t)) return "mentions";
  return "content";
}

/* ────────────────────────────────────────────────────────────────
   Small building blocks
   ──────────────────────────────────────────────────────────────── */

function ModelSwitcher({ tab, setTab, t }: { tab: ModelKey; setTab: (m: ModelKey) => void; t: Strings }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl border border-neutral-150 bg-neutral-50/60 p-1">
      {MODEL_TABS.map((m) => {
        const active = tab === m.key;
        if (!m.available) {
          return (
            <button key={m.key} type="button" title={t.proTooltip} disabled className="flex cursor-not-allowed items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-300">
              {m.label}
              <Lock className="h-3 w-3" />
            </button>
          );
        }
        return (
          <button key={m.key} type="button" onClick={() => setTab(m.key)} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${active ? "bg-neutral-900 text-white" : "text-neutral-500 hover:text-neutral-900"}`}>
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

type HistoryPoint = { created_at: string; visibility_score: number };

function useVisibilityHistory(brand: string) {
  const [points, setPoints] = useState<HistoryPoint[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { if (!cancelled) setPoints([]); return; }
        const { data, error } = await supabase
          .from("audits")
          .select("created_at, visibility_score")
          .eq("user_id", user.id)
          .eq("brand", brand)
          .not("visibility_score", "is", null)
          .order("created_at", { ascending: true })
          .limit(30);
        if (error) throw error;
        if (!cancelled) setPoints((data as HistoryPoint[]) ?? []);
      } catch {
        if (!cancelled) setPoints([]);
      }
    })();
    return () => { cancelled = true; };
  }, [brand]);
  return points;
}

function statLabel(name: string, isYou: boolean, youLabel: string) {
  return isYou ? `${name} (${youLabel})` : name;
}

/* ────────────────────────────────────────────────────────────────
   Dashboard
   ──────────────────────────────────────────────────────────────── */

export function Dashboard({ data, onBack, lang = "en", brandName = "GetCited" }: { data: AuditData; onBack: () => void; lang?: Lang; brandName?: string }) {
  const t = STR[lang];
  const [view, setView] = useState<View>("overview");
  const [tab, setTab] = useState<ModelKey>("all");
  const [showAllCitations, setShowAllCitations] = useState(false);
  const citationsRef = useRef<HTMLDivElement>(null);
  const history = useVisibilityHistory(data.brand);

  const modelsForTab = (r: AuditResult) => (tab === "gemini" ? [r.gemini] : tab === "chatgpt" ? [r.chatgpt] : [r.gemini, r.chatgpt]);

  /* ---- metrics for the selected model tab ---- */
  const metrics = useMemo(() => {
    let mentionsWithLink = 0;
    let citationsNoLink = 0;
    let scorePct = data.visibility_score;

    if (tab === "gemini") {
      mentionsWithLink = data.results.filter((r) => r.gemini.mentioned_with_link).length;
      citationsNoLink = data.results.filter((r) => r.gemini.mentioned_without_link).length;
      scorePct = data.total_prompts ? Math.round((data.gemini_score / data.total_prompts) * 100) : 0;
    } else if (tab === "chatgpt") {
      mentionsWithLink = data.results.filter((r) => r.chatgpt.mentioned_with_link).length;
      citationsNoLink = data.results.filter((r) => r.chatgpt.mentioned_without_link).length;
      scorePct = data.total_prompts ? Math.round((data.chatgpt_score / data.total_prompts) * 100) : 0;
    } else {
      mentionsWithLink = data.mentions_score;
      citationsNoLink = data.citations_score;
      scorePct = data.visibility_score;
    }

    const others = data.competitor_ranking.filter((c) => !c.is_your_brand);
    const competitorAvg = others.length ? Math.round(others.reduce((s, c) => s + c.mention_rate, 0) / others.length) : 0;
    const topCompetitorsByMentions = [...others].sort((a, b) => b.mentions_with_link - a.mentions_with_link).slice(0, 2);
    const topCompetitorsByCitations = [...others].sort((a, b) => b.mentions_without_link - a.mentions_without_link).slice(0, 2);

    return { mentionsWithLink, citationsNoLink, scorePct, competitorAvg, topCompetitorsByMentions, topCompetitorsByCitations };
  }, [tab, data]);

  /* ---- uncovered / best-covered prompts ---- */
  const uncoveredPrompts = useMemo(() => {
    return data.results
      .map((r) => {
        const ms = modelsForTab(r);
        const youMentioned = ms.some((m) => m.mentioned);
        const competitors = Array.from(new Set(ms.flatMap((m) => m.competitors_found)));
        return { prompt: r.prompt, competitors, youMentioned };
      })
      .filter((r) => !r.youMentioned && r.competitors.length > 0);
  }, [tab, data.results]);

  const bestCoveredPrompts = useMemo(() => {
    return data.results
      .map((r) => {
        const ms = modelsForTab(r);
        const youMentioned = ms.some((m) => m.mentioned);
        const competitors = Array.from(new Set(ms.flatMap((m) => m.competitors_found)));
        return { prompt: r.prompt, youMentioned, competitorCount: competitors.length };
      })
      .filter((r) => r.youMentioned)
      .sort((a, b) => a.competitorCount - b.competitorCount);
  }, [tab, data.results]);

  const visibleCitations = showAllCitations ? data.citations : data.citations.slice(0, 10);

  /* ---- recommendations, categorised ---- */
  const recCategories = useMemo(() => {
    const items = data.recommendations.split("\n\n").filter(Boolean);
    const buckets: Record<string, { text: string; priority: string }[]> = { mentions: [], technical: [], content: [], authority: [], keywords: [] };
    for (const raw of items) {
      const priority = raw.includes("High") ? t.high : raw.includes("Medium") ? t.medium : t.low;
      const text = raw.replace(/PRIORITY:.*\n/, "").trim();
      buckets[categorize(raw)].push({ text, priority });
    }
    return buckets;
  }, [data.recommendations, t]);

  /* ---- bubble chart geometry (Mentions x, Citations y) ---- */
  const bubbleData = useMemo(() => {
    const all = data.competitor_ranking;
    const maxX = Math.max(...all.map((c) => c.mentions_with_link), 1);
    const maxY = Math.max(...all.map((c) => c.mentions_without_link), 1);
    const maxTotal = Math.max(...all.map((c) => c.total_mentions), 1);
    const plotW = 390, plotH = 200, left = 50, top = 20;
    return all.map((c) => ({
      ...c,
      cx: left + (c.mentions_with_link / maxX) * plotW,
      cy: top + plotH - (c.mentions_without_link / maxY) * plotH,
      r: 10 + (c.total_mentions / maxTotal) * 32,
    }));
  }, [data.competitor_ranking]);

  /* ---- history chart geometry ---- */
  const historyGeom = useMemo(() => {
    if (!history || history.length < 2) return null;
    const w = 400, h = 90;
    const values = history.map((p) => p.visibility_score);
    const max = Math.max(...values, 100);
    const min = Math.min(...values, 0);
    const range = Math.max(max - min, 1);
    const step = w / (history.length - 1);
    const points = history.map((p, i) => {
      const x = i * step;
      const y = h - ((p.visibility_score - min) / range) * h;
      return `${x},${y}`;
    }).join(" ");
    const delta = values[values.length - 1] - values[values.length - 2];
    return { points, delta, dates: history.map((p) => new Date(p.created_at)) };
  }, [history]);

  /* ────────────────────────────────────────────────────────────
     Recommendations view
     ──────────────────────────────────────────────────────────── */
  if (view === "recommendations") {
    const cats: { key: keyof typeof recCategories; label: string; desc: string }[] = [
      { key: "mentions", label: t.catMentions, desc: t.catMentionsDesc },
      { key: "technical", label: t.catTechnical, desc: t.catTechnicalDesc },
      { key: "content", label: t.catContent, desc: t.catContentDesc },
      { key: "authority", label: t.catAuthority, desc: t.catAuthorityDesc },
      { key: "keywords", label: t.catKeywords, desc: t.catKeywordsDesc },
    ];
    return (
      <div className="min-h-screen bg-white text-neutral-900">
        <header className="sticky top-0 z-40 border-b border-neutral-100 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <button onClick={() => setView("overview")} className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900">
              <ArrowLeft className="h-4 w-4" /> {t.backToDashboard}
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-6 py-10">
          <h1 className="text-2xl font-bold">{t.recommendationsTitle}</h1>
          <p className="mt-1 text-sm text-neutral-500">{t.recommendationsSub}</p>
          <div className="mt-8 space-y-8">
            {cats.map((c) => (
              <div key={c.key}>
                <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">{c.label}</p>
                <p className="mt-1 text-sm text-neutral-500">{c.desc}</p>
                <div className="mt-3 space-y-3">
                  {recCategories[c.key].length === 0 && <p className="rounded-xl border border-dashed border-neutral-200 p-4 text-sm text-neutral-400">{t.noRecsYet}</p>}
                  {recCategories[c.key].map((rec, i) => {
                    const dot = rec.priority === t.high ? "bg-red-500" : rec.priority === t.medium ? "bg-amber-500" : "bg-green-500";
                    return (
                      <div key={i} className="rounded-xl border border-neutral-100 bg-white p-4">
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${dot}`} />
                          <span className="text-xs font-medium text-neutral-500">{rec.priority}</span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-800">{rec.text}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    );
  }

  /* ────────────────────────────────────────────────────────────
     Uncovered / covered prompts drill-down view
     ──────────────────────────────────────────────────────────── */
  if (view === "uncovered" || view === "covered") {
    const isUncovered = view === "uncovered";
    return (
      <div className="min-h-screen bg-white text-neutral-900">
        <header className="sticky top-0 z-40 border-b border-neutral-100 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <button onClick={() => setView("overview")} className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900">
              <ArrowLeft className="h-4 w-4" /> {t.backToDashboard}
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-6 py-10">
          <h1 className="text-xl font-semibold">{isUncovered ? t.uncoveredTitle : t.bestCoveredTitle}</h1>
          <p className="mt-1 text-sm text-neutral-500">{isUncovered ? t.uncoveredSub(uncoveredPrompts.length) : ""}</p>

          {(isUncovered ? uncoveredPrompts.length : bestCoveredPrompts.length) === 0 ? (
            <p className="mt-6 rounded-xl border border-dashed border-neutral-200 p-6 text-center text-sm text-neutral-400">
              {isUncovered ? t.uncoveredEmpty : t.bestCoveredEmpty}
            </p>
          ) : (
            <div className="mt-6 divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-150">
              {isUncovered
                ? uncoveredPrompts.map((p, i) => (
                    <div key={i} className="flex items-center justify-between gap-4 bg-neutral-50/50 p-4">
                      <div>
                        <p className="text-sm">{p.prompt}</p>
                        <p className="mt-1 text-xs text-neutral-400">{t.mentionedBy(p.competitors.join(", "))}</p>
                      </div>
                      <span className="whitespace-nowrap rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-600">{t.notCovered}</span>
                    </div>
                  ))
                : bestCoveredPrompts.map((p, i) => (
                    <div key={i} className="flex items-center justify-between gap-4 bg-neutral-50/50 p-4">
                      <p className="text-sm">{p.prompt}</p>
                      <span className="whitespace-nowrap rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-600">{t.covered}</span>
                    </div>
                  ))}
            </div>
          )}

          {isUncovered && (
            <button onClick={() => setView("recommendations")} className="mt-6 text-sm text-neutral-500 hover:text-neutral-900">{t.howToFix}</button>
          )}
        </main>
      </div>
    );
  }

  /* ────────────────────────────────────────────────────────────
     Overview
     ──────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <header className="sticky top-0 z-40 border-b border-neutral-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <button onClick={onBack} className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-900 text-white"><span className="text-sm font-bold">G</span></div>
            <span className="text-lg font-semibold">{brandName}</span>
          </button>
          <button onClick={onBack} className="text-sm text-neutral-400 hover:text-neutral-900">{t.back}</button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{data.brand}</h1>
            <p className="text-xs text-neutral-400">{t.lastRun}{data.category ? ` · ${data.category}` : ""}</p>
          </div>
          <ModelSwitcher tab={tab} setTab={setTab} t={t} />
        </div>

        {/* 3 metric cards */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-neutral-150 bg-neutral-50/50 p-6">
            <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">{t.aiVisibilityScore}</p>
            <div className="mt-2 text-5xl font-bold tracking-tight">{metrics.scorePct}%</div>
            <p className="mt-1 text-xs text-neutral-400">{t.vsCompetitorsAvg(metrics.competitorAvg)}</p>
          </div>

          <div className="rounded-2xl border border-neutral-150 bg-neutral-50/50 p-6">
            <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">{t.totalMentions}</p>
            <div className="mt-2 text-5xl font-bold tracking-tight">{metrics.mentionsWithLink}</div>
            <p className="mt-1 text-xs text-neutral-400">{t.mentionsSub}</p>
            {metrics.topCompetitorsByMentions.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {metrics.topCompetitorsByMentions.map((c) => (
                  <span key={c.name} className="rounded-full border border-neutral-200 px-2.5 py-1 text-[11px] text-neutral-500">
                    {c.name} <b className="font-medium text-neutral-900">{c.mentions_with_link}</b>
                  </span>
                ))}
              </div>
            )}
          </div>

          <button type="button" onClick={() => { setShowAllCitations(true); citationsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }} className="rounded-2xl border border-neutral-150 bg-neutral-50/50 p-6 text-left transition-colors hover:bg-neutral-100/60">
            <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">{t.totalCitations}</p>
            <div className="mt-2 text-5xl font-bold tracking-tight">{metrics.citationsNoLink}</div>
            <p className="mt-1 text-xs text-neutral-400">{t.citationsSub}</p>
            {metrics.topCompetitorsByCitations.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {metrics.topCompetitorsByCitations.map((c) => (
                  <span key={c.name} className="rounded-full border border-neutral-200 px-2.5 py-1 text-[11px] text-neutral-500">
                    {c.name} <b className="font-medium text-neutral-900">{c.mentions_without_link}</b>
                  </span>
                ))}
              </div>
            )}
          </button>
        </div>

        {/* Where you stand vs competitors */}
        <div className="mb-6 rounded-2xl border border-neutral-150 bg-neutral-50/50 p-6">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">{t.comparedTo}</p>
            <button onClick={() => setView("uncovered")} className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900">
              {t.seeUncovered} <ChevronRight className="h-3 w-3" />
            </button>
          </div>
          <div className="space-y-2">
            {data.competitor_ranking.slice(0, 5).map((stat) => {
              const max = Math.max(...data.competitor_ranking.map((s) => s.mention_rate), 1);
              return (
                <div key={stat.name} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 truncate text-xs font-medium">
                    {stat.name}
                    {stat.is_your_brand && <span className="ml-1 rounded-full bg-neutral-900 px-1.5 py-0.5 text-[10px] text-white">{t.you}</span>}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
                    <div className={`h-full rounded-full ${stat.is_your_brand ? "bg-neutral-900" : "bg-neutral-300"}`} style={{ width: `${(stat.mention_rate / max) * 100}%` }} />
                  </div>
                  <span className="w-10 shrink-0 text-right text-xs font-semibold">{stat.mention_rate}%</span>
                </div>
              );
            })}
          </div>
          <button onClick={() => setView("recommendations")} className="mt-3 block w-full text-right text-xs text-neutral-400 hover:text-neutral-900">{t.howToFix}</button>
        </div>

        {/* Competitive landscape bubble chart */}
        {bubbleData.length > 1 && (
          <div className="mb-6 rounded-2xl border border-neutral-150 bg-neutral-50/50 p-6">
            <p className="text-sm font-medium">{t.landscapeTitle}</p>
            <p className="mt-0.5 text-xs text-neutral-400">{t.landscapeSub}</p>
            <svg viewBox="0 0 460 260" width="100%" height="240" className="mt-2">
              <line x1="50" y1="20" x2="50" y2="220" stroke="#e5e5e5" strokeWidth={1} />
              <line x1="50" y1="220" x2="440" y2="220" stroke="#e5e5e5" strokeWidth={1} />
              <text x="16" y="120" fontSize="11" fill="#a3a3a3" transform="rotate(-90 16 120)" textAnchor="middle">{t.landscapeYAxis}</text>
              <text x="245" y="248" fontSize="11" fill="#a3a3a3" textAnchor="middle">{t.landscapeXAxis}</text>
              {bubbleData.map((b) => (
                <g key={b.name}>
                  <circle cx={b.cx} cy={b.cy} r={b.r} fill={b.is_your_brand ? "#171717" : "#a3a3a3"} opacity={b.is_your_brand ? 0.9 : 0.35} />
                  <text x={b.cx} y={b.cy - b.r - 6} fontSize="11" fontWeight={500} textAnchor="middle" fill="#171717">
                    {statLabel(b.name, b.is_your_brand, t.you)}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        )}

        {/* Best covered topics */}
        <div className="mb-6 rounded-2xl border border-neutral-150 bg-neutral-50/50 p-6">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">{t.bestCoveredTitle}</p>
            {bestCoveredPrompts.length > 0 && (
              <button onClick={() => setView("covered")} className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900">
                {t.seeResultsWithPrompts} <ChevronRight className="h-3 w-3" />
              </button>
            )}
          </div>
          {bestCoveredPrompts.length === 0 ? (
            <div>
              <p className="text-sm text-neutral-400">{t.bestCoveredEmpty}</p>
              <button onClick={() => setView("uncovered")} className="mt-2 text-xs text-neutral-500 hover:text-neutral-900">{t.seeCompetitorsDoBetter}</button>
            </div>
          ) : (
            <div className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-100">
              {bestCoveredPrompts.slice(0, 3).map((p, i) => (
                <div key={i} className="flex items-center justify-between bg-white px-4 py-2.5">
                  <span className="text-xs">{p.prompt}</span>
                  <span className="text-[11px] text-neutral-400">{p.competitorCount === 0 ? "—" : `+${p.competitorCount}`}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Distribution by LLM */}
        <div className="mb-6 rounded-2xl border border-neutral-150 bg-neutral-50/50 p-6">
          <p className="mb-3 text-sm font-medium">{t.distributionTitle}</p>
          <div className="space-y-3">
            {[
              { label: "ChatGPT", pct: data.total_prompts ? Math.round((data.chatgpt_score / data.total_prompts) * 100) : 0, locked: false },
              { label: "Gemini", pct: data.total_prompts ? Math.round((data.gemini_score / data.total_prompts) * 100) : 0, locked: false },
              { label: "Perplexity", pct: 0, locked: true },
              { label: "Claude", pct: 0, locked: true },
            ].map((m) => (
              <div key={m.label} className="flex items-center gap-3">
                <span className="flex w-24 shrink-0 items-center gap-1 text-xs font-medium text-neutral-700">
                  {m.label}{m.locked && <Lock className="h-3 w-3 text-neutral-300" />}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
                  {!m.locked && <div className="h-full rounded-full bg-neutral-900" style={{ width: `${m.pct}%` }} />}
                </div>
                <span className="w-10 shrink-0 text-right text-xs font-semibold text-neutral-500">{m.locked ? t.proOnly : `${m.pct}%`}</span>
              </div>
            ))}
          </div>
        </div>

        {/* History */}
        <div className="mb-6 rounded-2xl border border-neutral-150 bg-neutral-50/50 p-6">
          <div className="flex items-baseline justify-between">
            <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">{t.history}</p>
            {historyGeom && (
              <span className={`text-xs ${historyGeom.delta >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                {historyGeom.delta >= 0 ? "+" : ""}{historyGeom.delta}% {t.historyChange}
              </span>
            )}
          </div>
          {historyGeom ? (
            <>
              <svg viewBox="0 0 400 90" width="100%" height="90" preserveAspectRatio="none" className="mt-3">
                <polyline points={historyGeom.points} fill="none" stroke="#171717" strokeWidth={2.5} />
              </svg>
              <div className="mt-1 flex justify-between text-[10px] text-neutral-400">
                <span>{historyGeom.dates[0].toLocaleDateString()}</span>
                <span>{historyGeom.dates[historyGeom.dates.length - 1].toLocaleDateString()}</span>
              </div>
            </>
          ) : (
            <div className="mt-4">
              <p className="text-sm font-medium text-neutral-500">{t.historyNotEnough}</p>
              <p className="mt-1 text-xs text-neutral-400">{t.historyNotEnoughSub}</p>
            </div>
          )}
        </div>

        {/* What AI says */}
        <div className="mb-6 rounded-2xl border border-neutral-150 bg-neutral-50/50 p-6">
          <p className="text-sm font-medium">{t.whatAiSays}</p>
          {data.sample_quote ? (
            <>
              <p className="mt-3 text-sm italic text-neutral-600">"{data.sample_quote}"</p>
              <button onClick={() => setView("covered")} className="mt-3 text-xs text-neutral-500 hover:text-neutral-900">{t.seeHowAccurate}</button>
            </>
          ) : (
            <p className="mt-3 text-sm text-neutral-400">{t.whatAiSaysEmpty}</p>
          )}
        </div>

        {/* Citations table */}
        {data.citations && data.citations.length > 0 && (
          <div ref={citationsRef} className="mb-6 rounded-2xl border border-neutral-150 bg-neutral-50/50 p-6">
            <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">{t.citationsTable}</p>
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100">
                  <th className="pb-2 text-left text-xs text-neutral-400">{t.colPrompt}</th>
                  <th className="pb-2 text-center text-xs text-neutral-400">{t.colSV}</th>
                  <th className="pb-2 text-center text-xs text-neutral-400">{t.colModel}</th>
                  <th className="pb-2 text-right text-xs text-neutral-400">{t.colPage}</th>
                </tr>
              </thead>
              <tbody>
                {visibleCitations.map((c, i) => (
                  <tr key={i} className="border-b border-neutral-50">
                    <td className="max-w-[260px] truncate py-2 pr-4 text-xs text-neutral-700">{c.prompt || "—"}</td>
                    <td className="py-2 text-center text-xs text-neutral-400">{t.svPending}</td>
                    <td className="py-2 text-center">
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-600">{c.gemini_count >= c.chatgpt_count ? "Gemini" : "ChatGPT"}</span>
                    </td>
                    <td className="py-2 text-right">
                      <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-xs text-neutral-700 hover:text-neutral-900 hover:underline">{c.domain}</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.citations.length > 10 && (
              <button onClick={() => setShowAllCitations(!showAllCitations)} className="mt-3 text-xs text-neutral-500 hover:text-neutral-900">
                {showAllCitations ? t.showLess : t.viewAllCitations(data.citations.length)}
              </button>
            )}
          </div>
        )}

        {/* Recommendations entry point */}
        <button onClick={() => setView("recommendations")} className="flex w-full items-center justify-between rounded-2xl border border-neutral-150 bg-neutral-900 p-6 text-left text-white transition-colors hover:bg-neutral-800">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">{t.recommendationsTitle}</p>
            <p className="mt-1 text-sm text-neutral-300">{t.recommendationsSub}</p>
          </div>
          <ArrowLeft className="h-5 w-5 rotate-180" />
        </button>

      </main>
    </div>
  );
}

// keep this export tree-shakeable-safe; ChevronDown reserved for future expand affordances
void ChevronDown;
