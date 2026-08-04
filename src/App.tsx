import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, X } from "lucide-react";

const BRAND = "GetCited";
const API_URL = "https://web-production-b2168.up.railway.app";

const AI_LOGOS = ["ChatGPT", "Claude", "Gemini", "Perplexity", "YandexGPT", "AI Overview", "Copilot", "Mistral", "Grok"];

function Reveal({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={`transition-all duration-700 ease-out ${shown ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"} ${className}`}>{children}</div>;
}

type AuditResult = { prompt: string; gemini: { mentioned: boolean; competitors_found: string[]; }; chatgpt: { mentioned: boolean; competitors_found: string[]; }; };
type CompetitorStat = { name: string; is_your_brand: boolean; gemini_mentions: number; chatgpt_mentions: number; total_mentions: number; mention_rate: number; rank: number; };
type AuditData = { brand: string; category: string; visibility_score: number; gemini_score: number; chatgpt_score: number; total_prompts: number; results: AuditResult[]; competitor_ranking: CompetitorStat[]; recommendations: string; };

function Dashboard({ data, onBack }: { data: AuditData; onBack: () => void }) {
  const recs = data.recommendations.split("\n\n").filter(Boolean);
  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <header className="sticky top-0 z-40 border-b border-neutral-100 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <button onClick={onBack} className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-900 text-white"><span className="text-sm font-bold">G</span></div>
            <span className="text-lg font-semibold tracking-tight">{BRAND}</span>
          </button>
          <button onClick={onBack} className="text-sm text-neutral-500 hover:text-neutral-900">← Back</button>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-12">
        <div className="mb-10 text-center">
          <h1 className="text-4xl font-bold">{data.brand}</h1>
          {data.category && <span className="mt-2 inline-block rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs text-neutral-500">{data.category}</span>}
          <div className="mt-4 text-8xl font-bold text-[#5B4BFF]">{data.visibility_score}%</div>
          <p className="mt-2 text-neutral-500">Overall AI Visibility Score</p>
        </div>
        <div className="mb-10 grid grid-cols-2 gap-4">
          <div className="rounded-2xl border border-neutral-200 p-6 text-center">
            <p className="text-sm text-neutral-500">Gemini</p>
            <div className="mt-2 text-5xl font-bold text-[#5B4BFF]">{Math.round(data.gemini_score / data.total_prompts * 100)}%</div>
            <p className="mt-1 text-xs text-neutral-400">{data.gemini_score}/{data.total_prompts} prompts</p>
          </div>
          <div className="rounded-2xl border border-neutral-200 p-6 text-center">
            <p className="text-sm text-neutral-500">ChatGPT</p>
            <div className="mt-2 text-5xl font-bold text-[#5B4BFF]">{Math.round(data.chatgpt_score / data.total_prompts * 100)}%</div>
            <p className="mt-1 text-xs text-neutral-400">{data.chatgpt_score}/{data.total_prompts} prompts</p>
          </div>
        </div>
        <div className="mb-10 rounded-2xl border border-neutral-200 p-6">
          <h2 className="mb-4 text-xl font-bold">Brand Ranking</h2>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-neutral-100"><th className="pb-3 text-left font-medium text-neutral-500">#</th><th className="pb-3 text-left font-medium text-neutral-500">Brand</th><th className="pb-3 text-center font-medium text-neutral-500">Gemini</th><th className="pb-3 text-center font-medium text-neutral-500">ChatGPT</th><th className="pb-3 text-center font-medium text-neutral-500">Mention Rate</th></tr></thead>
            <tbody>
              {data.competitor_ranking.map((stat) => (
                <tr key={stat.name} className={`border-b border-neutral-50 ${stat.is_your_brand ? "bg-[#5B4BFF]/5" : ""}`}>
                  <td className="py-3 text-neutral-500">{stat.rank}</td>
                  <td className="py-3 font-medium">{stat.name}{stat.is_your_brand && <span className="ml-2 rounded-full bg-[#5B4BFF] px-2 py-0.5 text-xs text-white">You</span>}</td>
                  <td className="py-3 text-center text-neutral-600">{stat.gemini_mentions}/{data.total_prompts}</td>
                  <td className="py-3 text-center text-neutral-600">{stat.chatgpt_mentions}/{data.total_prompts}</td>
                  <td className="py-3 text-center font-semibold">{stat.mention_rate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mb-10 rounded-2xl border border-neutral-200 p-6">
          <h2 className="mb-4 text-xl font-bold">Prompt Results</h2>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-neutral-100"><th className="pb-3 text-left font-medium text-neutral-500">Prompt</th><th className="pb-3 text-center font-medium text-neutral-500">Gemini</th><th className="pb-3 text-center font-medium text-neutral-500">ChatGPT</th></tr></thead>
            <tbody>
              {data.results.map((r, i) => (
                <tr key={i} className="border-b border-neutral-50">
                  <td className="py-3 pr-4 text-neutral-700">{r.prompt}</td>
                  <td className="py-3 text-center">{r.gemini.mentioned ? "✅" : "❌"}</td>
                  <td className="py-3 text-center">{r.chatgpt.mentioned ? "✅" : "❌"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rounded-2xl border border-neutral-200 p-6">
          <h2 className="mb-4 text-xl font-bold">🎯 Recommendations</h2>
          <div className="space-y-4">
            {recs.map((rec, i) => {
              const priority = rec.includes("High") ? "High" : rec.includes("Medium") ? "Medium" : "Low";
              const color = priority === "High" ? "bg-red-50 text-red-600" : priority === "Medium" ? "bg-amber-50 text-amber-600" : "bg-green-50 text-green-600";
              return (
                <div key={i} className="rounded-xl border border-neutral-100 bg-neutral-50 p-4">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>Priority: {priority}</span>
                  <p className="mt-2 text-sm text-neutral-800 whitespace-pre-wrap">{rec.replace(/PRIORITY:.*\n/, "").trim()}</p>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}

function Modal({ onClose, onAuditComplete }: { onClose: () => void; onAuditComplete: (data: AuditData) => void }) {
  const [brand, setBrand] = useState("");
  const [competitorsInput, setCompetitorsInput] = useState("");
  const [description, setDescription] = useState("");
  const [showDescription, setShowDescription] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!brand.trim() || brand.length < 3) { setShowDescription(false); return; }
    const timer = setTimeout(async () => {
      setChecking(true);
      try {
        const res = await fetch(`${API_URL}/check-brand`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand: brand.trim() }) });
        const data = await res.json();
        setShowDescription(!data.known);
      } catch { setShowDescription(true); }
      finally { setChecking(false); }
    }, 1000);
    return () => clearTimeout(timer);
  }, [brand]);

  const startAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brand.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/audit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand: brand.trim(), competitors: competitorsInput.split(",").map(c => c.trim()).filter(Boolean), description: description.trim() }) });
      const data = await res.json();
      onAuditComplete(data);
    } catch { setError("Something went wrong. Please try again."); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <button onClick={onClose} className="absolute right-4 top-4 text-neutral-400 hover:text-neutral-600">
          <X className="h-5 w-5" />
        </button>
        <h2 className="text-2xl font-bold tracking-tight">Audit your brand</h2>
        <p className="mt-1 text-sm text-neutral-500">See how often AI recommends you vs competitors.</p>
        <form onSubmit={startAudit} className="mt-6 flex flex-col gap-3">
          <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Your brand name" className="h-12 w-full rounded-md border border-neutral-200 bg-white px-4 text-base outline-none focus:border-[#5B4BFF]" />
          {checking && <p className="text-xs text-neutral-400">Checking brand...</p>}
          {showDescription && <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does your brand do? (e.g. CRM for small teams)" className="h-12 w-full rounded-md border border-neutral-200 bg-white px-4 text-base outline-none focus:border-[#5B4BFF]" />}
          <input value={competitorsInput} onChange={(e) => setCompetitorsInput(e.target.value)} placeholder="Competitors (optional): Notion, Confluence" className="h-12 w-full rounded-md border border-neutral-200 bg-white px-4 text-base outline-none focus:border-[#5B4BFF]" />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={loading} className="h-12 rounded-md bg-[#5B4BFF] px-6 text-white hover:bg-[#4a3ae0] disabled:opacity-60 flex items-center gap-2 justify-center font-medium">
            {loading ? "Running audit..." : <><span>Start Free Audit</span><ArrowRight className="h-4 w-4" /></>}
          </button>
        </form>
        <p className="mt-3 text-center text-xs text-neutral-400">Free to start · no credit card</p>
      </div>
    </div>
  );
}

export default function App() {
  const [showModal, setShowModal] = useState(false);
  const [auditData, setAuditData] = useState<AuditData | null>(null);

  if (auditData) return <Dashboard data={auditData} onBack={() => setAuditData(null)} />;

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <style>{`:root{--brand:#5B4BFF;} @keyframes marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}`}</style>
      {showModal && <Modal onClose={() => setShowModal(false)} onAuditComplete={(data) => { setShowModal(false); setAuditData(data); }} />}
      <header className="sticky top-0 z-40 border-b border-neutral-100 bg-white/80 backdrop-blur">
        <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-6 py-4 md:grid-cols-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-900 text-white"><span className="text-sm font-bold">G</span></div>
            <span className="text-lg font-semibold tracking-tight">{BRAND}</span>
          </div>
          <nav className="hidden items-center justify-center gap-8 text-sm text-neutral-600 md:flex">
            <a href="#how" className="hover:text-neutral-900">How it works</a>
            <a href="#pricing" className="hover:text-neutral-900">Pricing</a>
            <a href="#blog" className="hover:text-neutral-900">Blog</a>
          </nav>
          <div className="flex items-center justify-end gap-2">
            <div className="mr-2 hidden items-center gap-1 text-xs text-neutral-500 sm:flex">
              <a href="/" className="font-semibold text-neutral-900">EN</a>
              <span className="text-neutral-300">|</span>
              <a href="/ru" className="hover:text-neutral-900">RU</a>
            </div>
            <button className="hidden sm:inline-flex px-3 py-1.5 text-sm text-neutral-600 hover:text-neutral-900">Sign In</button>
            <button onClick={() => setShowModal(true)} className="px-3 py-1.5 text-sm bg-[#5B4BFF] text-white rounded-md hover:bg-[#4a3ae0]">Start Free</button>
          </div>
        </div>
      </header>
      <section className="mx-auto max-w-5xl px-6 pt-20 pb-16 text-center md:pt-28">
        <Reveal>
          <span className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs text-neutral-600">
            <span className="h-1.5 w-1.5 rounded-full bg-[#5B4BFF]" />
            Now tracking ChatGPT, Claude, Gemini & YandexGPT
          </span>
        </Reveal>
        <Reveal><h1 className="mx-auto mt-6 max-w-4xl text-5xl font-bold tracking-tight text-neutral-900 md:text-7xl">See how often AI recommends your brand</h1></Reveal>
        <Reveal><p className="mx-auto mt-6 max-w-2xl text-lg text-neutral-600 md:text-xl">Get actionable recommendations to outflank your competitors.</p></Reveal>
        <Reveal>
          <div className="mt-10 flex flex-col items-center gap-4">
            <button onClick={() => setShowModal(true)} className="h-12 rounded-md bg-[#5B4BFF] px-8 text-white hover:bg-[#4a3ae0] flex items-center gap-2 text-base font-medium">
              Start Free Audit <ArrowRight className="h-4 w-4" />
            </button>
            <p className="text-sm text-neutral-500">Free to start · no credit card</p>
          </div>
        </Reveal>
      </section>
      <section className="border-y border-neutral-100 bg-white py-8">
        <div className="mb-4 text-center text-xs uppercase tracking-widest text-neutral-400">Tracking visibility across</div>
        <div className="relative overflow-hidden">
          <div className="flex w-max animate-[marquee_30s_linear_infinite] gap-14 pr-14">
            {[...AI_LOGOS, ...AI_LOGOS].map((logo, i) => <span key={i} className="whitespace-nowrap text-xl font-semibold tracking-tight text-neutral-400">{logo}</span>)}
          </div>
        </div>
      </section>
      <section id="pricing" className="mx-auto max-w-6xl px-6 py-24 md:py-32">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-4xl font-bold tracking-tight md:text-5xl">Simple pricing</h2>
            <p className="mt-4 text-lg text-neutral-600">Start free. Upgrade when you are ready.</p>
          </div>
        </Reveal>
        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {[
            { name: "Free Trial", price: "$0", period: "3 days", features: ["1 brand", "10 prompts", "2 AI models", "1 run"], cta: "Start Free", dark: false },
            { name: "Starter", price: "$9", period: "/month", features: ["1 brand", "20 prompts", "3 AI models", "4 runs / month"], cta: "Get Started", dark: false },
            { name: "Pro", price: "$29", period: "/month", features: ["5 brands", "50 prompts", "5 AI models", "12 runs / month", "CSV export", "Team seats"], cta: "Go Pro", dark: true },
          ].map((plan) => (
            <div key={plan.name} className={`relative flex flex-col rounded-2xl border p-8 ${plan.dark ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 bg-white"}`}>
              {plan.dark && <span className="absolute -top-3 left-6 rounded-full bg-[#5B4BFF] px-2.5 py-0.5 text-xs font-medium text-white">Most popular</span>}
              <h3 className={`text-sm font-medium ${plan.dark ? "text-neutral-300" : "text-neutral-500"}`}>{plan.name}</h3>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-5xl font-bold tracking-tight">{plan.price}</span>
                <span className={plan.dark ? "text-neutral-400" : "text-neutral-500"}>{plan.period}</span>
              </div>
              <ul className="mt-8 flex-1 space-y-3 text-sm">
                {plan.features.map((f) => <li key={f} className="flex items-start gap-2"><Check className={`mt-0.5 h-4 w-4 shrink-0 ${plan.dark ? "text-[#5B4BFF]" : "text-neutral-900"}`} /><span>{f}</span></li>)}
              </ul>
              <button onClick={() => setShowModal(true)} className={`mt-8 h-11 rounded-xl font-medium ${plan.dark ? "bg-white text-neutral-900 hover:bg-neutral-100" : "bg-neutral-900 text-white hover:bg-neutral-800"}`}>{plan.cta}</button>
            </div>
          ))}
        </div>
      </section>
      <footer className="border-t border-neutral-100 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-900 text-white"><span className="text-sm font-bold">G</span></div>
              <span className="text-lg font-semibold tracking-tight">{BRAND}</span>
            </div>
            <nav className="flex flex-wrap gap-6 text-sm text-neutral-600">
              <a href="#how" className="hover:text-neutral-900">How it works</a>
              <a href="#pricing" className="hover:text-neutral-900">Pricing</a>
              <a href="#blog" className="hover:text-neutral-900">Blog</a>
            </nav>
          </div>
          <div className="mt-8 flex flex-col items-start justify-between gap-2 border-t border-neutral-100 pt-6 text-sm text-neutral-500 md:flex-row md:items-center">
            <span>Free to start · no credit card · set up in minutes</span>
            <span>2026 {BRAND}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
