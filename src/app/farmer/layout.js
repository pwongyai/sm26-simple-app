"use client";

import { usePathname } from "next/navigation";
import { useSession } from "@/lib/useSession";
import { useOrders } from "@/lib/useOrders";
import Bell from "@/components/Bell";
import Logo from "@/components/Logo";
import TabBar from "@/components/TabBar";

// Version 3 §11.6 lists four farmer tabs, but the Weather one is dropped on
// the project lead's call — weather belongs inside a field, where it's about
// that plot, not as a home tab.
const TABS = [
  { key: "fields", href: "/farmer", label: "My Fields", icon: "field" },
  { key: "requests", href: "/farmer/orders", label: "Requests", icon: "request" },
  { key: "profile", href: "/farmer/profile", label: "Profile", icon: "person" },
];

export default function FarmerLayout({ children }) {
  const pathname = usePathname();
  const { user, loading } = useSession({ require: "farmer" });
  const [orders] = useOrders();

  if (loading) return null;

  const unseen = orders.filter((o) => o.unseen_by_farmer).length;
  const tab = pathname.startsWith("/farmer/orders")
    ? "requests"
    : pathname.startsWith("/farmer/profile")
      ? "profile"
      : "fields";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between bg-white px-5 py-3">
        <div className="flex items-center gap-2.5">
          <Logo size={28} />
          <div>
            <p className="text-[13px] font-bold leading-tight">{user.name}</p>
            <p className="text-[11px] text-[var(--text-tert)]">
              {user.organization.name}
            </p>
          </div>
        </div>
        <Bell count={unseen} />
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-5 pb-6">{children}</main>

      <TabBar tabs={TABS} active={tab} />
    </div>
  );
}
