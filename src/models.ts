import { useEffect, useState } from "react";

const API_URL = "https://web-production-b2168.up.railway.app";

/* Every model an audit can carry, in display order.

   One list, in a module that imports nothing of ours, because the last
   arrangement had three. The dashboard had this one; the audit form ticked
   boxes from it; and saveAudit.ts, which cannot import the dashboard without
   a cycle, kept a hand-typed copy. That copy had already lost DeepSeek, so
   DeepSeek answers were never written to the history table — the exact
   failure the old comment above this list warned about, happening to the
   list the comment was attached to. */
export const MODELS = [
  { key: "chatgpt", label: "ChatGPT" },
  { key: "gemini", label: "Gemini" },
  { key: "perplexity", label: "Perplexity" },
  { key: "claude", label: "Claude" },
  { key: "deepseek", label: "DeepSeek" },
  { key: "ai_overview", label: "AI Overview" },
  { key: "copilot", label: "Copilot" },
  { key: "ai_mode", label: "Google AI Mode" },
  { key: "yandex", label: "Яндекс Нейро" },
] as const;

export type ModelName = (typeof MODELS)[number]["key"];

export type ServerModel = { key: string; label: string; separate?: boolean };

/* The models the server will actually run, asked rather than assumed.

   The audit form used to tick boxes from a list written in the frontend, and
   the two lists drifted exactly as far as you would expect: the form offered
   DeepSeek, which the server has switched off, and hid Claude, which the
   server had just gained. Someone choosing models was choosing from a menu
   that described a different kitchen.

   Both halves of that are worth fixing and only one is visible. A model
   offered and then not run silently drops out — `selected_models` narrows to
   what is available, so the audit comes back measured by fewer engines than
   were ticked, with nothing saying which. A model the server has and the form
   hides cannot be bought at all.

   `MODELS` stays as the display registry — labels, tab order, the type the
   dashboard reads — because that is about how a stored run is rendered, not
   about what can be run now. This hook is only about the latter. */
export function useServerModels(): { models: ServerModel[]; loading: boolean } {
  const [models, setModels] = useState<ServerModel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch(`${API_URL}/models`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data) => {
        if (!alive) return;
        const list = Array.isArray(data?.models) ? data.models : [];
        // An empty list would silently offer nothing and read as "no models
        // exist" rather than "we could not ask", so it is treated as failure.
        if (list.length) setModels(list);
        else throw new Error("empty model list");
      })
      .catch((e) => {
        if (!alive) return;
        console.warn("model list unavailable, using the built-in one", e);
        // The built-in list is a worse answer than the server's and a far
        // better one than an empty form. It may offer a model the server has
        // switched off; the server narrows, so the cost of that is a tick
        // that does nothing, not a wrong number.
        setModels(MODELS.map((m) => ({ key: m.key, label: m.label })));
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  return { models, loading };
}
