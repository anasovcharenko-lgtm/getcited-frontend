import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, X } from "lucide-react";

const BRAND = "GetCited";
const API_URL = "https://web-production-b2168.up.railway.app";

const AI_LOGOS = [
  "ChatGPT", "Claude", "Gemini", "Perplexity",
  "YandexGPT", "AI Overview", "Copilot", "Mistral", "Grok",
];

function Reveal({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`transition-all duration-700 ease-out ${shown ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"} ${className}`}>
      {children}
    </div>
  );
}

type AuditResult = {
  prompt: string;
  brand_mentioned: boolean;
  competitors_found: string[];
};

type AuditData = {
  brand: string;
  visibility_score: number;
  results: AuditResult[];
  recommendations: string;
};

function Dashboard({ data, onBack }: { data: AuditData; onBack: () => void }) {
  const recs = data.recommendations.split("\n\n").filter(Boolean);
  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <header className="sticky top-0 z-40 border-b border-neutral-100 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <button onClick={onBack} className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-900 text-white">
              <span className="text-sm font-bold">G</span>
            </div>
            <span className="text-lg font-semibold tracking-tight">{BRAND}</span>
          </button>
          <button onClick={onBack} className="text-sm text-neutral-500 hover:text-neutral-900">← Back</button>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-12">
        <div className="mb-10 text-center">
          <h1 className="text-4xl font-bold">{data.brand}</h1>
          <div className="mt-4 text-8xl font-bold text-[#5B4BFF]">{data.visibility_score}%</div>
          <p className="mt-2 text-neutral-500">AI Visibility Score</p>
        </div>

        <div className="mb-10 rounded-2xl border border-neutral-200 p-6">
          <h2 className="mb-4 text-xl font-bold">Prompt Results</h2>
          <div className="space-y-3">
            {data.results.map((r, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-neutral-100 bg-neutral-50 px-4 py-3">
                <span className="text-sm text-neutral-700">{r.prompt}</span>
                {r.brand_mentioned
                  ? <span className="flex items-center gap-1 text-emerald-600 text-sm"><Check className="h-4 w-4" /> Mentioned</span>
                  : <span className="flex items-center gap-1 text-red-500 text-sm"><X className="h-4 w-4" /> Not mentioned</span>
                }
              </div>
            ))}
          </div>
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
                  <p className="mt-2 text-sm text-neutral-800 whitespace-pre-wrap">{rec.replace(/PRIORITY:.*\n/, "").replace(/WHY IT WORKS.*\n?/g, "").trim()}</p>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const [brand, setBrand] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [auditData, setAuditData] = useState<AuditData | null>(null);

  const startAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brand.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand: brand.trim(), competitors: [] }),
      });
      const data = await res.json();
      setAuditData(data);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (auditData) return <Dashboard data={auditData} onBack={() => setAuditData(null)} />;

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <style>{`:root{--brand:#5B4BFF;} @keyframes marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}`}</style>

      <header className="sticky top-0 z-40 border-b border-neutral-100 bg-white/80 backdrop-blur">
        <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-6 py-4 md:grid-cols-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-900 text-white">
              <span className="text-sm font-bold">G</span>
            </div>
            <span className="text-lg font-semibold tracking-tight">{BRAND}</span>
          </div>
          <nav className="hidden items-center justify-center gap-8 text-sm text-neutral-600 md:flex">
            <a href="#how" className="hover:text-neutral-900">How it works</a>
            <a href="#pricing" className="hover:text-neutral-900">Pricing</a>
            <a href="#blog" className="hover:text-neutral-900">Blog</a>
          </nav>
          <div className="flex items-center justify-end gap-2">
            <button className="hidden sm:inline-flex px-3 py-1.5 text-sm text-neutral-600 hover:text-neutral-900">Sign In</button>
            <button className="px-3 py-1.5 text-sm bg-[#5B4BFF] text-white rounded-md hover:bg-[#4a3ae0]">Start Free</button>
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
        <Reveal>
          <h1 className="mx-auto mt-6 max-w-4xl text-5xl font-bold tracking-tight text-neutral-900 md:text-7xl">
            See how often AI recommends your brand
          </h1>
        </Reveal>
        <Reveal>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-neutral-600 md:text-xl">
            Get actionable recommendations to outflank your competitors.
          </p>
        </Reveal>
        <Reveal>
          <form onSubmit={startAudit} className="mx-auto mt-10 flex w-full max-w-xl flex-col gap-3 sm:flex-row">
            <input
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="Enter your brand name"
              className="h-12 flex-1 rounded-md border border-neutral-200 bg-white px-4 text-base outline-none focus:border-[#5B4BFF]"
            />
            <button
              type="submit"
              disabled={loading}
              className="h-12 rounded-md bg-[#5B4BFF] px-6 text-white hover:bg-[#4a3ae0] disabled:opacity-60 flex items-center gap-2 justify-center"
            >
              {loading ? "Running audit..." : <><span>Start Free Audit</span><ArrowRight className="h-4 w-4" /></>}
            </button>
          </form>
          {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
          <p className="mt-4 text-sm text-neutral-500">Free to start · no credit card</p>
        </Reveal>
      </section>

      <section className="border-y border-neutral-100 bg-white py-8">
        <div className="mb-4 text-center text-xs uppercase tracking-widest text-neutral-400">Tracking visibility across</div>
        <div className="relative overflow-hidden">
          <div className="flex w-max animate-[marquee_30s_linear_infinite] gap-14 pr-14">
            {[...AI_LOGOS, ...AI_LOGOS].map((logo, i) => (
              <span key={i} className="whitespace-nowrap text-xl font-semibold tracking-tight text-neutral-400">{logo}</span>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-6xl px-6 py-24 md:py-32">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-4xl font-bold tracking-tight md:text-5xl">Simple pricing</h2>
            <p className="mt-4 text-lg text-neutral-600">Start free. Upgrade when you're ready.</p>
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
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className={`mt-0.5 h-4 w-4 shrink-0 ${plan.dark ? "text-[#5B4BFF]" : "text-neutral-900"}`} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <button className={`mt-8 h-11 rounded-xl font-medium ${plan.dark ? "bg-white text-neutral-900 hover:bg-neutral-100" : "bg-neutral-900 text-white hover:bg-neutral-800"}`}>
                {plan.cta}
              </button>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-neutral-100 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-900 text-white">
                <span className="text-sm font-bold">G</span>
              </div>
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
            <span>© 2026 {BRAND}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}