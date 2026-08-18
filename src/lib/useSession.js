"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Who am I, according to the server. The session cookie is httpOnly, so the
// client can't read it directly — and can't fake it either.
export function useSession({ require: requiredRole } = {}) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const res = await fetch("/api/auth/me");
      const { user } = await res.json();
      if (cancelled) return;

      if (!user) {
        router.replace("/login");
        return;
      }
      if (!user.organization_id) {
        router.replace("/join");
        return;
      }
      // A contractor who hasn't said which business they are can't be shown
      // anyone's machines or prices yet.
      if (user.role === "contractor" && !user.contractor_agro_org_id) {
        router.replace("/business");
        return;
      }
      if (requiredRole && user.role !== requiredRole) {
        router.replace(user.role === "farmer" ? "/farmer" : "/contractor");
        return;
      }

      setUser(user);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [router, requiredRole]);

  return { user, loading };
}

export async function logout() {
  await fetch("/api/auth/logout", { method: "POST" });
}
