/* Things the platforms did, on the dates they did them.

   A visibility score moves for three kinds of reason: the brand changed, the
   measurement changed, or the platform changed underneath both. Only the first
   is the customer's doing, and nothing on this screen distinguished them.

   November 2026 is the case that made it worth building. Google began a core
   update on the 10th and switched AI Mode's default model to Gemini 4 Hydrogen
   on the 12th. Any before-and-after comparison spanning that week mixes three
   causes, and the one a reader reaches for first is "our marketing failed".
   Being able to say "two of these are Google's" is worth more than another
   chart.

   Hand-written, and it has to be: nobody publishes a feed of "we changed the
   model behind AI Mode" — that one was a post on X. So each entry carries the
   source it came from, and the interface links it, because a claim about
   someone else's product that the reader cannot check is worse than silence.

   Dates are the day the change began, UTC. A rollout that takes two weeks is
   marked at its start and given its `endsOn`, since the whole window is
   unreliable rather than the first day of it. */
export type PlatformEvent = {
  /** ISO date the change began. */
  date: string;
  /** ISO date the rollout finished, where it was not instant. */
  endsOn?: string;
  /** Which models this touches. Empty means every surface. */
  models?: string[];
  label: { en: string; ru: string };
  /** What it means for a number measured around this date. */
  note: { en: string; ru: string };
  source: string;
};

export const PLATFORM_EVENTS: PlatformEvent[] = [
  {
    date: "2026-11-10",
    endsOn: "2026-11-24",
    models: ["ai_overview", "ai_mode"],
    label: {
      en: "Google November 2026 core update",
      ru: "Core update Google, ноябрь 2026",
    },
    note: {
      en: "Rolled out globally and in all languages, over roughly two weeks. Rankings moved for reasons unrelated to your brand, and AI answers draw on those rankings.",
      ru: "Раскатка по всему миру и на всех языках, около двух недель. Позиции двигались по причинам, не связанным с брендом, а ответы ИИ опираются на эти позиции.",
    },
    source: "https://status.search.google.com/products/rGHU1u87FJnkP6W2GwMi/history",
  },
  {
    date: "2026-11-12",
    models: ["ai_mode", "ai_overview"],
    label: {
      en: "AI Mode switched to Gemini 4 Hydrogen",
      ru: "AI Mode перешёл на Gemini 4 Hydrogen",
    },
    note: {
      en: "Google made Hydrogen the default model in AI Mode, and uses it for some AI Overview questions. Answers before and after this date come from different models, so they are not strictly comparable.",
      ru: "Google сделал Hydrogen моделью по умолчанию в AI Mode и использует его для части вопросов в AI Overview. Ответы до и после этой даты даны разными моделями, то есть строго сравнивать их нельзя.",
    },
    source: "https://blog.google/products/search/ai-mode-gemini-4-hydrogen/",
  },
];

/** Events overlapping a window, newest first. A rollout counts for every day
 *  it was still running, not only the day it started. */
export function eventsBetween(from: Date, to: Date, model?: string): PlatformEvent[] {
  const a = from.getTime(), b = to.getTime();
  return PLATFORM_EVENTS
    .filter((e) => {
      if (model && e.models && !e.models.includes(model)) return false;
      const start = Date.parse(e.date);
      const end = e.endsOn ? Date.parse(e.endsOn) : start;
      return end >= a && start <= b;
    })
    .sort((x, y) => Date.parse(y.date) - Date.parse(x.date));
}

/** Events a single run should be read alongside: anything still rolling out
 *  when it was measured, or finished within the previous fortnight. */
export function eventsAround(when: Date, model?: string): PlatformEvent[] {
  const FORTNIGHT = 14 * 24 * 3600 * 1000;
  return eventsBetween(new Date(when.getTime() - FORTNIGHT), when, model);
}
