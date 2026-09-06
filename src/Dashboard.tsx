import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronRight, Lock } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
  answer?: string;
  cited_domains?: string[];
};

export type AuditResult = {
  prompt: string;
  prompt_type?: "problem" | "comparison" | "brand";
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

export type SourceCheck = {
  url: string;
  domain: string;
  status: "absent" | "present" | "unreadable";
  reason: string;
  competitors_on_page: string[];
  found_in?: "post" | "comment" | "";
};

export type AuditData = {
  brand: string;
  category: string;
  brand_domain?: string;
  run_at?: string;
  models_used?: Record<string, string>;
  model_status?: Record<string, { ok: boolean; enabled?: boolean; error?: string | null }>;
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
type View = "overview" | "recommendations" | "uncovered" | "covered" | "competitors";

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
  modelFailed: (names: string) => string;
  sourcesTitle: string;
  sourcesSummary: (n: number) => string;
  sourcesChecked: (n: number, present: number) => string;
  sourcesRun: string;
  sourcesRunning: string;
  sourcesFailed: string;
  andMore: (n: number) => string;
  inPost: string;
  inComment: string;
  ofTotal: (a: number, b: number) => string;
  wholeBarAvailable: string;
  competitorsTitle: string;
  competitorsSub: (n: number) => string;
  colPrompt2: string;
  colVolume: string;
  colAnswer: string;
  colMentions: string;
  noVolume: string;
  showMore: string;
  selectedCount: (n: number) => string;
  trackHint: string;
  trackButton: string;
  trackSaving: string;
  trackSaved: string;
  trackFailed: string;
  lockedRow: string;
  seeAiResponse: string;
  hideAiResponse: string;
  citedDomains: string;
  noAnswerCaptured: string;
  youAppear: string;
  youDontAppear: string;
  runProvenance: (model: string, date: string) => string;
  responseHeading: string;
}

const STR: Record<Lang, Strings> = {
  en: {
    back: "Back",
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
    backToDashboard: "Back to dashboard",
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
    modelFailed: (names: string) => `${names} didn't respond during this audit — the numbers below are incomplete.`,
    sourcesTitle: "Where AI looks for answers",
    sourcesSummary: (n) => `${n} source${n === 1 ? "" : "s"} shaped these answers.`,
    sourcesChecked: (n, present) =>
      present === 0
        ? `Checked all ${n}. None of them mention you.`
        : `Checked all ${n}. ${present} mention${present === 1 ? "s" : ""} you.`,
    sourcesRun: "Check which of them mention you →",
    sourcesRunning: "Opening pages…",
    sourcesFailed: "Could not reach the checker. Try again in a moment.",
    andMore: (n) => `+${n} more`,
    inPost: "in the post",
    inComment: "in a comment",
    ofTotal: (a, b) => `${a} of ${b}`,
    wholeBarAvailable: "the whole bar is available",
    competitorsTitle: "Prompts your competitors answer",
    competitorsSub: (n) => `${n} prompt${n === 1 ? "" : "s"} where they appear and you don't.`,
    colPrompt2: "Prompt",
    colVolume: "Volume",
    colAnswer: "Answer",
    colMentions: "Mentions",
    noVolume: "—",
    showMore: "more",
    selectedCount: (n) => `${n} prompt${n === 1 ? "" : "s"} selected`,
    trackHint: "We'll track these and tell you when you start appearing",
    trackButton: "Get these queries too →",
    trackSaving: "Saving…",
    trackSaved: "Tracked. We'll check these on your next audit.",
    trackFailed: "Could not save. Try again.",
    lockedRow: "Paid plans",
    seeAiResponse: "See what AI answered",
    hideAiResponse: "Hide answer",
    citedDomains: "Cited",
    noAnswerCaptured: "This model didn't return an answer for this prompt.",
    youAppear: "You appear",
    youDontAppear: "You don't appear",
    runProvenance: (model, date) => `${model} API · ${date}`,
    responseHeading: "Model response",
  },
  ru: {
    back: "Назад",
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
    backToDashboard: "Назад к дашборду",
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
    modelFailed: (names: string) => `${names} не ответил(а) во время аудита — цифры ниже неполные.`,
    sourcesTitle: "Откуда AI берёт ответы",
    sourcesSummary: (n) => `${n} источник(ов) сформировали эти ответы.`,
    sourcesChecked: (n, present) =>
      present === 0
        ? `Проверили все ${n}. Ни один вас не упоминает.`
        : `Проверили все ${n}. Вас упоминают: ${present}.`,
    sourcesRun: "Проверить, кто из них вас упоминает →",
    sourcesRunning: "Открываем страницы…",
    sourcesFailed: "Не удалось связаться с проверкой. Попробуйте ещё раз.",
    andMore: (n) => `+ещё ${n}`,
    inPost: "в посте",
    inComment: "в комментарии",
    ofTotal: (a, b) => `${a} из ${b}`,
    wholeBarAvailable: "вся полоса свободна",
    competitorsTitle: "Промпты, на которые отвечают конкуренты",
    competitorsSub: (n) => `${n} промптов, где есть они и нет вас.`,
    colPrompt2: "Промпт",
    colVolume: "Частотность",
    colAnswer: "Ответ",
    colMentions: "Упоминают",
    noVolume: "—",
    showMore: "ещё",
    selectedCount: (n) => `Выбрано промптов: ${n}`,
    trackHint: "Будем следить за ними и сообщим, когда вы начнёте появляться",
    trackButton: "Хочу быть в этих запросах →",
    trackSaving: "Сохраняем…",
    trackSaved: "Отслеживаем. Проверим при следующем аудите.",
    trackFailed: "Не удалось сохранить. Попробуйте ещё раз.",
    lockedRow: "Платные тарифы",
    seeAiResponse: "Смотреть ответ AI",
    hideAiResponse: "Свернуть ответ",
    citedDomains: "Ссылки",
    noAnswerCaptured: "Эта модель не вернула ответ на этот промпт.",
    youAppear: "Вы есть в ответе",
    youDontAppear: "Вас нет в ответе",
    runProvenance: (model, date) => `${model} API · ${date}`,
    responseHeading: "Ответ модели",
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

/* AI answers come back as markdown — headings, bold, and comparison tables.
   Rendering them raw showed literal ** and pipe characters, so we render
   properly but keep the type small to fit inside an expanded row. */
function AnswerMarkdown({ text }: { text: string }) {
  return (
    <div className="text-xs leading-relaxed text-neutral-700">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <p className="mb-1 mt-3 text-sm font-semibold text-neutral-900">{children}</p>,
          h2: ({ children }) => <p className="mb-1 mt-3 text-sm font-semibold text-neutral-900">{children}</p>,
          h3: ({ children }) => <p className="mb-1 mt-2 text-xs font-semibold text-neutral-900">{children}</p>,
          p: ({ children }) => <p className="mb-2">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-neutral-900">{children}</strong>,
          ul: ({ children }) => <ul className="mb-2 list-disc space-y-0.5 pl-4">{children}</ul>,
          ol: ({ children }) => <ol className="mb-2 list-decimal space-y-0.5 pl-4">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-neutral-900 underline underline-offset-2">{children}</a>
          ),
          code: ({ children }) => <code className="rounded bg-neutral-100 px-1 py-0.5 text-[11px]">{children}</code>,
          table: ({ children }) => (
            <div className="mb-2 overflow-x-auto">
              <table className="w-full border-collapse text-[11px]">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="border-b border-neutral-200">{children}</thead>,
          th: ({ children }) => <th className="px-2 py-1.5 text-left align-top font-medium text-neutral-900">{children}</th>,
          td: ({ children }) => <td className="border-b border-neutral-100 px-2 py-1.5 align-top">{children}</td>,
          hr: () => <hr className="my-2 border-neutral-100" />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}


const API_URL = "https://web-production-b2168.up.railway.app";


/* Which pages the models cited, and whether the brand is actually on them.

   Runs on demand rather than as part of the audit: opening 10-20 pages takes
   10-30 seconds, and nobody should wait that long before seeing their score. */

/* Screen 2: the prompts competitors answer and the brand does not.

   Selecting prompts writes them to Supabase. That list is what the next audit
   compares against - it is the reason to come back rather than just re-read a
   report. */
function CompetitorPrompts({ data, t, onBack }: { data: AuditData; t: Strings; onBack: () => void }) {
  const rows = useMemo(() => {
    return data.results
      .map((r) => {
        const models = [r.chatgpt, r.gemini];
        const youHere = models.some((m) => m.mentioned);
        const rivals = Array.from(new Set(models.flatMap((m) => m.competitors_found || [])));
        const answer = r.chatgpt.answer || r.gemini.answer || "";
        return { prompt: r.prompt, rivals, answer, youHere };
      })
      .filter((r) => !r.youHere && r.rivals.length > 0);
  }, [data.results]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState(false);

  const toggle = (p: string) => {
    setSaved(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    setFailed(false);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("not signed in");
      const rowsToSave = Array.from(selected).map((prompt) => ({
        user_id: user.id,
        brand: data.brand,
        prompt,
      }));
      // Re-selecting a prompt already tracked should not error.
      const { error } = await supabase
        .from("tracked_prompts")
        .upsert(rowsToSave, { onConflict: "user_id,brand,prompt" });
      if (error) throw error;
      setSaved(true);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <header className="sticky top-0 z-40 border-b border-neutral-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <button onClick={onBack} className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900">
            <ArrowLeft className="h-4 w-4" /> {t.backToDashboard}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10 pb-28">
        <h1 className="text-xl font-semibold">{t.competitorsTitle}</h1>
        <p className="mt-1 text-sm text-neutral-500">{t.competitorsSub(rows.length)}</p>

        {rows.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-neutral-200 p-6 text-center text-sm text-neutral-400">
            {t.uncoveredEmpty}
          </p>
        ) : (
          <div className="mt-6 overflow-hidden rounded-2xl border border-neutral-150">
            <div className="grid grid-cols-[26px_1.4fr_0.6fr_2fr_0.9fr] gap-2 bg-neutral-50 px-4 py-2.5 text-[10px] uppercase tracking-wide text-neutral-400">
              <span />
              <span>{t.colPrompt2}</span>
              <span>{t.colVolume}</span>
              <span>{t.colAnswer}</span>
              <span>{t.colMentions}</span>
            </div>
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-[26px_1.4fr_0.6fr_2fr_0.9fr] items-start gap-2 border-t border-neutral-100 px-4 py-3">
                <input
                  type="checkbox"
                  checked={selected.has(r.prompt)}
                  onChange={() => toggle(r.prompt)}
                  className="mt-0.5"
                />
                <span className="pr-2 text-xs">{r.prompt}</span>
                {/* No search-volume source yet. An honest dash beats a number we made up. */}
                <span className="text-xs text-neutral-300">{t.noVolume}</span>
                <span className="pr-2 text-[11px] leading-relaxed text-neutral-500">
                  {r.answer ? r.answer.slice(0, 150) + (r.answer.length > 150 ? "…" : "") : "—"}
                </span>
                <span className="text-[11px] leading-relaxed text-neutral-500">
                  {r.rivals.join(", ")}
                </span>
              </div>
            ))}
          </div>
        )}
      </main>

      {selected.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 border-t border-neutral-150 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
            <div>
              <p className="text-sm font-medium">{t.selectedCount(selected.size)}</p>
              <p className="mt-0.5 text-xs text-neutral-400">
                {saved ? t.trackSaved : failed ? t.trackFailed : t.trackHint}
              </p>
            </div>
            <button
              onClick={save}
              disabled={saving || saved}
              className="whitespace-nowrap rounded-lg bg-neutral-900 px-4 py-2.5 text-xs font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-50"
            >
              {saving ? t.trackSaving : saved ? t.trackSaved : t.trackButton}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* Which sites the models drew on, and whether the brand is on any of them.

   Domains show immediately from the audit. Opening 10-20 pages to check for the
   brand takes 10-30 seconds, so that part runs only when asked. */
function SourceGap({ data, t }: { data: AuditData; t: Strings }) {
  const [checks, setChecks] = useState<SourceCheck[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const domains = useMemo(() => {
    const byDomain = new Map<string, { urls: string[]; count: number }>();
    for (const c of data.citations) {
      const e = byDomain.get(c.domain) || { urls: [], count: 0 };
      e.urls.push(c.url);
      e.count += c.total || 1;
      byDomain.set(c.domain, e);
    }
    return Array.from(byDomain, ([domain, e]) => ({ domain, ...e }))
      .sort((a, b) => b.count - a.count);
  }, [data.citations]);

  const run = async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch(`${API_URL}/source-gap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urls: domains.flatMap((d) => d.urls),
          brand: data.brand,
          brand_domain: data.brand_domain || "",
          competitors: data.competitor_ranking.filter((c) => !c.is_your_brand).map((c) => c.name),
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      setChecks(json.results || []);
      setExpanded(true);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  const statusFor = (domain: string) => {
    const mine = (checks || []).filter((c) => c.domain === domain);
    if (!mine.length) return null;
    const hit = mine.find((c) => c.status === "present");
    if (hit) return { status: "present" as const, foundIn: hit.found_in || "", reason: "" };
    if (mine.some((c) => c.status === "absent")) return { status: "absent" as const, foundIn: "", reason: "" };
    return { status: "unreadable" as const, foundIn: "", reason: mine[0].reason };
  };

  const presentCount = (checks || []).filter((c) => c.status === "present").length;

  if (domains.length === 0) return null;

  const visible = expanded ? domains : domains.slice(0, 3);

  return (
    <div className="mb-6 rounded-2xl border border-neutral-150 bg-neutral-50/50 p-6">
      <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">{t.sourcesTitle}</p>
      <p className="mt-1.5 text-xs text-neutral-500">
        {checks
          ? t.sourcesChecked(domains.length, presentCount)
          : t.sourcesSummary(domains.length)}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {visible.map((d) => {
          const st = statusFor(d.domain);
          return (
            <span
              key={d.domain}
              title={st?.reason || undefined}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${
                st?.status === "present"
                  ? "border-neutral-900 text-neutral-900"
                  : "border-neutral-200 text-neutral-500"
              }`}
            >
              {d.domain}
              <b className="font-medium text-neutral-900">{d.count}×</b>
              {st?.status === "present" && (
                <span className="text-[10px] text-neutral-500">
                  {st.foundIn === "comment" ? t.inComment : t.inPost}
                </span>
              )}
              {st?.status === "unreadable" && <span className="text-[10px] text-neutral-300">?</span>}
            </span>
          );
        })}
        {!expanded && domains.length > 3 && (
          <button onClick={() => setExpanded(true)} className="rounded-full border border-neutral-200 px-2.5 py-1 text-[11px] text-neutral-500 hover:text-neutral-900">
            {t.andMore(domains.length - 3)}
          </button>
        )}
      </div>

      {!checks && (
        <button onClick={run} disabled={loading} className="mt-4 text-xs text-neutral-500 hover:text-neutral-900 disabled:opacity-50">
          {loading ? t.sourcesRunning : t.sourcesRun}
        </button>
      )}
      {failed && <p className="mt-3 text-xs text-neutral-400">{t.sourcesFailed}</p>}
    </div>
  );
}

/* Expandable row showing what each model actually answered for one prompt.
   This is the "why don't I appear / what did competitors get" view. */
function PromptRow({ result, t, tab, modelsUsed, runDate }: { result: AuditResult; t: Strings; tab: ModelKey; modelsUsed?: Record<string, string>; runDate: string }) {
  const [open, setOpen] = useState(false);
  const models: { key: "chatgpt" | "gemini"; label: string; info: ModelMentionInfo }[] = [
    { key: "chatgpt", label: "ChatGPT", info: result.chatgpt },
    { key: "gemini", label: "Gemini", info: result.gemini },
  ].filter((m) => tab === "all" || tab === m.key) as never;

  const youMentioned = models.some((m) => m.info.mentioned);
  const competitors = Array.from(new Set(models.flatMap((m) => m.info.competitors_found)));

  return (
    <div className="bg-neutral-50/50">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-4 p-4 text-left transition-colors hover:bg-neutral-100/60">
        <div className="min-w-0">
          <p className="text-sm">{result.prompt}</p>
          {competitors.length > 0 && (
            <p className="mt-1 truncate text-xs text-neutral-400">
              {competitors.map((c, i) => `${i + 1}. ${c}`).join("  ")}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${youMentioned ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>
            {youMentioned ? t.youAppear : t.youDontAppear}
          </span>
          {open ? <ChevronDown className="h-4 w-4 text-neutral-400" /> : <ChevronRight className="h-4 w-4 text-neutral-400" />}
        </div>
      </button>

      {open && (
        <div className="space-y-4 border-t border-neutral-100 bg-white px-4 py-4">
          {models.map((m) => (
            <div key={m.key}>
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-600">{m.label}</span>
                <span className="text-[10px] text-neutral-400">{t.runProvenance(modelsUsed?.[m.key] ?? m.label, runDate)}</span>
                {m.info.mentioned && <span className="text-[10px] text-emerald-600">✓ {m.info.mentioned_with_link ? t.withLink : t.withoutLink}</span>}
              </div>
              {m.info.answer ? (
                <AnswerMarkdown text={m.info.answer} />
              ) : (
                <p className="text-xs italic text-neutral-400">{t.noAnswerCaptured}</p>
              )}
              {m.info.cited_domains && m.info.cited_domains.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-wide text-neutral-400">{t.citedDomains}</span>
                  {m.info.cited_domains.map((d) => (
                    <span key={d} className="rounded-full border border-neutral-200 px-2 py-0.5 text-[10px] text-neutral-600">{d}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
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
        return { prompt: r.prompt, competitors, youMentioned, result: r };
      })
      .filter((r) => !r.youMentioned && r.competitors.length > 0);
  }, [tab, data.results]);

  const bestCoveredPrompts = useMemo(() => {
    return data.results
      .map((r) => {
        const ms = modelsForTab(r);
        const youMentioned = ms.some((m) => m.mentioned);
        const competitors = Array.from(new Set(ms.flatMap((m) => m.competitors_found)));
        return { prompt: r.prompt, youMentioned, competitorCount: competitors.length, result: r };
      })
      .filter((r) => r.youMentioned)
      .sort((a, b) => a.competitorCount - b.competitorCount);
  }, [tab, data.results]);

  const runDate = useMemo(() => {
    const d = data.run_at ? new Date(data.run_at) : new Date();
    return d.toLocaleDateString(lang === "ru" ? "ru-RU" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
  }, [data.run_at, lang]);

  const visibleCitations = showAllCitations ? data.citations : data.citations.slice(0, 10);

  const failedModels = useMemo(() => {
    const status = data.model_status;
    if (!status) return [];
    const labels: Record<string, string> = { gemini: "Gemini", chatgpt: "ChatGPT" };
    // A model we deliberately turned off isn't a failure — don't alarm the user about it.
    return Object.entries(status).filter(([, v]) => !v.ok && v.enabled !== false).map(([k]) => labels[k] ?? k);
  }, [data.model_status]);

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
    const maxX = Math.max(...all.map((c) => c.mentions_with_link), 0);
    const maxY = Math.max(...all.map((c) => c.mentions_without_link), 0);
    const maxTotal = Math.max(...all.map((c) => c.total_mentions), 1);
    const plotW = 340, plotH = 150, left = 60, top = 40;
    const flatX = maxX === 0;
    const flatY = maxY === 0;

    const placed = all.map((c, i) => {
      const fracX = flatX ? (all.length === 1 ? 0.5 : i / (all.length - 1)) * 0.8 + 0.1 : c.mentions_with_link / maxX;
      const fracY = flatY ? 0.1 : c.mentions_without_link / maxY;
      const r = 8 + (c.total_mentions / maxTotal) * 22;
      // Clamp so a big bubble near the edge doesn't get clipped by the viewBox.
      const cx = Math.min(Math.max(left + fracX * plotW, left + r), left + plotW);
      const cy = Math.min(Math.max(top + plotH - fracY * plotH, top + r), top + plotH);
      return { ...c, cx, cy, r };
    });

    // Nudge labels apart when bubbles sit close together horizontally.
    return placed.map((b, i) => {
      const crowded = placed.some((o, j) => j < i && Math.abs(o.cx - b.cx) < 70 && Math.abs(o.cy - b.cy) < 30);
      return { ...b, labelY: crowded ? b.cy + b.r + 14 : b.cy - b.r - 7 };
    });
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
  if (view === "competitors") {
    return <CompetitorPrompts data={data} t={t} onBack={() => setView("overview")} />;
  }

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
              {(isUncovered ? uncoveredPrompts : bestCoveredPrompts).map((p, i) => (
                <PromptRow key={i} result={p.result} t={t} tab={tab} modelsUsed={data.models_used} runDate={runDate} />
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
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-neutral-400 hover:text-neutral-900"><ArrowLeft className="h-4 w-4" /> {t.back}</button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{data.brand}</h1>
            <p className="text-xs text-neutral-400">{runDate}{data.category ? ` · ${data.category}` : ""}</p>
          </div>
          <ModelSwitcher tab={tab} setTab={setTab} t={t} />
        </div>

        {failedModels.length > 0 && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm text-amber-800">{t.modelFailed(failedModels.join(", "))}</p>
          </div>
        )}

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
            <button onClick={() => setView("competitors")} className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900">
              {t.seeUncovered} <ChevronRight className="h-3 w-3" />
            </button>
          </div>
          <div className="space-y-2">
            {data.competitor_ranking.slice(0, 5).map((stat) => {
              // Counts, not percentages: "0 of 18" gives the gap a size you can
              // aim at, where "0%" is just a score you are losing.
              const total = data.total_prompts || 1;
              const covered = Math.round((stat.mention_rate / 100) * total);
              const max = Math.max(...data.competitor_ranking.map((s) => s.mention_rate), 1);
              const empty = covered === 0;
              return (
                <div key={stat.name} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 truncate text-xs font-medium">
                    {stat.name}
                    {stat.is_your_brand && <span className="ml-1 rounded-full bg-neutral-900 px-1.5 py-0.5 text-[10px] text-white">{t.you}</span>}
                  </span>
                  {empty ? (
                    <div className="h-2 flex-1 rounded-full border border-dashed border-neutral-300" />
                  ) : (
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
                      <div className={`h-full rounded-full ${stat.is_your_brand ? "bg-neutral-900" : "bg-neutral-300"}`} style={{ width: `${(stat.mention_rate / max) * 100}%` }} />
                    </div>
                  )}
                  <span className="w-14 shrink-0 text-right text-xs font-semibold">{t.ofTotal(covered, total)}</span>
                </div>
              );
            })}
          </div>
          {data.competitor_ranking.some((s) => s.is_your_brand && s.mention_rate === 0) && (
            <p className="mt-1.5 pl-[7.75rem] text-[10px] text-neutral-400">{t.wholeBarAvailable}</p>
          )}
          <button onClick={() => setView("recommendations")} className="mt-3 block w-full text-right text-xs text-neutral-400 hover:text-neutral-900">{t.howToFix}</button>
        </div>

        {/* Competitive landscape bubble chart */}
        {bubbleData.length > 1 && (
          <div className="mb-6 rounded-2xl border border-neutral-150 bg-neutral-50/50 p-6">
            <p className="text-sm font-medium">{t.landscapeTitle}</p>
            <p className="mt-0.5 text-xs text-neutral-400">{t.landscapeSub}</p>
            <svg viewBox="0 0 460 260" width="100%" height="240" className="mt-2">
              <line x1="60" y1="30" x2="60" y2="190" stroke="#e5e5e5" strokeWidth={1} />
              <line x1="60" y1="190" x2="410" y2="190" stroke="#e5e5e5" strokeWidth={1} />
              <text x="20" y="110" fontSize="11" fill="#a3a3a3" transform="rotate(-90 20 110)" textAnchor="middle">{t.landscapeYAxis}</text>
              <text x="235" y="220" fontSize="11" fill="#a3a3a3" textAnchor="middle">{t.landscapeXAxis}</text>
              {bubbleData.map((b) => (
                <g key={b.name}>
                  <circle cx={b.cx} cy={b.cy} r={b.r} fill={b.is_your_brand ? "#171717" : "#a3a3a3"} opacity={b.is_your_brand ? 0.9 : 0.35} />
                  <text x={b.cx} y={b.labelY} fontSize="11" fontWeight={500} textAnchor="middle" fill="#171717">
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
                <button key={i} onClick={() => setView("covered")} className="flex w-full items-center justify-between bg-white px-4 py-2.5 text-left transition-colors hover:bg-neutral-50">
                  <span className="text-xs">{p.prompt}</span>
                  <span className="flex items-center gap-1 text-[11px] text-neutral-400">{t.seeAiResponse} <ChevronRight className="h-3 w-3" /></span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Distribution by LLM */}
        <div className="mb-6 rounded-2xl border border-neutral-150 bg-neutral-50/50 p-6">
          <p className="mb-3 text-sm font-medium">{t.distributionTitle}</p>
          <div className="space-y-3">
            {[
              { label: "ChatGPT", pct: data.total_prompts ? Math.round((data.chatgpt_score / data.total_prompts) * 100) : 0, locked: false, hidden: false },
              { label: "Gemini", pct: data.total_prompts ? Math.round((data.gemini_score / data.total_prompts) * 100) : 0, locked: false, hidden: data.model_status?.gemini?.enabled === false },
              { label: "Perplexity", pct: 0, locked: true, hidden: false },
              { label: "Claude", pct: 0, locked: true, hidden: false },
            ].filter((m) => !m.hidden).map((m) => (
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
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium">{t.responseHeading}</p>
            <span className="text-[11px] text-neutral-400">{t.runProvenance(data.models_used?.chatgpt ?? "ChatGPT", runDate)}</span>
          </div>
          {data.sample_quote ? (
            <>
              <p className="mt-3 text-sm italic text-neutral-600">"{data.sample_quote}"</p>
              <button onClick={() => setView("covered")} className="mt-3 text-xs text-neutral-500 hover:text-neutral-900">{t.seeAiResponse} →</button>
            </>
          ) : (
            <p className="mt-3 text-sm text-neutral-400">{t.whatAiSaysEmpty}</p>
          )}
        </div>

        <SourceGap data={data} t={t} />

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
