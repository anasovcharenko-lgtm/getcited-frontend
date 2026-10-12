import { supabase } from "./supabase";

/* Every call to the audit API goes through here.

   The API spends money on each request, so it now asks who is calling. The
   token is the one Supabase already issued at sign-in; this attaches it. It is
   a wrapper rather than a header helper because a call site that forgets the
   header fails only once the server starts enforcing, which is exactly when
   nobody is looking for it.

   getSession() refreshes an expired token before returning it, so a tab left
   open overnight does not start sending a dead one. */
export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init.headers as Record<string, string> | undefined) || {}),
  };
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch (e) {
    // No token is a valid state — signed out. Let the server decide.
    console.warn("no session for API call", e);
  }
  return fetch(url, { ...init, headers });
}
