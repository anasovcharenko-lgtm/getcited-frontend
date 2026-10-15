import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "./api";
import { supabase } from "./supabase";
import { signInWithGoogle } from "./auth";
import type { KeywordRow } from "./Dashboard";

const API_URL = "https://web-production-b2168.up.railway.app";

/* A keyword tool that belongs to nobody's audit.

   The same lookup already exists on the recommendations screen, but it is tied
   to the audit on display: it opens with that audit's market and sits inside a
   page about one brand. Research does not work that way — the question "is this
   phrase worth going after" usually gets asked before there is an audit at all,
   and often for a different market than whatever is open.

   So this is a separate page rather than a prop on the panel. The panel keeps
   its place next to the page check, where it answers "what should this brand
   add"; this answers "what is worth asking about in this market". */

/* The API's own limits, copied here only to warn before spending money: a
   phrase over either is rejected by DataForSEO rather than returned empty, and
   a lookup that was never going to work should not be paid for.

   The server stays authoritative — every row comes back with its own `too_long`
   and that is what the table shows. This is advisory, which is why it is
   allowed to be a copy. */
const MAX_WORDS = 10;
const MAX_CHARS = 80;

function eligible(phrase: string): boolean {
  return phrase.length <= MAX_CHARS && phrase.trim().split(/\s+/).length <= MAX_WORDS;
}

const COPY = {
  en: {
    title: "Keyword research",
    sub: "Search demand and ranking difficulty for any phrase, in any market. Independent of your audits.",
    back: "← Back",
    label: "Phrases, one per line",
    placeholder: "loyalty platform for retail\nbest loyalty program software\nhow to launch a loyalty program",
    market: "Market",
    marketsFailed: "The market list could not be loaded, so only the default market is available. The /markets endpoint may not be deployed.",
    run: "Look up",
    running: "Looking up…",
    failed: "The lookup failed.",
    signedOut: "Sign in to look up keyword data.",
    signIn: "Sign in with Google",
    counts: (total: number, ok: number, skip: number) =>
      skip > 0
        ? `${total} phrases · ${ok} will be looked up · ${skip} too long and will be skipped`
        : `${total} phrases · all will be looked up`,
    tooLongHint: `Phrases over ${MAX_WORDS} words or ${MAX_CHARS} characters are rejected by the keyword API. They are sent anyway and come back marked, so nothing is hidden — but they cost a request and return nothing.`,
    colKeyword: "Phrase",
    colVolume: "Volume / mo",
    colDifficulty: "Difficulty",
    colCpc: "CPC",
    colAds: "Ad competition",
    volumeTitle: "Average monthly Google searches. This is search volume, not prompt volume — nobody sells prompt volume.",
    difficultyTitle: "0–100, the estimated chance of reaching the organic top ten. Not the same as ad competition.",
    adsTitle: "How many advertisers bid on this phrase. Commercial interest, not ranking difficulty.",
    tooLongTag: "too long",
    footnote: (market: string) =>
      `Volume and difficulty are Google data for ${market}, supplied by DataForSEO. Volume is a monthly average and barely moves; a dash means either no data or a phrase the API rejected, never zero.`,
    empty: "Nothing looked up yet.",
    csv: "Download CSV",
    cost: "Each lookup is two paid requests, about ten cents, however many phrases are in it. Put them all in at once rather than one at a time.",
  },
  ru: {
    title: "Исследование ключевых слов",
    sub: "Спрос и сложность ранжирования для любой фразы на любом рынке. Не привязано к аудитам.",
    back: "← Назад",
    label: "Фразы, по одной в строке",
    placeholder: "платформа лояльности для ритейла\nлучшие программы лояльности\nкак запустить программу лояльности",
    market: "Рынок",
    marketsFailed: "Список рынков не загрузился, доступен только рынок по умолчанию. Возможно, эндпоинт /markets ещё не задеплоен.",
    run: "Проверить",
    running: "Проверяю…",
    failed: "Запрос не прошёл.",
    signedOut: "Войдите, чтобы смотреть данные по ключевым словам.",
    signIn: "Войти через Google",
    counts: (total: number, ok: number, skip: number) =>
      skip > 0
        ? `${total} фраз · ${ok} уйдёт в запрос · ${skip} слишком длинные, данных не будет`
        : `${total} фраз · все уйдут в запрос`,
    tooLongHint: `Фразы длиннее ${MAX_WORDS} слов или ${MAX_CHARS} символов API отклоняет. Они всё равно отправляются и возвращаются помеченными — ничего не скрывается, но данных по ним не будет.`,
    colKeyword: "Фраза",
    colVolume: "Частотность / мес",
    colDifficulty: "Сложность",
    colCpc: "CPC",
    colAds: "Конкуренция в рекламе",
    volumeTitle: "Среднее число запросов в Google за месяц. Это частотность поиска, а не частотность промптов — промптовую никто не продаёт.",
    difficultyTitle: "0–100, оценка шанса попасть в органический топ-10. Не то же самое, что конкуренция в рекламе.",
    adsTitle: "Сколько рекламодателей торгуется за фразу. Коммерческий интерес, а не сложность ранжирования.",
    tooLongTag: "слишком длинная",
    footnote: (market: string) =>
      `Частотность и сложность — данные Google по рынку «${market}» через DataForSEO. Частотность это среднее за месяц, она почти не меняется. Прочерк означает «нет данных» или отклонённую фразу, но никогда не ноль.`,
    empty: "Пока ничего не проверялось.",
    csv: "Скачать CSV",
    cost: "Один запрос — это два платных обращения, примерно десять центов, независимо от числа фраз. Выгоднее отправлять их все сразу, а не по одной.",
  },
} as const;

export default function Keywords({ lang = "en" }: { lang?: "en" | "ru" }) {
  const t = COPY[lang];

  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const [text, setText] = useState("");
  const [market, setMarket] = useState(lang === "ru" ? "RU" : "US");
  const [markets, setMarkets] = useState<{ code: string; name: string }[]>([]);
  /* Said out loud rather than swallowed. The dashboard's copy of this catch is
     silent, and that is exactly how a missing /markets endpoint went unnoticed
     for two days while the dropdown quietly offered one option. */
  const [marketsFailed, setMarketsFailed] = useState(false);

  const [rows, setRows] = useState<KeywordRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ranFor, setRanFor] = useState("");

  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    apiFetch(`${API_URL}/markets`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (!alive) return;
        if (Array.isArray(d?.markets) && d.markets.length) setMarkets(d.markets);
        else setMarketsFailed(true);
      })
      .catch(() => { if (alive) setMarketsFailed(true); });
    return () => { alive = false; };
  }, [signedIn]);

  const phrases = useMemo(
    () => Array.from(new Set(text.split("\n").map((l) => l.trim()).filter(Boolean))),
    [text]);
  const skipped = useMemo(() => phrases.filter((p) => !eligible(p)).length, [phrases]);

  const run = async () => {
    if (!phrases.length) return;
    setLoading(true); setError(""); setRows([]);
    try {
      const res = await apiFetch(`${API_URL}/keyword-research`, {
        method: "POST",
        body: JSON.stringify({ keywords: phrases, country: market }),
      });
      const out = await res.json();
      if (!res.ok || (out?.error && !Array.isArray(out?.results))) {
        setError(out?.detail || out?.error || t.failed);
      } else {
        setRows(out.results || []);
        setRanFor(markets.find((m) => m.code === market)?.name || market);
        // A lookup can return rows and still carry a vendor-level problem.
        // Showing both beats hiding one.
        if (out.error) setError(out.error);
      }
    } catch {
      setError(t.failed);
    } finally {
      setLoading(false);
    }
  };

  const downloadCsv = () => {
    const head = ["keyword", "search_volume", "keyword_difficulty", "cpc", "ad_competition", "too_long"];
    const esc = (v: unknown) =>
      v === null || v === undefined ? "" : `"${String(v).replace(/"/g, '""')}"`;
    const csv = [head.join(",")]
      .concat(rows.map((r) => [r.keyword, r.search_volume, r.keyword_difficulty,
                               r.cpc, r.ad_competition, r.too_long].map(esc).join(",")))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `keywords-${market.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const num = (v: number | null, fmt?: (n: number) => string) =>
    typeof v === "number" ? (fmt ? fmt(v) : v.toLocaleString(lang === "ru" ? "ru-RU" : "en-US"))
                          : <span className="text-neutral-300">—</span>;

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <header className="border-b border-neutral-100">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
          <Link to={lang === "ru" ? "/ru" : "/"} className="text-sm text-neutral-500 hover:text-neutral-900">
            {t.back}
          </Link>
          <Link to={lang === "ru" ? "/keywords" : "/ru/keywords"} className="text-xs text-neutral-400 hover:text-neutral-900">
            {lang === "ru" ? "English" : "Русский"}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight">{t.title}</h1>
        <p className="mt-2 max-w-2xl text-neutral-500">{t.sub}</p>

        {signedIn === false && (
          <div className="mt-8 rounded-2xl border border-neutral-150 bg-neutral-50/60 p-6">
            <p className="text-sm text-neutral-600">{t.signedOut}</p>
            <button
              onClick={signInWithGoogle}
              className="mt-4 h-10 rounded-lg bg-neutral-900 px-5 text-sm font-medium text-white hover:bg-neutral-800"
            >
              {t.signIn}
            </button>
          </div>
        )}

        {signedIn && (
          <>
            <section className="mt-8 rounded-2xl border border-neutral-150 bg-neutral-50/60 p-6">
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-500">{t.label}</span>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={8}
                  placeholder={t.placeholder}
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 font-mono text-sm outline-none focus:border-neutral-900"
                />
              </label>

              {phrases.length > 0 && (
                <p className="mt-2 text-xs text-neutral-500">
                  {t.counts(phrases.length, phrases.length - skipped, skipped)}
                </p>
              )}
              {skipped > 0 && <p className="mt-1 text-[11px] leading-relaxed text-neutral-400">{t.tooLongHint}</p>}

              <div className="mt-4 flex flex-wrap items-end gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-neutral-500">{t.market}</span>
                  <select
                    value={market}
                    onChange={(e) => setMarket(e.target.value)}
                    className="h-10 rounded-lg border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-neutral-900"
                  >
                    {(markets.length ? markets : [{ code: market, name: market }])
                      .map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}
                  </select>
                </label>
                <button
                  onClick={run}
                  disabled={loading || !phrases.length}
                  className="h-10 rounded-lg bg-neutral-900 px-5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
                >
                  {loading ? t.running : t.run}
                </button>
              </div>

              {marketsFailed && <p className="mt-3 text-xs text-amber-700">{t.marketsFailed}</p>}
              {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
              <p className="mt-4 text-[11px] leading-relaxed text-neutral-400">{t.cost}</p>
            </section>

            <section className="mt-8">
              {rows.length === 0 && <p className="text-sm text-neutral-400">{t.empty}</p>}
              {rows.length > 0 && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-widest text-neutral-400">{ranFor}</p>
                    <button onClick={downloadCsv} className="text-xs text-neutral-500 underline hover:text-neutral-900">
                      {t.csv}
                    </button>
                  </div>
                  <table className="mt-3 w-full text-sm">
                    <thead>
                      <tr className="border-b border-neutral-200 text-left text-xs text-neutral-400">
                        <th className="pb-2 font-medium">{t.colKeyword}</th>
                        <th className="pb-2 pl-4 text-right font-medium" title={t.volumeTitle}>{t.colVolume}</th>
                        <th className="pb-2 pl-4 text-right font-medium" title={t.difficultyTitle}>{t.colDifficulty}</th>
                        <th className="pb-2 pl-4 text-right font-medium">{t.colCpc}</th>
                        {/* Kept under its own name so it is never read as ranking
                            difficulty — the two get confused constantly. */}
                        <th className="pb-2 pl-4 text-right font-medium" title={t.adsTitle}>{t.colAds}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i} className="border-b border-neutral-100 last:border-0">
                          <td className="py-2 pr-3 text-xs">
                            {r.keyword}
                            {r.too_long && (
                              <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-400">
                                {t.tooLongTag}
                              </span>
                            )}
                          </td>
                          <td className="py-2 pl-4 text-right text-xs tabular-nums">{num(r.search_volume)}</td>
                          {/* 0 is a real difficulty, so it must not fall into the dash. */}
                          <td className="py-2 pl-4 text-right text-xs tabular-nums">{num(r.keyword_difficulty)}</td>
                          <td className="py-2 pl-4 text-right text-xs tabular-nums">{num(r.cpc, (n) => `$${n.toFixed(2)}`)}</td>
                          <td className="py-2 pl-4 text-right text-xs tabular-nums">{num(r.ad_competition, (n) => n.toFixed(2))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-4 text-[11px] leading-relaxed text-neutral-400">{t.footnote(ranFor)}</p>
                </>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
