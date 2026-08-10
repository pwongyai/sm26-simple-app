"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getRole, setRole } from "@/lib/store";

export default function Home() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const role = getRole();
    if (role === "farmer") router.replace("/farmer");
    else if (role === "contractor") router.replace("/contractor");
    else setChecked(true);
  }, [router]);

  function choose(role) {
    setRole(role);
    router.push(role === "farmer" ? "/farmer" : "/contractor");
  }

  if (!checked) return null;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="mb-1 text-xl font-semibold">SM26 Simple App</h1>
      <p className="mb-8 text-sm text-black/60">
        Who are you testing as?
      </p>
      <div className="flex flex-col gap-3">
        <button
          onClick={() => choose("farmer")}
          className="rounded bg-black py-3 text-sm font-medium text-white"
        >
          🌾 Smart Farmer
        </button>
        <button
          onClick={() => choose("contractor")}
          className="rounded border border-black/20 py-3 text-sm font-medium"
        >
          🚜 Contractor
        </button>
      </div>
    </main>
  );
}
