"use client";

import { usePathname } from "next/navigation";
import { useSession } from "@/lib/useSession";
import {
  ContractorOrdersProvider,
  useContractorOrders,
} from "@/lib/ContractorOrdersContext";
import Bell from "@/components/Bell";
import Logo from "@/components/Logo";
import TabBar from "@/components/TabBar";
import OrderDetail from "@/components/OrderDetail";
import IncomingRequestCard from "@/components/IncomingRequestCard";

// Version 2's three-step workflow plus settings — Booking, Machine, Report,
// Settings — as a bottom tab bar, the way version 3 laid it out.
const TABS = [
  { key: "notebook", href: "/contractor", label: "Booking", icon: "book" },
  { key: "machines", href: "/contractor/machines", label: "Machine", icon: "machine" },
  { key: "reports", href: "/contractor/reports", label: "Report", icon: "report" },
  { key: "settings", href: "/contractor/settings", label: "Settings", icon: "settings" },
];

export default function ContractorLayout({ children }) {
  const { user, loading } = useSession({ require: "contractor" });

  if (loading) return null;

  return (
    <ContractorOrdersProvider>
      <ContractorChrome user={user}>{children}</ContractorChrome>
    </ContractorOrdersProvider>
  );
}

function ContractorChrome({ user, children }) {
  const pathname = usePathname();
  const {
    services,
    selected,
    setSelected,
    refresh,
    pending,
    showIncoming,
    openIncoming,
    closeIncoming,
  } = useContractorOrders();

  const tab =
    TABS.slice(1).find((t) => pathname.startsWith(t.href))?.key || "notebook";

  return (
    // h-dvh (not min-h-screen) + overflow-y-auto on <main> — the tab bar's
    // CSS position is `sticky`, which only avoids overlapping content when
    // the page is tall enough to scroll past its natural position first. On
    // a short page (e.g. Machine Detail once its stats grid was removed),
    // the bar's natural position was already below the fold at scrollTop 0,
    // so it snapped up and painted over the last ~15px of real content
    // instead of sitting below it. Pinning the shell to exactly one viewport
    // and letting only <main> scroll means the tab bar is just an ordinary
    // flex sibling at the true bottom, every time — nothing to overlap.
    <div className="flex h-dvh flex-col">
      {/* The logo sits where a title would, exactly as version 3 has it. */}
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
        <div className="flex items-center gap-3">
          <Bell count={pending.length} onClick={openIncoming} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 overflow-y-auto px-5 pb-0">
        {children}
      </main>

      <TabBar tabs={TABS} active={tab} />

      {/* The bell's own overlay — incoming Smart Farmer requests, reachable
          from any contractor tab since the bell lives in this shared header. */}
      {showIncoming && (
        <div className="overlay">
          <div className="ov-header">
            <button className="ov-back" onClick={closeIncoming}>
              ←
            </button>
            <span className="ov-title">Incoming Requests</span>
          </div>
          <div className="ov-body">
            <div className="fieldset-note">
              Requests sent by Smart Farmers through the app. Accepting adds the
              job to your notebook; you can change the date first.
            </div>
            {pending.length === 0 && (
              <p className="empty-msg">Nothing waiting right now.</p>
            )}
            {pending.map((o) => (
              <IncomingRequestCard
                key={o.id}
                order={o}
                onChanged={() => {
                  refresh();
                  closeIncoming();
                }}
              />
            ))}
          </div>
        </div>
      )}

      {selected && (
        <OrderDetail
          order={selected}
          services={services}
          onClose={() => setSelected(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}
