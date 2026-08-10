"use client";

import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function Header({ name, role }) {
  const router = useRouter();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <header className="flex items-center justify-between border-b border-black/10 px-6 py-4">
      <div>
        <p className="font-semibold">SM26 Simple App</p>
        {name && (
          <p className="text-sm text-black/60">
            {name} · {role}
          </p>
        )}
      </div>
      {name && (
        <button
          onClick={handleLogout}
          className="rounded border border-black/20 px-3 py-1.5 text-sm hover:bg-black/5"
        >
          Log out
        </button>
      )}
    </header>
  );
}
