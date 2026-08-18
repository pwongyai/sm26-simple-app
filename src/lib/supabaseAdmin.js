import { createClient } from "@supabase/supabase-js";

// Server-only Supabase client. Uses the service-role key, which bypasses RLS —
// so this must never be imported into a client component. The identity tables
// (organizations / app_users / user_fields) have RLS on with no policies, so
// this is the only way to reach them at all.
//
// Created lazily: building the app must not require the key to be present
// (Next collects route config at build time, and Vercel builds run before env
// vars are necessarily complete). A missing key fails loudly on first use
// instead, which is where it actually matters.
let client = null;

function getClient() {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY (and URL) must be set — see .env.local.example"
    );
  }

  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

// Proxy so callers can keep writing `supabaseAdmin.from(...)` while the real
// client is only built on the first actual query.
export const supabaseAdmin = new Proxy(
  {},
  {
    get(_target, prop) {
      const value = getClient()[prop];
      return typeof value === "function" ? value.bind(getClient()) : value;
    },
  }
);
