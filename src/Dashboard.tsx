import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronRight, Lock } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "./supabase";
import { saveAddedPrompts } from "./saveAudit";

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
  discovered_brands?: string[];
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
  /* Carried by the backend so the page check can fetch each rival's page
     without asking the user to retype URLs the audit already had. */
  domain?: string;
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
  country?: string;
  category_source?: string;
  needs_description?: boolean;
  site_issue?: string;
  language?: string;
  run_at?: string;
  /* Which models actually answered, and when prompts were added to this run.
     Both are needed to extend it honestly. */
  models_run?: string[];
  extended_at?: string;
  added_prompts?: string[];
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

/* ── /page-check: measured from the page, not written by a model ── */

export type PageChange = {
  field: string;
  where: string;
  current: string;
  proposed: string;
};

export type PageFinding = {
  id: string;
  /* The numbers the backend derived its wording from. We phrase the sentence
     ourselves so a Russian reader does not get English inside Russian
     headings; the backend's own strings are the fallback. */
  facts?: Record<string, unknown>;
  severity: "high" | "medium" | "low";
  title: string;
  found: string;
  why: string;
  affects_prompts: string[];
  competitors_doing_it: string[];
  changes: PageChange[];
};

export type PageCheckResult = {
  url?: string;
  brand?: string;
  terms?: string[];
  page?: {
    title: string; h1: string; meta_description: string;
    questions: string[]; schema_types: string[]; body_chars: number;
  };
  placement?: Record<string, boolean | number | string>;
  robots?: { sitemaps: string[]; named_ai_agents: string[]; note: string };
  findings?: PageFinding[];
  competitors?: {
    name: string; url: string; unreadable: string;
    in_title: boolean; in_h1: boolean; in_meta_description: boolean;
    questions: number; has_faq_schema: boolean; names_ai_crawlers: boolean;
  }[];
  blocked_by?: string;
  error?: string;
  detail?: string;
};

type ModelKey = "all" | "chatgpt" | "gemini" | "perplexity" | "claude" | "ai_overview";
type Lang = "en" | "ru";
type View = "overview" | "recommendations" | "uncovered" | "covered" | "competitors" | "open";

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
  openTitle: string;
  openSub: (n: number) => string;
  openEmpty: string;
  seeOpenPrompts: string;
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
  addPromptsLink: string;
  addPromptsHint: string;
  addPromptsPlaceholder: string;
  addPromptsAction: string;
  addPromptsRunning: string;
  addPromptsCancel: string;
  addPromptsFailed: string;
  addPromptsDone: (added: number, total: number) => string;
  addPromptsDates: (first: string, second: string) => string;
  recommendationsTitle: string;
  recommendationsSub: string;
  pageCheckTitle: string;
  pageCheckSub: string;
  pageCheckUrlLabel: string;
  pageCheckRun: string;
  pageCheckRunning: string;
  pageCheckRerun: string;
  pageCheckNoFindings: string;
  pageCheckFailed: string;
  pageCheckFound: string;
  pageCheckWhy: string;
  pageCheckChange: string;
  pageCheckNow: string;
  pageCheckInstead: string;
  pageCheckAffects: (n: number) => string;
  pageCheckRivals: string;
  pageCheckWrittenBelow: string;
  pageCheckNotChecked: string;
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
  openAnswer: string;
  trackedTitle: string;
  trackedEmpty: string;
  addedOn: (d: string) => string;
  alsoNamed: string;
  unknownCategory: string;
  unknownCategoryWhy: (reason: string) => string;
  youAppearShort: string;
  youDontAppearShort: string;
  closeAnswer: string;
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
    openTitle: "Prompts nobody has won",
    openSub: (n) => `${n} prompt${n === 1 ? "" : "s"} where neither you nor the competitors you listed were named.`,
    openEmpty: "Every prompt named somebody. No open ground in this set.",
    seeOpenPrompts: "See prompts nobody has won →",
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
    addPromptsLink: "Add more prompts to this audit",
    addPromptsHint: "One per line. Only the new ones are measured — the rest are not run or charged again.",
    addPromptsPlaceholder: "which loyalty platform handles black friday load\nhow long does a CDP rollout take",
    addPromptsAction: "Measure and add",
    addPromptsRunning: "Measuring…",
    addPromptsCancel: "Cancel",
    addPromptsFailed: "Could not add those. Try again.",
    addPromptsDone: (added, total) => `Added ${added}. The audit now covers ${total} prompts.`,
    addPromptsDates: (first, second) => `Measured in two sittings — ${first} and ${second}. The figure averages both.`,
    recommendationsTitle: "Actionable recommendations",
    recommendationsSub: "Prioritised fixes to close the gap with your competitors",
    pageCheckTitle: "What is actually on your page",
    pageCheckSub: "Read from your page and compared with the competitors who do get named. Every item below is a change to make, not a suggestion to interpret.",
    pageCheckUrlLabel: "Which page should we check?",
    pageCheckRun: "Check this page",
    pageCheckRunning: "Reading the page…",
    pageCheckRerun: "Check again",
    pageCheckNoFindings: "Nothing to fix on this page — the category is declared where it needs to be, and the crawlers can reach it.",
    pageCheckFailed: "We could not read that page",
    pageCheckFound: "What we found",
    pageCheckWhy: "Why it matters",
    pageCheckChange: "The change",
    pageCheckNow: "Now",
    pageCheckInstead: "Instead",
    pageCheckAffects: (n: number) => `Should affect ${n} prompt${n === 1 ? "" : "s"} you were not named in`,
    pageCheckRivals: "Competitors already doing this",
    pageCheckWrittenBelow: "Written from the audit",
    pageCheckNotChecked: "Enter the page you want checked. Usually the product page, not the homepage — a product competes as a page.",
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
    openAnswer: "Read the full answer",
    trackedTitle: "Prompts you are tracking",
    trackedEmpty: "Nothing tracked yet. Pick prompts above and they will run in every audit.",
    addedOn: (d: string) => `Tracked since ${d}`,
    alsoNamed: "also named",
    unknownCategory: "We could not work out which market you compete in, so the prompts below are generic.",
    unknownCategoryWhy: (reason) =>
      reason ? `We tried to read your website but ${reason}. Add a short description and run the audit again.`
             : "Add a short description of what you do and run the audit again.",
    youAppearShort: "mentioned",
    youDontAppearShort: "no mention",
    closeAnswer: "Hide",
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
    openTitle: "Промпты, которые никто не занял",
    openSub: (n) => `${n} промптов, где не назвали ни вас, ни указанных вами конкурентов.`,
    openEmpty: "В каждом промпте кого-то назвали. Свободной земли в этом наборе нет.",
    seeOpenPrompts: "Смотреть промпты, которые никто не занял →",
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
    addPromptsLink: "Добавить промпты к этому аудиту",
    addPromptsHint: "По одному в строке. Измерятся только новые — за остальные платить снова не придётся.",
    addPromptsPlaceholder: "какая программа лояльности выдерживает чёрную пятницу\nсколько занимает внедрение CDP",
    addPromptsAction: "Измерить и добавить",
    addPromptsRunning: "Измеряем…",
    addPromptsCancel: "Отмена",
    addPromptsFailed: "Не удалось добавить. Попробуйте ещё раз.",
    addPromptsDone: (added, total) => `Добавлено: ${added}. Аудит теперь по ${total} промптам.`,
    addPromptsDates: (first, second) => `Измерено в два приёма — ${first} и ${second} Цифра усредняет оба.`,
    recommendationsTitle: "Рекомендации к действию",
    recommendationsSub: "Приоритетные шаги, чтобы догнать конкурентов",
    pageCheckTitle: "Что на самом деле на вашей странице",
    pageCheckSub: "Прочитано с вашей страницы и сравнено с конкурентами, которых называют. Ниже не советы, а готовые изменения.",
    pageCheckUrlLabel: "Какую страницу проверить?",
    pageCheckRun: "Проверить страницу",
    pageCheckRunning: "Читаем страницу…",
    pageCheckRerun: "Проверить снова",
    pageCheckNoFindings: "На этой странице чинить нечего — категория объявлена там, где нужно, и краулеры до неё доходят.",
    pageCheckFailed: "Не удалось прочитать страницу",
    pageCheckFound: "Что нашли",
    pageCheckWhy: "Почему это важно",
    pageCheckChange: "Изменение",
    pageCheckNow: "Сейчас",
    pageCheckInstead: "Нужно",
    pageCheckAffects: (n: number) => `Должно повлиять на ${n} ${n === 1 ? "запрос" : n < 5 ? "запроса" : "запросов"}, где вас не назвали`,
    pageCheckRivals: "Конкуренты, у которых это уже сделано",
    pageCheckWrittenBelow: "Составлено по результатам аудита",
    pageCheckNotChecked: "Укажите страницу для проверки. Обычно это страница продукта, а не главная — продукт конкурирует страницей.",
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
    openAnswer: "Читать ответ целиком",
    trackedTitle: "Промпты на отслеживании",
    trackedEmpty: "Пока ничего не отслеживается. Выберите промпты выше — они будут проверяться в каждом аудите.",
    addedOn: (d: string) => `На отслеживании с ${d}`,
    alsoNamed: "также названы",
    unknownCategory: "Не удалось определить ваш рынок, поэтому промпты ниже получились общими.",
    unknownCategoryWhy: (reason) =>
      reason ? `Мы пытались прочитать сайт, но ${reason}. Добавьте короткое описание и запустите аудит заново.`
             : "Добавьте короткое описание того, чем вы занимаетесь, и запустите аудит заново.",
    youAppearShort: "упоминание есть",
    youDontAppearShort: "упоминания нет",
    closeAnswer: "Свернуть",
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

/* Phrase a finding in the reader's language from the facts the backend sent.
   Falls back to the backend's English whenever an id is unknown or the facts
   are missing, so a new check added server-side still renders. */
function localizeFinding(f: PageFinding, lang: Lang): { title: string; found: string; why: string } {
  if (lang !== "ru" || !f.facts) return { title: f.title, found: f.found, why: f.why };
  const x = f.facts as Record<string, never>;
  const plural = (n: number, one: string, few: string, many: string) => {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  };
  const FIELD_RU: Record<string, string> = {
    title: "title", H1: "H1", "meta description": "meta description",
  };
  switch (f.id) {
    case "self_declaration": {
      const n = Number(x.body_occurrences) || 0;
      const missing = (x.missing as unknown as string[] | undefined) || [];
      return {
        title: "Страница не объявляет категорию, в которой конкурирует",
        found: `«${x.term}» встречается в тексте ${n} ${plural(n, "раз", "раза", "раз")}, но отсутствует в ${missing.map((m) => FIELD_RU[m] || m).join(", ")}.`,
        why: "Отвечая на категорийный вопрос, модель опирается на то, чем страница себя объявляет, а не на то, сколько раз фраза встретилась ниже по тексту. Частота в теле страницы и в кейсах не заменяет title, H1 и описание — страница с втрое меньшим числом упоминаний выигрывает, если ведёт этими тремя.",
      };
    }
    case "question_content": {
      const own = Number(x.own_questions) || 0;
      const lost = Number(x.lost_questions) || 0;
      return {
        title: "Нет контента в форме вопросов для тех вопросов, которые вы проигрываете",
        found: `Заголовков в форме вопроса на странице: ${own}${x.has_faq_schema ? "" : ", разметки FAQPage нет"}. Из запросов, где вас не назвали, ${lost} ${plural(lost, "сформулирован", "сформулированы", "сформулированы")} как вопрос.`,
        why: "Отвечая на вопрос, модель предпочитает фрагмент, который сам является этим вопросом с ответом под ним. Текст, содержащий ответ, но нигде не задающий вопрос, извлекается хуже — поэтому FAQ обходит страницу, написанную лучше, но без него.",
      };
    }
    case "ai_crawlers": {
      const blocked = (x.blocked as unknown as string[] | undefined) || [];
      const unnamed = Number(x.unnamed) || 0;
      return {
        title: blocked.length ? "ИИ-краулеры заблокированы на этой странице" : (unnamed === Number(x.total_agents) ? "В robots.txt не назван ни один ИИ-краулер" : "У части ИИ-краулеров нет собственных правил"),
        found: (blocked.length ? `Заблокированы: ${blocked.join(", ")}. ` : "") +
               (unnamed ? `У ${unnamed} ${plural(unnamed, "краулера", "краулеров", "краулеров")} нет собственных правил, они попадают под общую группу. ` : "") +
               (x.has_sitemap ? "" : "Sitemap не объявлен."),
        why: "Заблокированный краулер не лечится никаким контентом — это единственная поломка, из-за которой всё остальное бессмысленно. Краулеры без своих правил не заблокированы, так что само по себе это не срочно: важно, что общая группа писалась под поисковики и может закрывать пути по причинам, которые уже неактуальны.",
      };
    }
    case "js_rendered":
      return {
        title: "Пока не выполнится JavaScript, на странице почти нет текста",
        found: `В самом HTML только ${Number(x.body_chars) || 0} символов текста.`,
        why: "Большинство краулеров, которые питают ассистентов, не выполняют JavaScript и видят пустую страницу. Пока это так, ничто другое из списка не поможет.",
      };
    default:
      return { title: f.title, found: f.found, why: f.why };
  }
}

/* Where in the markup a change goes. Keyed on the field rather than on the
   backend's sentence, so wording changes there do not silently fall back to
   English here. */
const WHERE_RU: Record<string, string> = {
  title: "<head><title>",
  h1: "первый <h1> на странице",
  meta_description: '<meta name="description">',
  faq: "новый блок FAQ с разметкой FAQPage",
  "robots.txt": "/robots.txt",
  rendering: "сборка сайта",
};

/* The add-prompts control. Lives in a component because it is rendered on
   three screens, and three hand-copied versions is how the admin exemption and
   the audit-saving block drifted apart before. */
function AddPromptsBox({ t, open, setOpen, text, setText, busy, error, onSubmit, note }: {
  t: Strings; open: boolean; setOpen: (v: boolean) => void;
  text: string; setText: (v: string) => void;
  busy: boolean; error: string; onSubmit: () => void; note: React.ReactNode;
}) {
  if (!open) {
    return (
      <div className="mt-6">
        <button onClick={() => setOpen(true)} className="text-xs text-neutral-400 hover:text-neutral-900">
          + {t.addPromptsLink}
        </button>
        {note}
      </div>
    );
  }
  return (
    <div className="mt-6 rounded-2xl border border-neutral-150 p-5">
      <p className="text-sm font-medium">{t.addPromptsLink}</p>
      <p className="mt-1 text-xs text-neutral-400">{t.addPromptsHint}</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t.addPromptsPlaceholder}
        rows={3}
        className="mt-3 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-900"
      />
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button onClick={onSubmit} disabled={busy || text.trim().length === 0}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
          {busy ? t.addPromptsRunning : t.addPromptsAction}
        </button>
        <button onClick={() => setOpen(false)} disabled={busy}
          className="rounded-lg border border-neutral-200 px-4 py-2 text-xs text-neutral-600 hover:text-neutral-900 disabled:opacity-50">
          {t.addPromptsCancel}
        </button>
      </div>
    </div>
  );
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

/* The excerpt is a slice out of a markdown answer, so it arrives carrying
   ## headings and ** marks. Rendering full markdown here would pull in
   headings and tables mid-sentence; stripping the syntax and keeping only
   bold reads as prose while preserving the emphasis the model intended. */
function excerptToNodes(text: string, limit = 150): React.ReactNode[] {
  const cleaned = text
    .replace(/^[-*]\s+/gm, "")        // bullet markers at line start
    .replace(/\s+/g, " ")
    // Headings are matched after collapsing newlines, so a "###" that ended up
    // mid-sentence gets removed too rather than showing as literal hashes.
    .replace(/#{1,6}\s+/g, "")
    .replace(/`+/g, "")
    .trim();
  const clipped = cleaned.length > limit ? cleaned.slice(0, limit) + "…" : cleaned;

  const out: React.ReactNode[] = [];
  let last = 0;
  const bold = /\*\*(.+?)\*\*/g;
  let m: RegExpExecArray | null;
  while ((m = bold.exec(clipped)) !== null) {
    if (m.index > last) out.push(clipped.slice(last, m.index));
    out.push(<strong key={m.index} className="font-medium text-neutral-700">{m[1]}</strong>);
    last = m.index + m[0].length;
  }
  // Strip stray asterisks from the tail: a bold marker cut in half by the
  // character limit would otherwise render as literal "**".
  if (last < clipped.length) out.push(clipped.slice(last).replace(/\*+/g, ""));
  return out.length ? out : [clipped.replace(/\*+/g, "")];
}

/* Screen 2: the prompts competitors answer and the brand does not.

   Selecting prompts writes them to Supabase. That list is what the next audit
   compares against - it is the reason to come back rather than just re-read a
   report. */
function CompetitorPrompts({ data, t, lang, setLang, onBack, addBox }: { data: AuditData; t: Strings; lang: Lang; setLang: (l: Lang) => void; onBack: () => void; addBox?: React.ReactNode }) {
  const rows = useMemo(() => {
    return data.results
      .map((r) => {
        const models = [r.chatgpt, r.gemini];
        const youHere = models.some((m) => m.mentioned);
        const rivals = Array.from(new Set(models.flatMap((m) => m.competitors_found || [])));
        // Names the models brought up that nobody asked us to track. Often the
        // more useful finding, so they are shown but kept visually apart.
        const found = Array.from(new Set(models.flatMap((m) => m.discovered_brands || [])));
        const answer = r.chatgpt.answer || r.gemini.answer || "";
        return { prompt: r.prompt, rivals, found, answer, youHere };
      })
      .filter((r) => !r.youHere && r.rivals.length > 0);
  }, [data.results]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [tracked, setTracked] = useState<{ prompt: string; created_at: string }[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { if (!cancelled) setTracked([]); return; }
        const { data: rows } = await supabase
          .from("tracked_prompts")
          .select("prompt, created_at")
          .eq("user_id", user.id)
          .ilike("brand", data.brand);
        if (!cancelled) setTracked((rows || []) as { prompt: string; created_at: string }[]);
      } catch {
        if (!cancelled) setTracked([]);
      }
    })();
    return () => { cancelled = true; };
  }, [data.brand]);

  /* A tracked prompt may not have been in this run at all - the audit may have
     been made before it was picked. Saying "not yet" in that case would be a
     lie, so the three states are kept apart. */
  const trackedRows = useMemo(() => {
    if (!tracked) return [];
    return tracked.map((row) => {
      const p = row.prompt;
      const added = row.created_at
        ? new Date(row.created_at).toLocaleDateString(lang === "ru" ? "ru-RU" : "en-GB",
            { day: "numeric", month: "long", year: "numeric" })
        : "";
      const hit = data.results.find((r) => r.prompt.toLowerCase() === p.toLowerCase());
      if (!hit) return { prompt: p, state: "unknown" as const, rivals: [] as string[], added };
      const models = [hit.chatgpt, hit.gemini];
      return {
        prompt: p,
        state: models.some((m) => m.mentioned) ? ("present" as const) : ("absent" as const),
        rivals: Array.from(new Set(models.flatMap((m) => m.competitors_found || []))),
        added,
      };
    });
  }, [tracked, data.results, lang]);
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
          <LangSwitch lang={lang} setLang={setLang} />
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
            {rows.map((r, i) => {
              const open = openRow === r.prompt;
              return (
                <div key={i} className="border-t border-neutral-100">
                  <div className="grid grid-cols-[26px_1.4fr_0.6fr_2fr_0.9fr] items-start gap-2 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(r.prompt)}
                      onChange={() => toggle(r.prompt)}
                      className="mt-0.5"
                    />
                    <span className="pr-2 text-xs">{r.prompt}</span>
                    {/* No search-volume source yet. An honest dash beats a number we made up. */}
                    <span className="text-xs text-neutral-300">{t.noVolume}</span>
                    <div className="pr-2">
                      <p className="text-[11px] leading-relaxed text-neutral-500">
                        {r.answer ? excerptToNodes(r.answer) : "—"}
                      </p>
                      {r.answer && (
                        <button
                          onClick={() => setOpenRow(open ? null : r.prompt)}
                          className="mt-1 text-[11px] text-neutral-400 underline underline-offset-2 hover:text-neutral-900"
                        >
                          {open ? t.closeAnswer : t.openAnswer}
                        </button>
                      )}
                    </div>
                    <div className="text-[11px] leading-relaxed">
                      <span className="text-neutral-500">{r.rivals.join(", ") || "—"}</span>
                      {r.found.length > 0 && (
                        <p className="mt-1 text-neutral-400">
                          <span className="text-[10px] uppercase tracking-wide text-neutral-300">{t.alsoNamed}</span>
                          <br />{r.found.join(", ")}
                        </p>
                      )}
                    </div>
                  </div>

                  {open && r.answer && (
                    <div className="border-t border-neutral-100 bg-neutral-50/60 px-4 py-4">
                      <AnswerMarkdown text={r.answer} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-10">
          <h2 className="text-sm font-medium">{t.trackedTitle}</h2>
          {trackedRows.length === 0 ? (
            <p className="mt-2 text-xs text-neutral-400">{t.trackedEmpty}</p>
          ) : (
            <div className="mt-3 overflow-hidden rounded-2xl border border-neutral-150">
              {trackedRows.map((r, i) => (
                <div key={i} className="flex items-start justify-between gap-4 border-b border-neutral-100 px-4 py-3 last:border-0">
                  <div>
                    <p className="text-xs">{r.prompt}</p>
                    {r.rivals.length > 0 && (
                      <p className="mt-0.5 text-[11px] text-neutral-400">{r.rivals.join(", ")}</p>
                    )}
                  </div>
                  <span className={`whitespace-nowrap text-[11px] font-medium ${
                    r.state === "present" ? "text-emerald-600"
                    : r.state === "absent" ? "text-neutral-400"
                    : "text-neutral-300"
                  }`}>
                    {r.state === "present" ? t.youAppearShort
                      : r.state === "absent" ? t.youDontAppearShort
                      : t.addedOn(r.added)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {addBox}
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

/* Two labels rather than a dropdown: with two options a dropdown costs an extra
   click and hides the alternative. */
function LangSwitch({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-neutral-200 p-0.5">
      {(["en", "ru"] as Lang[]).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
            lang === l ? "bg-neutral-900 text-white" : "text-neutral-400 hover:text-neutral-900"
          }`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

export function Dashboard({ data: raw, onBack, lang: initialLang = "en", brandName = "GetCited", auditId = null }: { data: AuditData; onBack: () => void; lang?: Lang; brandName?: string; auditId?: string | number | null }) {
  /* The page URL sets the starting language, but the reader can change it.
     The audit itself can be in a different language from the interface - a
     Russian-market audit is often read by an English-speaking colleague. */
  const [lang, setLang] = useState<Lang>(initialLang);
  const t = STR[lang];

  /* A partial payload should degrade, not blank the page. Missing arrays are
     normalised here so every use site can assume they exist. */
  /* Prompts added after the run. Holding the extended audit here rather than
     lifting it up means every figure on this screen recomputes from it without
     a single display having to know that extending exists. */
  const [extendedData, setExtendedData] = useState<AuditData | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addText, setAddText] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  const data = useMemo(() => {
    const base = extendedData ?? raw;
    return ({
    ...base,
    results: Array.isArray(base?.results) ? base.results : [],
    citations: Array.isArray(base?.citations) ? base.citations : [],
    competitor_ranking: Array.isArray(base?.competitor_ranking) ? base.competitor_ranking : [],
  });
  }, [raw, extendedData]);
  const [view, setView] = useState<View>("overview");
  const [tab, setTab] = useState<ModelKey>("all");
  const [showAllCitations, setShowAllCitations] = useState(false);

  /* ---- page check (POST /page-check) ----
     Runs only when asked. Keeping it off the overview is deliberate: the
     visibility page answers "are we named", this answers "why not", and
     mixing them would make the first page slower for no reason. */
  const [pageUrl, setPageUrl] = useState(data.brand_domain ? `https://${data.brand_domain}` : "");
  const [pageCheck, setPageCheck] = useState<PageCheckResult | null>(null);
  const [pageChecking, setPageChecking] = useState(false);
  const [pageCheckError, setPageCheckError] = useState("");

  /* Prompts where neither model named the brand. These are what the proposed
     FAQ is built from, which is what later ties a movement in the score to a
     specific change rather than to "we improved the content". */
  const missedPrompts = useMemo(() => data.results
    .filter((r) => !r.gemini?.mentioned && !r.chatgpt?.mentioned)
    .map((r) => ({ text: r.prompt, type: r.prompt_type || "" })), [data.results]);

  const runPageCheck = async () => {
    const url = pageUrl.trim();
    if (!url) return;
    setPageChecking(true);
    setPageCheckError("");
    try {
      const res = await fetch(`${API_URL}/page-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          website: url,
          brand: data.brand,
          category: data.category || "",
          competitors: data.competitor_ranking
            .filter((c) => !c.is_your_brand && c.domain)
            .slice(0, 5)
            .map((c) => ({ name: c.name, website: `https://${c.domain}` })),
          missed_prompts: missedPrompts,
        }),
      });
      const json: PageCheckResult = await res.json();
      if (json.error) {
        setPageCheckError(json.detail || json.error);
        setPageCheck(null);
      } else {
        setPageCheck(json);
      }
    } catch {
      setPageCheckError(t.pageCheckFailed);
      setPageCheck(null);
    } finally {
      setPageChecking(false);
    }
  };
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

  /* Neither you nor any competitor you listed. These used to appear nowhere:
     "covered" needs you named, "uncovered" needs a rival named, and a prompt
     that named nobody satisfies neither — while being the cheapest to win,
     since there is no incumbent to displace. */
  const openPrompts = useMemo(() => {
    return data.results
      .map((r) => {
        const ms = modelsForTab(r);
        return {
          prompt: r.prompt,
          youMentioned: ms.some((m) => m.mentioned),
          competitors: Array.from(new Set(ms.flatMap((m) => m.competitors_found))),
          result: r,
        };
      })
      .filter((r) => !r.youMentioned && r.competitors.length === 0);
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

  /* The API returns one entry per cited URL, so a prompt that pulled three
     sources produced three identical-looking rows. Group by prompt: the prompt
     is the unit a reader thinks in, the domains are its detail. */
  const citationGroups = useMemo(() => {
    const byPrompt = new Map<string, { prompt: string; sources: Citation[] }>();
    for (const c of data.citations) {
      const key = c.prompt || "—";
      const g = byPrompt.get(key) || { prompt: key, sources: [] };
      g.sources.push(c);
      byPrompt.set(key, g);
    }
    return Array.from(byPrompt.values());
  }, [data.citations]);

  const visibleCitations = showAllCitations ? citationGroups : citationGroups.slice(0, 10);

  const failedModels = useMemo(() => {
    const status = data.model_status;
    if (!status) return [];
    const labels: Record<string, string> = { gemini: "Gemini", chatgpt: "ChatGPT" };
    // A model we deliberately turned off isn't a failure — don't alarm the user about it.
    return Object.entries(status).filter(([, v]) => !v.ok && v.enabled !== false).map(([k]) => labels[k] ?? k);
  }, [data.model_status]);

  /* ---- recommendations, categorised ---- */
  const addPrompts = async () => {
    const lines = Array.from(new Set(
      addText.split("\n").map((l) => l.trim()).filter(Boolean)));
    if (lines.length === 0) return;
    setAdding(true);
    setAddError("");
    try {
      const res = await fetch(`${API_URL}/audit/extend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand: data.brand,
          // Rebuilt from the ranking, which already carries each rival's domain.
          competitor_list: data.competitor_ranking
            .filter((c) => !c.is_your_brand)
            .map((c) => ({ name: c.name, website: c.domain ? `https://${c.domain}` : "" })),
          country: data.country || "US",
          language: data.language || "",
          models: data.models_run || [],
          extra_prompts: lines,
          previous_results: data.results,
          previous_citations: data.citations,
        }),
      });
      const next = await res.json();
      if (!res.ok || next?.error || !Array.isArray(next?.results)) {
        setAddError(next?.detail || next?.error || t.addPromptsFailed);
        return;
      }
      // Recommendations are not regenerated by an extend, so keep the ones we have.
      const merged: AuditData = { ...next, recommendations: data.recommendations };
      setExtendedData(merged);
      setAddText("");
      setAddOpen(false);

      if (auditId) {
        const added = (next.results as AuditResult[]).filter(
          (r) => (next.added_prompts || []).includes(r.prompt));
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await saveAddedPrompts({ auditId, userId: user.id, added, data: merged });
        }
      }
    } catch {
      setAddError(t.addPromptsFailed);
    } finally {
      setAdding(false);
    }
  };

  const addNote = extendedData ? (
    <p className="mt-2 text-xs text-neutral-400">
      {t.addPromptsDone((extendedData.added_prompts || []).length, data.total_prompts)}{" "}
      {extendedData.extended_at && t.addPromptsDates(
        runDate,
        new Date(extendedData.extended_at).toLocaleDateString(
          lang === "ru" ? "ru-RU" : "en-GB", { day: "numeric", month: "short", year: "numeric" }))}
    </p>
  ) : null;

  const addBox = (
    <AddPromptsBox
      t={t} open={addOpen} setOpen={setAddOpen} text={addText} setText={setAddText}
      busy={adding} error={addError} onSubmit={addPrompts} note={addNote}
    />
  );

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

    /* Zero maps to an inset, not to the axis itself. Brands with no mentions
       were landing exactly on the lines, which read as a rendering fault rather
       than as data. */
    const INSET = 0.12;
    const scale = (v: number, max: number) => (max === 0 ? INSET : INSET + (v / max) * (1 - INSET * 2));

    const placed = all.map((c) => {
      const fracX = scale(c.mentions_with_link, maxX);
      const fracY = scale(c.mentions_without_link, maxY);
      const r = 8 + (c.total_mentions / maxTotal) * 22;
      const cx = Math.min(Math.max(left + fracX * plotW, left + r), left + plotW - r);
      const cy = Math.min(Math.max(top + plotH - fracY * plotH, top + r), top + plotH - r);
      return { ...c, cx, cy, r };
    });

    /* Brands with identical numbers land on the same point and their labels
       overlap into an unreadable smudge. Spread a tied cluster along an arc. */
    const byPoint = new Map<string, typeof placed>();
    for (const b of placed) {
      const key = `${Math.round(b.cx)}:${Math.round(b.cy)}`;
      byPoint.set(key, [...(byPoint.get(key) || []), b]);
    }
    const spread = placed.map((b) => {
      const key = `${Math.round(b.cx)}:${Math.round(b.cy)}`;
      const group = byPoint.get(key)!;
      if (group.length < 2) return b;
      const idx = group.indexOf(b);
      const angle = (idx / group.length) * Math.PI * 2;
      const offset = 14 + b.r;
      return {
        ...b,
        cx: Math.min(Math.max(b.cx + Math.cos(angle) * offset, left + b.r), left + plotW - b.r),
        cy: Math.min(Math.max(b.cy + Math.sin(angle) * offset, top + b.r), top + plotH - b.r),
      };
    });

    // Labels above by default, below when a neighbour is close.
    return spread.map((b, i) => {
      const crowded = spread.some((o, j) => j < i && Math.abs(o.cx - b.cx) < 70 && Math.abs(o.cy - b.cy) < 30);
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
            <LangSwitch lang={lang} setLang={setLang} />
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-6 py-10">
          <h1 className="text-2xl font-bold">{t.recommendationsTitle}</h1>
          <p className="mt-1 text-sm text-neutral-500">{t.recommendationsSub}</p>

          {/* ── Measured from the page. Sits above the model-written items
                because a fact about the markup outranks a suggestion. ── */}
          <section className="mt-8 rounded-2xl border border-neutral-150 bg-neutral-50/60 p-6">
            <h2 className="text-lg font-semibold">{t.pageCheckTitle}</h2>
            <p className="mt-1 text-sm text-neutral-500">{t.pageCheckSub}</p>

            <label className="mt-5 block">
              <span className="mb-1 block text-xs text-neutral-500">{t.pageCheckUrlLabel}</span>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={pageUrl}
                  onChange={(e) => setPageUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runPageCheck(); } }}
                  placeholder="https://example.com/products/loyalty/"
                  className="h-11 w-full rounded-lg border border-neutral-200 bg-white px-4 text-sm outline-none focus:border-neutral-900"
                />
                <button
                  onClick={runPageCheck}
                  disabled={pageChecking || !pageUrl.trim()}
                  className="h-11 shrink-0 rounded-lg bg-neutral-900 px-5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
                >
                  {pageChecking ? t.pageCheckRunning : pageCheck ? t.pageCheckRerun : t.pageCheckRun}
                </button>
              </div>
            </label>

            {!pageCheck && !pageChecking && !pageCheckError && (
              <p className="mt-3 text-xs text-neutral-400">{t.pageCheckNotChecked}</p>
            )}
            {pageCheckError && (
              <p className="mt-3 rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                {t.pageCheckFailed} — {pageCheckError}
              </p>
            )}

            {pageCheck && (pageCheck.findings || []).length === 0 && (
              <p className="mt-4 rounded-xl border border-dashed border-neutral-200 bg-white p-4 text-sm text-neutral-500">
                {t.pageCheckNoFindings}
              </p>
            )}

            {pageCheck && (pageCheck.findings || []).length > 0 && (
              <div className="mt-5 space-y-4">
                {(pageCheck.findings || []).map((f) => {
                  const dot = f.severity === "high" ? "bg-red-500" : f.severity === "medium" ? "bg-amber-500" : "bg-neutral-400";
                  const label = f.severity === "high" ? t.high : f.severity === "medium" ? t.medium : t.low;
                  const loc = localizeFinding(f, lang);
                  return (
                    <article key={f.id} className="rounded-xl border border-neutral-150 bg-white p-5">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${dot}`} />
                        <span className="text-xs font-medium text-neutral-500">{label}</span>
                      </div>
                      <h3 className="mt-2 text-sm font-semibold text-neutral-900">{loc.title}</h3>

                      <p className="mt-3 text-xs font-medium uppercase tracking-widest text-neutral-400">{t.pageCheckFound}</p>
                      <p className="mt-1 text-sm text-neutral-800">{loc.found}</p>

                      <p className="mt-3 text-xs font-medium uppercase tracking-widest text-neutral-400">{t.pageCheckWhy}</p>
                      <p className="mt-1 text-sm text-neutral-600">{loc.why}</p>

                      {f.changes.length > 0 && (
                        <>
                          <p className="mt-4 text-xs font-medium uppercase tracking-widest text-neutral-400">{t.pageCheckChange}</p>
                          <div className="mt-2 space-y-3">
                            {f.changes.map((c, i) => (
                              <div key={i} className="rounded-lg border border-neutral-100 bg-neutral-50 p-3">
                                <p className="text-xs text-neutral-500">{c.field} — {(lang === "ru" && WHERE_RU[c.field]) || c.where}</p>
                                {c.current && (
                                  <p className="mt-2 text-sm text-neutral-500">
                                    <span className="text-xs uppercase tracking-wide text-neutral-400">{t.pageCheckNow}</span>{" "}
                                    <span className="line-through decoration-neutral-300">{c.current}</span>
                                  </p>
                                )}
                                <p className="mt-1 whitespace-pre-wrap text-sm font-medium text-neutral-900">
                                  <span className="text-xs uppercase tracking-wide text-neutral-400">{t.pageCheckInstead}</span>{" "}
                                  {c.proposed}
                                </p>
                              </div>
                            ))}
                          </div>
                        </>
                      )}

                      {f.affects_prompts.length > 0 && (
                        <details className="mt-4">
                          <summary className="cursor-pointer text-xs text-neutral-500 hover:text-neutral-900">
                            {t.pageCheckAffects(f.affects_prompts.length)}
                          </summary>
                          <ul className="mt-2 space-y-1">
                            {f.affects_prompts.map((q, i) => (
                              <li key={i} className="text-sm text-neutral-600">— {q}</li>
                            ))}
                          </ul>
                        </details>
                      )}

                      {f.competitors_doing_it.length > 0 && (
                        <p className="mt-3 text-xs text-neutral-500">
                          {t.pageCheckRivals}: {f.competitors_doing_it.join(", ")}
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <p className="mt-10 text-xs font-medium uppercase tracking-widest text-neutral-400">{t.pageCheckWrittenBelow}</p>
          <div className="mt-4 space-y-8">
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
    return <CompetitorPrompts data={data} t={t} lang={lang} setLang={setLang} onBack={() => setView("overview")} addBox={addBox} />;
  }

  if (view === "uncovered" || view === "covered" || view === "open") {
    const isUncovered = view === "uncovered";
    const isOpen = view === "open";
    const listRows = isOpen ? openPrompts : isUncovered ? uncoveredPrompts : bestCoveredPrompts;
    return (
      <div className="min-h-screen bg-white text-neutral-900">
        <header className="sticky top-0 z-40 border-b border-neutral-100 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <button onClick={() => setView("overview")} className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900">
              <ArrowLeft className="h-4 w-4" /> {t.backToDashboard}
            </button>
            <LangSwitch lang={lang} setLang={setLang} />
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-6 py-10">
          <h1 className="text-xl font-semibold">{isOpen ? t.openTitle : isUncovered ? t.uncoveredTitle : t.bestCoveredTitle}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {isOpen ? t.openSub(openPrompts.length) : isUncovered ? t.uncoveredSub(uncoveredPrompts.length) : ""}
          </p>

          {listRows.length === 0 ? (
            <p className="mt-6 rounded-xl border border-dashed border-neutral-200 p-6 text-center text-sm text-neutral-400">
              {isOpen ? t.openEmpty : isUncovered ? t.uncoveredEmpty : t.bestCoveredEmpty}
            </p>
          ) : (
            <div className="mt-6 divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-150">
              {listRows.map((p, i) => (
                <PromptRow key={i} result={p.result} t={t} tab={tab} modelsUsed={data.models_used} runDate={runDate} />
              ))}
            </div>
          )}

          {isUncovered && (
            <button onClick={() => setView("recommendations")} className="mt-6 text-sm text-neutral-500 hover:text-neutral-900">{t.howToFix}</button>
          )}

          {addBox}
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
          <div className="flex items-center gap-3">
            <LangSwitch lang={lang} setLang={setLang} />
            <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-neutral-400 hover:text-neutral-900"><ArrowLeft className="h-4 w-4" /> {t.back}</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{data.brand}</h1>
            <p className="text-xs text-neutral-400">
              {runDate}{data.category ? ` · ${data.category}` : ""}
              {/* A score without its market is not comparable to anything. */}
              {data.country ? ` · ${data.country}` : ""}
            </p>
          </div>
          <ModelSwitcher tab={tab} setTab={setTab} t={t} />
        </div>

        {failedModels.length > 0 && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm text-amber-800">{t.modelFailed(failedModels.join(", "))}</p>
          </div>
        )}

        {/* 3 metric cards */}
        {data.needs_description && (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
            <p className="text-sm font-medium text-amber-900">{t.unknownCategory}</p>
            <p className="mt-1 text-xs text-amber-800">{t.unknownCategoryWhy(data.site_issue || "")}</p>
          </div>
        )}

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
            <div className="flex flex-col items-end gap-1">
              <button onClick={() => setView("competitors")} className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900">
                {t.seeUncovered} <ChevronRight className="h-3 w-3" />
              </button>
              {openPrompts.length > 0 && (
                <button onClick={() => setView("open")} className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-900">
                  {t.openTitle} · {openPrompts.length} <ChevronRight className="h-3 w-3" />
                </button>
              )}
            </div>
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
                {visibleCitations.map((g, i) => (
                  <tr key={i} className="border-b border-neutral-50 align-top">
                    <td className="max-w-[280px] py-2.5 pr-4 text-xs text-neutral-700">{g.prompt}</td>
                    <td className="py-2.5 text-center text-xs text-neutral-400">{t.svPending}</td>
                    <td className="py-2.5 text-center">
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-600">
                        {g.sources[0].gemini_count >= g.sources[0].chatgpt_count ? "Gemini" : "ChatGPT"}
                      </span>
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="flex flex-wrap justify-end gap-x-2 gap-y-1">
                        {g.sources.map((c, j) => (
                          <a key={j} href={c.url} target="_blank" rel="noopener noreferrer" className="text-xs text-neutral-700 hover:text-neutral-900 hover:underline">
                            {c.domain}
                          </a>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {citationGroups.length > 10 && (
              <button onClick={() => setShowAllCitations(!showAllCitations)} className="mt-3 text-xs text-neutral-500 hover:text-neutral-900">
                {showAllCitations ? t.showLess : t.viewAllCitations(citationGroups.length)}
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
