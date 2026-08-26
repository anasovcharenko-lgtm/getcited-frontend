import { useEffect, useRef, useState } from "react";
import { supabase } from './supabase'
import { signInWithGoogle, signOut } from './auth'


import { ArrowRight, Check, X } from "lucide-react";
import { Dashboard, type AuditData } from "./Dashboard";

const BRAND = "GetCited";
const API_URL = "https://web-production-b2168.up.railway.app";
const AI_LOGOS = ["ChatGPT", "Claude", "Gemini", "Perplexity", "YandexGPT", "AI Overview", "Copilot", "Mistral", "Grok"];





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
  return <div ref={ref} className={`transition-all duration-700 ease-out ${shown ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"} ${className}`}>{children}</div>;
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

function Modal({ onClose, onAuditComplete }: { onClose: () => void; onAuditComplete: (data: AuditData) => void }) {
  const [brand, setBrand] = useState("");
  const [competitorsInput, setCompetitorsInput] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
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
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { count } = await supabase
          .from('audits')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);
        const adminEmails = ["anas.ovcharenko@gmail.com"];
        const isAdmin = user.email && adminEmails.includes(user.email);
        if (!isAdmin && (count ?? 0) >= 1) {
          setError("Free trial limit reached. Upgrade to run more audits.");
          setLoading(false);
          return;
        }
      }
      const res = await fetch(`${API_URL}/audit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand: brand.trim(), competitors: competitorsInput.split(",").map(c => c.trim()).filter(Boolean), description: description.trim(), website: website.trim() }) });
      const data = await res.json();
      if (user) {
        await supabase.from('audits').insert({
          user_id: user.id,
          brand: brand.trim(),
          visibility_score: data.visibility_score,
          gemini_score: data.gemini_score,
          chatgpt_score: data.chatgpt_score,
          total_prompts: data.total_prompts,
          category: data.category,
          mentions_score: data.mentions_score,
          citations_score: data.citations_score,
        });
      }
      onAuditComplete(data);
    } catch { setError("Something went wrong. Please try again."); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {loading && <LoadingScreen brand={brand} />}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={loading ? undefined : onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <button onClick={onClose} className="absolute right-4 top-4 text-neutral-300 hover:text-neutral-600"><X className="h-5 w-5" /></button>
        <h2 className="text-2xl font-bold">Audit your brand</h2>
        <p className="mt-1 text-sm text-neutral-500">See how often AI recommends you vs competitors.</p>
        <form onSubmit={startAudit} className="mt-6 flex flex-col gap-3">
          <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Your brand name" className="h-12 w-full rounded-lg border border-neutral-200 px-4 text-sm outline-none focus:border-neutral-900" />
          {checking && <p className="text-xs text-neutral-400">Checking brand...</p>}
          {showDescription && <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does your brand do? (e.g. CRM for small teams)" className="h-12 w-full rounded-lg border border-neutral-200 px-4 text-sm outline-none focus:border-neutral-900" />}
          <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="Your website (optional, improves accuracy)" className="h-12 w-full rounded-lg border border-neutral-200 px-4 text-sm outline-none focus:border-neutral-900" />
          <input value={competitorsInput} onChange={(e) => setCompetitorsInput(e.target.value)} placeholder="Competitors (optional): Notion, Confluence" className="h-12 w-full rounded-lg border border-neutral-200 px-4 text-sm outline-none focus:border-neutral-900" />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={loading} className="h-12 rounded-lg bg-neutral-900 text-sm text-white hover:bg-neutral-800 disabled:opacity-50 flex items-center gap-2 justify-center font-medium">
            {loading ? "Analysing..." : <><span>Start Free Audit</span><ArrowRight className="h-4 w-4" /></>}
          </button>
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

  if (auditData) return <Dashboard data={auditData} onBack={() => setAuditData(null)} lang="en" brandName={BRAND} />;

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
      {showModal && <Modal onClose={() => setShowModal(false)} onAuditComplete={(data) => { setShowModal(false); setAuditData(data); }} />}

      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-neutral-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-900 text-white"><span className="text-sm font-bold">G</span></div>
            <span className="font-semibold">{BRAND}</span>
          </div>
          <nav className="hidden items-center gap-8 text-sm text-neutral-500 md:flex">
            <a href="#friction" className="hover:text-neutral-900">How it works</a>
            <a href="#pricing" className="hover:text-neutral-900">Pricing</a>
            <a href="#blog" className="hover:text-neutral-900">Blog</a>
          </nav>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-1 text-xs text-neutral-400 sm:flex">
              <a href="/" className="font-medium text-neutral-900">EN</a>
              <span>|</span>
              <a href="/ru" className="hover:text-neutral-900">RU</a>
            </div>
            <button onClick={user ? signOut : signInWithGoogle} className="hidden text-sm text-neutral-500 hover:text-neutral-900 sm:block">{user ? user.email?.split("@")[0] : "Sign in"}</button>
            <button onClick={handleStartAudit} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800">Start free</button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative mx-auto max-w-5xl px-6 pb-20 pt-24 md:pt-32">
        <Reveal>
          <p className="text-sm text-neutral-400">Now tracking ChatGPT · Claude · Gemini · YandexGPT</p>
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
          <div className="mt-8 flex items-center gap-4">
            <button onClick={handleStartAudit} className="flex items-center gap-2 rounded-lg bg-neutral-900 px-6 py-3 text-sm font-medium text-white hover:bg-neutral-800">
              Start free audit <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-3 text-xs text-neutral-400">Free to start · no credit card</p>
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

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-5xl px-6 py-24">
        <Reveal>
          <h2 className="text-3xl font-bold tracking-tight">Simple pricing.</h2>
          <p className="mt-2 text-neutral-500">Start free. Upgrade when you are ready.</p>
        </Reveal>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            { name: "Free Trial", price: "$0", period: "3 days", features: ["1 brand", "10 prompts", "2 AI models", "1 run"], cta: "Start free" },
            { name: "Starter", price: "$9", period: "/month", features: ["1 brand", "20 prompts", "3 AI models", "4 runs / month"], cta: "Get started" },
            { name: "Pro", price: "$29", period: "/month", features: ["5 brands", "50 prompts", "5 AI models", "12 runs / month", "CSV export", "Team seats"], cta: "Go Pro", highlight: true },
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
              <button onClick={() => setShowModal(true)} className={`mt-6 rounded-lg py-2.5 text-sm font-medium ${"highlight" in plan && plan.highlight ? "bg-white text-neutral-900 hover:bg-neutral-100" : "bg-neutral-900 text-white hover:bg-neutral-800"}`}>{plan.cta}</button>
            </div>
          ))}
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
            <nav className="flex gap-6 text-sm text-neutral-400">
              <a href="#friction" className="hover:text-neutral-900">How it works</a>
              <a href="#pricing" className="hover:text-neutral-900">Pricing</a>
              <a href="#blog" className="hover:text-neutral-900">Blog</a>
            </nav>
          </div>
          <div className="mt-6 flex flex-col gap-1 border-t border-neutral-100 pt-6 text-xs text-neutral-400 md:flex-row md:justify-between">
            <span>Free to start · no credit card · set up in minutes</span>
            <span>© 2026 {BRAND}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
