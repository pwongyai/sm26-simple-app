"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Header from "@/components/Header";

const STATUS_STYLES = {
  open: "bg-yellow-100 text-yellow-800",
  accepted: "bg-blue-100 text-blue-800",
  done: "bg-green-100 text-green-800",
};

export default function FarmerPage() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [requests, setRequests] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
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

    if (!profileData || profileData.role !== "farmer") {
      router.push("/contractor");
      return;
    }

    setProfile(profileData);
    await loadRequests(session.user.id);
    setLoading(false);
  }

  async function loadRequests(farmerId) {
    const { data } = await supabase
      .from("requests")
      .select("*")
      .eq("farmer_id", farmerId)
      .order("created_at", { ascending: false });
    setRequests(data || []);
  }

  async function handlePost(e) {
    e.preventDefault();
    if (!message.trim()) return;
    setPosting(true);
    setError("");

    const { error: insertError } = await supabase.from("requests").insert({
      farmer_id: profile.id,
      message: message.trim(),
    });

    if (insertError) {
      setError(insertError.message);
    } else {
      setMessage("");
      await loadRequests(profile.id);
    }
    setPosting(false);
  }

  if (loading) {
    return <p className="p-6 text-sm text-black/60">Loading…</p>;
  }

  return (
    <>
      <Header name={profile.name} role="farmer" />
      <main className="mx-auto w-full max-w-lg flex-1 px-6 py-8">
        <h1 className="mb-4 text-lg font-semibold">Ask for work</h1>
        <form onSubmit={handlePost} className="mb-8 flex flex-col gap-2">
          <textarea
            placeholder="What do you need done? e.g. Harvest 5 rai of rice near the canal"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            required
            className="rounded border border-black/20 px-3 py-2 text-sm"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={posting}
            className="self-start rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {posting ? "Sending…" : "Send request"}
          </button>
        </form>

        <h2 className="mb-3 text-sm font-semibold text-black/70">
          Your requests
        </h2>
        {requests.length === 0 && (
          <p className="text-sm text-black/50">No requests yet.</p>
        )}
        <ul className="flex flex-col gap-3">
          {requests.map((r) => (
            <li
              key={r.id}
              className="rounded border border-black/10 p-3 text-sm"
            >
              <div className="mb-1 flex items-center justify-between">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[r.status]}`}
                >
                  {r.status}
                </span>
                <span className="text-xs text-black/40">
                  {new Date(r.created_at).toLocaleDateString()}
                </span>
              </div>
              <p>{r.message}</p>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
