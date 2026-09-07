import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, X } from "lucide-react";
import { supabase } from './supabase'
import { signInWithGoogle, signOut } from './auth'
import { Dashboard, type AuditData } from "./Dashboard";

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

function Modal({ onClose, onAuditComplete }: { onClose: () => void; onAuditComplete: (data: AuditData) => void }) {
  const [brand, setBrand] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [country, setCountry] = useState("RU");
  const [language, setLanguage] = useState(COUNTRY_LANGUAGE["RU"]);
  const [comps, setComps] = useState([{ name: "", website: "" }]);
  const [step, setStep] = useState(1);
  // "generate" asks the model to build the prompt set; "manual" runs exactly
  // what is typed and skips generation entirely.
  const [mode, setMode] = useState<"generate" | "manual">("generate");
  const [customRows, setCustomRows] = useState<string[]>([""]);
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

  const customLines = customRows.map((l) => l.trim()).filter(Boolean);

  /* Pasting a block of prompts should fill the rows rather than dumping every
     line into one field, which is what people actually do when they have a
     list ready in a document. */
  const pasteIntoRows = (index: number, text: string) => {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return false;
    const next = [...customRows];
    next.splice(index, 1, ...lines);
    setCustomRows(next.slice(0, MAX_PROMPTS));
    return true;
  };

  const startAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brand.trim()) return;
    if (mode === "manual" && customLines.length === 0) { setError("Добавьте хотя бы один промпт или переключитесь на генерацию."); return; }
    setLoading(true);
    setError("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { count } = await supabase.from('audits').select('*', { count: 'exact', head: true }).eq('user_id', user.id);
        if ((count ?? 0) >= 1) {
          setError("Лимит бесплатного периода исчерпан. Перейдите на платный план.");
          setLoading(false);
          return;
        }
      }
      const res = await fetch(`${API_URL}/audit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand: brand.trim(), competitor_list: comps.filter(c => c.name.trim()).map(c => ({ name: c.name.trim(), website: c.website.trim() })), description: description.trim(), website: website.trim(), country, language, custom_prompts: mode === "manual" ? customLines : [] }) });
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
    } catch { setError("Что-то пошло не так. Попробуйте ещё раз."); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <button onClick={onClose} className="absolute right-4 top-4 text-neutral-300 hover:text-neutral-600"><X className="h-5 w-5" /></button>
        <h2 className="text-2xl font-bold">Аудит вашего бренда</h2>
        <p className="mt-1 text-sm text-neutral-500">Узнайте как часто AI рекомендует вас по сравнению с конкурентами.</p>
        <form onSubmit={startAudit} className="mt-6 flex flex-col gap-3">
          {step === 1 && (<>
          <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Название вашего бренда" className="h-12 w-full rounded-lg border border-neutral-200 px-4 text-sm outline-none focus:border-neutral-900" />
          {checking && <p className="text-xs text-neutral-400">Проверяем бренд...</p>}
          {showDescription && <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Чем занимается ваш бренд? (например: CRM для малых команд)" className="h-12 w-full rounded-lg border border-neutral-200 px-4 text-sm outline-none focus:border-neutral-900" />}
          <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="Ваш сайт (необязательно, повышает точность)" className="h-12 w-full rounded-lg border border-neutral-200 px-4 text-sm outline-none focus:border-neutral-900" />
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">Страна для результатов AI</span>
            <select value={country} onChange={(e) => { setCountry(e.target.value); setLanguage(COUNTRY_LANGUAGE[e.target.value] || "English"); }} className="h-12 w-full rounded-lg border border-neutral-200 bg-white px-4 text-sm outline-none focus:border-neutral-900">
              {MARKETS.map((m) => (<option key={m.code} value={m.code}>{m.label}</option>))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">Язык результатов AI</span>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} className="h-12 w-full rounded-lg border border-neutral-200 bg-white px-4 text-sm outline-none focus:border-neutral-900">
              {LANGUAGES.map((l) => (<option key={l} value={l}>{l}</option>))}
            </select>
          </label>
          <div>
            <span className="mb-1 block text-xs text-neutral-500">Конкуренты</span>
            {comps.map((c, i) => (
              <div key={i} className="mb-2 flex gap-2">
                <input value={c.name} onChange={(e) => setComps(comps.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Название" className="h-12 w-1/2 rounded-lg border border-neutral-200 px-4 text-sm outline-none focus:border-neutral-900" />
                <input value={c.website} onChange={(e) => setComps(comps.map((x, j) => j === i ? { ...x, website: e.target.value } : x))} placeholder="Сайт (необязательно)" className="h-12 w-1/2 rounded-lg border border-neutral-200 px-4 text-sm outline-none focus:border-neutral-900" />
              </div>
            ))}
            {comps.length < 5 && (
              <button type="button" onClick={() => setComps([...comps, { name: "", website: "" }])} className="text-xs text-neutral-500 hover:text-neutral-900">+ Добавить конкурента</button>
            )}
          </div>
          <button type="button" onClick={() => setStep(2)} disabled={!brand.trim()} className="h-12 rounded-lg bg-neutral-900 text-sm text-white hover:bg-neutral-800 disabled:opacity-50 font-medium">Далее →</button>
          </>)}

          {step === 2 && (<>
          <div>
            <h3 className="text-sm font-medium">Какие промпты проверяем</h3>
            <p className="mt-0.5 text-xs text-neutral-500">Впишите свои или дайте сгенерировать по вашей категории.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setMode("generate")} className={`h-10 flex-1 rounded-lg border text-xs font-medium ${mode === "generate" ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 text-neutral-600"}`}>Сгенерировать</button>
            <button type="button" onClick={() => setMode("manual")} className={`h-10 flex-1 rounded-lg border text-xs font-medium ${mode === "manual" ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 text-neutral-600"}`}>Напишу сама</button>
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
                      if (pasteIntoRows(i, e.clipboardData.getData("text"))) e.preventDefault();
                    }}
                    placeholder="Промпт"
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
                  <button type="button" onClick={() => setCustomRows([...customRows, ""])} className="text-xs text-neutral-500 hover:text-neutral-900">+ Добавить промпт</button>
                ) : <span />}
                <span className="text-xs text-neutral-400">{customLines.length} промпт(ов)</span>
              </div>
            </div>
          ) : (
            <p className="rounded-lg bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-500">Сгенерированные промпты покрывают шесть типов запросов: сравнение, коммерческие, проблемные, брендовые, отраслевые и технические.</p>
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={loading} className="h-12 rounded-lg bg-neutral-900 text-sm text-white hover:bg-neutral-800 disabled:opacity-50 flex items-center gap-2 justify-center font-medium">
            {loading ? "..." : <><span>{mode === "manual" ? "Проверить эти промпты" : "Сгенерировать и запустить"}</span><ArrowRight className="h-4 w-4" /></>}
          </button>
          <button type="button" onClick={() => setStep(1)} className="text-xs text-neutral-400 hover:text-neutral-900">← Назад</button>
          </>)}
        </form>
        <p className="mt-3 text-center text-xs text-neutral-400">Бесплатно · без карты</p>
      </div>
    </div>
  );
}

export default function RuPage() {
  const [showModal, setShowModal] = useState(false);
  const [auditData, setAuditData] = useState<AuditData | null>(null);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { setUser(session?.user ?? null); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { setUser(session?.user ?? null); });
    return () => subscription.unsubscribe();
  }, []);

  const handleStartAudit = () => {
    if (!user) { signInWithGoogle(); } else { setShowModal(true); }
  };

  if (auditData) return <Dashboard data={auditData} onBack={() => setAuditData(null)} lang="ru" brandName={BRAND} />;

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <style>{`@keyframes marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}`}</style>
      {showModal && <Modal onClose={() => setShowModal(false)} onAuditComplete={(data) => { setShowModal(false); setAuditData(data); }} />}
      <header className="sticky top-0 z-40 border-b border-neutral-100 bg-white/90 backdrop-blur">
        <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-6 py-4 md:grid-cols-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-900 text-white"><span className="text-sm font-bold">G</span></div>
            <span className="font-semibold">{BRAND}</span>
          </div>
          <nav className="hidden items-center justify-center gap-8 text-sm text-neutral-500 md:flex">
            <a href="#friction" className="hover:text-neutral-900">Как это работает</a>
            <a href="#pricing" className="hover:text-neutral-900">Цены</a>
            <a href="#blog" className="hover:text-neutral-900">Блог</a>
          </nav>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-1 text-xs text-neutral-400 sm:flex">
              <a href="/" className="hover:text-neutral-900">EN</a>
              <span>|</span>
              <a href="/ru" className="font-medium text-neutral-900">RU</a>
            </div>
            <button onClick={user ? signOut : signInWithGoogle} className="hidden text-sm text-neutral-500 hover:text-neutral-900 sm:block">{user ? user.email?.split("@")[0] : "Войти"}</button>
            <button onClick={handleStartAudit} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800">Начать бесплатно</button>
          </div>
        </div>
      </header>
      <section className="mx-auto max-w-5xl px-6 pb-20 pt-24 md:pt-32">
        <Reveal><p className="text-sm text-neutral-400">Отслеживаем ChatGPT · Claude · Gemini · YandexGPT</p></Reveal>
        <Reveal>
          <h1 className="mt-4 max-w-3xl text-balance text-5xl font-bold leading-tight tracking-tight md:text-6xl">
            Ваш бренд —<br />в каждом ответе AI.
          </h1>
        </Reveal>
        <Reveal>
          <p className="mt-6 max-w-xl text-lg text-neutral-500">
            Показываем, где вас обходят конкуренты и как именно вам обойти их.
          </p>
        </Reveal>
        <Reveal>
          <div className="mt-8 flex items-center gap-4">
            <button onClick={handleStartAudit} className="flex items-center gap-2 rounded-lg bg-neutral-900 px-6 py-3 text-sm font-medium text-white hover:bg-neutral-800">
              Начать бесплатный аудит <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-3 text-xs text-neutral-400">Бесплатно · без карты</p>
        </Reveal>
      </section>
      <section className="border-y border-neutral-100 py-5">
        <p className="mb-3 text-center text-[10px] uppercase tracking-widest text-neutral-400">Одна панель · все AI модели</p>
        <div className="relative overflow-hidden">
          <div className="flex w-max animate-[marquee_25s_linear_infinite] gap-12 pr-12">
            {[...AI_LOGOS, ...AI_LOGOS].map((logo, i) => <span key={i} className="whitespace-nowrap text-sm font-semibold text-neutral-300">{logo}</span>)}
          </div>
        </div>
      </section>
      <section id="friction" className="mx-auto max-w-5xl px-6 py-24">
        <Reveal>
          <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">Проблема</p>
          <h2 className="mt-3 max-w-2xl text-balance text-4xl font-bold tracking-tight md:text-5xl">
            Ваш бренд невидим для AI.<br />И вы даже не знаете об этом.
          </h2>
        </Reveal>
        <div className="mt-12 space-y-4">
          {[
            "Ваших конкурентов рекомендует ChatGPT. Вас — нет.",
            "Вы не знаете, какие промпты используют ваши покупатели.",
            "Вы не знаете, в каких AI вас упоминают, а в каких — игнорируют.",
            "Вы не знаете, какие страницы сайта AI вообще читает.",
            "Вы получаете данные. Но никто не говорит, что с ними делать.",
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
      <section className="border-t border-neutral-100 bg-neutral-50/50 py-24">
        <div className="mx-auto max-w-5xl px-6">
          <Reveal>
            <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">Продукт · смотри в действии</p>
            <h2 className="mt-3 max-w-2xl text-balance text-4xl font-bold tracking-tight">Мы берём на себя вашу AI-видимость.</h2>
          </Reveal>
          <div className="mt-16 space-y-20">
            {[
              { num: "01", title: "Как часто AI упоминает ваш бренд по сравнению с конкурентами", desc: "Отслеживайте процент упоминаний по всем ключевым AI-моделям. Видите точно, где конкуренты обходят вас." },
              { num: "02", title: "Рейтинг брендов", desc: "Смотрите где ваш бренд стоит относительно конкурентов в каждой AI-модели. Знайте, кто обгоняет вас и насколько." },
              { num: "03", title: "Какие промпты используют клиенты — и где вы проигрываете", desc: "Узнайте, какие именно вопросы задают AI в вашей категории. Смотрите, какие темы покрывают конкуренты, а вы — нет." },
              { num: "04", title: "Какие страницы вашего сайта AI цитирует чаще всего", desc: "AI любят не любой контент. Смотрите, какие страницы попадают в ответы, и оценку каждой из них." },
              { num: "05", title: "Сколько посетителей из AI стали клиентами", desc: "Отслеживайте конверсии трафика из AI. Знайте, какие каналы реально приносят выручку.", badge: "Скоро" },
              { num: "06", title: "Рекомендации по улучшению — автоматически + персональный аудит", desc: "Каждая страница получает приоритетные рекомендации. Апгрейд даёт персональный аудит и звонок с экспертом." },
            ].map(({ num, title, desc, badge }) => (
              <Reveal key={num}>
                <div className="grid items-center gap-12 md:grid-cols-2">
                  <div className={num === "02" || num === "04" ? "md:order-2" : ""}>
                    <p className="font-mono text-sm text-neutral-300">{num}</p>
                    <h3 className="mt-2 text-2xl font-bold tracking-tight">{title}</h3>
                    <p className="mt-3 text-neutral-500">{desc}</p>
                    {badge && <span className="mt-4 inline-block rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-medium text-neutral-600">{badge}</span>}
                  </div>
                  <div className={`rounded-xl border border-neutral-200 bg-white p-5 ${num === "02" || num === "04" ? "md:order-1" : ""}`}>
                    <p className="text-xs text-neutral-400 uppercase tracking-wider mb-3">Пример данных</p>
                    <div className="space-y-2">
                      {["Ваш бренд", "Конкурент A", "Конкурент B"].map((b, i) => (
                        <div key={b} className={`flex items-center justify-between rounded-lg px-3 py-2 ${i === 0 ? "bg-neutral-900 text-white" : "bg-neutral-50"}`}>
                          <span className="text-sm font-medium">{b}</span>
                          <span className="text-sm font-bold">{[74, 61, 45][i]}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      <section id="pricing" className="mx-auto max-w-5xl px-6 py-24">
        <Reveal>
          <h2 className="text-3xl font-bold tracking-tight">Простые цены.</h2>
          <p className="mt-2 text-neutral-500">Начните бесплатно. Переходите на платный план когда будете готовы.</p>
        </Reveal>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            { name: "Бесплатный период", price: "0 ₽", period: "3 дня", features: ["1 бренд", "10 промптов", "2 AI-модели", "1 запуск"], cta: "Начать бесплатно" },
            { name: "Стартер", price: "990 ₽", period: "/месяц", features: ["1 бренд", "20 промптов", "3 AI-модели", "4 запуска / месяц"], cta: "Выбрать" },
            { name: "Про", price: "2 990 ₽", period: "/месяц", features: ["5 брендов", "50 промптов", "5 AI-моделей", "12 запусков / месяц", "Экспорт CSV", "Командный доступ"], cta: "Выбрать Про", highlight: true },
          ].map((plan) => (
            <div key={plan.name} className={`flex flex-col rounded-2xl border p-6 ${"highlight" in plan && plan.highlight ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 bg-white"}`}>
              <p className={`text-xs font-medium ${"highlight" in plan && plan.highlight ? "text-neutral-400" : "text-neutral-500"}`}>{plan.name}</p>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-4xl font-bold">{plan.price}</span>
                <span className="text-sm text-neutral-400">{plan.period}</span>
              </div>
              <ul className="mt-6 flex-1 space-y-2">
                {plan.features.map((f) => <li key={f} className="flex items-center gap-2 text-sm"><Check className={`h-4 w-4 shrink-0 ${"highlight" in plan && plan.highlight ? "text-white" : "text-neutral-900"}`} />{f}</li>)}
              </ul>
              <button onClick={handleStartAudit} className={`mt-6 rounded-lg py-2.5 text-sm font-medium ${"highlight" in plan && plan.highlight ? "bg-white text-neutral-900 hover:bg-neutral-100" : "bg-neutral-900 text-white hover:bg-neutral-800"}`}>{plan.cta}</button>
            </div>
          ))}
        </div>
      </section>
      <footer className="border-t border-neutral-100">
        <div className="mx-auto max-w-5xl px-6 py-10">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-900 text-white"><span className="text-sm font-bold">G</span></div>
              <span className="font-semibold">{BRAND}</span>
            </div>
            <nav className="flex gap-6 text-sm text-neutral-400">
              <a href="#friction" className="hover:text-neutral-900">Как это работает</a>
              <a href="#pricing" className="hover:text-neutral-900">Цены</a>
              <a href="#blog" className="hover:text-neutral-900">Блог</a>
            </nav>
          </div>
          <div className="mt-6 flex flex-col gap-1 border-t border-neutral-100 pt-6 text-xs text-neutral-400 md:flex-row md:justify-between">
            <span>Бесплатно · без карты · запуск за несколько минут</span>
            <span>© 2026 {BRAND}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
