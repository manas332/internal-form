"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useSession } from "next-auth/react";
import { useAuthStore } from "@/store/authStore";

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const { data: session } = useSession();

  const login = useAuthStore((state) => state.login);

  useEffect(() => {
    if (!session?.user) return;
    const email = session?.user?.email;

    if (!email) return;

    if (!email.endsWith("@humarapandit.com")) {
      return;
    }

    login({
      id: email,
      name: session.user?.name ?? "",
      email,
    });
  }, [session, login]);

  const handleGoogleLogin = () => {
    setIsLoading(true);
    signIn("google");
    setIsLoading(false);
  };

  return (
    <div className="relative flex min-h-[calc(100vh-70px)] items-center justify-center px-4 py-12 sm:px-6 lg:px-8 bg-[var(--bg-app)] overflow-hidden">
      <div className="w-full max-w-md space-y-8 z-10">
        <div className="flex flex-col items-center text-center">
          <h2 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-[var(--text-primary)] to-[var(--accent)] bg-clip-text text-transparent sm:text-4xl">
            Internal Sales Tool
          </h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)] max-w-xs">
            Sign in using your corporate Google account to access your
            workspace.
          </p>
        </div>

        <button
          onClick={handleGoogleLogin}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 px-5 py-3.5 border border-[var(--border)] rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] font-semibold transition-all duration-200 shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed group relative overflow-hidden"
        >
          {isLoading ? (
            <>
              <span>Signing in...</span>
            </>
          ) : (
            <>
              <span>Sign in with Google</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
