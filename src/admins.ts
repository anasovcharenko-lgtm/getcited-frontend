// Accounts exempt from the free-trial audit limit.
//
// This list used to live inside App.tsx, and the check that used it lived in
// two places. RuPage.tsx never got the exemption at all, so the Russian page
// enforced the limit on every account including the owner's. One list, one
// function, imported by both — so the two pages cannot disagree again.

export const ADMIN_EMAILS = [
  "anas.ovcharenko@gmail.com",
  "anaovcharenko11@gmail.com",
  "ovcharenko.working@gmail.com",
];

// Google returns the address as the user typed it at sign-up, so compare
// case-insensitively rather than trusting it to match the list exactly.
export const isAdmin = (email?: string | null): boolean =>
  !!email && ADMIN_EMAILS.includes(email.trim().toLowerCase());

/* How many prompts one audit may carry.

   Twenty for everyone, fifty for these accounts. Written here rather than as
   a constant in each page because it was a constant in each page — the same
   number typed twice, in App.tsx and RuPage.tsx, which is how the exemption
   above came to be missing from the Russian page in the first place.

   Worth knowing before raising it further: fifty prompts is two and a half
   times the vendor spend of twenty, and it buys resolution. The detectable
   move at twenty prompts across seven engines is about eight points; at
   fifty it is about five. A run that cannot see a five-point change cannot
   report one, so this is the knob that decides what a trend line is allowed
   to mean. */
export const PROMPT_LIMIT = 20;
export const PROMPT_LIMIT_ADMIN = 50;

export const promptLimitFor = (email?: string | null): number =>
  isAdmin(email) ? PROMPT_LIMIT_ADMIN : PROMPT_LIMIT;
