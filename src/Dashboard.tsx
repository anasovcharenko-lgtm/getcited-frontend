import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ChevronDown, ChevronRight, Lock } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "./supabase";
import { saveAddedPrompts, activeModels } from "./saveAudit";
import { apiFetch } from "./api";
import { isAdmin } from "./admins";

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
  /* The pages the model actually read to write this answer. The one question a
     reader has in front of an answer that named someone else is "where did that
     come from" — the domain chips could not answer it, because a domain is not a
     page. Optional: audits saved before this existed carry cited_domains only. */
  sources?: string[];
  cited_domains?: string[];
  discovered_brands?: string[];
};

/* The models an audit can carry, in display order. The backend has the same
   list; both sides read it rather than naming models inline, because a model
   named in one place and forgotten in another is a number that silently
   excludes it. */
export const MODELS = [
  { key: "chatgpt", label: "ChatGPT" },
  { key: "gemini", label: "Gemini" },
  { key: "perplexity", label: "Perplexity" },
  { key: "deepseek", label: "DeepSeek" },
  { key: "ai_overview", label: "AI Overview" },
] as const;

export type ModelName = (typeof MODELS)[number]["key"];

export type AuditResult = {
  prompt: string;
  prompt_type?: "problem" | "comparison" | "brand";
  /* Google search volume for the prompt used verbatim as a search phrase.
     Absent when the phrase is too long for the API or Google has no data. */
  search_volume?: number;
  /* The phrase the figure belongs to. Usually NOT the prompt: a prompt is a
     sentence and nobody searches sentences, so the backend derives a short
     phrase and prices that. Shown on screen for the same reason it is stored —
     a volume beside a prompt reads as "this many people typed this". */
  keyword_phrase?: string;
  keyword_source?: "exact" | "derived";
  gemini: ModelMentionInfo;
  chatgpt: ModelMentionInfo;
  // Optional: every run saved before a model existed has no key for it.
  perplexity?: ModelMentionInfo;
  deepseek?: ModelMentionInfo;
  ai_overview?: ModelMentionInfo;
};

const NO_ANSWER: ModelMentionInfo = {
  mentioned: false, mentioned_with_link: false, mentioned_without_link: false,
  competitors_found: [], competitors_with_link: [], competitors_without_link: [],
};

/* A model that is missing from a stored run did not answer; it must read as
   "not measured", never as "measured and absent", which would count against the
   brand in a before-and-after. */
export const infoFor = (r: AuditResult, key: ModelName): ModelMentionInfo =>
  (r[key] as ModelMentionInfo | undefined) ?? NO_ANSWER;

/* Which models this particular run used. `models_run` is what the backend
   divided its scores by; the fallback reads the results themselves for runs
   saved before that field existed. */
/* How many answers from this model named the brand.

   Counted, not recovered from the rounded percentage, because the point of
   showing a fraction under the headline is that it can be checked against the
   lists. model_scores is the backend's own count; the two named fields are the
   fallback for runs stored before it, and the results themselves for a model
   that predates both. */
export function modelNamedCount(
  data: { model_scores?: Record<string, number>; gemini_score?: number;
          chatgpt_score?: number; results?: AuditResult[] },
  key: ModelName): number {
  const fromScores = data.model_scores?.[key];
  if (typeof fromScores === "number") return fromScores;
  if (key === "gemini" && typeof data.gemini_score === "number") return data.gemini_score;
  if (key === "chatgpt" && typeof data.chatgpt_score === "number") return data.chatgpt_score;
  return (data.results || []).filter((r) => infoFor(r, key).mentioned).length;
}

export function modelsIn(
  data: { models_answered?: string[]; models_run?: string[]; results?: AuditResult[] },
): ModelName[] {
  /* models_answered first: a model that was asked and said nothing has no tab
     worth opening and no row to fill, and counting it would read as "measured,
     not named". models_run is the fallback for runs saved before the backend
     told the two apart; the banner still reports the failure either way. */
  const spoke = (data.models_answered || []).filter(
    (m): m is ModelName => MODELS.some((x) => x.key === m));
  if (spoke.length) return spoke;
  const declared = (data.models_run || []).filter(
    (m): m is ModelName => MODELS.some((x) => x.key === m));
  if (declared.length) return declared;
  return MODELS.map((m) => m.key).filter((k) =>
    (data.results || []).some((r) => r[k] && typeof r[k] === "object"));
}

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
  /* The page's own <title>. Empty when the fetch never got far enough
     to see one — a timeout, a dead domain — which is exactly when the
     slug fallback has to carry it. */
  title?: string;
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
  model_status?: Record<string, { ok: boolean; enabled?: boolean; selected?: boolean; error?: string | null }>;
  visibility_score: number;
  gemini_score: number;
  chatgpt_score: number;
  // Named the brand, per model. The two fields above are the same thing for the
  // first two models and stay because stored runs carry them.
  model_scores?: Record<string, number>;
  /* The denominator the backend divided by, and which models actually spoke.
     A model can be in models_run and absent here: selected, called, silent. */
  answers?: number;
  models_answered?: string[];
  total_prompts: number;
  /* Named against the convention, and kept that way because stored runs and the
     Supabase columns carry these keys. `mentions_score` is the count of answers
     that name the brand AND link to it — a citation. `citations_score` is the
     count that name it with no link — a mention. The screen maps them to the
     right words; nothing else should read them without this note. */
  mentions_score: number;
  citations_score: number;
  results: AuditResult[];
  competitor_ranking: CompetitorStat[];
  /* Demand and visibility per intent cluster. Optional: a run made before the
     backend computed it has none, and the section hides rather than showing
     zeros that would read as "no demand anywhere". */
  clusters?: Cluster[];
  /* Each brand's share of every naming event in the answers. Optional: runs
     stored before it was computed have none, and the section hides rather than
     showing a share of nothing. */
  share_of_voice?: {
    total: number;
    /* null when nobody was named at all. A share of nothing is undefined, not
       zero, and the two must not render the same. */
    yours: number | null;
    brands: { name: string; mentions: number; is_your_brand: boolean; share: number | null }[];
  };
  citations: Citation[];
  sample_quote?: string;
  recommendations: string;
};

/* ── /page-check: measured from the page, not written by a model ── */

export type KeywordRow = {
  keyword: string;
  search_volume: number | null;
  /* 0-100, chance of reaching the organic top ten. Not the `ad_competition`
     that comes with search volume, which counts advertisers bidding — the two
     are routinely confused and mean different things. */
  keyword_difficulty: number | null;
  cpc: number | null;
  ad_competition: number | null;
  too_long: boolean;
};

/* One intent cluster — comparison questions, commercial questions, and so on.

   Two coverages live here and the screen must keep them apart, because they
   answer different questions and sharing a word would repeat the mistake that
   swapped mentions and citations:

     with_volume     prompts Google had a figure for, bounded by the keyword
                     API's 10-word / 80-character limits
     mention_rate    how often the brand was named, over answers received

   `unique_phrases` is smaller than `with_volume` whenever two prompts derived
   the same search phrase — the sum is over searches, not over our rows. */
export type Cluster = {
  cluster: string;
  prompts: number;
  answers: number;
  named: number;
  mention_rate: number | null;
  with_volume: number;
  unique_phrases: number;
  search_volume_avg: number | null;
  search_volume_total: number | null;
  /* Average monthly demand the brand is currently not named for. */
  missed_demand: number | null;
};

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

type ModelKey = "all" | "chatgpt" | "gemini" | "perplexity" | "deepseek" | "ai_overview" | "claude";
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
  /* The two words are not interchangeable and the industry fixed their meaning
     before we did: a MENTION is the brand named in the prose, a CITATION is the
     answer crediting your page, normally with a link. The cards used to carry
     them the other way round, which made every number we quoted a client read
     as the opposite of what the same number means in Profound or Peec. */
  mentionRateSub: (named: number, answers: number) => string;
  citationsCard: string;
  citationsCardSub: (pct: number) => string;
  mentionsNoLinkCard: string;
  mentionsNoLinkSub: (pct: number) => string;
  proOnly: string;
  proTooltip: string;
  comparedTo: string;
  seeUncovered: string;
  you: string;
  howToFix: string;
  landscapeTitle: string;
  landscapeLegend: string;
  landscapeCited: (n: number, answers: number) => string;
  landscapeBare: (n: number, answers: number) => string;
  landscapeSub: string;
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
  /* Labels only. The descriptions that used to sit under each of these are
     gone: the three areas below carry the explaining now, and a sub-label
     inside an area only has to partition it. */
  catTechnical: string;
  catContent: string;
  catKeywords: string;
  noRecsYet: string;
  /* The three things a recommendation can ask of you: change what is there,
     make something that is not, or get named somewhere you do not control.
     The five categories above still do the sorting — they are what the text is
     matched against — but they are presented inside these. */
  areaFix: string;
  areaFixDesc: string;
  areaBuild: string;
  areaBuildDesc: string;
  areaInfluence: string;
  areaInfluenceDesc: string;
  recWhy: string;
  effortEasy: string;
  effortMedium: string;
  effortHard: string;
  menuPageCheck: string;
  menuKeywords: string;
  menuFix: string;
  menuBuild: string;
  menuInfluence: string;
  infTitle: string;
  infSub: string;
  infRun: string;
  infNotChecked: (pages: number, domains: number) => string;
  infSummary: (gaps: number, present: number, total: number) => string;
  infYouHere: string;
  infRivalsNotYou: (names: string) => string;
  infTier1: string;
  infTier1Desc: string;
  infTier2: string;
  infTier2Desc: string;
  infTier3: string;
  infTier3Desc: string;
  fgTitle: string;
  fgSub: string;
  fgNotYet: string;
  fgWaiting: string;
  fgSummary: (names: string) => string;
  fgNoGaps: string;
  fgCount: (total: number, yours: number) => string;
  fgFootnote: string;
  fgNames: Record<PageFormat, string>;
  dgTitle: string;
  dgSub: string;
  dgRun: string;
  dgNotRun: (n: number, market: string) => string;
  dgSummary: (withVolume: number, total: number) => string;
  dgNoData: (market: string) => string;
  pageCheckUrlHint: string;
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
  menuProjects: string;
  menuHide: string;
  menuShow: string;
  /* The nav has its own labels. Reusing the section headings put "Sources —
     the pages AI models cite most in your category" into a 176px column, which
     wraps to three lines and stops being a menu. A heading explains; a menu
     label only has to be recognisable once you are already on the page. */
  menuScore: string;
  menuRivals: string;
  menuSov: string;
  sovTitle: string;
  sovNobody: string;
  sovDenominator: string;
  sovSub: (yours: number, total: number, brands: number) => string;
  menuCovered: string;
  menuSources: string;
  menuHistory: string;
  menuCitations: string;
  menuRecs: string;
  sourcesSummary: (n: number) => string;
  sourcesChecked: (n: number, present: number) => string;
  sourcesRun: string;
  sourcesRunning: string;
  sourcesRunningN: (n: number) => string;
  sourcesProgress: (done: number, total: number) => string;
  rivalsOnPage: (names: string) => string;
  noRivalsOnPage: string;
  pageUnreadable: string;
  citedTimes: (n: number) => string;
  openDomain: string;
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
  kwTitle: string;
  kwSub: string;
  kwLabel: string;
  kwPlaceholder: string;
  kwRun: string;
  kwRunning: string;
  kwFailed: string;
  kwColKeyword: string;
  kwFullTool: string;
  volumeDerived: string;
  volumeExact: string;
  clTitle: string;
  clSub: string;
  clNoData: string;
  clBarTitle: string;
  clNoVolume: string;
  clNamedShort: (named: number, answers: number) => string;
  clNames: Record<string, string>;
  kwColDifficulty: string;
  kwColCpc: string;
  kwDifficultyTitle: string;
  kwCpcTitle: string;
  kwTooLong: string;
  kwMarket: string;
  kwFootnote: (market: string) => string;
  volumeTitle: string;
  volumeMissing: string;
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
    mentionRateSub: (named, answers) => `named in ${named} of ${answers} answers that came back`,
    citationsCard: "Citations",
    citationsCardSub: (pct) => `named with a link to your site · ${pct}% of answers`,
    mentionsNoLinkCard: "Mentions, no link",
    mentionsNoLinkSub: (pct) => `named, but nothing links back · ${pct}% of answers`,
    proOnly: "Pro",
    proTooltip: "Available on paid plans",
    comparedTo: "Where you stand vs competitors",
    seeUncovered: "See uncovered prompts",
    you: "you",
    howToFix: "How to fix this →",
    landscapeTitle: "Competitive landscape",
    landscapeSub: "Named with a link to the site, against named with no link at all",
    landscapeLegend: "Top bar: cited with a link · bottom bar: named, no link · numbers are counts out of answers received",
    landscapeCited: (n, a) => `Cited with a link in ${n} of ${a} answers`,
    landscapeBare: (n, a) => `Named without a link in ${n} of ${a} answers`,
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
    /* It said "run another audit to try again", which blames a glitch. The
         card is empty because no model named the brand, so there was no
         sentence to quote. That is a result, not a failure. */
    whatAiSaysEmpty: "No model named you in this run, so there is no sentence to quote.",
    seeHowAccurate: "See how accurate this is →",
    /* It was "the pages AI models cite most in your category", which promised
       a ranking. This table is a different cut: one row per question, showing
       where that answer came from. The ranking is the chip list above. */
    citationsTable: "Which sources answer each question",
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
    /* The "which page" advice moved up next to the field, so this no longer
       repeats it two lines below. */
    pageCheckNotChecked: "Not checked yet.",
    backToDashboard: "Back to dashboard",
    catTechnical: "Technical",
    catContent: "Content improving",
    catKeywords: "Keywords to add",
    noRecsYet: "Nothing here from this audit.",
    areaFix: "Fix",
    areaFixDesc: "Changes to pages you already have. Cheapest to do and the fastest to show up in an answer.",
    areaBuild: "Build",
    areaBuildDesc: "Pages that do not exist yet, for questions you are losing because there is nothing to cite.",
    areaInfluence: "Influence",
    areaInfluenceDesc: "Places you do not own but models read anyway. Slowest to move and the hardest for a competitor to copy.",
    recWhy: "Why",
    effortEasy: "Easy",
    effortMedium: "Medium effort",
    effortHard: "Hard",
    menuPageCheck: "Your page",
    menuKeywords: "Keyword research",
    menuFix: "Fix",
    menuBuild: "Build",
    menuInfluence: "Influence",
    infTitle: "Where the models actually look",
    infSub: "The pages behind the answers in this audit, grouped by how much say you have over what is on them.",
    infRun: "Open these pages and check",
    infNotChecked: (pages, domains) =>
      `${pages} page${pages === 1 ? "" : "s"} across ${domains} domain${domains === 1 ? "" : "s"}. We open each one and look for your name and your competitors'.`,
    infSummary: (gaps, present, total) =>
      gaps === 0
        ? `No page we could read names a competitor without naming you. You are on ${present} of ${total}.`
        : `Competitors are named on ${gaps} page${gaps === 1 ? "" : "s"} of ${total} where you are not. You are on ${present}.`,
    infYouHere: "You are on this page already.",
    /* The sentence the whole section exists for, so it gets said
       plainly rather than reusing the overview's footnote. */
    infRivalsNotYou: (names) => `Named here: ${names}. You are not.`,
    infTier1: "Tier 1 — someone else decides",
    infTier1Desc: "Press, directories and industry sites. Slowest to move, and the hardest thing here for a competitor to copy.",
    infTier2: "Tier 2 — you can post there today",
    infTier2Desc: "Communities and platforms that need nobody's permission. Faster, and the models read them.",
    infTier3: "Tier 3 — yours already",
    infTier3Desc: "Your own pages. Nothing to influence: a model citing these is reading you directly.",
    fgTitle: "What shape of page gets quoted here",
    fgSub: "Every page a model cited in this audit, sorted into the kind of page it is. Classified from the title and the address, so the pages behind each row are shown with it.",
    fgNotYet: "Run the source check under Influence first — this reads the same pages.",
    fgWaiting: "Opening the pages…",
    fgSummary: (names) => `Models quote these formats here and nothing of yours is in them: ${names}.`,
    fgNoGaps: "You appear in every format a model quoted here.",
    fgCount: (total, yours) =>
      yours === 0
        ? `${total} page${total === 1 ? "" : "s"} cited, none of them yours`
        : `${total} page${total === 1 ? "" : "s"} cited, you are on ${yours}`,
    fgFootnote: "The shape is read from the title and the address, not from the page itself, so treat a single row as a prompt to look rather than as a verdict.",
    fgNames: {
      listicle: "Lists and roundups", comparison: "Comparisons", review: "Reviews",
      video: "Video", guide: "Guides and how-tos", discussion: "Discussion threads",
      other: "Everything else",
    },
    dgTitle: "Branded searches nobody has answered",
    dgSub: "What someone who already knows your name types next. These land on a page about you that is usually not yours, which is why they sit here and not under Build.",
    dgRun: "Look up the volumes",
    dgNotRun: (n, market) => `${n} phrases, checked against ${market}. This is a paid lookup, about ten cents.`,
    dgSummary: (withVolume, total) =>
      `${withVolume} of ${total} phrases have measurable demand behind them.`,
    dgNoData: (market) =>
      `No volume came back for any phrase in ${market}. That is a gap in the data source, not a finding about demand: Google stopped selling ads in Russia in March 2022, so Google Ads has no Russian location to report on. Treat this panel as unavailable for this market rather than as an answer.`,
    pageCheckUrlHint: "Usually the product page, not the homepage — a product competes as a page, so that is the page a model either cites or does not.",
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
    menuProjects: "← My projects",
    menuHide: "Hide the menu",
    menuShow: "Show the menu",
    menuScore: "Score",
    menuRivals: "Competitors",
    menuSov: "Share of voice",
    sovTitle: "Share of voice",
    sovSub: (yours, total, brands) =>
      `${yours} of ${total} brand mentions across the answers, among ${brands} brands named`,
    sovNobody: "No brand was named in any answer, so there is no share to divide.",
    sovDenominator: "Counted over every brand the models named — your competitors and the ones they brought up unprompted. Counting only the competitors you track would give a higher number that measured your own form rather than the market.",
    menuCovered: "Covered topics",
    menuSources: "Sources",
    menuHistory: "History",
    menuCitations: "Sources by question",
    menuRecs: "Recommendations",
    sourcesSummary: (n) => `${n} source${n === 1 ? "" : "s"} shaped these answers.`,
    sourcesChecked: (n, present) =>
      present === 0
        ? `Checked all ${n}. None of them mention you.`
        : `Checked all ${n}. ${present} mention${present === 1 ? "s" : ""} you.`,
    sourcesRun: "Check which of them mention you →",
    sourcesRunning: "Opening pages…",
    sourcesRunningN: (n) => `Opening ${n} page${n === 1 ? "" : "s"}, about ${Math.max(3, Math.round(n * 0.6))}s…`,
    sourcesProgress: (done, total) => `Checked ${done} of ${total}…`,
    rivalsOnPage: (names) => `on this page: ${names}`,
    noRivalsOnPage: "nobody from your list is on this page",
    pageUnreadable: "could not be read",
    citedTimes: (n) => `Cited ${n} time${n === 1 ? "" : "s"} across this audit`,
    openDomain: "Show the pages",
    sourcesFailed: "Could not reach the checker. Try again in a moment.",
    andMore: (n) => `+${n} more`,
    inPost: "in the post",
    inComment: "in a comment",
    ofTotal: (a, b) => `${a} of ${b}`,
    wholeBarAvailable: "the whole bar is available",
    competitorsTitle: "Prompts your competitors answer",
    competitorsSub: (n) => `${n} prompt${n === 1 ? "" : "s"} where they appear and you don't.`,
    colPrompt2: "Prompt",
    colVolume: "Google volume",
    kwTitle: "Keyword research",
    kwSub: "Demand and ranking difficulty for phrases you are considering, before deciding which to go after.",
    kwLabel: "One phrase per line",
    kwPlaceholder: "ai visibility tracking\nbrand monitoring for llms\ngeo agency",
    kwRun: "Look up",
    kwRunning: "Looking up…",
    kwFailed: "Could not look those up. Try again.",
    kwColKeyword: "Phrase",
    kwFullTool: "Open the full tool",
    volumeDerived: "This figure is for the search phrase shown, not for the prompt. Nobody types the prompt into Google.",
    volumeExact: "This figure is for the prompt itself, which was short enough to ask about.",
    clTitle: "Demand by cluster",
    clSub: "How much search demand sits behind each group of questions, relative to each other in this audit.",
    clNoData: "No volume data for this cluster. Unknown demand, which is not the same as none.",
    clBarTitle: "Relative to the busiest cluster in this audit. Based on the prompts short enough for the keyword API to answer.",
    clNoVolume: "no data",
    clNamedShort: (named, answers) => `named in ${named} of ${answers}`,
    clNames: {
      comparison: "Comparison", commercial: "Commercial", problem: "Problem",
      technical: "Technical", vertical: "Industry", tracked: "Tracked",
      custom: "Your own", other: "Other",
    },
    kwColDifficulty: "Difficulty",
    kwColCpc: "CPC",
    kwDifficultyTitle: "0-100, the chance of reaching Google's organic top ten. Not the advertiser competition that comes with search volume — a different number that is often confused with this one.",
    kwCpcTitle: "What advertisers pay per click. A rough read on how commercial the phrase is.",
    kwTooLong: "too long to look up",
    kwMarket: "Market",
    kwFootnote: (market) => `Google data for ${market}. Volume differs a lot between markets, so the figures above mean nothing without it. A dash means Google has no data for that phrase, or it was over the 10-word limit — neither is zero.`,
    volumeTitle: "Monthly Google searches for this exact phrase. Not how often an AI is asked it — nobody publishes that.",
    volumeMissing: "Either the phrase is too long for the keyword API, or Google has no data for it. Not zero.",
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
    citedDomains: "Sources the model read",
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
    mentionRateSub: (named, answers) => `вас называют в ${named} из ${answers} полученных ответов`,
    citationsCard: "Цитирования",
    citationsCardSub: (pct) => `назвали и дали ссылку на ваш сайт · ${pct}% ответов`,
    mentionsNoLinkCard: "Упоминания без ссылки",
    mentionsNoLinkSub: (pct) => `назвали, но ссылки на вас нет · ${pct}% ответов`,
    proOnly: "Pro",
    proTooltip: "Доступно на платных тарифах",
    comparedTo: "Как вы выглядите на фоне конкурентов",
    seeUncovered: "Смотреть непокрытые промпты",
    you: "вы",
    howToFix: "Как это исправить →",
    landscapeTitle: "Конкурентный ландшафт",
    landscapeSub: "Назвали со ссылкой на сайт против назвали без ссылки",
    landscapeLegend: "Верхняя полоса — со ссылкой · нижняя — без ссылки · числа это количество из полученных ответов",
    landscapeCited: (n, a) => `Со ссылкой в ${n} из ${a} ответов`,
    landscapeBare: (n, a) => `Без ссылки в ${n} из ${a} ответов`,
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
    whatAiSaysEmpty: "Ни одна модель не назвала вас в этом прогоне — цитировать нечего.",
    seeHowAccurate: "Проверить точность →",
    citationsTable: "Какие источники отвечают на каждый вопрос",
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
    pageCheckNotChecked: "Пока не проверяли.",
    backToDashboard: "Назад к дашборду",
    catTechnical: "Техническое",
    catContent: "Улучшение контента",
    catKeywords: "Ключевые слова",
    noRecsYet: "По этому прогону здесь ничего нет.",
    areaFix: "Исправить",
    areaFixDesc: "Правки на страницах, которые у вас уже есть. Дешевле всего сделать и быстрее всего видно в ответах.",
    areaBuild: "Создать",
    areaBuildDesc: "Страниц пока нет — а вопросы есть, и вы их проигрываете просто потому, что цитировать нечего.",
    areaInfluence: "Повлиять",
    areaInfluenceDesc: "Площадки, которыми вы не владеете, но модели их читают. Двигается медленнее всего и хуже всего копируется конкурентом.",
    recWhy: "Зачем",
    effortEasy: "Легко",
    effortMedium: "Средние трудозатраты",
    effortHard: "Сложно",
    menuPageCheck: "Ваша страница",
    menuKeywords: "Исследование запросов",
    menuFix: "Исправить",
    menuBuild: "Создать",
    menuInfluence: "Повлиять",
    infTitle: "Куда модели смотрят на самом деле",
    infSub: "Страницы, которые стоят за ответами в этом прогоне, сгруппированные по тому, насколько вы можете влиять на их содержимое.",
    infRun: "Открыть эти страницы и проверить",
    infNotChecked: (pages, domains) =>
      `${pages} ${ruPlural(pages, "страница", "страницы", "страниц")} на ${domains} ${ruPlural(domains, "домене", "доменах", "доменах")}. Откроем каждую и поищем ваше имя и имена конкурентов.`,
    infSummary: (gaps, present, total) =>
      gaps === 0
        ? `Ни на одной прочитанной странице конкурент не назван там, где не названы вы. Вы есть на ${present} из ${total}.`
        : `Конкурентов называют на ${gaps} ${ruPlural(gaps, "странице", "страницах", "страницах")} из ${total}, где вас нет. Вы есть на ${present}.`,
    infYouHere: "Вы на этой странице уже есть.",
    infRivalsNotYou: (names) => `Здесь названы: ${names}. Вас — нет.`,
    infTier1: "Tier 1 — решает кто-то другой",
    infTier1Desc: "СМИ, каталоги и отраслевые сайты. Двигается медленнее всего — и конкуренту это скопировать тяжелее всего.",
    infTier2: "Tier 2 — можно опубликовать самому сегодня",
    infTier2Desc: "Сообщества и площадки, где не нужно ничьё разрешение. Быстрее, и модели их читают.",
    infTier3: "Tier 3 — уже ваше",
    infTier3Desc: "Ваши собственные страницы. Влиять не на что: модель здесь читает вас напрямую.",
    fgTitle: "Какой формат страницы здесь цитируют",
    fgSub: "Каждая страница, которую модель процитировала в этом прогоне, разложенная по типу. Тип определяется по заголовку и адресу, поэтому рядом с каждой строкой показаны сами страницы.",
    fgNotYet: "Сначала запустите проверку источников в разделе «Повлиять» — здесь читаются те же страницы.",
    fgWaiting: "Открываем страницы…",
    fgSummary: (names) => `Модели цитируют здесь такие форматы, и ни в одном из них вас нет: ${names}.`,
    fgNoGaps: "Вы присутствуете в каждом формате, который здесь цитировали.",
    fgCount: (total, yours) =>
      yours === 0
        ? `Процитировано ${total} ${ruPlural(total, "страница", "страницы", "страниц")}, ваших среди них нет`
        : `Процитировано ${total} ${ruPlural(total, "страница", "страницы", "страниц")}, вы есть на ${yours}`,
    fgFootnote: "Формат определяется по заголовку и адресу, а не по самой странице, так что отдельная строка — это повод посмотреть, а не приговор.",
    fgNames: {
      listicle: "Подборки и топы", comparison: "Сравнения", review: "Отзывы",
      video: "Видео", guide: "Гайды и инструкции", discussion: "Обсуждения",
      other: "Всё остальное",
    },
    dgTitle: "Брендовые запросы, на которые никто не ответил",
    dgSub: "Что набирает человек, который уже знает ваше имя. Такие запросы приводят на страницу о вас — обычно не вашу. Поэтому они здесь, а не в «Создать».",
    dgRun: "Узнать объёмы",
    dgNotRun: (n, market) => `${n} ${ruPlural(n, "фраза", "фразы", "фраз")}, проверка по рынку ${market}. Это платный запрос, около десяти центов.`,
    dgSummary: (withVolume, total) =>
      `У ${withVolume} из ${total} фраз есть измеримый спрос.`,
    dgNoData: (market) =>
      `Ни по одной фразе объём для рынка ${market} не вернулся. Это пробел в источнике данных, а не вывод о спросе: Google прекратил продажу рекламы в России в марте 2022, поэтому у Google Ads нет российской локации. Считайте, что для этого рынка панель недоступна, а не что она ответила.`,
    pageCheckUrlHint: "Обычно это страница продукта, а не главная: продукт конкурирует именно как страница — её модель либо цитирует, либо нет.",
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
    menuProjects: "← Мои проекты",
    menuHide: "Скрыть меню",
    menuShow: "Показать меню",
    menuScore: "Оценка",
    menuRivals: "Конкуренты",
    menuSov: "Доля голоса",
    sovTitle: "Доля голоса",
    sovSub: (yours, total, brands) =>
      `${yours} из ${total} упоминаний брендов в ответах, среди ${brands} названных брендов`,
    sovNobody: "Ни один бренд не назван ни в одном ответе — делить нечего.",
    sovDenominator: "Считается по всем брендам, которые назвали модели: и ваши конкуренты, и те, кого модели принесли сами. Если считать только отслеживаемых конкурентов, цифра будет выше — но она измеряла бы вашу форму, а не рынок.",
    menuCovered: "Покрытие",
    menuSources: "Источники",
    menuHistory: "История",
    menuCitations: "По вопросам",
    menuRecs: "Рекомендации",
    sourcesSummary: (n) => `${n} источник(ов) сформировали эти ответы.`,
    sourcesChecked: (n, present) =>
      present === 0
        ? `Проверили все ${n}. Ни один вас не упоминает.`
        : `Проверили все ${n}. Вас упоминают: ${present}.`,
    sourcesRun: "Проверить, кто из них вас упоминает →",
    sourcesRunning: "Открываем страницы…",
    /* Three plural forms, and the naive "n < 5" test breaks at 21: it would
       print "21 страниц". The tens and hundreds both have to be looked at. */
    sourcesRunningN: (n) => {
      const ten = n % 10, hundred = n % 100;
      const word = ten === 1 && hundred !== 11 ? "страницу"
                 : ten >= 2 && ten <= 4 && !(hundred >= 12 && hundred <= 14) ? "страницы"
                 : "страниц";
      return `Открываем ${n} ${word}, примерно ${Math.max(3, Math.round(n * 0.6))} сек…`;
    },
    sourcesProgress: (done, total) => `Проверено ${done} из ${total}…`,
    rivalsOnPage: (names) => `на этой странице: ${names}`,
    noRivalsOnPage: "никого из вашего списка на этой странице нет",
    pageUnreadable: "не удалось прочитать",
    citedTimes: (n) => {
      const ten = n % 10, hundred = n % 100;
      const word = ten === 1 && hundred !== 11 ? "раз"
                 : ten >= 2 && ten <= 4 && !(hundred >= 12 && hundred <= 14) ? "раза"
                 : "раз";
      return `Процитирован ${n} ${word} за этот аудит`;
    },
    openDomain: "Показать страницы",
    sourcesFailed: "Не удалось связаться с проверкой. Попробуйте ещё раз.",
    andMore: (n) => `+ещё ${n}`,
    inPost: "в посте",
    inComment: "в комментарии",
    ofTotal: (a, b) => `${a} из ${b}`,
    wholeBarAvailable: "вся полоса свободна",
    competitorsTitle: "Промпты, на которые отвечают конкуренты",
    competitorsSub: (n) => `${n} промптов, где есть они и нет вас.`,
    colPrompt2: "Промпт",
    colVolume: "Частотность Google",
    kwTitle: "Подбор запросов",
    kwSub: "Спрос и сложность продвижения по фразам, которые вы рассматриваете, — до того как выбрать, за какие браться.",
    kwLabel: "По одной фразе в строке",
    kwPlaceholder: "отслеживание упоминаний в ai\nмониторинг бренда\ngeo агентство",
    kwRun: "Проверить",
    kwRunning: "Проверяем…",
    kwFailed: "Не удалось проверить. Попробуйте ещё раз.",
    kwColKeyword: "Фраза",
    kwFullTool: "Открыть полный инструмент",
    volumeDerived: "Цифра относится к показанной поисковой фразе, а не к промпту. Промпт в Google никто не набирает.",
    volumeExact: "Цифра относится к самому промпту — он оказался достаточно коротким, чтобы спросить.",
    clTitle: "Спрос по кластерам",
    clSub: "Сколько поискового спроса стоит за каждой группой вопросов — относительно друг друга внутри этого прогона.",
    clNoData: "По этому кластеру нет данных о частотности. Спрос неизвестен — это не то же самое, что его отсутствие.",
    clBarTitle: "Относительно самого крупного кластера в этом прогоне. Считается по промптам, достаточно коротким для API частотности.",
    clNoVolume: "нет данных",
    clNamedShort: (named, answers) => `назвали в ${named} из ${answers}`,
    clNames: {
      comparison: "Сравнение", commercial: "Коммерческие", problem: "Проблемные",
      technical: "Технические", vertical: "Отраслевые", tracked: "Отслеживаемые",
      custom: "Свои", other: "Прочие",
    },
    kwColDifficulty: "Сложность",
    kwColCpc: "CPC",
    kwDifficultyTitle: "0-100, шанс попасть в органический топ-10 Google. Это не «конкуренция», которая приходит вместе с частотностью: та считает рекламодателей, и её постоянно путают с этой.",
    kwCpcTitle: "Сколько рекламодатели платят за клик. Грубая оценка того, насколько фраза коммерческая.",
    kwTooLong: "слишком длинная",
    kwMarket: "Рынок",
    kwFootnote: (market) => `Данные Google по рынку: ${market}. Частотность сильно различается между рынками, так что цифры выше без него ничего не значат. Прочерк значит, что у Google нет данных по фразе или она длиннее 10 слов, — и то и другое не ноль.`,
    volumeTitle: "Сколько раз в месяц эту фразу ищут в Google. Не то же, сколько раз её спрашивают у AI — таких данных не публикует никто.",
    volumeMissing: "Либо фраза слишком длинная для API частотности, либо у Google нет по ней данных. Это не ноль.",
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
    citedDomains: "Источники, на которые опирался ответ",
    noAnswerCaptured: "Эта модель не вернула ответ на этот промпт.",
    youAppear: "Вы есть в ответе",
    youDontAppear: "Вас нет в ответе",
    runProvenance: (model, date) => `${model} API · ${date}`,
    responseHeading: "Ответ модели",
  },
} as const;

/* Every tab the dashboard can show. Whether one is selectable comes from the
   run, not from this list — see ModelSwitcher. The last two have no backend
   behind them yet and so are never in `ran`, which is what greys them out. */
const MODEL_TABS: { key: ModelKey; label: string }[] = [
  { key: "all", label: "All models" },
  ...MODELS.map((m) => ({ key: m.key as ModelKey, label: m.label })),
  { key: "claude", label: "Claude" },
];

function categorize(text: string): "mentions" | "technical" | "content" | "authority" | "keywords" {
  const t = text.toLowerCase();
  if (/keyword/.test(t)) return "keywords";
  if (/schema|robots\.txt|sitemap|llms\.txt|crawl|meta tag|structured data|page speed|indexing|technical/.test(t)) return "technical";
  if (/topical authority|pillar page|comprehensive guide|content cluster|topic cluster/.test(t)) return "authority";
  if (/backlink|press|directory|review site|reddit|forum|off-page|listing|wikipedia|third-party/.test(t)) return "mentions";
  return "content";
}

/* ── What kind of page a model cited ──

   Not every format gets quoted equally. A listicle naming ten products is
   answering the question a model was asked; a press release is not. So the
   useful gap is not "we have no video", it is "every page a model reads for
   this question is a listicle, and you are in none of them".

   Classified from the host, the path and the title, in that order of
   confidence, and the order of the tests matters: "10 лучших систем:
   сравнение" is a listicle that mentions comparing, not a comparison.

   Honest about its own limits — a heuristic on a title cannot be sure, which
   is why the finding is always shown with the pages it was derived from. */
type PageFormat = "listicle" | "comparison" | "review" | "video" | "guide" | "discussion" | "other";

/* Hosts where the host IS the format. Deliberately short: vc.ru and habr.com
   are not here, because they carry articles of every shape and classifying
   them by host would file a comparison review as a discussion. */
const FORMAT_HOSTS: [string, PageFormat][] = [
  ["youtube.com", "video"], ["youtu.be", "video"], ["rutube.ru", "video"], ["vimeo.com", "video"],
  ["otzovik.com", "review"], ["irecommend.ru", "review"], ["g2.com", "review"],
  ["capterra.com", "review"], ["trustpilot.com", "review"], ["startpack.ru", "review"],
  ["reddit.com", "discussion"], ["quora.com", "discussion"], ["stackoverflow.com", "discussion"],
];

/* `\b` in JavaScript is defined on [A-Za-z0-9_], so `\bотзыв\b` matches
   nothing: the edge between a Cyrillic letter and a space is not a word
   boundary by that definition. Every Russian pattern written that way is dead
   on arrival — and silently, since a dead pattern just files the page under
   "everything else". For an audit in Russian that would have been the whole
   panel. Boundaries are spelled out with \p{L} instead.

   STEM carries a leading boundary only, because Russian inflects and the
   ending is the part that varies: "сравнени" has to reach сравнение,
   сравнения and сравнению. WORD closes both ends, for short English words
   that otherwise appear inside longer ones — "vs" inside "Versatile". */
const STEM = (alts: string) => new RegExp(`(^|[^\\p{L}])(${alts})`, "iu");
const WORD = (alts: string) => new RegExp(`(^|[^\\p{L}])(${alts})(?![\\p{L}])`, "iu");

const FORMAT_WORDS: [RegExp, PageFormat][] = [
  /* A count is the strongest signal there is, and the one she found by hand:
     competitors sat in four listicles out of four. Counted only where it is
     actually a list — at the start of the title, or next to a top/лучшие
     marker. "на 2 млн клиентов" is a number in a sentence, not a listicle. */
  [/^\s*(top\s+|топ[\s-]*)?\d{1,2}\s+\p{L}/iu, "listicle"],
  [/(^|[^\p{L}])(top|топ)[\s-]*\d{1,2}(?![\d])/iu, "listicle"],
  [/\d{1,2}\s+(лучш|best)/iu, "listicle"],
  [STEM("подборка|подборки|рейтинг\\s*\\d"), "listicle"],

  [WORD("vs|versus"), "comparison"],
  [STEM("сравнени|сравнить|сравнива|сопоставл|альтернатив|comparison|compared|alternative"), "comparison"],

  [STEM("отзыв|рецензи|рейтинг|review"), "review"],

  [WORD("как|how"), "guide"],
  [STEM("how[-\\s]to|guide|гайд|инструкц|пошагов|чек[-\\s]?лист|checklist|tutorial"), "guide"],

  [STEM("forum|форум|обсужден|thread"), "discussion"],
];

function formatOf(url: string, title: string): PageFormat {
  let host = "", path = "";
  try {
    const u = new URL(url);
    host = u.hostname.replace(/^www\./, "").toLowerCase();
    path = decodeURIComponent(u.pathname).toLowerCase();
  } catch { /* a malformed URL still has a title */ }

  const byHost = FORMAT_HOSTS.find(([h]) => host === h || host.endsWith(`.${h}`));
  if (byHost) return byHost[1];

  // Title first, path second: a slug is abbreviated and a title is written for
  // a reader, which is also what the model read.
  const haystack = `${title} ${path.replace(/[-_/]+/g, " ")}`;
  for (const [re, fmt] of FORMAT_WORDS) if (re.test(haystack)) return fmt;
  return "other";
}

/* Russian has three plural forms and the naive `n < 5` test breaks at 21 —
   it ships "21 страниц". Both the tens and the hundreds have to be looked at,
   because 11–14 are the exception to the rule the tens digit implies. */
const ruPlural = (n: number, one: string, few: string, many: string) => {
  const ten = n % 10, hundred = n % 100;
  if (ten === 1 && hundred !== 11) return one;
  if (ten >= 2 && ten <= 4 && !(hundred >= 12 && hundred <= 14)) return few;
  return many;
};

/* ── Where a cited page sits, and therefore what you can do about it ──

   Three tiers, and the line between them is who decides what goes on the page:

     1  someone else's editorial call — press, directories, industry sites.
        Slowest to move and the hardest for a competitor to copy.
     2  you can publish there today without anyone's permission.
     3  your own domain. Nothing to influence; the model already reads you.

   The membership test for tier 2 is that second sentence, which is why social
   networks are in it and a trade magazine is not. The list is explicit rather
   than clever: a heuristic on "forum" in the hostname would put every
   `forum.vendor.com` support site in the wrong tier. */
const TIER2_HOSTS = [
  "reddit.com", "quora.com", "youtube.com", "youtu.be", "medium.com",
  "substack.com", "stackoverflow.com", "stackexchange.com", "github.com",
  "linkedin.com", "facebook.com", "instagram.com", "tiktok.com",
  "x.com", "twitter.com", "t.me", "telegram.me",
  // RU equivalents, because the market a run is scored in is usually RU here.
  "habr.com", "vc.ru", "dzen.ru", "pikabu.ru", "livejournal.com",
  "vk.com", "ok.ru", "dtf.ru", "yaplakal.com", "otzovik.com", "irecommend.ru",
];

function tierOf(domain: string, brandDomain: string): 1 | 2 | 3 {
  const d = domain.replace(/^www\./, "").toLowerCase();
  const mine = (brandDomain || "").replace(/^www\./, "").toLowerCase();
  // Subdomains count as yours: docs.acme.com is still a page you control.
  if (mine && (d === mine || d.endsWith(`.${mine}`))) return 3;
  if (TIER2_HOSTS.some((h) => d === h || d.endsWith(`.${h}`))) return 2;
  return 1;
}

/* The model is asked for four labelled fields per recommendation. Until now
   only PRIORITY was pulled out and the rest was printed as it arrived, so a
   recommendation read as a wall with "ACTION:" and "WHY:" buried inside it.

   Parsing is deliberately forgiving. The labels come back bolded some runs and
   bare others, a field sometimes wraps onto the next line, and occasionally the
   format is ignored altogether — in which case the whole block is the action,
   which is still the useful half. */
/* Asterisks are allowed on both sides of the colon. The model bolds these as
   `**ACTION:**` — the stars sit after the colon, not around the word — so a
   pattern that only expected `**ACTION**:` left a `**` at the front of every
   bolded line. Values get the same treatment, because a bolded value is the
   next thing it does. */
const REC_FIELD = /^\s*\**\s*(PRIORITY|ACTION|WHY|EFFORT)\s*\**\s*:\s*\**\s*/i;
const unbold = (s: string) => s.replace(/\*\*/g, "").trim();

type ParsedRec = { priority: string; action: string; why: string; effort: string };

function parseRec(raw: string, t: Strings): ParsedRec {
  const f: Record<string, string> = {};
  let current = "";
  for (const line of raw.split("\n")) {
    const m = line.match(REC_FIELD);
    if (m) {
      current = m[1].toUpperCase();
      f[current] = line.slice(m[0].length).trim();
      continue;
    }
    const rest = line.trim();
    if (!rest) continue;
    // A wrapped field belongs to the label above it; text before any label at
    // all is the model answering in prose, which is an action by default.
    const target = current || "ACTION";
    f[target] = `${f[target] || ""} ${rest}`.trim();
  }

  const pick = (value: string, map: Record<string, string>, fallback: string) => {
    const key = (value || "").toLowerCase();
    for (const [needle, label] of Object.entries(map)) {
      if (key.includes(needle)) return label;
    }
    return fallback;
  };

  return {
    priority: pick(f.PRIORITY, { high: t.high, medium: t.medium, low: t.low }, t.low),
    action: unbold(f.ACTION || raw),
    why: unbold(f.WHY || ""),
    // No effort stated is left blank rather than guessed — an invented "Easy"
    // is the kind of number that gets planned around.
    effort: pick(f.EFFORT, { easy: t.effortEasy, hard: t.effortHard, medium: t.effortMedium }, ""),
  };
}

/* ────────────────────────────────────────────────────────────────
   Small building blocks
   ──────────────────────────────────────────────────────────────── */

/* One nav, two screens. The overview had this inline and the recommendations
   page — the longer of the two — had no way to move around it at all. */
type NavItem =
  | { kind: "anchor"; id: string; label: string }
  | { kind: "link"; href: string; label: string };

function SideNav({ items, open, toggle, t, onProjects }: {
  items: NavItem[]; open: boolean; toggle: () => void; t: Strings; onProjects?: () => void;
}) {
  return (
    /* Hidden below lg — at phone width a fixed column would eat the page it is
       meant to help you read. */
    <nav className={`hidden shrink-0 lg:block ${open ? "w-44" : "w-8"}`}>
      <div className="sticky top-24 space-y-0.5">
        {/* Three lines, always in the same spot whether the nav is open or
            shut, so closing it does not make the way back disappear. */}
        <button
          onClick={toggle}
          aria-expanded={open}
          aria-label={open ? t.menuHide : t.menuShow}
          title={open ? t.menuHide : t.menuShow}
          className="mb-2 flex h-7 w-8 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900"
        >
          <span className="flex flex-col gap-[3px]">
            <span className="block h-[1.5px] w-3.5 rounded bg-current" />
            <span className="block h-[1.5px] w-3.5 rounded bg-current" />
            <span className="block h-[1.5px] w-3.5 rounded bg-current" />
          </span>
        </button>

        {open && onProjects && (
          <>
            <button
              onClick={onProjects}
              className="block w-full rounded-lg px-3 py-1.5 text-left text-xs font-medium text-neutral-900 hover:bg-neutral-100"
            >
              {t.menuProjects}
            </button>
            <div className="!my-2 border-t border-neutral-100" />
          </>
        )}

        {open && items.map((item) => (
          <a
            key={item.kind === "anchor" ? item.id : item.href}
            href={item.kind === "anchor" ? `#${item.id}` : item.href}
            className="block rounded-lg px-3 py-1.5 text-xs text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
          >
            {item.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

function ModelSwitcher({ tab, setTab, t, ran }: { tab: ModelKey; setTab: (m: ModelKey) => void; t: Strings; ran: ModelName[] }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl border border-neutral-150 bg-neutral-50/60 p-1">
      {MODEL_TABS.map((m) => {
        const active = tab === m.key;
        // Availability follows the run, not a constant. A model the backend has
        // started running would otherwise still show as locked.
        const available = m.key === "all" || ran.includes(m.key as ModelName);
        if (!available) {
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
/* Model names stay in Latin script — they are product names, and a transliterated
   "Джемини" would be harder to recognise, not easier. */
const MODEL_RU = (key: string) =>
  MODELS.find((m) => m.key === key)?.label ?? (key === "ai_overview" ? "AI Overview" : key);

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
      const names = missing.map((m) => FIELD_RU[m] || m);
      // Собранная через «но» фраза держится только на противопоставлении: при
      // нуле в теле «встречается 0 раз, но отсутствует в title» противопоставляет
      // отсутствие отсутствию. Ноль — отдельная формулировка.
      const found =
        n > 0
          ? `«${x.term}» встречается в тексте ${n} ${plural(n, "раз", "раза", "раз")}, но отсутствует в ${names.join(", ")}.`
          : missing.length === 3
            ? `«${x.term}» не встречается на странице нигде — ни в title, ни в H1, ни в meta description, ни в тексте.`
            : `«${x.term}» отсутствует в ${names.join(" и ")} и не встречается в тексте.`;
      return {
        title: "Страница не объявляет категорию, в которой конкурирует",
        found,
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
               ((): string => {
                 /* The pairing of a blocked crawler with that model's own
                    figure. Built from the numbers, not translated. */
                 const e = x.evidence as unknown as {
                   blocked_model: string; blocked_named: number; blocked_answers: number;
                   allowed_model: string; allowed_named: number; allowed_answers: number;
                 } | undefined;
                 if (!e || !e.blocked_model) return "";
                 return `По этому прогону ${MODEL_RU(e.blocked_model)} называет вас в ${e.blocked_named} из ${e.blocked_answers}, а ${MODEL_RU(e.allowed_model)} — в ${e.allowed_named} из ${e.allowed_answers}, и её краулер вы пускаете. `;
               })() +
               (unnamed ? `У ${unnamed} ${plural(unnamed, "краулера", "краулеров", "краулеров")} нет собственных правил, они попадают под общую группу. ` : "") +
               (x.has_sitemap ? "" : "Sitemap не объявлен."),
        why: "Заблокированный краулер не лечится никаким контентом — это единственная поломка, из-за которой всё остальное бессмысленно. Краулеры без своих правил не заблокированы, так что само по себе это не срочно: важно, что общая группа писалась под поисковики и может закрывать пути по причинам, которые уже неактуальны.",
      };
    }
    case "js_rendered": {
      /* Rebuilt from the figures rather than translated from the English
         sentence: the backend writes one, and a second one here that has to
         stay in step with it is a sentence that eventually will not. */
      const models = (x.models as unknown as Record<string, { named: number; answers: number }> | undefined) || {};
      const keys = Object.keys(models).filter((k) => models[k].answers > 0);
      let spread = "";
      if (keys.length >= 2) {
        const rate = (k: string) => models[k].named / models[k].answers;
        const ranked = [...keys].sort((a, b) => rate(a) - rate(b));
        const worst = ranked[0], best = ranked[ranked.length - 1];
        if (rate(worst) < rate(best)) {
          spread = ` По этому прогону ${MODEL_RU(worst)} называет вас в ${models[worst].named} из ${models[worst].answers}, а ${MODEL_RU(best)} — в ${models[best].named} из ${models[best].answers}. Это та самая картина, которую даёт такой рендеринг: модели по-разному читают страницу — кто-то выполняет JavaScript, кто-то нет.`;
        }
      }
      return {
        title: "Пока не выполнится JavaScript, на странице почти нет текста",
        found: `В самом HTML только ${Number(x.body_chars) || 0} символов текста.` + spread,
        why: "Большинство краулеров, которые питают ассистентов, не выполняют JavaScript и видят пустую страницу. Пока это так, ничто другое из списка не поможет.",
      };
    }
    case "indexable": {
      const noindex = Boolean(x.noindex);
      const canonical = String(x.canonical || "");
      const where = [x.in_meta ? '<meta name="robots">' : "", x.in_header ? "заголовке X-Robots-Tag" : ""].filter(Boolean);
      const parts = [
        noindex ? `Страница просит не индексировать себя — в ${where.join(" и ")}.` : "",
        canonical ? `Её canonical указывает на ${canonical}, а не на саму себя.` : "",
      ].filter(Boolean);
      return {
        title: noindex ? "Страница просит не индексировать себя" : "Страница говорит, что настоящая — другая",
        found: parts.join(" "),
        why: noindex
          ? "Ассистенты достают ответы из индексов, построенных ровно на этих сигналах, так что страница с таким тегом участвует либо как копия, либо никак. И ломается это молча: в браузере страница выглядит безупречно."
          : "Canonical передаёт зачёт той странице, которую называет. Если так и задумано — проверять и улучшать надо именно её. Если это осталось от шаблона — эта страница работает на чужой адрес.",
      };
    }
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
  "robots directive": '<meta name="robots"> / заголовок X-Robots-Tag',
  canonical: '<link rel="canonical">',
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

/* The sources the model read, under the answer it wrote.

   The backend appends these to the answer text as a "Sources:" block and used to
   strip them again on the way out, leaving only the CITED chips — which say
   whether your own domain turned up, not which pages the model was reading. For
   working out why a competitor was named and you were not, the pages are the
   whole answer, so they are shown as links. `sources` carries the URLs;
   `cited_domains` is the fallback for audits saved before it existed, and those
   stay as plain chips because a domain has no page to open. */
function SourceList({ info, label }: { info: ModelMentionInfo; label: string }) {
  const urls = info.sources || [];
  if (urls.length > 0) {
    return (
      <div className="mt-2">
        <span className="text-[10px] uppercase tracking-wide text-neutral-400">{label}</span>
        <ol className="mt-1 space-y-0.5">
          {urls.map((u, i) => {
            // Host and path separately: several sources often share a domain, and
            // "capterra.com" four times over says nothing about which page was read.
            let host = u, path = "";
            try {
              const p = new URL(u);
              host = p.hostname.replace(/^www\./, "");
              path = decodeURIComponent(p.pathname).replace(/\/$/, "");
            } catch { /* unparseable: show it raw rather than hide it */ }
            return (
              <li key={`${u}-${i}`} className="flex gap-1.5 text-[10px] leading-snug">
                <span className="w-3 shrink-0 text-right text-neutral-400">{i + 1}</span>
                <a href={u} target="_blank" rel="noopener noreferrer"
                   className="min-w-0 truncate underline decoration-neutral-300 hover:decoration-neutral-500"
                   title={u}>
                  <span className="text-neutral-700">{host}</span>
                  {path && <span className="text-neutral-400">{path}</span>}
                </a>
              </li>
            );
          })}
        </ol>
      </div>
    );
  }
  const domains = info.cited_domains || [];
  if (domains.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wide text-neutral-400">{label}</span>
      {domains.map((d) => (
        <span key={d} className="rounded-full border border-neutral-200 px-2 py-0.5 text-[10px] text-neutral-600">{d}</span>
      ))}
    </div>
  );
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
/* Cut at the end of a sentence. Never inside one.

   `slice(0, 160)` lands wherever it lands, which is how the quote card showed
   "Set Loyalty — po…" — two letters of a word, mid-clause.

   So whole sentences are taken while they fit. If even the first one does not
   fit, it is kept whole anyway and the limit gives way: half a sentence is not
   a shorter excerpt, it is a broken one.

   HARD_MAX is the one exception. A model that answers in a single 900-character
   sentence would otherwise fill the card, and at that length the text has
   stopped being a quote. There the cut falls back to a word boundary, which is
   still never mid-word.

   The ellipsis is added only when something was actually left behind. */
const HARD_MAX_FACTOR = 2.5;

function clip(text: string, limit: number): string {
  if (text.length <= limit) return text;

  // Split after terminal punctuation, keeping it with its sentence.
  const parts = text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [text];

  /* No exception for the first part. Letting it in unconditionally — which
     `out && ...` did — meant `out` was never empty, the branch below never ran,
     and a single 300-character sentence was returned in full against a limit of
     100. */
  let out = "";
  for (const part of parts) {
    if ((out + part).trim().length > limit) break;
    out += part;
  }
  out = out.trim();

  // Nothing fit: keep the first sentence whole, unless it is so long that it
  // is no longer a quote.
  if (!out) {
    const first = parts[0].trim();
    if (first.length <= limit * HARD_MAX_FACTOR) return first;
    const head = first.slice(0, limit);
    const space = head.lastIndexOf(" ");
    const cut = space > limit / 2 ? head.slice(0, space) : head;
    return cut.replace(/[\s,;:\u2014-]+$/, "") + "\u2026";
  }

  return out === text.trim() ? out : out + " \u2026";
}

/* A readable name for a page we could not read.

   A McKinsey link is 120 characters of slug and tracking parameters and tells
   the reader nothing. The last path segment usually carries the headline the
   publisher wrote — "members-only-delivering-greater-value-through-loyalty-and-
   pricing" — so it is unhyphenated and given a capital. Crude, and still far
   better than the raw path.

   Returns "" when the slug is not words: an id, a date, a bare domain. A made-up
   title is worse than none, and the caller falls back to the path. */
function titleFromSlug(url: string): string {
  let last = "";
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    last = parts[parts.length - 1] || "";
  } catch { return ""; }
  last = last.replace(/\.(html?|php|aspx?)$/i, "");
  if (!/[a-z\u0430-\u044f]/i.test(last)) return "";       // ids and dates, not words
  // Publishers prefix the slug with the post id — vc.ru gives
  // "2521314-top-10-programm". The number is for their database, not the reader.
  const words = last.replace(/^\d+[-_]+/, "").replace(/[-_]+/g, " ").trim();
  if (words.length < 8 || !words.includes(" ")) return ""; // one token is not a title
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function excerptToNodes(text: string, limit = 150): React.ReactNode[] {
  const cleaned = text
    .replace(/^[-*]\s+/gm, "")        // bullet markers at line start
    .replace(/\s+/g, " ")
    // Headings are matched after collapsing newlines, so a "###" that ended up
    // mid-sentence gets removed too rather than showing as literal hashes.
    .replace(/#{1,6}\s+/g, "")
    .replace(/`+/g, "")
    .trim();
  const clipped = clip(cleaned, limit);

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
  const ran = useMemo(() => modelsIn(data), [data]);

  const rows = useMemo(() => {
    return data.results
      .map((r) => {
        const models = ran.map((k) => infoFor(r, k));
        const youHere = models.some((m) => m.mentioned);
        const rivals = Array.from(new Set(models.flatMap((m) => m.competitors_found || [])));
        // Names the models brought up that nobody asked us to track. Often the
        // more useful finding, so they are shown but kept visually apart.
        const found = Array.from(new Set(models.flatMap((m) => m.discovered_brands || [])));
        // The sources have to come from whichever model's answer is on screen,
        // not from a merge of both — otherwise the list cites pages that the
        // answer above it was not written from.
        const shown = r.chatgpt.answer ? r.chatgpt : r.gemini.answer ? r.gemini : null;
        const answer = shown?.answer || "";
        return { prompt: r.prompt, rivals, found, answer, info: shown, youHere,
                 searchVolume: r.search_volume,
                 keywordPhrase: r.keyword_phrase,
                 keywordSource: r.keyword_source };
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
      const models = ran.map((k) => infoFor(hit, k));
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
                    {/* Google search volume for this exact phrase, when there is
                        any. Absent means one of two things — the phrase is too
                        long for the API to accept, or Google has no data — and
                        neither is zero, so the dash stays rather than a number
                        that would claim nobody searches it. */}
                    {typeof r.searchVolume === "number" ? (
                      <span className="text-xs text-neutral-700" title={t.volumeTitle}>
                        {r.searchVolume.toLocaleString(lang === "ru" ? "ru-RU" : "en-US")}
                        {/* The phrase, every time there is a number. Without it
                            the column claims people type the prompt, and for a
                            derived row that is simply false. */}
                        {r.keywordPhrase && (
                          <span className="mt-0.5 block text-[10px] leading-tight text-neutral-400"
                                title={r.keywordSource === "derived" ? t.volumeDerived : t.volumeExact}>
                            {r.keywordPhrase}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-xs text-neutral-300" title={t.volumeMissing}>{t.noVolume}</span>
                    )}
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
                      {r.info && <SourceList info={r.info} label={t.citedDomains} />}
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
/* The source check used to live inside SourceGap, which was fine while the
   overview was the only screen that wanted it. Influence wants the same
   verdicts, and running the same 10–25 page fetches a second time would be
   both slow and, for the pages behind a rate limit, differently wrong. So one
   run, held above both, shared by reference. */
type SourceChecks = {
  domains: { domain: string; urls: string[]; count: number }[];
  urlCount: number;
  checks: SourceCheck[] | null;
  loading: boolean;
  failed: boolean;
  run: () => Promise<void>;
};

function useSourceChecks(data: AuditData): SourceChecks {
  const [checks, setChecks] = useState<SourceCheck[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

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

  const urlCount = useMemo(() => domains.reduce((n, d) => n + d.urls.length, 0), [domains]);

  /* Sent in small batches, all in flight at once, with the results appended as
     each lands. One request for everything took five seconds behind a greyed
     out label, which reads as a hang; this way the screen moves while the rest
     is still running.

     Parallel rather than sequential on purpose — sequential batches would show
     progress and be slower overall, which is a bad trade. Total time stays the
     slowest batch. */
  const BATCH = 3;

  const run = async () => {
    // Guarded, because two screens can now reach the same button.
    if (loading || checks) return;
    const urls = domains.flatMap((d) => d.urls);
    setLoading(true);
    setFailed(false);
    setChecks([]);

    const batches: string[][] = [];
    for (let i = 0; i < urls.length; i += BATCH) batches.push(urls.slice(i, i + BATCH));

    const body = {
      brand: data.brand,
      brand_domain: data.brand_domain || "",
      competitors: data.competitor_ranking.filter((c) => !c.is_your_brand).map((c) => c.name),
    };

    const settled = await Promise.allSettled(batches.map(async (batch) => {
      const res = await apiFetch(`${API_URL}/source-gap`, {
        method: "POST",
        body: JSON.stringify({ ...body, urls: batch }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      setChecks((prev) => [...(prev || []), ...(json.results || [])]);
      return json.results || [];
    }));

    // A batch that failed must not look like pages that came back clean. If
    // every one failed there is nothing on screen, so say so; if some worked,
    // the rows that arrived are real and the rest simply have no verdict.
    if (settled.every((r) => r.status === "rejected")) {
      setChecks(null);
      setFailed(true);
    }
    setLoading(false);
  };

  return { domains, urlCount, checks, loading, failed, run };
}

function SourceGap({ src, t }: { src: SourceChecks; t: Strings }) {
  const { domains, urlCount, checks, loading, failed, run } = src;
  const [expanded, setExpanded] = useState(false);
  /* Which domain's pages are open. A domain is a bundle: mindbox.ru 4x is
     four different pages, and which page the model read is the thing worth
     seeing. The URLs were already here, folded away. */
  const [openDomain, setOpenDomain] = useState<string | null>(null);

  /* Opening the list is this screen's business, not the shared run's: the
     recommendations screen shares the verdicts and has no chips to expand. */
  const startRun = () => { setExpanded(true); return run(); };

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

  /* Expanded once checked, whichever screen did the checking — the chips are
     only worth collapsing while they all still say the same nothing. */
  const visible = expanded || checks ? domains : domains.slice(0, 3);

  return (
    <div className="mb-6 rounded-2xl border border-neutral-150 bg-neutral-50/50 p-6">
      <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">{t.sourcesTitle}</p>
      <p className="mt-1.5 text-xs text-neutral-500">
        {/* While batches are still landing this says how far it has got.
            "Checked all 10" the moment the first three return would be a
            claim about pages nobody has opened yet. */}
        {loading && checks
          ? t.sourcesProgress(checks.length, urlCount)
          : checks
            ? t.sourcesChecked(domains.length, presentCount)
            : t.sourcesSummary(domains.length)}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {visible.map((d) => {
          const st = statusFor(d.domain);
          return (
            <button
              key={d.domain}
              onClick={() => setOpenDomain(openDomain === d.domain ? null : d.domain)}
              title={st?.reason || t.openDomain}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] hover:border-neutral-400 ${
                openDomain === d.domain ? "border-neutral-400 bg-white" : ""
              } ${
                st?.status === "present"
                  ? "border-neutral-900 text-neutral-900"
                  : "border-neutral-200 text-neutral-500"
              }`}
            >
              {d.domain}
              <b className="font-medium text-neutral-900" title={t.citedTimes(d.count)}>{d.count}×</b>
              {st?.status === "present" && (
                <span className="text-[10px] text-neutral-500">
                  {st.foundIn === "comment" ? t.inComment : t.inPost}
                </span>
              )}
              {st?.status === "unreadable" && <span className="text-[10px] text-neutral-300">?</span>}
            </button>
          );
        })}
        {!expanded && domains.length > 3 && (
          <button onClick={() => setExpanded(true)} className="rounded-full border border-neutral-200 px-2.5 py-1 text-[11px] text-neutral-500 hover:text-neutral-900">
            {t.andMore(domains.length - 3)}
          </button>
        )}
      </div>

      {/* The pages behind one domain. Same shape as the Sources list under an
          answer — host, then path in lighter type — so a link reads the same
          way wherever it appears in the product.

          `competitors_on_page` has been coming back from the check all along
          and was never shown. It is the most useful thing here: not "you are
          missing from this domain" but "here is the page, and here is who is
          on it instead". */}
      {openDomain && (
        <div className="mt-3 space-y-2.5 border-t border-neutral-150 pt-3">
          {(domains.find((d) => d.domain === openDomain)?.urls || []).map((url) => {
            const check = (checks || []).find((c) => c.url === url);
            const rivals = check?.competitors_on_page || [];
            let path = url;
            try { path = new URL(url).pathname + new URL(url).search; } catch { /* keep raw */ }
            return (
              <div key={url}>
                {/* One line per page. A McKinsey URL is 120 characters of
                    tracking parameters and wrapped to three lines, which turned
                    a list of ten pages into a wall; the full address is still
                    in the title and one click away. */}
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={url}
                  className="flex items-baseline gap-1.5 text-[11px] hover:underline"
                >
                  <span className="shrink-0 text-neutral-500">{openDomain}</span>
                  {/* The page's name, not its address. The real title when the
                      check could read the page, the slug when it could not, and
                      the path when the slug is an id rather than words. */}
                  <span className="truncate text-neutral-800">
                    {check?.title || titleFromSlug(url) || path}
                  </span>
                </a>
                {/* Why there is no verdict, or who is on the page. Kept, because
                    "we could not read this" is a different answer from "you are
                    not on it" — but set below the link and in lighter type,
                    since it is a footnote to the address, not a second heading.
                    It read as competing with the link before. */}
                {check && (
                  <p className="mt-0.5 text-[10px] leading-tight text-neutral-300">
                    {check.status === "unreadable"
                      ? (check.reason || t.pageUnreadable)
                      : rivals.length
                        ? t.rivalsOnPage(rivals.join(", "))
                        : t.noRivalsOnPage}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!checks && (
        <button onClick={startRun} disabled={loading} className="mt-4 text-xs text-neutral-500 hover:text-neutral-900 disabled:opacity-50">
          {/* The count and a rough wait. Five seconds of a greyed-out 11px label
              that only says "opening pages" reads as a hang. */}
          {loading ? t.sourcesRunningN(urlCount) : t.sourcesRun}
        </button>
      )}
      {failed && <p className="mt-3 text-xs text-neutral-400">{t.sourcesFailed}</p>}
    </div>
  );
}

/* ── Influence: the measured half of the off-page story ──

   Same verdicts as the overview's chips, read the other way round. There the
   question is "which domains do models lean on"; here it is "which of those
   pages names a competitor and not you, and what could you do about it".

   Nothing new is fetched. The run is shared, so whichever screen starts it,
   both have the answer. */
function InfluenceSources({ src, data, t }: { src: SourceChecks; data: AuditData; t: Strings }) {
  const { domains, urlCount, checks, loading, failed, run } = src;

  const tiers = useMemo(() => {
    const rows = (checks || []).map((c) => ({
      ...c,
      tier: tierOf(c.domain, data.brand_domain || ""),
      /* The sharp gap first: a page a model reads, with a competitor on it and
         not you. Then pages with nobody on them, then the ones you already
         hold, then the ones we could not read — "no verdict" is not a finding
         and should not sit above one. */
      rank: c.status === "unreadable" ? 3
        : c.status === "present" ? 2
          : c.competitors_on_page.length ? 0 : 1,
    }));
    return [1, 2, 3].map((tier) => ({
      tier: tier as 1 | 2 | 3,
      rows: rows.filter((r) => r.tier === tier).sort((a, b) =>
        a.rank - b.rank || b.competitors_on_page.length - a.competitors_on_page.length),
    })).filter((g) => g.rows.length > 0);
  }, [checks, data.brand_domain]);

  const gaps = (checks || []).filter((c) => c.status === "absent" && c.competitors_on_page.length).length;
  const present = (checks || []).filter((c) => c.status === "present").length;

  if (domains.length === 0) return null;

  const labels: Record<1 | 2 | 3, { name: string; desc: string }> = {
    1: { name: t.infTier1, desc: t.infTier1Desc },
    2: { name: t.infTier2, desc: t.infTier2Desc },
    3: { name: t.infTier3, desc: t.infTier3Desc },
  };

  return (
    <div className="mt-5 rounded-2xl border border-neutral-150 bg-neutral-50/60 p-6">
      <h3 className="text-sm font-semibold">{t.infTitle}</h3>
      <p className="mt-1 max-w-2xl text-sm text-neutral-500">{t.infSub}</p>

      {!checks && !loading && (
        <>
          <p className="mt-3 text-xs text-neutral-400">{t.infNotChecked(urlCount, domains.length)}</p>
          <button onClick={run} className="mt-3 rounded-lg bg-neutral-900 px-4 py-2 text-xs font-medium text-white hover:bg-neutral-800">
            {t.infRun}
          </button>
        </>
      )}
      {loading && (
        <p className="mt-3 text-xs text-neutral-400">
          {checks ? t.sourcesProgress(checks.length, urlCount) : t.sourcesRunningN(urlCount)}
        </p>
      )}
      {failed && <p className="mt-3 text-xs text-neutral-400">{t.sourcesFailed}</p>}

      {/* The one line worth reading if you read nothing else here. Held back
          until the run is done: a count of gaps out of three pages checked so
          far is a different, smaller claim than the same count out of twenty. */}
      {checks && !loading && checks.length > 0 && (
        <p className="mt-4 max-w-2xl text-sm text-neutral-900">{t.infSummary(gaps, present, checks.length)}</p>
      )}

      {checks && checks.length > 0 && (
        <div className="mt-5 space-y-6">
          {tiers.map((g) => (
            <div key={g.tier}>
              <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">{labels[g.tier].name}</p>
              <p className="mt-0.5 max-w-2xl text-xs text-neutral-400">{labels[g.tier].desc}</p>
              <div className="mt-2.5 space-y-2.5">
                {g.rows.map((r) => {
                  let path = r.url;
                  try { const u = new URL(r.url); path = u.pathname + u.search; } catch { /* keep raw */ }
                  return (
                    <div key={r.url} className="flex gap-2.5">
                      {/* Marked only where there is a gap with someone standing
                          in it. A dot on every row is a dot on no row. */}
                      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                        r.status === "absent" && r.competitors_on_page.length ? "bg-red-500"
                          : r.status === "present" ? "bg-green-500" : "bg-neutral-200"}`} />
                      <div className="min-w-0">
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={r.url}
                          className="flex items-baseline gap-1.5 text-xs hover:underline"
                        >
                          <span className="shrink-0 text-neutral-500">{r.domain}</span>
                          <span className="truncate text-neutral-900">
                            {r.title || titleFromSlug(r.url) || path}
                          </span>
                        </a>
                        <p className="mt-0.5 text-[11px] leading-snug text-neutral-500">
                          {r.status === "unreadable"
                            ? (r.reason || t.pageUnreadable)
                            : r.status === "present"
                              ? t.infYouHere
                              : r.competitors_on_page.length
                                ? t.rivalsOnPage(r.competitors_on_page.join(", "))
                                : t.noRivalsOnPage}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Format gap: the shapes of page a model reads for this question ──

   Build asks what does not exist yet. This answers it from the citations
   rather than from a guess: these are the formats models actually quoted in
   this category, and these are the ones with nothing of yours in them.

   Shares the source-check run with Influence, because the verdict needed here
   — "is any page of this shape yours, or does any of them name you" — is the
   same verdict that screen already fetched. */
function FormatGap({ src, t }: { src: SourceChecks; t: Strings }) {
  const { checks, loading } = src;

  const groups = useMemo(() => {
    if (!checks?.length) return [];
    const by = new Map<PageFormat, { total: number; yours: number; examples: SourceCheck[] }>();
    for (const c of checks) {
      // A page nobody could read has no title to classify and no verdict to
      // report, so it is left out rather than filed under "other".
      if (c.status === "unreadable") continue;
      const fmt = formatOf(c.url, c.title || titleFromSlug(c.url) || "");
      const g = by.get(fmt) || { total: 0, yours: 0, examples: [] };
      g.total += 1;
      if (c.status === "present") g.yours += 1;
      if (g.examples.length < 3) g.examples.push(c);
      by.set(fmt, g);
    }
    return Array.from(by, ([format, g]) => ({ format, ...g }))
      // Gaps first, then by how much of the evidence is that shape. "other" is
      // not a format anyone can act on, so it sinks regardless.
      .sort((a, b) =>
        Number(a.format === "other") - Number(b.format === "other") ||
        Number(a.yours > 0) - Number(b.yours > 0) ||
        b.total - a.total);
  }, [checks]);

  // Nothing to say until the shared run has produced verdicts. The button for
  // it lives in Influence; duplicating it here would mean two ways to spend
  // the same seconds.
  if (!checks?.length) {
    return <p className="mt-4 text-xs text-neutral-400">{loading ? t.fgWaiting : t.fgNotYet}</p>;
  }

  const gaps = groups.filter((g) => g.yours === 0 && g.format !== "other");

  return (
    <div className="mt-5 rounded-2xl border border-neutral-150 bg-neutral-50/60 p-6">
      <h3 className="text-sm font-semibold">{t.fgTitle}</h3>
      <p className="mt-1 max-w-2xl text-sm text-neutral-500">{t.fgSub}</p>
      <p className="mt-4 max-w-2xl text-sm text-neutral-900">
        {gaps.length ? t.fgSummary(gaps.map((g) => t.fgNames[g.format]).join(", ")) : t.fgNoGaps}
      </p>

      <div className="mt-5 space-y-2">
        {groups.map((g) => {
          const gap = g.yours === 0 && g.format !== "other";
          /* "Everything else" is not a format anyone can go and make, so it
             gets neither verdict. A green dot there would read as "you are
             covered here", which is a claim about a bucket that means
             nothing. */
          const dot = g.format === "other" ? "bg-neutral-200" : gap ? "bg-red-500" : "bg-green-500";
          return (
            <div key={g.format} className="rounded-xl border border-neutral-100 bg-white p-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                <p className="text-sm font-medium">{t.fgNames[g.format]}</p>
                <p className="text-xs text-neutral-500">{t.fgCount(g.total, g.yours)}</p>
              </div>
              {/* The pages the verdict came from. A heuristic on a title is a
                  guess, and a guess that cannot be checked is worse than one
                  that can. */}
              <div className="mt-2 space-y-1">
                {g.examples.map((c) => (
                  <a
                    key={c.url}
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={c.url}
                    className="flex items-baseline gap-1.5 text-[11px] hover:underline"
                  >
                    <span className="shrink-0 text-neutral-400">{c.domain}</span>
                    <span className="truncate text-neutral-600">{c.title || titleFromSlug(c.url) || c.url}</span>
                  </a>
                ))}
                {g.total > g.examples.length && (
                  <p className="text-[11px] text-neutral-300">{t.andMore(g.total - g.examples.length)}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 max-w-2xl text-[11px] leading-relaxed text-neutral-400">{t.fgFootnote}</p>
    </div>
  );
}

/* ── Demand gap: branded searches nobody has answered ──

   Off-page by nature, which is why it sits in Influence: someone searching
   "<brand> отзывы" is going to land on a page about you that is not yours.

   Owner-gated and on demand, like the keyword panel, because every click is a
   paid DataForSEO lookup. */
function DemandGap({ data, t, lang }: { data: AuditData; t: Strings; lang: Lang }) {
  const [rows, setRows] = useState<KeywordRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  /* The phrases somebody already knows your name to type. The rival is the
     best-placed competitor, because "<you> vs <them>" is the comparison a
     buyer at the end of the funnel actually searches for. */
  const phrases = useMemo(() => {
    const brand = (data.brand || "").trim();
    if (!brand) return [];
    const rival = data.competitor_ranking.find((c) => !c.is_your_brand)?.name || "";
    const mods = lang === "ru"
      ? ["отзывы", "цена", "стоимость", "альтернативы", "интеграция", "внедрение"]
      : ["reviews", "pricing", "alternatives", "integration", "demo", "case study"];
    const out = mods.map((m) => `${brand} ${m}`);
    if (rival) out.push(lang === "ru" ? `${brand} или ${rival}` : `${brand} vs ${rival}`);
    return out;
  }, [data.brand, data.competitor_ranking, lang]);

  const run = async () => {
    if (!phrases.length) return;
    setBusy(true); setError(""); setRows(null);
    try {
      const res = await apiFetch(`${API_URL}/keyword-research`, {
        method: "POST",
        body: JSON.stringify({ keywords: phrases, country: (data.country || "US").toUpperCase() }),
      });
      const out = await res.json();
      if (!res.ok || (out?.error && !Array.isArray(out?.results))) {
        setError(out?.detail || out?.error || t.kwFailed);
      } else {
        setRows(out.results || []);
        if (out.error) setError(out.error);
      }
    } catch {
      setError(t.kwFailed);
    } finally {
      setBusy(false);
    }
  };

  if (!phrases.length) return null;

  const withVolume = (rows || []).filter((r) => typeof r.search_volume === "number" && r.search_volume > 0);
  // Every row blank is a statement about the data source, not about demand.
  // Saying "no demand" here would be inventing a measurement from its absence.
  const allBlank = Boolean(rows?.length) && withVolume.length === 0;

  return (
    <div className="mt-5 rounded-2xl border border-neutral-150 bg-neutral-50/60 p-6">
      <h3 className="text-sm font-semibold">{t.dgTitle}</h3>
      <p className="mt-1 max-w-2xl text-sm text-neutral-500">{t.dgSub}</p>

      {!rows && !busy && (
        <>
          <p className="mt-3 text-xs text-neutral-400">{t.dgNotRun(phrases.length, (data.country || "US").toUpperCase())}</p>
          <button onClick={run} className="mt-3 rounded-lg bg-neutral-900 px-4 py-2 text-xs font-medium text-white hover:bg-neutral-800">
            {t.dgRun}
          </button>
        </>
      )}
      {busy && <p className="mt-3 text-xs text-neutral-400">{t.kwRunning}</p>}
      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

      {allBlank && (
        <p className="mt-4 max-w-2xl rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
          {t.dgNoData((data.country || "US").toUpperCase())}
        </p>
      )}

      {rows && withVolume.length > 0 && (
        <>
          <p className="mt-4 max-w-2xl text-sm text-neutral-900">{t.dgSummary(withVolume.length, rows.length)}</p>
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs text-neutral-400">
                <th className="pb-2 font-medium">{t.kwColKeyword}</th>
                <th className="pb-2 pl-4 text-right font-medium" title={t.volumeTitle}>{t.colVolume}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-neutral-100 last:border-0">
                  <td className="py-2 pr-3 text-xs">{r.keyword}</td>
                  <td className="py-2 pl-4 text-right text-xs tabular-nums">
                    {typeof r.search_volume === "number"
                      ? r.search_volume.toLocaleString(lang === "ru" ? "ru-RU" : "en-US")
                      : <span className="text-neutral-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

/* Expandable row showing what each model actually answered for one prompt.
   This is the "why don't I appear / what did competitors get" view. */
function PromptRow({ result, t, tab, ran, modelsUsed, runDate }: { result: AuditResult; t: Strings; tab: ModelKey; ran: ModelName[]; modelsUsed?: Record<string, string>; runDate: string }) {
  const [open, setOpen] = useState(false);
  const models = MODELS
    .filter((m) => ran.includes(m.key))
    .filter((m) => tab === "all" || tab === m.key)
    .map((m) => ({ key: m.key, label: m.label, info: infoFor(result, m.key) }));

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
              <SourceList info={m.info} label={t.citedDomains} />
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

export function Dashboard({ data: raw, onBack, onProjects, lang: initialLang = "en", brandName = "GetCited", auditId = null }: { data: AuditData; onBack: () => void; onProjects?: () => void; lang?: Lang; brandName?: string; auditId?: string | number | null }) {
  /* The page URL sets the starting language, but the reader can change it.
     The audit itself can be in a different language from the interface - a
     Russian-market audit is often read by an English-speaking colleague. */
  const [lang, setLang] = useState<Lang>(initialLang);
  /* Whether the side nav is showing. Remembered, because someone who closed it
     to read the page in peace wants it closed on the next audit too — and
     because the alternative is them closing it every single time.

     Wrapped: storage throws in a private window and on a blocked-cookies
     browser, and a nav preference is not worth a blank page. */
  const [navOpen, setNavOpen] = useState<boolean>(() => {
    try { return localStorage.getItem("gc.nav") !== "closed"; } catch { return true; }
  });
  const toggleNav = () => {
    setNavOpen((was) => {
      try { localStorage.setItem("gc.nav", was ? "closed" : "open"); } catch { /* fine */ }
      return !was;
    });
  };
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

  /* Held here rather than inside either screen, because both want the same
     verdicts and the pages behind them cost real seconds to open. Start it on
     the overview and Influence already has the answer, and the other way
     round. */
  const sourceChecks = useSourceChecks(data);

  /* ---- keyword research (POST /keyword-research) ----

     Separate from an audit on purpose: this answers "is this phrase worth
     going after", which is the question that comes before "does a model name
     us for it". Two DataForSEO endpoints behind it, about ten cents a lookup. */
  const [kwText, setKwText] = useState("");
  /* Which market the numbers are for. Defaults to the audit's country but is
     not tied to it: keyword research is planning work, often for a different
     client in a different market than whatever audit happens to be open. */
  const [kwMarket, setKwMarket] = useState((data.country || "US").toUpperCase());
  const [markets, setMarkets] = useState<{ code: string; name: string }[]>([]);
  const [kwRows, setKwRows] = useState<KeywordRow[]>([]);
  const [kwLoading, setKwLoading] = useState(false);
  const [kwError, setKwError] = useState("");
  /* Whether to offer the panel at all. The lookup is owner-only on the server
     now, so for a customer the button could only ever return 403 — and a
     feature that is visible and refuses is worse than one that is absent. */
  const [canKeywords, setCanKeywords] = useState(false);
  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data }) => setCanKeywords(isAdmin(data.session?.user?.email)))
      .catch(() => setCanKeywords(false));
  }, []);

  useEffect(() => {
    // Served by the API so there is one list. Every model list that got
    // duplicated into this file drifted from the backend eventually.
    let alive = true;
    apiFetch(`${API_URL}/markets`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && Array.isArray(d?.markets)) setMarkets(d.markets); })
      .catch(() => { /* the select falls back to the audit's own market */ });
    return () => { alive = false; };
  }, []);

  const runKeywords = async () => {
    const keywords = Array.from(new Set(
      kwText.split("\n").map((l) => l.trim()).filter(Boolean)));
    if (!keywords.length) return;
    setKwLoading(true); setKwError(""); setKwRows([]);
    try {
      const res = await apiFetch(`${API_URL}/keyword-research`, {
        method: "POST",
        body: JSON.stringify({ keywords, country: kwMarket }),
      });
      const out = await res.json();
      if (!res.ok || out?.error && !Array.isArray(out?.results)) {
        setKwError(out?.detail || out?.error || t.kwFailed);
      } else {
        setKwRows(out.results || []);
        // The lookup can succeed for some rows and still carry a vendor-level
        // problem; showing both beats hiding one.
        if (out.error) setKwError(out.error);
      }
    } catch {
      setKwError(t.kwFailed);
    } finally {
      setKwLoading(false);
    }
  };

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
      const res = await apiFetch(`${API_URL}/page-check`, {
        method: "POST",
        body: JSON.stringify({
          website: url,
          brand: data.brand,
          category: data.category || "",
          competitors: data.competitor_ranking
            .filter((c) => !c.is_your_brand && c.domain)
            .slice(0, 5)
            .map((c) => ({ name: c.name, website: `https://${c.domain}` })),
          missed_prompts: missedPrompts,
          model_results: modelResults,
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

  const ran = useMemo(() => modelsIn(data), [data]);

  /* Per-model counts, sent with the page check so a fact about the markup can
     be put next to the answers it explains — "GPTBot is blocked, and ChatGPT
     names you in 2 of 8 while Gemini names you in 5". Neither half is worth
     much alone, and nothing that only reads pages or only asks models can put
     them together.

     Registry-driven. The denominator is the prompts this model actually
     answered, not the prompts asked: a model that went quiet on half the run
     must not be scored as absent from it. */
  const modelResults = useMemo(() => {
    const out: Record<string, { named: number; answers: number }> = {};
    for (const key of ran) {
      const answers = data.results.filter((r) => r[key] !== undefined).length;
      if (answers > 0) out[key] = { named: modelNamedCount(data, key), answers };
    }
    return out;
  }, [data, ran]);
  useEffect(() => {
    // Opening a saved run while a model tab is selected that this run did not
    // use would show its zeros as a real measurement.
    if (tab !== "all" && !ran.includes(tab as ModelName)) setTab("all");
  }, [ran, tab]);
  const modelsForTab = (r: AuditResult) =>
    (tab === "all" ? ran : ran.filter((k) => k === tab)).map((k) => infoFor(r, k));

  /* ---- metrics for the selected model tab ---- */
  const metrics = useMemo(() => {
    let citationCount = 0;
    let bareMentionCount = 0;
    let scorePct = data.visibility_score;

    /* The denominator is answers, not prompts: on the combined tab every prompt
       was put to each model that ran, so eight prompts across two models are
       sixteen answers. Quoting a count against "8 prompts" would halve the rate
       the moment a second model is switched on.

       `models_run` is the same list the backend divided by, so the fraction on
       screen cannot contradict the percentage next to it. Recomputing "which
       models count" here would be a second definition of the denominator, and
       the two would disagree the first time a model ran but failed on every
       prompt. activeModels is the fallback for runs saved before models_run. */
    /* The backend sends the denominator it divided by. Recomputing it as
       prompts × models silently disagrees whenever a model was asked and did
       not answer — exactly the run where the numbers most need explaining. */
    const modelCount = Math.max(ran.length || activeModels(data).length || 1, 1);
    const allAnswers = typeof data.answers === "number" && data.answers > 0
      ? data.answers
      : data.total_prompts * modelCount;
    const answers = tab === "all"
      ? allAnswers
      : data.results.filter((r) => (infoFor(r, tab as ModelName).answer || "").trim()).length
        || data.total_prompts;

    /* Per-model counts come from the results, which carry every model. The
       combined tab uses the backend's own totals so the headline cannot drift
       from what was stored. Both branches used to name gemini and chatgpt, so
       selecting a third model showed the combined figures under its tab. */
    let named: number;
    if (tab === "all") {
      citationCount = data.mentions_score;
      bareMentionCount = data.citations_score;
      scorePct = data.visibility_score;
      named = ran.reduce((s, k) => s + modelNamedCount(data, k), 0);
    } else {
      const key = tab as ModelName;
      citationCount = data.results.filter((r) => infoFor(r, key).mentioned_with_link).length;
      bareMentionCount = data.results.filter((r) => infoFor(r, key).mentioned_without_link).length;
      named = modelNamedCount(data, key);
      scorePct = data.total_prompts ? Math.round((named / data.total_prompts) * 100) : 0;
    }

    const others = data.competitor_ranking.filter((c) => !c.is_your_brand);
    const competitorAvg = others.length ? Math.round(others.reduce((s, c) => s + c.mention_rate, 0) / others.length) : 0;
    const topRivalsByCitations = [...others].sort((a, b) => b.mentions_with_link - a.mentions_with_link).slice(0, 2);
    const topRivalsByBareMentions = [...others].sort((a, b) => b.mentions_without_link - a.mentions_without_link).slice(0, 2);

    const pct = (n: number) => (answers > 0 ? Math.round((n / answers) * 100) : 0);

    return { citationCount, bareMentionCount, scorePct, competitorAvg,
             topRivalsByCitations, topRivalsByBareMentions,
             answers, named, withLinkPct: pct(citationCount), noLinkPct: pct(bareMentionCount) };
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

  /* Volume lives on the result row, keyed by the prompt text — the same lookup
     the prompts table does. The demand column had been printing a hardcoded
     dash since before there was anything to put in it. */
  const volumeByPrompt = useMemo(() => {
    const m = new Map<string, { volume: number; phrase?: string }>();
    for (const r of data.results) {
      if (typeof r.search_volume === "number") {
        m.set(r.prompt, { volume: r.search_volume, phrase: r.keyword_phrase });
      }
    }
    return m;
  }, [data.results]);

  const visibleCitations = showAllCitations ? citationGroups : citationGroups.slice(0, 10);

  const failedModels = useMemo(() => {
    const status = data.model_status;
    if (!status) return [];
    const labels = Object.fromEntries(MODELS.map((m) => [m.key, m.label]));
    /* Three different things look alike in model_status, and only one is a
       failure worth a warning:
         enabled: false  — switched off on the server, deliberate
         selected: false — not ticked for this audit, also deliberate
         ok: false       — asked, and did not answer
       The second was missing, so a model simply left out of the run was
       announced as having not responded, with the numbers called incomplete
       when they were exactly as complete as asked for. */
    return Object.entries(status)
      .filter(([, v]) => !v.ok && v.enabled !== false && v.selected !== false)
      .map(([k, v]) => ({ label: labels[k] ?? k, reason: (v.error || "").trim() }));
  }, [data.model_status]);

  /* ---- recommendations, categorised ---- */
  const addPrompts = async () => {
    const lines = Array.from(new Set(
      addText.split("\n").map((l) => l.trim()).filter(Boolean)));
    if (lines.length === 0) return;
    setAdding(true);
    setAddError("");
    try {
      const res = await apiFetch(`${API_URL}/audit/extend`, {
        method: "POST",
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
    const buckets: Record<string, ParsedRec[]> = { mentions: [], technical: [], content: [], authority: [], keywords: [] };
    for (const raw of items) {
      /* Sorted on the raw block, not on the parsed action: the words that place
         a recommendation ("robots.txt", "reddit") turn up in the reasoning as
         often as in the instruction. */
      buckets[categorize(raw)].push(parseRec(raw, t));
    }
    return buckets;
  }, [data.recommendations, t]);

  /* ---- competitive landscape rows ----

     This was a bubble chart, and five brands with counts between zero and three
     cannot fill a plane. Scaled to the brands, a single bare mention drew the
     one brand with 0% visibility at the very top; scaled to the answers,
     everything collapsed into the bottom-left corner with the labels on top of
     each other. Both are true pictures of five small numbers in a space built
     for a hundred larger ones.

     Two bars per brand says the same thing — a citation and a bare mention are
     different outcomes — and says it at any sample size. Labels sit in their
     own column, so they cannot collide however close the values are. */
  const landscapeRows = useMemo(() => {
    const all = data.competitor_ranking;
    /* Widths are a share of answers received, the denominator both counts come
       out of, so a bar length means the same thing on every row and between two
       audits. The observed maximum is the fallback for a run stored before
       `answers` was returned. */
    const denom = data.answers
      || Math.max(...all.map((c) => c.total_mentions), 0)
      || 1;
    return all
      .map((c) => ({
        ...c,
        citedPct: Math.min((c.mentions_with_link / denom) * 100, 100),
        barePct: Math.min((c.mentions_without_link / denom) * 100, 100),
      }))
      .sort((a, b) =>
        (b.mentions_with_link - a.mentions_with_link) ||
        (b.mentions_without_link - a.mentions_without_link));
  }, [data.competitor_ranking, data.answers]);

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
    /* Three things a recommendation can ask of you, and the five sorting
       buckets live inside them. Fix keeps its three sub-labels: "add these
       phrases" and "rewrite this page" are both edits to a page you own, but
       they are not the same afternoon's work. */
    const areas: {
      id: string; title: string; desc: string;
      /* Measured findings for this area, shown above the written items. Same
         rule as the page check at the top of the screen: a fact outranks a
         suggestion, so it goes first. */
      measured?: ReactNode;
      groups: { key: keyof typeof recCategories; label?: string }[];
    }[] = [
      {
        id: "area-fix", title: t.areaFix, desc: t.areaFixDesc,
        groups: [
          { key: "technical", label: t.catTechnical },
          { key: "content", label: t.catContent },
          { key: "keywords", label: t.catKeywords },
        ],
      },
      {
        id: "area-build", title: t.areaBuild, desc: t.areaBuildDesc,
        measured: <FormatGap src={sourceChecks} t={t} />,
        groups: [{ key: "authority" }],
      },
      {
        id: "area-influence", title: t.areaInfluence, desc: t.areaInfluenceDesc,
        measured: (
          <>
            <InfluenceSources src={sourceChecks} data={data} t={t} />
            {/* Owner-gated with the keyword panel: every run is a paid lookup,
                and the spend is the thing that has an owner. */}
            {canKeywords && <DemandGap data={data} t={t} lang={lang} />}
          </>
        ),
        groups: [{ key: "mentions" }],
      },
    ];

    const navItems: NavItem[] = [
      { kind: "anchor", id: "sec-page-check", label: t.menuPageCheck },
      /* A link, not an anchor: the panel below belongs to this audit and opens
         on its market, and the question "is this phrase worth going after"
         usually arrives without an audit attached. */
      ...(canKeywords ? [{ kind: "link" as const, href: lang === "ru" ? "/ru/keywords" : "/keywords", label: t.menuKeywords }] : []),
      { kind: "anchor", id: "area-fix", label: t.menuFix },
      { kind: "anchor", id: "area-build", label: t.menuBuild },
      { kind: "anchor", id: "area-influence", label: t.menuInfluence },
    ];

    return (
      <div className="min-h-screen bg-white text-neutral-900">
        <header className="sticky top-0 z-40 border-b border-neutral-100 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <button onClick={() => setView("overview")} className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900">
              <ArrowLeft className="h-4 w-4" /> {t.backToDashboard}
            </button>
            <LangSwitch lang={lang} setLang={setLang} />
          </div>
        </header>
        <div className="mx-auto flex max-w-6xl gap-8 px-6 py-10">
        <SideNav items={navItems} open={navOpen} toggle={toggleNav} t={t} onProjects={onProjects} />
        <main className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">{t.recommendationsTitle}</h1>
          <p className="mt-1 text-sm text-neutral-500">{t.recommendationsSub}</p>

          {/* ── Measured from the page. Sits above the model-written items
                because a fact about the markup outranks a suggestion. ── */}
          <section id="sec-page-check" className="mt-8 scroll-mt-24 rounded-2xl border border-neutral-150 bg-neutral-50/60 p-6">
            <h2 className="text-lg font-semibold">{t.pageCheckTitle}</h2>
            <p className="mt-1 text-sm text-neutral-500">{t.pageCheckSub}</p>

            <label className="mt-5 block">
              <span className="mb-1 block text-xs text-neutral-500">{t.pageCheckUrlLabel}</span>
              {/* The field is prefilled with the homepage because that is the
                  one URL the audit knows. Which is the opposite of the advice,
                  so the advice is next to the field and not hidden in a state
                  that disappears the moment anything has been checked. */}
              <span className="mb-2 block max-w-xl text-xs leading-relaxed text-neutral-400">{t.pageCheckUrlHint}</span>
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

          {/* The cluster volume bar stood here. Parked, not deleted: the
                backend still computes `clusters` and the payload still carries
                them, so it comes back as one line of JSX. It is coming back
                inside Build, where "this group of questions has demand and you
                have no page for it" is the recommendation rather than a chart
                beside one. */}

          {/* Owner-only, because this panel fires fresh paid lookups on demand.
              Figures computed during an audit the customer already paid for are
              not gated — the spend, not the data, is what has an owner. */}
          {canKeywords && (<>
          {/* ── Keyword research. Deliberately next to the page check rather
                than among the written recommendations: both are measured
                numbers, and the model-written items below are suggestions. ── */}
          <section className="mt-8 rounded-2xl border border-neutral-150 bg-neutral-50/60 p-6">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-lg font-semibold">{t.kwTitle}</h2>
              {/* A plain anchor rather than a router Link: this panel is the
                  only part of the dashboard that would need the router, and a
                  full load costs nothing on a page people leave anyway. */}
              <a
                href={lang === "ru" ? "/ru/keywords" : "/keywords"}
                className="shrink-0 text-xs text-neutral-500 underline hover:text-neutral-900"
              >
                {t.kwFullTool}
              </a>
            </div>
            <p className="mt-1 text-sm text-neutral-500">{t.kwSub}</p>

            <label className="mt-5 block">
              <span className="mb-1 block text-xs text-neutral-500">{t.kwLabel}</span>
              <textarea
                value={kwText}
                onChange={(e) => setKwText(e.target.value)}
                rows={4}
                placeholder={t.kwPlaceholder}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-900"
              />
            </label>
            <div className="mt-2 flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-500">{t.kwMarket}</span>
                <select
                  value={kwMarket}
                  onChange={(e) => setKwMarket(e.target.value)}
                  className="h-10 rounded-lg border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-neutral-900"
                >
                  {/* Until the list arrives, the audit's own market is the only
                      honest option — better one real choice than a guessed set. */}
                  {(markets.length ? markets : [{ code: kwMarket, name: kwMarket }])
                    .map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}
                </select>
              </label>
              <button
                onClick={runKeywords}
                disabled={kwLoading || !kwText.trim()}
                className="h-10 rounded-lg bg-neutral-900 px-5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {kwLoading ? t.kwRunning : t.kwRun}
              </button>
            </div>
            {kwError && <p className="mt-2 text-xs text-red-600">{kwError}</p>}

            {kwRows.length > 0 && (
              <>
                <table className="mt-5 w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 text-left text-xs text-neutral-400">
                      <th className="pb-2 font-medium">{t.kwColKeyword}</th>
                      <th className="pb-2 pl-4 text-right font-medium" title={t.volumeTitle}>{t.colVolume}</th>
                      <th className="pb-2 pl-4 text-right font-medium" title={t.kwDifficultyTitle}>{t.kwColDifficulty}</th>
                      <th className="pb-2 pl-4 text-right font-medium" title={t.kwCpcTitle}>{t.kwColCpc}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kwRows.map((r, i) => (
                      <tr key={i} className="border-b border-neutral-100 last:border-0">
                        <td className="py-2 pr-3 text-xs">
                          {r.keyword}
                          {r.too_long && <span className="ml-2 text-[10px] text-neutral-400">{t.kwTooLong}</span>}
                        </td>
                        <td className="py-2 pl-4 text-right text-xs tabular-nums">
                          {typeof r.search_volume === "number"
                            ? r.search_volume.toLocaleString(lang === "ru" ? "ru-RU" : "en-US")
                            : <span className="text-neutral-300">—</span>}
                        </td>
                        {/* 0 is a real difficulty, so it must not fall into the dash. */}
                        <td className="py-2 pl-4 text-right text-xs tabular-nums">
                          {typeof r.keyword_difficulty === "number"
                            ? r.keyword_difficulty
                            : <span className="text-neutral-300">—</span>}
                        </td>
                        <td className="py-2 pl-4 text-right text-xs tabular-nums">
                          {typeof r.cpc === "number"
                            ? `$${r.cpc.toFixed(2)}`
                            : <span className="text-neutral-300">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-3 text-[11px] leading-relaxed text-neutral-400">{t.kwFootnote(markets.find((m) => m.code === kwMarket)?.name || kwMarket)}</p>
              </>
            )}
          </section>
          </>)}

          <p className="mt-12 text-xs font-medium uppercase tracking-widest text-neutral-400">{t.pageCheckWrittenBelow}</p>
          <div className="mt-4 space-y-10">
            {areas.map((area) => {
              /* Every bucket in the area, so an area with nothing in it says so
                 once instead of three times. */
              const groups = area.groups
                .map((g) => ({ ...g, items: recCategories[g.key] }))
                .filter((g) => g.items.length > 0);

              return (
                <section key={area.id} id={area.id} className="scroll-mt-24">
                  <div className="border-b border-neutral-150 pb-3">
                    <h2 className="text-lg font-semibold">{area.title}</h2>
                    <p className="mt-1 max-w-2xl text-sm text-neutral-500">{area.desc}</p>
                  </div>

                  {area.measured}

                  {/* Only when the area has nothing at all. An area carrying a
                      measured block is not empty just because the model wrote
                      no prose for it. */}
                  {groups.length === 0 && !area.measured && (
                    <p className="mt-4 rounded-xl border border-dashed border-neutral-200 p-4 text-sm text-neutral-400">{t.noRecsYet}</p>
                  )}

                  {groups.map((g) => (
                    <div key={g.key} className="mt-5">
                      {/* The sub-label is dropped where an area holds a single
                          bucket — a heading over its own only child is noise. */}
                      {g.label && area.groups.length > 1 && (
                        <p className="mb-2 text-xs font-medium uppercase tracking-widest text-neutral-400">{g.label}</p>
                      )}
                      <div className="space-y-3">
                        {g.items.map((rec, i) => {
                          const dot = rec.priority === t.high ? "bg-red-500" : rec.priority === t.medium ? "bg-amber-500" : "bg-green-500";
                          return (
                            <article key={i} className="rounded-xl border border-neutral-150 bg-white p-5">
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                <span className="flex items-center gap-2">
                                  <span className={`h-2 w-2 rounded-full ${dot}`} />
                                  <span className="text-xs font-medium text-neutral-500">{rec.priority}</span>
                                </span>
                                {/* Blank when the model did not say. An effort
                                    nobody estimated is worse than none. */}
                                {rec.effort && (
                                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-500">{rec.effort}</span>
                                )}
                              </div>

                              {/* The instruction carries the weight; the
                                  reasoning sits under it where it can be
                                  skipped. Both used to be one grey paragraph
                                  with the field labels still inside it. */}
                              {/* Capped rather than filling the card: these run
                                  two or three sentences, and an 850px line is
                                  where the eye loses the start of the next. */}
                              <p className="mt-2.5 max-w-3xl text-sm font-medium leading-relaxed text-neutral-900">{rec.action}</p>
                              {rec.why && (
                                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-neutral-500">
                                  <span className="text-xs uppercase tracking-wide text-neutral-400">{t.recWhy}</span>{" "}
                                  {rec.why}
                                </p>
                              )}
                            </article>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </section>
              );
            })}
          </div>
        </main>
        </div>
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
                <PromptRow key={i} result={p.result} t={t} tab={tab} ran={ran} modelsUsed={data.models_used} runDate={runDate} />
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

      {/* Everything on this page is one long column, and until now the only way
          to reach the bottom of it was to scroll past the top of it. The nav is
          a plain anchor list rather than routing: the sections are all already
          rendered, so there is nothing to load and nothing to get out of sync. */}
      <div className="mx-auto flex max-w-6xl gap-8 px-6 py-10">
        <SideNav
          open={navOpen}
          toggle={toggleNav}
          t={t}
          onProjects={onProjects}
          items={[
            { kind: "anchor", id: "sec-score", label: t.menuScore },
            { kind: "anchor", id: "sec-rivals", label: t.menuRivals },
            { kind: "anchor", id: "sec-sov", label: t.menuSov },
            { kind: "anchor", id: "sec-covered", label: t.menuCovered },
            { kind: "anchor", id: "sec-sources", label: t.menuSources },
            { kind: "anchor", id: "sec-history", label: t.menuHistory },
            { kind: "anchor", id: "sec-citations", label: t.menuCitations },
            { kind: "anchor", id: "sec-recs", label: t.menuRecs },
          ]}
        />

        <main className="min-w-0 flex-1">

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{data.brand}</h1>
            <p className="text-xs text-neutral-400">
              {runDate}{data.category ? ` · ${data.category}` : ""}
              {/* A score without its market is not comparable to anything. */}
              {data.country ? ` · ${data.country}` : ""}
            </p>
          </div>
          <ModelSwitcher tab={tab} setTab={setTab} t={t} ran={ran} />
        </div>

        {failedModels.length > 0 && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm text-amber-800">{t.modelFailed(failedModels.map((f) => f.label).join(", "))}</p>
            {/* The reason was in the payload all along and never shown, so the
                only way to find out why a model went quiet was to call the API
                by hand — which now needs a token. It is the provider's own
                words, so it is kept as a quotation rather than paraphrased. */}
            {failedModels.filter((f) => f.reason).map((f) => (
              <p key={f.label} className="mt-1 break-words font-mono text-[11px] leading-snug text-amber-700/90">
                {f.label}: {f.reason.slice(0, 300)}
              </p>
            ))}
          </div>
        )}

        {/* 3 metric cards */}
        {data.needs_description && (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
            <p className="text-sm font-medium text-amber-900">{t.unknownCategory}</p>
            <p className="mt-1 text-xs text-amber-800">{t.unknownCategoryWhy(data.site_issue || "")}</p>
          </div>
        )}

        <div id="sec-score" className="mb-6 scroll-mt-24 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-neutral-150 bg-neutral-50/50 p-6">
            <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">{t.aiVisibilityScore}</p>
            <div className="mt-2 text-5xl font-bold tracking-tight">{metrics.scorePct}%</div>
            {/* What the percentage is a percentage of. Without it the headline
                number cannot be checked against the lists further down. */}
            <p className="mt-1 text-xs text-neutral-400">{t.mentionRateSub(metrics.named, metrics.answers)}</p>
            <p className="text-xs text-neutral-400">{t.vsCompetitorsAvg(metrics.competitorAvg)}</p>
          </div>

          <div className="rounded-2xl border border-neutral-150 bg-neutral-50/50 p-6">
            <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">{t.citationsCard}</p>
            <div className="mt-2 text-5xl font-bold tracking-tight">{metrics.citationCount}</div>
            <p className="mt-1 text-xs text-neutral-400">{t.citationsCardSub(metrics.withLinkPct)}</p>
            {metrics.topRivalsByCitations.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {metrics.topRivalsByCitations.map((c) => (
                  <span key={c.name} className="rounded-full border border-neutral-200 px-2.5 py-1 text-[11px] text-neutral-500">
                    {c.name} <b className="font-medium text-neutral-900">{c.mentions_with_link}</b>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Was a button that scrolled to the table below. That table lists the
              domains the models read, not the answers that named you without a
              link, so the click promised one thing and delivered another. The
              table keeps its own "view all". */}
          <div className="rounded-2xl border border-neutral-150 bg-neutral-50/50 p-6">
            <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">{t.mentionsNoLinkCard}</p>
            <div className="mt-2 text-5xl font-bold tracking-tight">{metrics.bareMentionCount}</div>
            <p className="mt-1 text-xs text-neutral-400">{t.mentionsNoLinkSub(metrics.noLinkPct)}</p>
            {metrics.topRivalsByBareMentions.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {metrics.topRivalsByBareMentions.map((c) => (
                  <span key={c.name} className="rounded-full border border-neutral-200 px-2.5 py-1 text-[11px] text-neutral-500">
                    {c.name} <b className="font-medium text-neutral-900">{c.mentions_without_link}</b>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Where you stand vs competitors */}
        <div className="mb-6 rounded-2xl border border-neutral-150 bg-neutral-50/50 p-6">
          <div className="mb-4 flex items-center justify-between">
            <p id="sec-rivals" className="scroll-mt-24 text-xs font-medium uppercase tracking-widest text-neutral-400">{t.comparedTo}</p>
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
              /* The count itself, against the same denominator as the cards.
                 This used to rebuild the count from the rounded percentage and
                 multiply it by PROMPTS, while the rate is over ANSWERS — so a
                 rival named in one of three answers came out as round(0.33 × 1)
                 = "0 of 1" on the bar while the card above said the competitor
                 average was 33%. Two numbers from the same data, contradicting
                 each other on the same screen. */
              const total = metrics.answers || data.total_prompts || 1;
              const covered = stat.total_mentions;
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

        {/* ── Share of voice. Visibility says how often this brand was
              named; this says how much of the conversation it held. A brand
              named in half the answers looks strong until the other half named
              four rivals each. ── */}
        {data.share_of_voice && data.share_of_voice.brands.length > 1 && (
        <div id="sec-sov" className="mb-6 scroll-mt-24 rounded-2xl border border-neutral-150 bg-neutral-50/50 p-6">
          <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">{t.sovTitle}</p>

          {data.share_of_voice.total === 0 ? (
            /* Nobody was named at all. Printing 0% here would be a measurement
               claim where there was no measurement. */
            <p className="mt-3 text-sm text-neutral-400">{t.sovNobody}</p>
          ) : (
            <>
              <p className="mt-2 text-4xl font-bold tracking-tight">
                {data.share_of_voice.yours ?? 0}%
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                {t.sovSub(
                  data.share_of_voice.brands.find((b) => b.is_your_brand)?.mentions ?? 0,
                  data.share_of_voice.total,
                  data.share_of_voice.brands.filter((b) => b.mentions > 0).length,
                )}
              </p>

              <div className="mt-5 space-y-1.5">
                {data.share_of_voice.brands.filter((b) => b.mentions > 0).slice(0, 8).map((b) => (
                  <div key={b.name} className="grid grid-cols-[130px_1fr_auto] items-center gap-3">
                    <p className={`truncate text-xs ${b.is_your_brand ? "font-medium text-neutral-900" : "text-neutral-500"}`}>
                      {statLabel(b.name, b.is_your_brand, t.you)}
                    </p>
                    <div className="h-2 w-full rounded-full bg-neutral-100">
                      <div
                        className={`h-2 rounded-full ${b.is_your_brand ? "bg-neutral-900" : "bg-neutral-300"}`}
                        style={{ width: `${b.share ?? 0}%` }}
                      />
                    </div>
                    <p className="w-20 whitespace-nowrap text-right text-[11px] tabular-nums text-neutral-400">
                      {b.share}% · {b.mentions}
                    </p>
                  </div>
                ))}
              </div>

              {/* The denominator, said out loud. A share is meaningless without
                  it, and this one deliberately counts brands nobody asked us to
                  track — which is why it is lower than a tracked-only figure
                  would be, and why it is the honest one. */}
              <p className="mt-4 text-[11px] leading-relaxed text-neutral-400">{t.sovDenominator}</p>
            </>
          )}
        </div>
        )}

        {/* Competitive landscape */}
        {landscapeRows.length > 1 && (
          <div className="mb-6 rounded-2xl border border-neutral-150 bg-neutral-50/50 p-6">
            <p className="text-sm font-medium">{t.landscapeTitle}</p>
            <p className="mt-0.5 text-xs text-neutral-400">{t.landscapeSub}</p>

            <div className="mt-4 space-y-2.5">
              {landscapeRows.map((b) => (
                <div key={b.name} className="grid grid-cols-[130px_1fr_auto] items-center gap-3">
                  <p className={`truncate text-xs ${b.is_your_brand ? "font-medium text-neutral-900" : "text-neutral-500"}`}>
                    {statLabel(b.name, b.is_your_brand, t.you)}
                  </p>

                  {/* Two bars, stacked, sharing one track. Cited sits on top
                      because it is the stronger outcome, and a brand with
                      nothing still gets an empty track rather than vanishing —
                      absence is part of the comparison. */}
                  <div className="space-y-1">
                    <div className="h-2 w-full rounded-full bg-neutral-100">
                      <div
                        className={`h-2 rounded-full ${b.is_your_brand ? "bg-neutral-900" : "bg-neutral-400"}`}
                        style={{ width: `${b.citedPct}%` }}
                        title={t.landscapeCited(b.mentions_with_link, data.answers || 0)}
                      />
                    </div>
                    <div className="h-2 w-full rounded-full bg-neutral-100">
                      <div
                        className={`h-2 rounded-full ${b.is_your_brand ? "bg-neutral-400" : "bg-neutral-200"}`}
                        style={{ width: `${b.barePct}%` }}
                        title={t.landscapeBare(b.mentions_without_link, data.answers || 0)}
                      />
                    </div>
                  </div>

                  <p className="whitespace-nowrap text-[11px] tabular-nums text-neutral-400">
                    {b.mentions_with_link} / {b.mentions_without_link}
                  </p>
                </div>
              ))}
            </div>

            <p className="mt-3 text-[11px] text-neutral-400">{t.landscapeLegend}</p>
          </div>
        )}

        {/* Best covered topics */}
        <div id="sec-covered" className="mb-6 scroll-mt-24 rounded-2xl border border-neutral-150 bg-neutral-50/50 p-6">
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
              /* A fourth hand-written model list lived here, with Perplexity
                 nailed to "Pro" while the backend was already running it. Each
                 row is now a share of the answers THAT MODEL returned, not of
                 the prompts it was asked: a model that answered four of eight
                 and named the brand in two is at 50%, not 25%. Claude stays
                 locked because nothing behind it exists yet. */
              ...MODELS.map((m) => {
                const answered = data.results.filter(
                  (r) => (infoFor(r, m.key).answer || "").trim()).length;
                const named = modelNamedCount(data, m.key);
                return {
                  label: m.label,
                  pct: answered ? Math.round((named / answered) * 100) : 0,
                  locked: false,
                  silent: answered === 0,
                  hidden: !ran.includes(m.key) && data.model_status?.[m.key]?.enabled === false,
                };
              }),
              { label: "Claude", pct: 0, locked: true, silent: false, hidden: false },
            ].filter((m) => !m.hidden).map((m) => (
              <div key={m.label} className="flex items-center gap-3">
                <span className="flex w-24 shrink-0 items-center gap-1 text-xs font-medium text-neutral-700">
                  {m.label}{m.locked && <Lock className="h-3 w-3 text-neutral-300" />}
                </span>
                <div className={`h-2 flex-1 overflow-hidden rounded-full ${m.silent ? "border border-dashed border-neutral-200" : "bg-neutral-100"}`}>
                  {!m.locked && !m.silent && <div className="h-full rounded-full bg-neutral-900" style={{ width: `${m.pct}%` }} />}
                </div>
                {/* A model that returned nothing has no percentage. Printing 0%
                    would read as "asked you about, never named you". */}
                <span className="w-10 shrink-0 text-right text-xs font-semibold text-neutral-500">
                  {m.locked ? t.proOnly : m.silent ? "—" : `${m.pct}%`}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* History */}
        <div id="sec-history" className="mb-6 scroll-mt-24 rounded-2xl border border-neutral-150 bg-neutral-50/50 p-6">
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
              {/* Through the same cleaner the prompt excerpts use. The backend
                  strips markdown now, but every audit stored before it did
                  still carries "**" in this field, and those are the runs
                  someone opens from their projects list. Fixing it only on the
                  way in would leave the history broken. */}
              <p className="mt-3 text-sm italic text-neutral-600">"{excerptToNodes(data.sample_quote, 200)}"</p>
              <button onClick={() => setView("covered")} className="mt-3 text-xs text-neutral-500 hover:text-neutral-900">{t.seeAiResponse} →</button>
            </>
          ) : (
            <p className="mt-3 text-sm text-neutral-400">{t.whatAiSaysEmpty}</p>
          )}
        </div>

        <div id="sec-sources" className="scroll-mt-24"><SourceGap src={sourceChecks} t={t} /></div>

        {/* Citations table */}
        {data.citations && data.citations.length > 0 && (
          <div id="sec-citations" ref={citationsRef} className="mb-6 scroll-mt-24 rounded-2xl border border-neutral-150 bg-neutral-50/50 p-6">
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
                    {/* A dash when Google has no figure or the phrase was too
                        long to ask about. Absent, never zero — zero would claim
                        nobody searches it. */}
                    <td className="py-2.5 text-center text-xs">
                      {(() => {
                        const v = volumeByPrompt.get(g.prompt);
                        if (!v) return <span className="text-neutral-300" title={t.volumeMissing}>—</span>;
                        return (
                          <span className="text-neutral-600" title={v.phrase ? t.volumeDerived : t.volumeTitle}>
                            {v.volume.toLocaleString(lang === "ru" ? "ru-RU" : "en-US")}
                            {v.phrase && (
                              <span className="mt-0.5 block text-[10px] leading-tight text-neutral-400">{v.phrase}</span>
                            )}
                          </span>
                        );
                      })()}
                    </td>
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
        <button id="sec-recs" onClick={() => setView("recommendations")} className="flex w-full scroll-mt-24 items-center justify-between rounded-2xl border border-neutral-150 bg-neutral-900 p-6 text-left text-white transition-colors hover:bg-neutral-800">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">{t.recommendationsTitle}</p>
            <p className="mt-1 text-sm text-neutral-300">{t.recommendationsSub}</p>
          </div>
          <ArrowLeft className="h-5 w-5 rotate-180" />
        </button>
        </main>
      </div>
    </div>
  );
}

// keep this export tree-shakeable-safe; ChevronDown reserved for future expand affordances
void ChevronDown;
