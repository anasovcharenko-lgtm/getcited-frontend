import { supabase } from "./supabase";

/* Saving a run lives here rather than in each landing page, because the two
   pages had drifted apart before and the history is the one thing that cannot
   be reconstructed later: a run that was not written down is gone. */

type ModelInfo = {
  mentioned?: boolean;
  mentioned_with_link?: boolean;
  competitors_found?: string[];
};

type ResultRow = {
  prompt: string;
  prompt_type?: string;
  [model: string]: unknown;
};

type AuditPayload = {
  visibility_score?: number;
  gemini_score?: number;
  chatgpt_score?: number;
  total_prompts?: number;
  category?: string;
  mentions_score?: number;
  citations_score?: number;
  models_used?: Record<string, string>;
  model_status?: Record<string, { ok?: boolean; enabled?: boolean; error?: string | null }>;
  results?: ResultRow[];
};

/* Only models that actually answered. A disabled model returns `mentioned:
   false` for every prompt, and storing that would record "measured, not named"
   where the truth is "never measured" — which would quietly poison any
   before-and-after built on top of it. */
function activeModels(data: AuditPayload): string[] {
  const status = data.model_status;
  const candidates = ["chatgpt", "gemini", "perplexity", "claude", "ai_overview"];
  const present = candidates.filter((m) =>
    (data.results || []).some((r) => r[m] && typeof r[m] === "object"));
  if (!status) return present;
  return present.filter((m) => status[m]?.ok !== false);
}

export async function saveAuditRun(opts: {
  userId: string;
  brand: string;
  country: string;
  language: string;
  brandSize: string;
  data: AuditPayload;
}): Promise<void> {
  const { userId, brand, country, language, brandSize, data } = opts;

  // The id is needed to attach the per-prompt rows, so this insert has to read
  // back what it wrote.
  const { data: inserted, error } = await supabase
    .from("audits")
    .insert({
      user_id: userId,
      brand,
      visibility_score: data.visibility_score,
      gemini_score: data.gemini_score,
      chatgpt_score: data.chatgpt_score,
      total_prompts: data.total_prompts,
      category: data.category,
      mentions_score: data.mentions_score,
      citations_score: data.citations_score,
      // What the run was measured with. Without these, two runs made with
      // different models or a different prompt profile sit on the same chart as
      // if they were comparable.
      models_used: data.models_used ?? null,
      country,
      language,
      brand_size: brandSize,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    console.error("audit not saved", error);
    return;
  }

  const models = activeModels(data);
  const rows = (data.results || []).flatMap((r) =>
    models.map((m) => {
      const info = (r[m] || {}) as ModelInfo;
      return {
        audit_id: (inserted as { id: number | string }).id,
        user_id: userId,
        prompt: r.prompt,
        prompt_type: r.prompt_type ?? null,
        model: m,
        mentioned: !!info.mentioned,
        mentioned_with_link: !!info.mentioned_with_link,
        competitors_found: info.competitors_found ?? [],
      };
    }));

  if (rows.length === 0) return;

  const { error: rowsError } = await supabase.from("audit_prompts").insert(rows);
  if (rowsError) console.error("prompt history not saved", rowsError);
}
