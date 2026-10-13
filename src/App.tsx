import { useEffect, useRef, useState } from "react";
import { supabase } from './supabase'
import { signInWithGoogle, signOut } from './auth'


import { ArrowRight, Check, X } from "lucide-react";
import { Dashboard, MODELS, type AuditData } from "./Dashboard";

import { COMPANY, companyLine } from "./legal/company";

import { isAdmin } from "./admins";
import { saveAuditRun } from "./saveAudit";
import { Projects } from "./Projects";
import { apiFetch } from "./api";
import { WaitlistForm } from "./Waitlist";

const BRAND = "GetCited";
const API_URL = "https://web-production-b2168.up.railway.app";

// Every prompt costs money, so the hand-written list has a ceiling too.
const MAX_PROMPTS = 20;

const LANGUAGES = [
  "English", "Russian", "German", "French", "Spanish", "Italian",
  "Portuguese", "Dutch", "Polish", "Turkish", "Ukrainian",
  "Japanese", "Korean", "Chinese", "Swedish", "Norwegian", "Danish",
];

// Default language for a market. Editable, because country and language are
// different questions: a UK-targeted brand can have a Russian-speaking audience.
const COUNTRY_LANGUAGE: Record<string, string> = {
  US: "English", GB: "English", CA: "English", AU: "English", IN: "English",
  RU: "Russian", KZ: "Russian", UA: "Ukrainian",
  DE: "German", FR: "French", ES: "Spanish", IT: "Italian",
  NL: "Dutch", PL: "Polish", TR: "Turkish",
  BR: "Portuguese", MX: "Spanish", JP: "Japanese",
};

const MARKETS = [
  { code: "US", label: "United States" },
  { code: "GB", label: "United Kingdom" },
  { code: "RU", label: "Russia" },
  { code: "DE", label: "Germany" },
  { code: "FR", label: "France" },
  { code: "ES", label: "Spain" },
  { code: "IT", label: "Italy" },
  { code: "NL", label: "Netherlands" },
  { code: "PL", label: "Poland" },
  { code: "CA", label: "Canada" },
  { code: "AU", label: "Australia" },
  { code: "IN", label: "India" },
  { code: "BR", label: "Brazil" },
  { code: "MX", label: "Mexico" },
  { code: "JP", label: "Japan" },
  { code: "UA", label: "Ukraine" },
  { code: "KZ", label: "Kazakhstan" },
  { code: "TR", label: "Turkey" },
];


/* What actually runs. The list used to carry nine names, five of which had no
   code behind them — which is a strange thing to claim on a page selling you as
   the company that checks whether AI tells the truth about brands. */
/* Every figure on this page names where it came from, and links to it.
   The widely quoted "23x" is one company measuring its own site for thirty
   days; printing that bare, on the homepage of a tool that sells checking
   rather than assuming, would undercut the product on its own front page.
   Two numbers that were asked for are absent because they could not be
   sourced: Adobe's current figure for AI-referred retail traffic is roughly
   double year on year rather than 9.7x, and no basis was found for a hundred
   million daily AI searchers. */
const CLAIMS = [
  {
    figure: "23×",
    claim: "Visitors arriving from AI answers converted 23 times better than organic search.",
    detail: "They were 0.5% of visits and 12.1% of signups. One company, its own site, thirty days — small, and worth knowing.",
    host: "ahrefs.com", path: "/blog/ai-search-traffic-conversions-ahrefs",
    href: "https://ahrefs.com/blog/ai-search-traffic-conversions-ahrefs/",
    source: "Ahrefs Web Analytics, measuring ahrefs.com",
  },
  {
    figure: "~55%",
    claim: "Around half of Google searches now return an AI Overview.",
    detail: "Informational and longer questions most of all — and not the same half from one week to the next.",
    host: "dataforseo.com", path: "/apis/serp-api",
    href: "https://dataforseo.com/apis/serp-api",
    source: "DataForSEO SERP data",
  },
  /* This one replaced a second-hand "AI traffic doubled" figure. That claim
     argued for the category, which the hero line already does, and said
     nothing about why anyone needs this product. This one is the measured
     version of the section immediately below it — so the assertion that each
     platform is its own ecosystem now arrives already evidenced.

     Stated as a Jaccard index as well as a percentage because that is the
     figure in the paper, and a reader who checks should find the same number
     rather than a rounded restatement of it. */
  {
    figure: "20%",
    claim: "Any two AI platforms share only about a fifth of the sources they cite most.",
    detail: "Ten platforms — among them ChatGPT, Google AI, Perplexity and DeepSeek — 17,211 citations over 6,356 domains. Mean overlap between any pair's top-20 cited sources: a Jaccard index of 0.201. Being named by one is not evidence about any other.",
    host: "arxiv.org", path: "/abs/2610.11932",
    href: "https://arxiv.org/abs/2610.11932",
    source: "Liu et al., Fudan University — measured March–April 2026",
  },
];

const AI_LOGOS = ["ChatGPT", "Google AI Overviews", "Gemini", "Perplexity", "DeepSeek"];





function Reveal({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }, { threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  // motion-reduce: the whole page is built out of these, so without it a
  // reader who has asked their system for less motion gets the most.
  return <div ref={ref} className={`transition-all duration-700 ease-out motion-reduce:transition-none motion-reduce:translate-y-0 motion-reduce:opacity-100 ${shown ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"} ${className}`}>{children}</div>;
}

function LoadingScreen({ brand }: { brand: string }) {
  const [step, setStep] = useState(0);
  const steps = [
    "Определяем категорию бренда...",
    "Генерируем релевантные промпты...",
    "Проверяем видимость в Gemini...",
    "Проверяем видимость в ChatGPT...",
    "Анализируем конкурентов...",
    "Генерируем рекомендации...",
  ];
  useEffect(() => {
    const interval = setInterval(() => {
      setStep(s => s < steps.length - 1 ? s + 1 : s);
    }, 7000);
    return () => clearInterval(interval);
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white">
      <div className="text-center max-w-sm px-6">
        <div className="mb-8 flex justify-center">
          <div className="h-12 w-12 rounded-full border-2 border-neutral-200 border-t-neutral-900 animate-spin" />
        </div>
        <h2 className="text-xl font-bold text-neutral-900 mb-2">Анализируем {brand}</h2>
        <p className="text-sm text-neutral-500 mb-6">{steps[step]}</p>
        <div className="flex gap-1 justify-center">
          {steps.map((_, i) => (
            <div key={i} className={`h-1 rounded-full transition-all duration-500 ${i <= step ? "bg-neutral-900 w-6" : "bg-neutral-200 w-3"}`} />
          ))}
        </div>
        <p className="mt-6 text-xs text-neutral-400">Обычно занимает 30-60 секунд</p>
      </div>
    </div>
  );
}

function Modal({ onClose, onAuditComplete }: { onClose: () => void; onAuditComplete: (data: AuditData, auditId: string | number | null) => void }) {
  const [brand, setBrand] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [country, setCountry] = useState("US");
  const [language, setLanguage] = useState(COUNTRY_LANGUAGE["US"]);
  // Decides how the queries split between broad and long-tail. A mid-size brand
  // cannot win a broad comparison query however good its site is, so measuring
  // it mostly on those spends the audit on ground it cannot take.
  const [brandSize, setBrandSize] = useState("mid");
  /* Which models this audit runs. Unticking one keeps it out of this audit and
     out of its cost; the backend narrows further if a model is switched off
     globally, because enabling one is a billing decision, not a per-audit one. */
  const [models, setModels] = useState<string[]>(MODELS.map((m) => m.key));
  const toggleModel = (m: string) =>
    setModels((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));
  const [comps, setComps] = useState([{ name: "", website: "" }]);
  const [step, setStep] = useState(1);
  // "generate" asks the model to build the prompt set; "manual" runs exactly
  // what is typed and skips generation entirely.
  const [mode, setMode] = useState<"generate" | "manual">("generate");
  const [customRows, setCustomRows] = useState<string[]>([""]);
  const [tracked, setTracked] = useState<string[]>([]);
  const [trackedLoading, setTrackedLoading] = useState(false);
  const [showDescription, setShowDescription] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!brand.trim() || brand.length < 3) { setShowDescription(false); return; }
    const timer = setTimeout(async () => {
      setChecking(true);
      try {
        const res = await apiFetch(`${API_URL}/check-brand`, { method: "POST", body: JSON.stringify({ brand: brand.trim() }) });
        const data = await res.json();
        setShowDescription(!data.known);
      } catch { setShowDescription(true); }
      finally { setChecking(false); }
    }, 1000);
    return () => clearTimeout(timer);
  }, [brand]);

  /* Prompts the user chose to track run in every audit - otherwise they would
     sit in the list forever with no status, and tracking would mean nothing. */
  useEffect(() => {
    if (step !== 2 || !brand.trim()) return;
    let cancelled = false;
    (async () => {
      setTrackedLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from("tracked_prompts")
          .select("prompt")
          .eq("user_id", user.id)
          .ilike("brand", brand.trim());
        if (!cancelled) setTracked((data || []).map((r: { prompt: string }) => r.prompt));
      } catch {
        if (!cancelled) setTracked([]);
      } finally {
        if (!cancelled) setTrackedLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [step, brand]);

  const customLines = customRows.map((l) => l.trim()).filter(Boolean);

  /* Pasting a whole list into any row spreads it across rows. People arrive
     with the list already written somewhere, so refusing multi-line paste
     would mean retyping it line by line. */
  const spreadPaste = (index: number, text: string) => {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return false;
    const next = [...customRows];
    next.splice(index, 1, ...lines);
    setCustomRows(next.slice(0, MAX_PROMPTS));
    return true;
  };
  // Everything this audit will measure, used only to validate the form. What
  // the request actually sends is split in two: typed prompts replace
  // generation, tracked prompts are added to it.
  const promptsToRun = Array.from(new Set([
    ...(mode === "manual" ? customLines.slice(0, MAX_PROMPTS) : []),
    ...tracked,
  ]));

  const startAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brand.trim()) return;
    if (mode === "manual" && promptsToRun.length === 0) { setError("Add at least one prompt, or switch to generate."); return; }
    setLoading(true);
    setError("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { count } = await supabase
          .from('audits')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);
        if (!isAdmin(user.email) && (count ?? 0) >= 1) {
          setError("Free trial limit reached. Upgrade to run more audits.");
          setLoading(false);
          return;
        }
      }
      const res = await apiFetch(`${API_URL}/audit`, { method: "POST", body: JSON.stringify({ brand: brand.trim(), competitor_list: comps.filter(c => c.name.trim()).map(c => ({ name: c.name.trim(), website: c.website.trim() })), description: description.trim(), website: website.trim(), country, language, brand_size: brandSize, models, /* Typed prompts replace generation; tracked ones are added to it. Sending tracked as custom_prompts is what used to switch generation off. */ custom_prompts: mode === "manual" ? customLines.slice(0, MAX_PROMPTS) : [], extra_prompts: tracked }) });
      const data = await res.json();

      /* A failed response is still JSON, and it used to be handed to the
         dashboard as if it were an audit. The dashboard then read fields that
         were not there and the page went blank, hiding the real error. */
      if (!res.ok) {
        const detail = Array.isArray(data?.detail)
          ? data.detail.map((d: { loc?: string[]; msg?: string }) =>
              `${(d.loc || []).slice(-1)[0] || ""} ${d.msg || ""}`.trim()).join("; ")
          : typeof data?.detail === "string" ? data.detail : "";
        setError(detail ? `The audit could not run: ${detail}` : "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }
      if (!data || !Array.isArray(data.results)) {
        setError("Something went wrong. Please try again.");
        setLoading(false);
        return;
      }

      let savedId: string | number | null = null;
      if (user) {
        /* The run itself plus one row per prompt per model. A failure here must
           not stop the audit being shown — the history is for later, the result
           is for now. */
        try {
          savedId = await saveAuditRun({
            userId: user.id,
            brand: brand.trim(),
            country,
            language,
            brandSize,
            data,
          });
        } catch (e) {
          console.error("audit history not saved", e);
        }
      }
      onAuditComplete(data, savedId);
    } catch { setError("Something went wrong. Please try again."); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {loading && <LoadingScreen brand={brand} />}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={loading ? undefined : onClose} />
      <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl bg-white p-8 shadow-2xl">
        <button onClick={onClose} className="sticky top-0 float-right -mr-2 -mt-2 text-neutral-300 hover:text-neutral-600"><X className="h-5 w-5" /></button>
        <h2 className="text-2xl font-bold">Audit your brand</h2>
        <p className="mt-1 text-sm text-neutral-500">See how often AI recommends you vs competitors.</p>
        <form onSubmit={startAudit} className="mt-6 flex flex-col gap-3">
          {step === 1 && (<>
          <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Your brand name" className="h-12 w-full rounded-lg border border-neutral-200 px-4 text-sm outline-none focus:border-neutral-900" />
          {checking && <p className="text-xs text-neutral-400">Checking brand...</p>}
          {showDescription && <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does your brand do? (e.g. CRM for small teams)" className="h-12 w-full rounded-lg border border-neutral-200 px-4 text-sm outline-none focus:border-neutral-900" />}
          <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="Your website (optional, improves accuracy)" className="h-12 w-full rounded-lg border border-neutral-200 px-4 text-sm outline-none focus:border-neutral-900" />
          <div>
            <span className="mb-1 block text-xs text-neutral-500">Which models to check</span>
            <div className="flex flex-wrap gap-2">
              {MODELS.map((m) => (
                <label key={m.key} className="flex cursor-pointer items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm">
                  <input type="checkbox" checked={models.includes(m.key)} onChange={() => toggleModel(m.key)} className="h-4 w-4 accent-neutral-900" />
                  {m.label}
                </label>
              ))}
            </div>
            <span className="mt-1 block text-xs text-neutral-400">Untick a model to leave it out of this audit and out of its cost. A model switched off on the server stays off either way.</span>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">How well known is your brand?</span>
            <select value={brandSize} onChange={(e) => setBrandSize(e.target.value)} className="h-12 w-full rounded-lg border border-neutral-200 bg-white px-4 text-sm outline-none focus:border-neutral-900">
              <option value="large">Large or well known — people search us by name</option>
              <option value="mid">Mid-size, little or no SEO</option>
              <option value="small">Small or new — few people have heard of us</option>
            </select>
            <span className="mt-1 block text-xs text-neutral-400">Changes which questions we ask. Smaller brands are measured on narrower questions, where being known is not what decides the answer.</span>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">Country for AI results</span>
            <select value={country} onChange={(e) => { setCountry(e.target.value); setLanguage(COUNTRY_LANGUAGE[e.target.value] || "English"); }} className="h-12 w-full rounded-lg border border-neutral-200 bg-white px-4 text-sm outline-none focus:border-neutral-900">
              {MARKETS.map((m) => (<option key={m.code} value={m.code}>{m.label}</option>))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">Language for AI results</span>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} className="h-12 w-full rounded-lg border border-neutral-200 bg-white px-4 text-sm outline-none focus:border-neutral-900">
              {LANGUAGES.map((l) => (<option key={l} value={l}>{l}</option>))}
            </select>
          </label>
          <div>
            <span className="mb-1 block text-xs text-neutral-500">Competitors</span>
            {comps.map((c, i) => (
              <div key={i} className="mb-2 flex gap-2">
                <input value={c.name} onChange={(e) => setComps(comps.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Name" className="h-12 w-1/2 rounded-lg border border-neutral-200 px-4 text-sm outline-none focus:border-neutral-900" />
                <input value={c.website} onChange={(e) => setComps(comps.map((x, j) => j === i ? { ...x, website: e.target.value } : x))} placeholder="Website (optional)" className="h-12 w-1/2 rounded-lg border border-neutral-200 px-4 text-sm outline-none focus:border-neutral-900" />
              </div>
            ))}
            {comps.length < 5 && (
              <button type="button" onClick={() => setComps([...comps, { name: "", website: "" }])} className="text-xs text-neutral-500 hover:text-neutral-900">+ Add competitor</button>
            )}
          </div>
          <button type="button" onClick={() => setStep(2)} disabled={!brand.trim()} className="h-12 rounded-lg bg-neutral-900 text-sm text-white hover:bg-neutral-800 disabled:opacity-50 font-medium">Next →</button>
          </>)}

          {step === 2 && (<>
          <div>
            <h3 className="text-sm font-medium">Which prompts to check</h3>
            <p className="mt-0.5 text-xs text-neutral-500">Write your own, or let us generate them from your category.</p>
          </div>
          {trackedLoading && <p className="text-xs text-neutral-400">Loading your tracked prompts…</p>}
          {tracked.length > 0 && (
            <div className="rounded-lg border border-neutral-200 p-3">
              <p className="text-xs font-medium">{`${tracked.length} tracked prompt(s) run as well as the rest`}</p>
              <p className="mt-1 text-xs text-neutral-400">You chose to track these earlier. They are added to whatever else this audit runs, so each one costs an extra check.</p>
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => setMode("generate")} className={`h-10 flex-1 rounded-lg border text-xs font-medium ${mode === "generate" ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 text-neutral-600"}`}>Generate for me</button>
            <button type="button" onClick={() => setMode("manual")} className={`h-10 flex-1 rounded-lg border text-xs font-medium ${mode === "manual" ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 text-neutral-600"}`}>Write my own</button>
          </div>
          {mode === "manual" ? (
            <div>
              {customRows.map((row, i) => (
                <div key={i} className="mb-2 flex items-center gap-2">
                  <span className="w-5 shrink-0 text-right text-xs text-neutral-400">{i + 1}.</span>
                  <input
                    value={row}
                    onChange={(e) => setCustomRows(customRows.map((x, j) => (j === i ? e.target.value : x)))}
                    onPaste={(e) => {
                      if (spreadPaste(i, e.clipboardData.getData("text"))) e.preventDefault();
                    }}
                    placeholder="Prompt"
                    className="h-11 flex-1 rounded-lg border border-neutral-200 px-3 text-sm outline-none focus:border-neutral-900"
                  />
                  {customRows.length > 1 && (
                    <button type="button" onClick={() => setCustomRows(customRows.filter((_, j) => j !== i))} className="shrink-0 text-neutral-300 hover:text-neutral-600">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              <div className="flex items-center justify-between">
                {customRows.length < MAX_PROMPTS ? (
                  <button type="button" onClick={() => setCustomRows([...customRows, ""])} className="text-xs text-neutral-500 hover:text-neutral-900">+ Add prompt</button>
                ) : <span />}
                <span className="text-xs text-neutral-400">{customLines.length} prompt(s)</span>
              </div>
            </div>
          ) : (
            <p className="rounded-lg bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-500">Generated prompts cover six kinds of query: comparison, commercial, problem, brand, industry and technical.</p>
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={loading} className="h-12 rounded-lg bg-neutral-900 text-sm text-white hover:bg-neutral-800 disabled:opacity-50 flex items-center gap-2 justify-center font-medium">
            {loading ? "..." : <><span>{mode === "manual" ? "Run these prompts" : "Generate and run"}</span><ArrowRight className="h-4 w-4" /></>}
          </button>
          <button type="button" onClick={() => setStep(1)} className="text-xs text-neutral-400 hover:text-neutral-900">← Back</button>
          </>)}
        </form>
        <p className="mt-3 text-center text-xs text-neutral-400">Free to start · no credit card</p>
      </div>
    </div>
  );
}

export default function App() {
  const [showModal, setShowModal] = useState(false);
  const [user, setUser] = useState<any>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const [auditData, setAuditData] = useState<AuditData | null>(null);
  const [auditId, setAuditId] = useState<string | number | null>(null);
  const [showProjects, setShowProjects] = useState(false);

  if (auditData) return <Dashboard data={auditData} auditId={auditId} onBack={() => setAuditData(null)} lang="en" brandName={BRAND} />;
  if (showProjects) return <Projects lang="en" onBack={() => setShowProjects(false)} onOpen={(d, id) => { setAuditData(d); setAuditId(id); setShowProjects(false); }} />;

  const handleStartAudit = () => {
    if (!user) {
      signInWithGoogle();
    } else {
      setShowModal(true);
    }
  };

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <style>{`@keyframes marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}`}</style>
      {showModal && <Modal onClose={() => setShowModal(false)} onAuditComplete={(data, id) => { setShowModal(false); setAuditData(data); setAuditId(id); }} />}

      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-neutral-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-900 text-white"><span className="text-sm font-bold">G</span></div>
            <span className="font-semibold">{BRAND}</span>
          </div>
          <nav className="hidden items-center gap-8 text-sm text-neutral-500 md:flex">
            <a href="#how" className="hover:text-neutral-900">How it works</a>
            <a href="#pricing" className="hover:text-neutral-900">Pricing</a>
            <a href="#blog" className="hover:text-neutral-900">Blog</a>
          </nav>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-1 text-xs text-neutral-400 sm:flex">
              <a href="/" className="font-medium text-neutral-900">EN</a>
              <span>|</span>
              <a href="/ru" className="hover:text-neutral-900">RU</a>
            </div>
            {user && (
              <button onClick={() => setShowProjects(true)} className="hidden text-sm text-neutral-500 hover:text-neutral-900 sm:block">My projects</button>
            )}
            <button onClick={user ? signOut : signInWithGoogle} className="hidden text-sm text-neutral-500 hover:text-neutral-900 sm:block">{user ? user.email?.split("@")[0] : "Sign in"}</button>
            {user ? (
              <button onClick={handleStartAudit} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800">Start free</button>
            ) : (
              <a href="#waitlist" className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800">Join waiting list</a>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative mx-auto max-w-5xl px-6 pb-20 pt-24 md:pt-32">
        <Reveal>
          <p className="text-sm text-neutral-400">Tracking ChatGPT · Google AI Overviews · Gemini · Perplexity · DeepSeek</p>
        </Reveal>
        <Reveal>
          <h1 className="mt-4 max-w-3xl text-balance text-5xl font-bold leading-tight tracking-tight md:text-6xl">
            Win more clients.<br />Get cited by AI.
          </h1>
        </Reveal>
        <Reveal>
          <p className="mt-6 max-w-xl text-lg text-neutral-500">
            See how often AI recommends your brand. Get the actionable recommendations to outflank your competitors.
          </p>
        </Reveal>
        <Reveal>
          {/* Signed in keeps the tool; everyone else joins the list. An
              anonymous visitor running an audit costs a real OpenAI call for a
              brand we never hear about again, and the service is not open yet. */}
          {user ? (
            <>
              <div className="mt-8 flex items-center gap-4">
                <button onClick={handleStartAudit} className="flex items-center gap-2 rounded-lg bg-neutral-900 px-6 py-3 text-sm font-medium text-white hover:bg-neutral-800">
                  Start free audit <ArrowRight className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-3 text-xs text-neutral-400">Free to start · no credit card</p>
            </>
          ) : (
            <WaitlistForm lang="en" source="home_hero_en" className="mt-8 scroll-mt-24" id="waitlist" />
          )}
        </Reveal>
      </section>

      {/* Marquee */}
      <section className="border-y border-neutral-100 py-5">
        <p className="mb-3 text-center text-[10px] uppercase tracking-widest text-neutral-400">One feed · every major AI model</p>
        <div className="relative overflow-hidden">
          <div className="flex w-max animate-[marquee_25s_linear_infinite] gap-12 pr-12">
            {[...AI_LOGOS, ...AI_LOGOS].map((logo, i) => (
              <span key={i} className="whitespace-nowrap text-sm font-semibold text-neutral-300">{logo}</span>
            ))}
          </div>
        </div>
      </section>


      {/* One claim per screen, each presented the way the product presents a
          model's answer: the statement, then its source as a numbered citation.
          The dashboard puts a Sources list under every answer because a claim
          without its provenance is the thing this product exists to catch — so
          the homepage makes the same argument by obeying it rather than by
          asserting it.

          The three were a cramped row of one-line cards before, which gave the
          evidence less room than the pricing table. */}
      <section aria-label="Why AI visibility matters" className="border-y border-neutral-100">
        {CLAIMS.map((c, i) => (
          <article
            key={c.figure}
            className={`flex min-h-[78vh] items-center px-6 ${i > 0 ? "border-t border-neutral-100" : ""} ${i % 2 ? "bg-neutral-50/50" : ""}`}
          >
            <Reveal className="mx-auto w-full max-w-4xl">
              <p className="text-[15vw] font-bold leading-[0.85] tracking-tighter sm:text-[11rem]">
                {c.figure}
              </p>
              <p className="mt-8 max-w-2xl text-2xl leading-snug text-neutral-900 sm:text-3xl">
                {c.claim}
              </p>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-neutral-500">
                {c.detail}
              </p>
              {/* The same shape as the Sources list under an answer in the
                  product: an index, the host, the path in lighter type. */}
              <a
                href={c.href}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-10 inline-flex items-baseline gap-2 text-sm hover:underline"
              >
                <span className="text-neutral-300">1</span>
                <span className="text-neutral-700">{c.host}</span>
                <span className="text-neutral-400">{c.path}</span>
              </a>
              <p className="mt-1 text-xs text-neutral-400">{c.source}</p>
            </Reveal>
          </article>
        ))}
      </section>

      {/* Each platform is its own ecosystem. This is the section that earns the
          five-model claim: it says what differs between them, which is the
          thing a buyer cannot find out without running all five. */}
      <section id="how" className="mx-auto max-w-5xl px-6 py-24">
        <Reveal>
          <h2 className="max-w-2xl text-balance text-4xl font-bold tracking-tight md:text-5xl">
            Each platform is its own ecosystem, with its own rules.
          </h2>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-neutral-500">
            Being named by ChatGPT tells you nothing about Google AI Overviews. They read
            different sources, answer different question shapes, and change independently.
            Tracking one and calling it AI visibility is a guess —{" "}
            {/* "Tells you nothing" was rhetoric until this paper measured it. The
                link is here as well as in the claims band because this is the
                sentence a sceptical buyer stops on. */}
            <a
              href="https://arxiv.org/abs/2610.11932"
              target="_blank"
              rel="noopener noreferrer"
              className="text-neutral-700 underline decoration-neutral-300 underline-offset-2 hover:decoration-neutral-700"
            >
              and a measured one
            </a>
            .
          </p>
        </Reveal>
        <div className="mt-14 overflow-hidden rounded-2xl border border-neutral-150">
          {[
            { name: "ChatGPT", note: "Searches live, cites a handful of pages. The one most buyers use by name." },
            { name: "Google AI Overviews", note: "Appears on roughly half of searches, and not the same half every week. Reaches people who never open a chatbot." },
            { name: "Gemini", note: "Grounded in Google Search, but picks differently from AI Overviews on the same query." },
            { name: "Perplexity", note: "Cites far more sources than the others — usually ten or more, which is where the useful detail is." },
            { name: "DeepSeek", note: "Matters where it is used, which is not where ChatGPT is used." },
          ].map((m, i) => (
            <div key={m.name} className={`grid gap-2 px-6 py-5 sm:grid-cols-[180px_1fr] ${i > 0 ? "border-t border-neutral-100" : ""}`}>
              <p className="font-medium">{m.name}</p>
              <p className="text-sm leading-relaxed text-neutral-500">{m.note}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Friction */}
      <section id="friction" className="mx-auto max-w-5xl px-6 py-24">
        <Reveal>
          <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">The friction</p>
          <h2 className="mt-3 max-w-2xl text-balance text-4xl font-bold tracking-tight md:text-5xl">
            Your brand is invisible to AI.<br />And you don't know it yet.
          </h2>
        </Reveal>
        <div className="mt-12 space-y-4">
          {[
            "Your competitors are recommended by ChatGPT. You are not.",
            "You don't know which prompts your buyers are using.",
            "You don't know which AI models mention you vs ignore you.",
            "You don't know which pages on your site AI actually reads.",
            "You get data. But no one tells you what to do with it.",
          ].map((item, i) => (
            <Reveal key={i}>
              <div className="flex items-start gap-5 border-b border-neutral-100 pb-4">
                <span className="shrink-0 font-mono text-sm text-neutral-300">0{i + 1}</span>
                <p className="text-lg text-neutral-700">{item}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Product demo */}
      <section className="border-t border-neutral-100 bg-neutral-50/50 py-24">
        <div className="mx-auto max-w-5xl px-6">
          <Reveal>
            <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">Product catalog · see it in motion</p>
            <h2 className="mt-3 max-w-2xl text-balance text-4xl font-bold tracking-tight">
              We run your AI visibility, end to end.
            </h2>
          </Reveal>
          <div className="mt-16 space-y-20">
            {[
              {
                num: "01", title: "Visibility Score", desc: "Track how often your brand appears across all major AI models. One number that tells the whole story.",
                demo: <div className="rounded-xl border border-neutral-200 bg-white p-5"><p className="text-xs text-neutral-400 uppercase tracking-wider">Visibility Score</p><div className="mt-2 text-5xl font-bold">74%</div><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-lg bg-neutral-50 p-3 text-center"><p className="text-xs text-neutral-400">Gemini</p><p className="text-2xl font-bold">80%</p></div><div className="rounded-lg bg-neutral-50 p-3 text-center"><p className="text-xs text-neutral-400">ChatGPT</p><p className="text-2xl font-bold">68%</p></div></div></div>
              },
              {
                num: "02", title: "Brand Ranking", desc: "See exactly where your brand ranks vs competitors across every AI model. Know who is beating you and by how much.",
                demo: <div className="rounded-xl border border-neutral-200 bg-white p-5"><p className="text-xs text-neutral-400 uppercase tracking-wider mb-3">Brand Ranking</p><div className="space-y-2">{[{n:"Your brand",r:74,you:true},{n:"Competitor A",r:61},{n:"Competitor B",r:45},{n:"Competitor C",r:22}].map((b,i)=><div key={i} className={`flex items-center justify-between rounded-lg px-3 py-2 ${b.you?"bg-neutral-900 text-white":"bg-neutral-50"}`}><span className="text-sm font-medium">{b.n}{b.you&&<span className="ml-2 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">You</span>}</span><span className="text-sm font-bold">{b.r}%</span></div>)}</div></div>
              },
              {
                num: "03", title: "Top Prompts", desc: "Discover exactly which questions buyers ask AI in your category — and whether you appear in the answers.",
                demo: <div className="rounded-xl border border-neutral-200 bg-white p-5"><p className="text-xs text-neutral-400 uppercase tracking-wider mb-3">Top Prompts</p><div className="space-y-2">{["Best CRM for remote teams","Salesforce alternatives 2026","How to track sales pipeline"].map((p,i)=><div key={i} className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2"><span className="text-xs text-neutral-700 truncate max-w-[200px]">{p}</span><span className={`text-xs font-bold ${i===0?"text-emerald-600":"text-neutral-400"}`}>{i===0?"Mentioned":"Not mentioned"}</span></div>)}</div></div>
              },
              {
                num: "04", title: "Citations", desc: "See which URLs AI models cite most in your category. Know what content is driving AI recommendations.",
                demo: <div className="rounded-xl border border-neutral-200 bg-white p-5"><p className="text-xs text-neutral-400 uppercase tracking-wider mb-3">Citations</p><div className="space-y-2">{["reddit.com","techradar.com","zapier.com"].map((d,i)=><div key={i} className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2"><span className="text-xs text-neutral-700">{d}</span><span className="text-xs font-bold text-neutral-500">{3-i} citations</span></div>)}</div></div>
              },
              {
                num: "05", title: "Actionable Recommendations", desc: "Not generic SEO advice. Specific actions that work for each AI model, with priority and effort scores.",
                demo: <div className="rounded-xl border border-neutral-200 bg-white p-5"><p className="text-xs text-neutral-400 uppercase tracking-wider mb-3">Recommendations</p><div className="space-y-2"><div className="rounded-lg border border-neutral-100 p-3"><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-red-500"/><span className="text-xs font-medium">High priority · Easy effort</span></div><p className="mt-1 text-xs text-neutral-700">Add a comparison table to /pricing — competitors cite theirs when ChatGPT is asked best alternatives.</p></div><div className="rounded-lg border border-neutral-100 p-3"><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-amber-500"/><span className="text-xs font-medium">Medium priority · Medium effort</span></div><p className="mt-1 text-xs text-neutral-700">Publish a vs page targeting the top 3 buyer prompts you are missing.</p></div></div></div>
              },
            ].map(({ num, title, desc, demo }) => (
              <Reveal key={num}>
                <div className="grid items-center gap-12 md:grid-cols-2">
                  <div className={num === "02" || num === "04" ? "md:order-2" : ""}>
                    <p className="font-mono text-sm text-neutral-300">{num}</p>
                    <h3 className="mt-2 text-2xl font-bold tracking-tight">{title}</h3>
                    <p className="mt-3 text-neutral-500">{desc}</p>
                  </div>
                  <div className={num === "02" || num === "04" ? "md:order-1" : ""}>{demo}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>


      {/* Comparison. A real table rather than three cards: the point is to read
          across a row, and cards make that the one thing you cannot do.
          Everything stated here is from the vendors' own public pricing pages,
          because a comparison that flatters us by misquoting them is worth less
          than no comparison. */}
      <section id="compare" className="border-t border-neutral-100 bg-neutral-50/40 py-24">
        <div className="mx-auto max-w-5xl px-6">
          <Reveal>
            <h2 className="max-w-2xl text-balance text-4xl font-bold tracking-tight">
              What the entry plans actually include.
            </h2>
            <p className="mt-4 max-w-2xl text-neutral-500">
              From each vendor's public pricing page. Where a tool charges extra for models, that is in the row.
            </p>
          </Reveal>
          <div className="mt-10 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-neutral-300 text-left">
                  <th className="pb-3 pr-4 font-medium"> </th>
                  <th className="pb-3 pr-4 font-semibold">GetCited</th>
                  <th className="pb-3 pr-4 font-medium text-neutral-500">Peec AI</th>
                  <th className="pb-3 pr-4 font-medium text-neutral-500">Profound</th>
                  <th className="pb-3 font-medium text-neutral-500">Otterly</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Entry price", "$39/mo", "$95/mo", "$99/mo", "$29/mo"],
                  ["Prompts at that price", "25", "50", "not stated", "15"],
                  ["Models included", "All 5", "3 of 6", "ChatGPT only", "4, Gemini costs extra"],
                  ["Sources behind each answer", "Yes", "Yes", "Yes", "Yes"],
                  // "Not listed" rather than "No": these were read off public
                  // pricing pages, not from using the products. Asserting a
                  // competitor lacks a feature we did not look for is the same
                  // error this tool exists to catch.
                  ["Page-level diagnostic", "Included", "Not listed", "Not listed", "Not listed"],
                  ["Google volume + difficulty", "Included", "Not listed", "Not listed", "Not listed"],
                ].map(([label, ...cells], i) => (
                  <tr key={label} className={i > 0 ? "border-t border-neutral-100" : ""}>
                    <td className="py-3 pr-4 text-neutral-500">{label}</td>
                    {cells.map((c, j) => (
                      <td key={j} className={`py-3 pr-4 ${j === 0 ? "font-medium text-neutral-900" : "text-neutral-500"}`}>{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs text-neutral-400">
            Vendor prices read from their pricing pages and correct at the time of writing. Check them — they move.
          </p>
        </div>
      </section>

      {/* FAQ. Native disclosure elements, so it works without JavaScript, is
          keyboard navigable for free, and one can be open while another is. */}
      <section id="faq" className="mx-auto max-w-3xl px-6 py-24">
        <Reveal>
          <h2 className="text-balance text-4xl font-bold tracking-tight">
            What a plan actually gets you.
          </h2>
        </Reveal>
        <div className="mt-10 divide-y divide-neutral-150 border-y border-neutral-150">
          {[
            {
              q: "What is in a plan, concretely?",
              a: "Your prompts, run against all five platforms on a schedule, and the full answer each one gave with the pages it read. Plus a check of your own page against the competitors who do get named, Google search volume and ranking difficulty for the phrases you are considering, and the history so you can see whether a change worked.",
            },
            {
              q: "How often do prompts re-run?",
              a: "Weekly on every plan. One measurement is an anecdote — models give different answers to the same question on different days, so a single run tells you very little. Daily is available and quoted per case, because it multiplies the cost by seven.",
            },
            {
              q: "Why does being named by ChatGPT not mean being named elsewhere?",
              a: "The platforms read different sources and answer different question shapes. A page that ChatGPT quotes may never appear in a Google AI Overview, and AI Overviews do not appear for every query at all. Tracking one platform and calling it AI visibility is a guess.",
            },
            {
              q: "Can you tell me why I was not named?",
              a: "That is the part most tools skip. Every answer comes with the pages the model actually read, so you can see who was cited instead of you. The page check then reads your own page and compares it against the competitors who get named — whether it declares the category it competes in, whether it can be read without JavaScript, whether crawlers are allowed in.",
            },
            {
              q: "Do you improve the visibility, or only measure it?",
              a: "Measurement, plus the specific change to make — the exact title, heading and description to use, not advice to improve your content. Running the change is yours, or ours as consulting. Then re-measure, which is the only way to know whether it worked.",
            },
            {
              q: "How many prompts do I need?",
              a: "Fewer than people expect. Twenty-five well chosen buyer questions tell you more than a hundred variations of the same one. Google volume is in the tool to help you pick, and you can add prompts to a run after seeing the results.",
            },
          ].map((f) => (
            <details key={f.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-base font-medium marker:content-none">
                {f.q}
                <span className="mt-1 shrink-0 text-neutral-300 transition-transform group-open:rotate-45" aria-hidden>+</span>
              </summary>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutral-500">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Blog. The nav has linked to #blog since launch with nothing behind it,
          which is a broken promise on the first click. An honest empty state
          beats a dead anchor. */}
      <section id="blog" className="border-t border-neutral-100 bg-neutral-50/40 py-20">
        <div className="mx-auto max-w-5xl px-6 sm:flex sm:items-center sm:justify-between">
          <div className="max-w-xl">
            <h2 className="text-2xl font-bold tracking-tight">Notes on what actually moves AI visibility</h2>
            <p className="mt-2 text-neutral-500">
              What we find running real audits: which changes moved a brand into an answer, and which did nothing.
              First pieces are being written now — join the list and they land in your inbox.
            </p>
          </div>
          <a href="#waitlist" className="mt-5 inline-block shrink-0 rounded-lg border border-neutral-300 px-5 py-2.5 text-sm font-medium hover:border-neutral-900 sm:mt-0">
            Get them by email
          </a>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-5xl px-6 py-24">
        <Reveal>
          <h2 className="text-3xl font-bold tracking-tight">Priced on what it costs to run.</h2>
          <p className="mt-2 text-neutral-500">Every prompt is a real call to every model, every week. The plans are built around that, not around a number that looked nice.</p>
        </Reveal>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {/* Costed, not guessed. One prompt put to one model once is an
              "answer", and an answer costs between $0.002 and $0.048 depending
              on the model — ChatGPT with web search is about four fifths of it,
              because OpenAI bills $10 per 1,000 searches plus the tokens the
              search pulls back. The old plans sold 5 brands x 50 prompts x 5
              models x 12 runs for $29, which is roughly $66 of API calls: every
              Pro customer lost money, and faster the better it sold. See
              cost_model.py in the repo for the arithmetic. */}
          {[
            { name: "Free", price: "$0", period: "one run", features: ["1 brand", "10 prompts", "ChatGPT + Perplexity", "One audit, no card"], cta: "Start free" },
            { name: "Solo", price: "$39", period: "/month", features: ["1 brand", "25 prompts", "All 5 models", "Weekly re-runs", "Page check + keyword research", "Sources behind every answer"], cta: "Get started" },
            { name: "Growth", price: "$99", period: "/month", features: ["1 brand", "50 prompts", "All 5 models", "Weekly re-runs", "Competitor tracking", "History + CSV export"], cta: "Go Growth", highlight: true },
          ].map((plan) => (
            <div key={plan.name} className={`flex flex-col rounded-2xl border p-6 ${"highlight" in plan && plan.highlight ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 bg-white"}`}>
              <p className={`text-xs font-medium ${"highlight" in plan && plan.highlight ? "text-neutral-400" : "text-neutral-500"}`}>{plan.name}</p>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-4xl font-bold">{plan.price}</span>
                <span className={`text-sm ${"highlight" in plan && plan.highlight ? "text-neutral-400" : "text-neutral-400"}`}>{plan.period}</span>
              </div>
              <ul className="mt-6 flex-1 space-y-2">
                {plan.features.map((f) => <li key={f} className="flex items-center gap-2 text-sm"><Check className={`h-4 w-4 shrink-0 ${"highlight" in plan && plan.highlight ? "text-white" : "text-neutral-900"}`} />{f}</li>)}
              </ul>
              {/* Was setShowModal(true), which opened the audit for a signed-out
                  visitor and skipped the sign-in that every other entry point
                  goes through. handleStartAudit is that one path. */}
              <button onClick={user ? handleStartAudit : () => { window.location.hash = "waitlist"; }} className={`mt-6 rounded-lg py-2.5 text-sm font-medium ${"highlight" in plan && plan.highlight ? "bg-white text-neutral-900 hover:bg-neutral-100" : "bg-neutral-900 text-white hover:bg-neutral-800"}`}>{user ? plan.cta : "Join waiting list"}</button>
            </div>
          ))}
        </div>
        <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50/60 p-6 sm:flex sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Agency — $299/month</p>
            <p className="mt-1 text-sm text-neutral-500">
              5 brands, 50 prompts each, all 5 models, weekly. For running GEO work on clients rather than one brand of your own.
            </p>
          </div>
          <a href="#waitlist" className="mt-4 inline-block rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 sm:mt-0">Join waiting list</a>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-neutral-400">
          Extra prompts $1.50 each per month. Daily instead of weekly multiplies every number by seven, so it is quoted per case rather than listed here.
          Prompts are re-run on a schedule — a figure from one measurement is an anecdote, not a trend.
        </p>

      </section>

      {/* Footer */}
      <footer className="border-t border-neutral-100">
        <div className="mx-auto max-w-5xl px-6 py-10">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-900 text-white"><span className="text-sm font-bold">G</span></div>
              <span className="font-semibold">{BRAND}</span>
            </div>
            <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-neutral-400">
              <a href="#how" className="hover:text-neutral-900">How it works</a>
              <a href="#pricing" className="hover:text-neutral-900">Pricing</a>
              <a href="#blog" className="hover:text-neutral-900">Blog</a>
              <a href="/legal/privacy" className="hover:text-neutral-900">Privacy</a>
              <a href="/legal/terms" className="hover:text-neutral-900">Terms</a>
              <a href="/legal/cookies" className="hover:text-neutral-900">Cookies</a>
            </nav>
          </div>
          <div className="mt-6 flex flex-col gap-1 border-t border-neutral-100 pt-6 text-xs text-neutral-400 md:flex-row md:justify-between">
            <span>Free to start · no credit card · set up in minutes</span>
            <span>© 2026 {BRAND}</span>
          </div>
          {/* Statutory disclosure — Companies Act 2006 s.82, E-Commerce Regs 2002 reg.6 */}
          <div className="mt-4 space-y-1 text-xs leading-relaxed text-neutral-400">
            <p>{companyLine(BRAND)}</p>
            <p>Contact: <a href={`mailto:${COMPANY.email}`} className="hover:text-neutral-900">{COMPANY.email}</a></p>
          </div>
        </div>
      </footer>
    </div>
  );
}
