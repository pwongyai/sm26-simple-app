"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Header from "@/components/Header";

export default function ContractorPage() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [openRequests, setOpenRequests] = useState([]);
  const [myJobs, setMyJobs] = useState([]);
  const [farmerNames, setFarmerNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      router.push("/login");
      return;
    }

    const { data: profileData } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single();

    if (!profileData || profileData.role !== "contractor") {
      router.push("/farmer");
      return;
    }

    setProfile(profileData);

    const { data: profiles } = await supabase.from("profiles").select("id, name");
    const names = {};
    (profiles || []).forEach((p) => {
      names[p.id] = p.name;
    });
    setFarmerNames(names);

    await loadRequests(profileData.id);
    setLoading(false);
  }

  async function loadRequests(contractorId) {
    const { data: open } = await supabase
      .from("requests")
      .select("*")
      .eq("status", "open")
      .order("created_at", { ascending: true });
    setOpenRequests(open || []);

    const { data: mine } = await supabase
      .from("requests")
      .select("*")
      .eq("contractor_id", contractorId)
      .order("created_at", { ascending: false });
    setMyJobs(mine || []);
  }

  async function handleAccept(id) {
    setError("");
    const { error: updateError } = await supabase
      .from("requests")
      .update({ status: "accepted", contractor_id: profile.id })
      .eq("id", id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    await loadRequests(profile.id);
  }

  async function handleMarkDone(id) {
    setError("");
    const { error: updateError } = await supabase
      .from("requests")
      .update({ status: "done" })
      .eq("id", id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    await loadRequests(profile.id);
  }

  if (loading) {
    return <p className="p-6 text-sm text-black/60">Loading…</p>;
  }

  return (
    <>
      <Header name={profile.name} role="contractor" />
      <main className="mx-auto w-full max-w-lg flex-1 px-6 py-8">
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        <h1 className="mb-3 text-lg font-semibold">Open requests</h1>
        {openRequests.length === 0 && (
          <p className="mb-8 text-sm text-black/50">Nothing waiting right now.</p>
        )}
        <ul className="mb-8 flex flex-col gap-3">
          {openRequests.map((r) => (
            <li
              key={r.id}
              className="flex items-start justify-between gap-3 rounded border border-black/10 p-3 text-sm"
            >
              <div>
                <p className="font-medium">{farmerNames[r.farmer_id] || "Unknown farmer"}</p>
                <p>{r.message}</p>
                <p className="mt-1 text-xs text-black/40">
                  {new Date(r.created_at).toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => handleAccept(r.id)}
                className="shrink-0 rounded bg-black px-3 py-1.5 text-xs text-white"
              >
                Accept
              </button>
            </li>
          ))}
        </ul>

        <h2 className="mb-3 text-sm font-semibold text-black/70">My jobs</h2>
        {myJobs.length === 0 && (
          <p className="text-sm text-black/50">No accepted jobs yet.</p>
        )}
        <ul className="flex flex-col gap-3">
          {myJobs.map((r) => (
            <li
              key={r.id}
              className="flex items-start justify-between gap-3 rounded border border-black/10 p-3 text-sm"
            >
              <div>
                <p className="font-medium">{farmerNames[r.farmer_id] || "Unknown farmer"}</p>
                <p>{r.message}</p>
                <p className="mt-1 text-xs text-black/40">{r.status}</p>
              </div>
              {r.status === "accepted" && (
                <button
                  onClick={() => handleMarkDone(r.id)}
                  className="shrink-0 rounded border border-black/20 px-3 py-1.5 text-xs"
                >
                  Mark done
                </button>
              )}
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
