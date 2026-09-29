import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { findDoc, navFor } from "./legal/content";
import { COMPANY, companyLine } from "./legal/company";

const BRAND = "GetCited";

// Monochrome renderer for the legal markdown. react-markdown and remark-gfm are
// already dependencies (the dashboard renders model answers with them), so the
// tables in these documents come for free.
const MD = {
  h1: ({ children }: { children?: ReactNode }) => (
    <h2 className="mt-12 text-xl font-semibold tracking-tight text-neutral-900">{children}</h2>
  ),
  h2: ({ children }: { children?: ReactNode }) => (
    <h2 className="mt-12 text-xl font-semibold tracking-tight text-neutral-900">{children}</h2>
  ),
  h3: ({ children }: { children?: ReactNode }) => (
    <h3 className="mt-8 text-base font-semibold text-neutral-900">{children}</h3>
  ),
  p: ({ children }: { children?: ReactNode }) => (
    <p className="mt-4 leading-relaxed text-neutral-600">{children}</p>
  ),
  strong: ({ children }: { children?: ReactNode }) => (
    <strong className="font-semibold text-neutral-900">{children}</strong>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="mt-4 list-disc space-y-2 pl-5">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="mt-4 list-decimal space-y-2 pl-5">{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => (
    <li className="leading-relaxed text-neutral-600 marker:text-neutral-300">{children}</li>
  ),
  code: ({ children }: { children?: ReactNode }) => (
    <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[0.85em] text-neutral-700">
      {children}
    </code>
  ),
  hr: () => <hr className="mt-10 border-neutral-100" />,
  a: ({ href, children }: { href?: string; children?: ReactNode }) => {
    const cls = "underline decoration-neutral-300 underline-offset-2 hover:decoration-neutral-900";
    if (href && /^https?:\/\//.test(href))
      return <a href={href} target="_blank" rel="noreferrer" className={cls}>{children}</a>;
    return <Link to={href ?? "#"} className={cls}>{children}</Link>;
  },
  table: ({ children }: { children?: ReactNode }) => (
    <div className="mt-6 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: ReactNode }) => <thead>{children}</thead>,
  tr: ({ children }: { children?: ReactNode }) => (
    <tr className="border-b border-neutral-100 align-top">{children}</tr>
  ),
  th: ({ children }: { children?: ReactNode }) => (
    <th className="border-b border-neutral-200 px-3 py-2 text-left font-medium text-neutral-900">
      {children}
    </th>
  ),
  td: ({ children }: { children?: ReactNode }) => (
    <td className="px-3 py-2 text-neutral-600">{children}</td>
  ),
};

const COPY = {
  en: { back: "Back to site", notFound: "Document not found.", legal: "Legal" },
  ru: { back: "На главную", notFound: "Документ не найден.", legal: "Документы" },
} as const;

export default function Legal({ lang }: { lang: "en" | "ru" }) {
  const { slug = "privacy" } = useParams();
  const doc = findDoc(lang, slug);
  const t = COPY[lang];
  const home = lang === "ru" ? "/ru" : "/";
  const base = lang === "ru" ? "/ru" : "";

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <header className="sticky top-0 z-40 border-b border-neutral-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to={home} className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-900 text-white">
              <span className="text-sm font-bold">G</span>
            </div>
            <span className="font-semibold">{BRAND}</span>
          </Link>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 text-xs text-neutral-400">
              <Link to={`/legal/${slug}`} className={lang === "en" ? "font-medium text-neutral-900" : "hover:text-neutral-900"}>EN</Link>
              <span>|</span>
              <Link to={`/ru/legal/${slug}`} className={lang === "ru" ? "font-medium text-neutral-900" : "hover:text-neutral-900"}>RU</Link>
            </div>
            <Link to={home} className="text-sm text-neutral-500 hover:text-neutral-900">{t.back}</Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-14 md:flex md:gap-14">
        <aside className="mb-10 shrink-0 md:mb-0 md:w-52">
          <div className="md:sticky md:top-24">
            <p className="text-xs uppercase tracking-wide text-neutral-400">{t.legal}</p>
            <nav className="mt-3 flex flex-wrap gap-x-4 gap-y-2 md:flex-col md:gap-2">
              {navFor(lang).map((d) => (
                <Link
                  key={d.slug}
                  to={`${base}/legal/${d.slug}`}
                  className={
                    d.slug === slug
                      ? "text-sm font-medium text-neutral-900"
                      : "text-sm text-neutral-400 hover:text-neutral-900"
                  }
                >
                  {d.nav}
                </Link>
              ))}
            </nav>
          </div>
        </aside>

        <main className="min-w-0 max-w-2xl">
          {doc ? (
            <>
              <h1 className="text-3xl font-bold leading-tight tracking-tight">{doc.title}</h1>
              <div className="mt-8 [&>h2:first-child]:mt-0">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD}>
                  {doc.body}
                </ReactMarkdown>
              </div>
            </>
          ) : (
            <p className="text-neutral-500">{t.notFound}</p>
          )}
        </main>
      </div>

      <LegalFooter lang={lang} />
    </div>
  );
}

// Exported so the landing pages can reuse it. The statutory details live in
// src/legal/company.ts — one source, so the two footers cannot drift apart.
export function LegalFooter({ lang }: { lang: "en" | "ru" }) {
  const base = lang === "ru" ? "/ru" : "";
  return (
    <footer className="border-t border-neutral-100">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-neutral-400">
          {navFor(lang).map((d) => (
            <Link key={d.slug} to={`${base}/legal/${d.slug}`} className="hover:text-neutral-900">
              {d.nav}
            </Link>
          ))}
        </nav>
        <div className="mt-6 space-y-1 border-t border-neutral-100 pt-6 text-xs leading-relaxed text-neutral-400">
          <p>{companyLine(BRAND)}</p>
          <p>
            {lang === "ru" ? "Контакт: " : "Contact: "}
            <a href={`mailto:${COMPANY.email}`} className="hover:text-neutral-900">{COMPANY.email}</a>
          </p>
          <p>© {new Date().getFullYear()} {COMPANY.name}</p>
        </div>
      </div>
    </footer>
  );
}
