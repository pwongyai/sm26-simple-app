"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Pure router: the server decides who you are, this just forwards you.
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const { user } = await fetch("/api/auth/me").then((r) => r.json());
      if (!user) router.replace("/login");
      else if (!user.organization_id) router.replace("/join");
      else if (user.role === "contractor" && !user.contractor_agro_org_id)
        router.replace("/business");
      else router.replace(user.role === "farmer" ? "/farmer" : "/contractor");
    })();
  }, [router]);

  return null;
}
