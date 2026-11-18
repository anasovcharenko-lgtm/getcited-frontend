/* What size of movement this many prompts can actually detect.

   A visibility score is a proportion: named in k of the answers that came
   back. Proportions from a small sample move on their own, and ten prompts is
   a small sample. Eight audits of one brand on 16 November 2026 returned 23,
   25, 31, 33, 34, 34, 36 and 37 with nothing changing in between — and a
   simulation of pure chance at that prompt count predicts a spread of about
   eighteen, so the models were not being erratic. That is simply the
   resolution of ten prompts.

   The number matters before the run, not after. Someone choosing ten prompts
   is choosing a measurement that cannot see a five-point move, and they should
   learn that while they can still choose twenty — not a month later from a
   chart that appears to show progress.

   Worked at p = 0.5, where a proportion's variance is greatest, so the figure
   is a floor and never promises more resolution than it has. Checked against
   simulation at both p = 0.5 and p = 0.3:

       prompts   formula   simulated (p=0.5)   simulated (p=0.3)
            10      20pp                20pp                18pp
            20      14pp                14pp                13pp
            40      10pp                10pp                 9pp
            80       7pp                 7pp                 6pp
*/
export function detectableMove(prompts: number, models: number): number | null {
  const answers = prompts * models;
  if (!Number.isFinite(answers) || answers < 1) return null;
  // Two runs compared, 95% of pure noise falling below this.
  return Math.round(1.96 * Math.sqrt(0.5 / answers) * 100);
}

export const resolutionNote = {
  en: (pp: number) =>
    `At this size, only a change of about ${pp} points or more is distinguishable from run-to-run noise. More prompts, finer resolution.`,
  ru: (pp: number) =>
    `При таком размере от шума отличимо только изменение примерно от ${pp} пунктов. Больше промптов — тоньше разрешение.`,
};
