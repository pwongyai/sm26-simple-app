"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getRole, clearRole } from "@/lib/store";
import { useOrders } from "@/lib/useOrders";
import Bell from "@/components/Bell";

export default function ContractorLayout({ children }) {
  const router = useRouter();
  const [orders] = useOrders();

  useEffect(() => {
    if (getRole() !== "contractor") router.replace("/");
  }, [router]);

  const hasUnseen = orders.some((o) => o.unseen_by_contractor);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4">
        <div>
          <p className="font-semibold">Contractor</p>
          <button
            onClick={() => {
              clearRole();
              router.push("/");
            }}
            className="text-xs text-black/40 underline"
          >
            switch role
          </button>
        </div>
        <Bell hasUnseen={hasUnseen} />
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-6 py-6">{children}</main>
    </div>
  );
}
