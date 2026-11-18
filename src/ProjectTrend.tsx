import { useMemo, useState } from "react";
import { eventsBetween } from "./platformEvents";

/* Visibility over time for one brand.

   The sparkline this replaces drew every audit of a brand on one line,
   filtered by nothing but the brand name. A brand audited in Argentina, the
   United States and Mexico therefore had its three markets plotted as a single
   series — three different questions in one row, read as one trend.

   Two further things it could not show, both of which decide whether a
   movement means anything:

   Runs are not all comparable. A run with a different model set or a different
   number of prompts sits on a different denominator, and the week this was
   written produced 16% and 20% from the same five mentions for exactly that
   reason. Those runs are drawn, because hiding them would be worse, but they
   are drawn hollow and left out of the line.

   And a single run is not a measurement. Eight audits of one brand on 16
   November 2026 returned 23, 25, 31, 33, 34, 34, 36 and 37 — a fourteen-point
   spread with nothing changing in between. A line through those points would
   look like a story. So every run is a dot and the line follows the median of
   each day: the spread stays visible instead of being averaged into
   confidence. */

export type TrendRun = {
  id: string | number;
  created_at: string;
  visibility_score: number | null;
  country: string | null;
  total_prompts: number | null;
  models_used: Record<string, string> | null;
  name: string | null;
};

export type TrendStrings = {
  trendTitle: string;
  trendEmpty: string;
  noiseFloor: (lo: number, hi: number) => string;
  noiseNone: string;
  notComparable: string;
  runsOn: (n: number, day: string) => string;
  allMarkets: string;
};

/* What makes two runs answer the same question. Model set and prompt count,
   because both change the denominator. */
function shape(r: TrendRun): string {
  const models = Object.keys(r.models_used || {}).sort().join(",");
  return `${r.total_prompts ?? "?"}|${models}`;
}

const dayOf = (iso: string) => iso.slice(0, 10);

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/* How far apart runs of the same day, market and shape land.

   Measured rather than assumed, from the customer's own history: it is the
   only honest way to say whether a five-point move is a result or a coin
   toss. Reported as the typical spread, not the worst one — a single bad day
   should not set the bar. */
export function noiseFloor(runs: TrendRun[]): number | null {
  const buckets = new Map<string, number[]>();
  for (const r of runs) {
    if (r.visibility_score == null) continue;
    const key = `${dayOf(r.created_at)}|${r.country ?? ""}|${shape(r)}`;
    buckets.set(key, [...(buckets.get(key) || []), r.visibility_score]);
  }
  const spreads = [...buckets.values()]
    .filter((v) => v.length > 1)
    .map((v) => Math.max(...v) - Math.min(...v));
  return spreads.length ? median(spreads) : null;
}

export function marketsOf(runs: TrendRun[]): string[] {
  const seen = new Map<string, number>();
  for (const r of runs) {
    const c = r.country || "—";
    seen.set(c, (seen.get(c) || 0) + 1);
  }
  // Busiest first: the market with the most history is the one the switcher
  // should open on.
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
}

const LINE = ["#171717", "#737373", "#a3a3a3"];

export function ProjectTrend({ runs, t, lang }: {
  runs: TrendRun[]; t: TrendStrings; lang: "en" | "ru";
}) {
  const markets = useMemo(() => marketsOf(runs), [runs]);
  const [on, setOn] = useState<string[]>(() => markets.slice(0, 1));
  const noise = useMemo(() => noiseFloor(runs), [runs]);

  /* The commonest shape is treated as this brand's baseline, and anything
     else is the exception — rather than picking the newest run's shape, which
     would turn one experiment into the standard and mark the real history as
     odd. */
  const baseline = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of runs) counts.set(shape(r), (counts.get(shape(r)) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  }, [runs]);

  const geom = useMemo(() => {
    const shown = runs.filter(
      (r) => r.visibility_score != null && on.includes(r.country || "—"));
    if (shown.length < 1) return null;

    const times = shown.map((r) => Date.parse(r.created_at));
    const t0 = Math.min(...times), t1 = Math.max(...times);
    const span = Math.max(t1 - t0, 1);
    const w = 720, h = 220, padX = 8, padTop = 10, padBot = 24;
    const x = (iso: string) =>
      padX + ((Date.parse(iso) - t0) / span) * (w - padX * 2);
    const y = (v: number) => padTop + (1 - v / 100) * (h - padTop - padBot);

    const series = on.map((market, i) => {
      const mine = shown.filter((r) => (r.country || "—") === market);
      const byDay = new Map<string, TrendRun[]>();
      for (const r of mine) {
        const d = dayOf(r.created_at);
        byDay.set(d, [...(byDay.get(d) || []), r]);
      }
      // The line follows comparable runs only; a hollow dot still appears for
      // the others, so nothing is hidden, but nothing incomparable bends the
      // trend either.
      const pts = [...byDay.entries()]
        .map(([day, rs]) => {
          const ok = rs.filter((r) => shape(r) === baseline);
          const use = ok.length ? ok : [];
          return use.length
            ? { day, at: use[0].created_at,
                v: median(use.map((r) => r.visibility_score!)) }
            : null;
        })
        .filter(Boolean)
        .sort((a, b) => Date.parse(a!.at) - Date.parse(b!.at)) as
          { day: string; at: string; v: number }[];

      return {
        market,
        colour: LINE[i % LINE.length],
        points: pts.map((p) => `${x(p.at)},${y(p.v)}`).join(" "),
        dots: mine.map((r) => ({
          cx: x(r.created_at), cy: y(r.visibility_score!),
          comparable: shape(r) === baseline, run: r,
        })),
      };
    });

    const marks = eventsBetween(new Date(t0), new Date(t1)).map((e) => {
      const a = Math.max(Date.parse(e.date), t0);
      const b = Math.min(e.endsOn ? Date.parse(e.endsOn) : a, t1);
      return {
        event: e,
        x: padX + ((a - t0) / span) * (w - padX * 2),
        width: ((b - a) / span) * (w - padX * 2),
      };
    });

    return { series, marks, w, h, padTop, padBot,
             from: new Date(t0), to: new Date(t1) };
  }, [runs, on, baseline]);

  const toggle = (m: string) =>
    setOn((cur) => cur.includes(m)
      // Never empty: an empty chart teaches nothing, and the last market is
      // the one being looked at.
      ? (cur.length > 1 ? cur.filter((c) => c !== m) : cur)
      : [...cur, m]);

  return (
    <div className="rounded-2xl border border-neutral-150 bg-neutral-50/50 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">
          {t.trendTitle}
        </p>
        {markets.length > 1 && (
          <div className="flex flex-wrap gap-1">
            {markets.map((m) => {
              const active = on.includes(m);
              return (
                <button key={m} onClick={() => toggle(m)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    active ? "bg-neutral-900 text-white"
                           : "text-neutral-500 hover:text-neutral-900"}`}>
                  <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle"
                        style={{ background: active ? LINE[on.indexOf(m) % LINE.length] : "#d4d4d4" }} />
                  {m}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {geom ? (
        <>
          <svg viewBox={`0 0 ${geom.w} ${geom.h}`} width="100%" height={geom.h} className="mt-4">
            {geom.marks.map((m, i) => (
              m.width > 2
                ? <rect key={i} x={m.x} y={0} width={m.width} height={geom.h - geom.padBot}
                        fill="#171717" opacity={0.05}>
                    <title>{m.event.label[lang]}</title>
                  </rect>
                : <line key={i} x1={m.x} x2={m.x} y1={0} y2={geom.h - geom.padBot}
                        stroke="#171717" strokeWidth={1} strokeDasharray="3 3" opacity={0.25}>
                    <title>{m.event.label[lang]}</title>
                  </line>
            ))}
            {[0, 25, 50, 75, 100].map((v) => {
              const yy = geom.padTop + (1 - v / 100) * (geom.h - geom.padTop - geom.padBot);
              return (
                <g key={v}>
                  <line x1={0} x2={geom.w} y1={yy} y2={yy} stroke="#e5e5e5" strokeWidth={1} />
                  <text x={2} y={yy - 3} fontSize={9} fill="#a3a3a3">{v}%</text>
                </g>
              );
            })}
            {geom.series.map((s) => (
              <g key={s.market}>
                {s.points && (
                  <polyline points={s.points} fill="none" stroke={s.colour} strokeWidth={2} />
                )}
                {s.dots.map((d, i) => (
                  <circle key={i} cx={d.cx} cy={d.cy} r={3.5}
                          fill={d.comparable ? s.colour : "white"}
                          stroke={s.colour} strokeWidth={1.5}>
                    <title>
                      {d.run.name ? `${d.run.name} — ` : ""}
                      {new Date(d.run.created_at).toLocaleDateString()} · {d.run.visibility_score}%
                      {d.comparable ? "" : ` · ${t.notComparable}`}
                    </title>
                  </circle>
                ))}
              </g>
            ))}
          </svg>

          <div className="flex justify-between text-[10px] text-neutral-400">
            <span>{geom.from.toLocaleDateString()}</span>
            <span>{geom.to.toLocaleDateString()}</span>
          </div>

          {/* The number that decides how to read everything above it. */}
          <p className="mt-3 border-t border-neutral-150 pt-3 text-xs text-neutral-500">
            {noise != null ? t.noiseFloor(noise, noise) : t.noiseNone}
          </p>

          {geom.marks.length > 0 && (
            <ul className="mt-2 space-y-1">
              {geom.marks.map((m, i) => (
                <li key={i} className="text-[11px] text-neutral-400">
                  {new Date(m.event.date).toLocaleDateString()}
                  {m.event.endsOn && ` – ${new Date(m.event.endsOn).toLocaleDateString()}`}{" "}
                  <a href={m.event.source} target="_blank" rel="noopener noreferrer"
                     className="underline decoration-neutral-300 hover:text-neutral-700">
                    {m.event.label[lang]}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="mt-4 text-sm text-neutral-400">{t.trendEmpty}</p>
      )}
    </div>
  );
}
