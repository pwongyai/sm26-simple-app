"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getRole, clearRole } from "@/lib/store";
import { useOrders } from "@/lib/useOrders";
import Bell from "@/components/Bell";

export default function FarmerLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [orders] = useOrders();

  useEffect(() => {
    if (getRole() !== "farmer") router.replace("/");
  }, [router]);

  const hasUnseen = orders.some((o) => o.unseen_by_farmer);
  const onOrders = pathname.startsWith("/farmer/orders");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4">
        <div>
          <p className="font-semibold">Smart Farmer</p>
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
        <Link href="/farmer/orders">
          <Bell hasUnseen={hasUnseen} />
        </Link>
      </header>

      <nav className="flex border-b border-black/10 text-sm">
        <Link
          href="/farmer"
          className={`flex-1 py-3 text-center ${!onOrders ? "border-b-2 border-black font-medium" : "text-black/50"}`}
        >
          Farm
        </Link>
        <Link
          href="/farmer/orders"
          className={`flex-1 py-3 text-center ${onOrders ? "border-b-2 border-black font-medium" : "text-black/50"}`}
        >
          Work Orders
        </Link>
      </nav>

      <main className="mx-auto w-full max-w-lg flex-1 px-6 py-6">{children}</main>
    </div>
  );
}
