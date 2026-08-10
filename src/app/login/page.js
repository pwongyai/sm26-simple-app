"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState("signin"); // 'signin' | 'signup'
  const [name, setName] = useState("");
  const [role, setRole] = useState("farmer");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function goToDashboard(userId) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      setError("Signed in, but no profile was found for this account.");
      return;
    }
    router.push(profile.role === "farmer" ? "/farmer" : "/contractor");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (mode === "signup") {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name, role } },
      });
      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }
      if (!data.session) {
        setError(
          "Account created — check your email to confirm before signing in."
        );
        setLoading(false);
        return;
      }
      await goToDashboard(data.user.id);
    } else {
      const { data, error: signInError } =
        await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }
      await goToDashboard(data.user.id);
    }
    setLoading(false);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="mb-1 text-xl font-semibold">SM26 Simple App</h1>
      <p className="mb-6 text-sm text-black/60">
        Minimal farmer ↔ contractor work requests.
      </p>

      <div className="mb-6 flex rounded border border-black/10 p-1 text-sm">
        <button
          type="button"
          onClick={() => setMode("signin")}
          className={`flex-1 rounded py-1.5 ${mode === "signin" ? "bg-black text-white" : ""}`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => setMode("signup")}
          className={`flex-1 rounded py-1.5 ${mode === "signup" ? "bg-black text-white" : ""}`}
        >
          Sign up
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {mode === "signup" && (
          <>
            <input
              type="text"
              placeholder="Your name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded border border-black/20 px-3 py-2 text-sm"
            />
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="role"
                  checked={role === "farmer"}
                  onChange={() => setRole("farmer")}
                />
                Farmer
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="role"
                  checked={role === "contractor"}
                  onChange={() => setRole("contractor")}
                />
                Contractor
              </label>
            </div>
          </>
        )}
        <input
          type="email"
          placeholder="Email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded border border-black/20 px-3 py-2 text-sm"
        />
        <input
          type="password"
          placeholder="Password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded border border-black/20 px-3 py-2 text-sm"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-black py-2 text-sm text-white disabled:opacity-50"
        >
          {loading ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
