import { useEffect, useState } from "react";

const API_URL = "https://web-production-b2168.up.railway.app";

/* `unavailable` lists the models that cannot answer about this market, and is
   absent for almost all of them. Russia and Belarus carry one because the
   vendor behind Copilot and AI Mode does not sell those countries — a fact
   the form should state before a run rather than leave someone to notice
   afterwards that two columns are missing. */
export type Market = {
  code: string;
  name: string;
  language: string;
  unavailable?: string[];
};

/* Language names, because the form offers names and the API speaks ISO codes.

   The audit's language is a separate question from its market — a brand
   selling into Spain may be courting English-speaking buyers there — so the
   market only proposes a language and the form lets it be changed. */
export const LANGUAGE_NAMES: Record<string, string> = {
  en: "English", ru: "Russian", uk: "Ukrainian", de: "German", fr: "French",
  es: "Spanish", it: "Italian", nl: "Dutch", pl: "Polish", tr: "Turkish",
  pt: "Portuguese", ja: "Japanese", ko: "Korean", "zh-CN": "Chinese",
  "zh-TW": "Chinese", ar: "Arabic", he: "Hebrew", sv: "Swedish",
  no: "Norwegian", da: "Danish", fi: "Finnish", is: "Icelandic",
  cs: "Czech", sk: "Slovak", hu: "Hungarian", ro: "Romanian",
  bg: "Bulgarian", el: "Greek", hr: "Croatian", sr: "Serbian",
  sl: "Slovenian", lt: "Lithuanian", lv: "Latvian", et: "Estonian",
  th: "Thai", vi: "Vietnamese", id: "Indonesian", ms: "Malay",
  bn: "Bengali", hi: "Hindi",
};

export const LANGUAGES = [
  "English", "Russian", "German", "French", "Spanish", "Italian",
  "Portuguese", "Dutch", "Polish", "Turkish", "Ukrainian",
  "Japanese", "Korean", "Chinese", "Swedish", "Norwegian", "Danish",
  "Arabic", "Hebrew", "Hindi", "Indonesian", "Vietnamese", "Thai",
  "Czech", "Greek", "Hungarian", "Romanian", "Finnish",
];

export function languageNameFor(market?: Market): string {
  if (!market) return "English";
  return LANGUAGE_NAMES[market.language] || "English";
}

/* Shown until the real list arrives, and if it never does.

   Short on purpose. It is not a second copy of the market list to keep in
   step — it is the handful of markets the select can offer in the half second
   before the server answers, so the control is never empty. The list that
   decides what actually runs lives on the server, which is the only place
   that knows which markets the data vendor still supports. */
export const FALLBACK_MARKETS: Market[] = [
  { code: "US", name: "United States", language: "en" },
  { code: "GB", name: "United Kingdom", language: "en" },
  { code: "DE", name: "Germany", language: "de" },
  { code: "FR", name: "France", language: "fr" },
  { code: "ES", name: "Spain", language: "es" },
  { code: "CA", name: "Canada", language: "en" },
  { code: "AU", name: "Australia", language: "en" },
  { code: "MX", name: "Mexico", language: "es" },
  { code: "RU", name: "Russia", language: "ru" },
];

let cached: Market[] | null = null;

/* The markets an audit can run in, from the server.

   This list used to be written by hand in three files — twice in the frontend
   and once in the backend — and the three had drifted apart: two countries
   were offered here with no entry on the server, where an unknown code falls
   through to the United States. So an audit of Japan ran in the United States
   and the report said Japan. Nothing on the screen contradicted it.

   Fetched once per page load and shared, so a page with two selects makes one
   request. */
export function useMarkets(): { markets: Market[]; loading: boolean } {
  const [markets, setMarkets] = useState<Market[]>(cached || FALLBACK_MARKETS);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    if (cached) return;
    let alive = true;
    fetch(`${API_URL}/markets`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        const list: Market[] = Array.isArray(d?.markets) ? d.markets : [];
        if (!list.length) throw new Error("empty market list");
        cached = list;
        if (alive) setMarkets(list);
      })
      .catch((e) => {
        // The built-in handful stays on screen. An audit form that cannot name
        // a single market is worse than one that names eight.
        console.error("markets fetch failed, using the built-in list", e);
      })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  return { markets, loading };
}

/* The market and language a form is set to.

   A hook rather than four `useState`s in each of two files, because the rule
   that ties them together is the part worth writing once: picking a market
   proposes its language, and choosing a language by hand means the next market
   must not overwrite it.

   It also settles what happens when the selected market is not on the server's
   list. That is not hypothetical — the data vendor's documentation says Russia
   and Belarus are no longer served, and this page opens on Russia. Leaving the
   code selected would run the audit in whatever the server falls back to and
   label the result Russia, which is the fault this whole change exists to
   remove. So the selection moves to a market that does exist. */
export function useMarketChoice(initialCode: string) {
  const { markets, loading } = useMarkets();
  const [country, setCountry] = useState(initialCode);
  const [language, setLanguage] = useState(() =>
    languageNameFor(FALLBACK_MARKETS.find((m) => m.code === initialCode)));
  const [languageChosen, setLanguageChosen] = useState(false);

  useEffect(() => {
    if (!markets.length) return;
    const here = markets.find((m) => m.code === country);
    if (!here) {
      const next = markets[0];
      setCountry(next.code);
      if (!languageChosen) setLanguage(languageNameFor(next));
      return;
    }
    // The real list can propose a different language than the placeholder did.
    if (!languageChosen) setLanguage(languageNameFor(here));
  }, [markets]);

  return {
    markets,
    loading,
    country,
    language,
    chooseCountry(code: string) {
      setCountry(code);
      if (!languageChosen) {
        setLanguage(languageNameFor(markets.find((m) => m.code === code)));
      }
    },
    chooseLanguage(name: string) {
      setLanguageChosen(true);
      setLanguage(name);
    },
  };
}
