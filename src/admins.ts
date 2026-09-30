// Accounts exempt from the free-trial audit limit.
//
// This list used to live inside App.tsx, and the check that used it lived in
// two places. RuPage.tsx never got the exemption at all, so the Russian page
// enforced the limit on every account including the owner's. One list, one
// function, imported by both — so the two pages cannot disagree again.

export const ADMIN_EMAILS = [
  "anas.ovcharenko@gmail.com",
  "anaovcharenko11@gmail.com",
];

// Google returns the address as the user typed it at sign-up, so compare
// case-insensitively rather than trusting it to match the list exactly.
export const isAdmin = (email?: string | null): boolean =>
  !!email && ADMIN_EMAILS.includes(email.trim().toLowerCase());
