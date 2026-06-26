"use client";

import Link from "next/link";
import { useAuthStore } from "@/store/authStore";
import { ArrowRight } from "lucide-react";

export default function Home() {
  const { isAuthenticated, user } = useAuthStore();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      {isAuthenticated ? (
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">
            Welcome, {user?.name || "User"}
          </h1>
          <p className="text-[var(--text-secondary)]">
            You are signed in as {user?.email}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">
            Internal Sales Tool
          </h1>
          <p className="text-[var(--text-secondary)]">
            Please{" "}
            <Link href="/login" className=" hover:underline transition-all">
              Login
            </Link>{" "}
            to access your workspace.
          </p>
        </div>
      )}
    </div>
  );
}
