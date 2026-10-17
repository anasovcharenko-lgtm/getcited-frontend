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

  if (auditData) return <Dashboard data={auditData} auditId={auditId} onBack={() => setAuditData(null)} onProjects={() => { setAuditData(null); setShowProjects(true); }} lang="en" brandName={BRAND} />;
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
      {showModal && <Modal onClose={() => setShowModal(false)} onAuditComplete={(data, id) => { setShowModal(false); setAuditData(data); setAuditId(id); }} />}

      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-neutral-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-900 text-white"><span className="text-sm font-bold">G</span></div>
            <span className="font-semibold">{BRAND}</span>
          </div>
          <nav className="hidden items-center gap-8 text-sm text-neutral-500 md:flex">
            <a href="#product" className="hover:text-neutral-900">Product</a>
            <a href="#pricing" className="hover:text-neutral-900">Pricing</a>
            <a href="#trust" className="hover:text-neutral-900">How we count</a>
            <a href="#faq" className="hover:text-neutral-900">FAQ</a>
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
              <a href="#waitlist" className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800">Join the waitlist</a>
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

      {/* ── 01 · Measure ──────────────────────────────────────────────
          The pain is the headline. A buyer recognises a sentence about
          themselves in two seconds and a feature list in none. */}
      <section id="product" className="mx-auto max-w-5xl px-6 py-24">
        <Reveal>
          <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">01 · AI visibility</p>
          <h2 className="mt-4 max-w-xl text-balance text-4xl font-bold leading-tight tracking-tight">
            You don't know whether AI mentions you at all
          </h2>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-neutral-500">
            Pick your brand. We write the questions your buyers ask, or you paste your own, and you watch it run.
            Three minutes later every answer is on the screen.
          </p>
        </Reveal>

        <Reveal className="mt-12">
          {/* An illustration of the real screen, not a result: the fraction is
              what the product shows under the percentage, because a score you
              cannot check against the lists below it is a number to trust on
              faith. */}
          <div className="rounded-2xl border border-neutral-150 bg-neutral-50/50 p-6">
            <p className="text-[10px] uppercase tracking-widest text-neutral-400">Example screen</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-neutral-150 bg-white p-5">
                <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">AI visibility score</p>
                <div className="mt-2 text-4xl font-bold tracking-tight">23%</div>
                <p className="mt-1 text-xs text-neutral-400">named in 3 of 13 answers that came back</p>
                <p className="text-xs text-neutral-400">vs competitors avg 41%</p>
              </div>
              <div className="rounded-xl border border-neutral-150 bg-white p-5">
                <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">Share of voice</p>
                <div className="mt-2 text-4xl font-bold tracking-tight">9%</div>
                <p className="mt-1 text-xs text-neutral-400">3 of 34 brand mentions, across 7 brands</p>
              </div>
              <div className="rounded-xl border border-neutral-150 bg-white p-5">
                <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">Named, no link</p>
                <div className="mt-2 text-4xl font-bold tracking-tight">8%</div>
                <p className="mt-1 text-xs text-neutral-400">mentioned without a citation back</p>
              </div>
            </div>
          </div>
        </Reveal>

        <div className="mt-14 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Score and share of voice", "Against every brand the models named — including ones you never listed."],
            ["Covered and uncovered", "What you win, what you lose, what nobody wins. Each labelled by direction."],
            ["Where you do better", "Per model, never averaged. ChatGPT and Gemini disagree about you more than you expect."],
            ["Visibility history", "Every run kept with the exact model version, so two runs are comparable or marked as not."],
            ["The model's own words", "The full answer, and the sentence naming you. How you are described, not just whether."],
            ["Where AI looks", "The pages models cite in your category, by title, and which of them name you."],
          ].map(([title, body]) => (
            <Reveal key={title}>
              <h3 className="text-base font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-500">{body}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Why a half-percent channel is worth measuring ──────────── */}
      <section className="bg-neutral-900 py-24 text-white">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <Reveal>
            <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">Why half a percent of traffic matters</p>
            <p className="mx-auto mt-6 max-w-[30ch] text-balance text-3xl font-bold leading-snug tracking-tight">
              Visitors who arrive from AI convert 23× better than organic search traffic
            </p>
            <p className="mx-auto mt-7 max-w-xl text-base leading-relaxed text-neutral-400">
              AI still sends a fraction of the visitors search does. Those visitors are the ones who sign up,
              which is why being named in the answer is worth more than its share of traffic suggests.
            </p>
            <p className="mt-6 text-xs text-neutral-500">Industry research, 2026</p>
          </Reveal>
        </div>
      </section>

      {/* ── 02 · Diagnose ─────────────────────────────────────────────
          Three bands rather than three bordered cards. Cards here read as a
          pricing table, which is the one thing this section is not. */}
      <section id="recommendations" className="mx-auto max-w-5xl px-6 py-24">
        <Reveal>
          <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">02 · Actionable recommendations</p>
          <h2 className="mt-4 max-w-2xl text-balance text-4xl font-bold leading-tight tracking-tight">
            Your competitor shows up and nobody can say why
          </h2>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-neutral-500">
            We sort what to do by what it asks of you, not by which chapter of SEO it belongs to.
            One is a developer's afternoon, one an editor's week, one a quarter.
          </p>
        </Reveal>

        <div className="mt-12">
          {[
            {
              title: "Fix",
              body: "Pages you already have, and what is stopping a model from reading them.",
              demo: (
                <div className="rounded-xl border border-neutral-150 bg-white p-5">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-red-500" />
                    <span className="text-xs font-medium text-neutral-500">High priority</span>
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-500">Easy</span>
                  </div>
                  <p className="mt-3 text-sm font-medium leading-relaxed">GPTBot is disallowed in your robots.txt — here are the three lines to add.</p>
                  <div className="mt-4 rounded-lg border border-neutral-100 bg-neutral-50 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-neutral-400">Now</p>
                    <p className="text-sm text-neutral-500 line-through decoration-neutral-300">User-agent: GPTBot · Disallow: /</p>
                    <p className="mt-2 text-[10px] uppercase tracking-wide text-neutral-400">Instead</p>
                    <p className="text-sm font-medium">User-agent: GPTBot · Allow: /</p>
                  </div>
                </div>
              ),
            },
            {
              title: "Build",
              body: "Pages that do not exist yet, for the questions you keep losing.",
              demo: (
                <div className="rounded-xl border border-neutral-150 bg-white p-5">
                  <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">What shape of page gets quoted here</p>
                  <div className="mt-4 space-y-2.5">
                    {[
                      ["Lists and roundups", "4 pages cited, none of them yours", true],
                      ["Comparisons", "2 pages cited, none of them yours", true],
                      ["Video", "2 pages cited, you are on 1", false],
                    ].map(([name, count, gap]) => (
                      <div key={String(name)} className="flex items-baseline gap-3">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${gap ? "bg-red-500" : "bg-emerald-500"}`} />
                        <span className="text-sm font-medium">{name}</span>
                        <span className="text-xs text-neutral-500">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ),
            },
            {
              title: "Influence",
              body: "Pages you do not own that models read anyway, sorted by who decides what goes on them.",
              demo: (
                <div className="rounded-xl border border-neutral-150 bg-white p-5">
                  <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">Tier 1 — someone else decides</p>
                  <div className="mt-4 space-y-3">
                    {[
                      ["retail.ru", "10 best loyalty platforms for retail", "Named here: Mindbox, Loymax. You are not."],
                      ["cossa.ru", "Loyalty programmes: what changed this year", "Nobody from your list is on this page"],
                    ].map(([host, title, note], i) => (
                      <div key={String(host)} className="flex gap-2.5">
                        <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${i === 0 ? "bg-red-500" : "bg-neutral-200"}`} />
                        <div className="min-w-0">
                          <p className="flex items-baseline gap-1.5 text-xs">
                            <span className="shrink-0 text-neutral-500">{host}</span>
                            <span className="truncate text-neutral-900">{title}</span>
                          </p>
                          <p className="mt-0.5 text-[11px] leading-snug text-neutral-500">{note}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ),
            },
          ].map(({ title, body, demo }) => (
            <Reveal key={title}>
              <div className="grid items-center gap-10 border-t border-neutral-100 py-12 md:grid-cols-[320px_1fr]">
                <div>
                  <h3 className="text-2xl font-bold tracking-tight">{title}</h3>
                  <p className="mt-3 text-base leading-relaxed text-neutral-500">{body}</p>
                </div>
                <div>{demo}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── 03 · The agent. Future tense throughout, and no button: a button
             invites someone to go looking for something that is not there. */}
      <section className="border-t border-neutral-100 bg-neutral-50/50 py-24">
        <div className="mx-auto max-w-5xl px-6">
          <Reveal>
            <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">03 · AI agent · on the roadmap</p>
            <div className="mt-4 grid gap-12 md:grid-cols-2">
              <div>
                <h2 className="max-w-md text-balance text-4xl font-bold leading-tight tracking-tight">
                  The list has been sitting there a month
                </h2>
                <p className="mt-4 text-base leading-relaxed text-neutral-600">
                  Knowing what to change is not the same as having changed it. Between the two sits a sprint nobody planned.
                </p>
                <p className="mt-4 text-base leading-relaxed text-neutral-600">
                  So we will open the pull request ourselves. You give access to your repository, the fix arrives as a diff
                  with the finding attached, and you press merge. We never merge, and we never touch a repository nobody
                  invited us into.
                </p>
              </div>
              <div className="rounded-xl border border-neutral-150 bg-white p-5">
                <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">Pull request</p>
                <p className="mt-3 text-sm font-medium">Allow GPTBot and PerplexityBot in robots.txt</p>
                <p className="mt-2 text-xs leading-relaxed text-neutral-500">
                  3 lines changed · linked to the audit finding that produced it
                </p>
                <div className="mt-4 space-y-1 rounded-lg bg-neutral-50 p-3 font-mono text-[11px]">
                  <p className="text-red-600">- Disallow: /</p>
                  <p className="text-emerald-700">+ Allow: /</p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── 04 · Measurement. No numbers here on purpose: we have never run a
             before-and-after with a customer, and inventing one is the thing
             the section below this is against. */}
      <section className="mx-auto max-w-5xl px-6 py-24">
        <Reveal>
          <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">04 · Measurement · on the roadmap</p>
          <div className="mt-4 grid items-center gap-12 md:grid-cols-2">
            <div>
              <h2 className="max-w-md text-balance text-4xl font-bold leading-tight tracking-tight">
                You can't show anyone that it worked
              </h2>
              <p className="mt-4 text-base leading-relaxed text-neutral-600">
                Tick off what you did. The next audit compares itself to the last one and says what happened — tied to
                the specific change, not to the month it fell in.
              </p>
              <p className="mt-4 text-sm leading-relaxed text-neutral-500">
                We will not claim it caused the rise. Models move, competitors act. We will show you what you did and
                what the number did.
              </p>
            </div>
            <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50/60 p-6">
              <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">The screen, once it exists</p>
              <p className="mt-3 text-sm leading-relaxed text-neutral-500">
                One sentence comparing this audit to the last: how many items you ticked off, and where the figure moved.
                No example numbers here — we have not run a before-and-after with a customer yet, and a made-up one would
                undo everything the next section promises.
              </p>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── How we count. Aimed squarely at anyone who tried another tracker
             and could not reconcile its figures. */}
      <section id="trust" className="border-t border-neutral-100 py-24">
        <div className="mx-auto max-w-5xl px-6">
          <Reveal>
            <h2 className="max-w-xl text-balance text-4xl font-bold leading-tight tracking-tight">
              Every number here can be checked
            </h2>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-neutral-500">
              If you have ever tried to reconcile a visibility report and given up, this is the section to read.
            </p>
          </Reveal>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {[
              ["We divide by answers, not questions", "A model that stayed silent is not a mark against you. Dividing by questions times models flatters everyone equally."],
              ["Absent is not zero", "Where we have no figure you see a dash. A zero is a measurement, and somebody has to have made it."],
              ["The source sits under the number", "Every percentage opens into the full answer, the date, and the exact model version that wrote it."],
            ].map(([title, body]) => (
              <Reveal key={title}>
                <div className="border-t-2 border-neutral-900 pt-5">
                  <h3 className="text-base font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-500">{body}</p>
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
              <button onClick={user ? handleStartAudit : () => { window.location.hash = "waitlist"; }} className={`mt-6 rounded-lg py-2.5 text-sm font-medium ${"highlight" in plan && plan.highlight ? "bg-white text-neutral-900 hover:bg-neutral-100" : "bg-neutral-900 text-white hover:bg-neutral-800"}`}>{user ? plan.cta : "Join the waitlist"}</button>
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
          <a href="#waitlist" className="mt-4 inline-block rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 sm:mt-0">Join the waitlist</a>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-neutral-400">
          Extra prompts $1.50 each per month. Daily instead of weekly multiplies every number by seven, so it is quoted per case rather than listed here.
          Prompts are re-run on a schedule — a figure from one measurement is an anecdote, not a trend.
        </p>

      </section>

      {/* FAQ. Native disclosure elements, so it works without JavaScript, is
          keyboard navigable for free, and one can be open while another is. */}
      <section id="faq" className="mx-auto max-w-3xl px-6 pb-24">
        <Reveal>
          <h2 className="text-balance text-3xl font-bold tracking-tight">Questions people ask first</h2>
        </Reveal>
        <div className="mt-10 divide-y divide-neutral-150 border-y border-neutral-150">
          {[
            {
              q: "Is this just SEO with a new name?",
              a: "No. SEO asks where you rank on a results page. This asks whether a model names you in a sentence, and which page it read to decide. The overlap is real, the measurement is not, and neither is most of the fix list.",
            },
            {
              q: "Which models do you ask?",
              a: "ChatGPT, Gemini, Perplexity, DeepSeek and Google AI Overview. We name them because \u201call the major models\u201d is not a measurement. Each run records the exact version that answered.",
            },
            {
              q: "Why does being named by ChatGPT not mean being named elsewhere?",
              a: "The platforms read different sources and answer different question shapes. A page ChatGPT quotes may never appear in a Google AI Overview, and AI Overviews do not appear for every query at all. That was rhetoric until it was measured.",
              href: "https://arxiv.org/abs/2610.11932",
              hrefLabel: "The paper that measured it",
            },
            {
              q: "Where do the questions come from?",
              a: "We write a set from your category, split across comparison, commercial, problem, technical and industry questions. You can paste your own at any point and they join the same run.",
            },
            {
              q: "Do you work outside English?",
              a: "Yes. The product runs in English and Russian and audits any market in its own language. One thing to know: search-volume data is unavailable for the Russian market, so that one panel stays empty and says why.",
            },
            {
              q: "Will my visibility go up?",
              a: "We will not put a number on that. Models change, competitors act, and one run is a small sample. What we will do is show the gap, the exact change, and whether the figure moved afterwards.",
            },
            {
              q: "How long does the first audit take?",
              a: "About three minutes, and you watch it run \u2014 the questions going out, the models answering, your name being looked for in each one.",
            },
          ].map((f) => (
            <details key={f.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-base font-medium marker:content-none">
                {f.q}
                <span className="mt-1 shrink-0 text-neutral-300 transition-transform group-open:rotate-45" aria-hidden>+</span>
              </summary>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutral-500">{f.a}</p>
              {"href" in f && f.href && (
                <a href={f.href} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm text-neutral-700 underline decoration-neutral-300 underline-offset-2 hover:decoration-neutral-700">
                  {f.hrefLabel}
                </a>
              )}
            </details>
          ))}
        </div>
      </section>

      {/* The close. Black, the way the page ends as one block with the footer
          rather than two. The form is the same waitlist as the hero. */}
      <section className="bg-neutral-900 py-24 text-white">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <Reveal>
            <h2 className="text-balance text-4xl font-bold leading-tight tracking-tight">Find out what AI says about you</h2>
            <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-neutral-400">
              One domain, three minutes, every answer in full. Free to start, no credit card.
            </p>
            <div className="mt-8 flex justify-center">
              {user ? (
                <button onClick={handleStartAudit} className="flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-medium text-neutral-900 hover:bg-neutral-100">
                  Start free audit <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <WaitlistForm lang="en" source="home_close_en" className="w-full max-w-md text-left" />
              )}
            </div>
          </Reveal>
        </div>
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
              <a href="#product" className="hover:text-neutral-900">Product</a>
              <a href="#pricing" className="hover:text-neutral-900">Pricing</a>
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
