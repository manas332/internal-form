"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import ThemeToggle from "./ThemeToggle";
import { useAuthStore } from "@/store/authStore";
import { LogOut, User, Menu, X } from "lucide-react";
import { useState, useEffect } from "react";
import { signOut } from "next-auth/react";

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, user, logout } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);

  const handleLogout = async () => {
    logout();
    await signOut({
      callbackUrl: "/login",
    });
  };

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  // Prevent body scroll when sidebar is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const list = [
    {
      name: "Create Order",
      href: "/create-order",
    },
    {
      name: "Schedule Order",
      href: "/schedule-order",
    },
    {
      name: "Track Orders",
      href: "/tracking",
    },
    {
      name: "Track Revenue",
      href: "/track-revenue",
    },
    {
      name: "Grievances",
      href: "/grievance",
    },
    {
      name: "Search Orders",
      href: "/search-orders",
    },
    {
      name: "Edit Invoice",
      href: "/edit-invoice",
    },
    {
      name: "Admin",
      href: "/admin",
    },
  ];

  return (
    <>
      <nav className="main-nav relative z-30">
        <div className="nav-container max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isAuthenticated && (
              <button
                onClick={() => setIsOpen(true)}
                className="p-2 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all duration-200 cursor-pointer"
                aria-label="Open navigation menu"
              >
                <Menu className="w-5.5 h-5.5" />
              </button>
            )}

            <div className="nav-logo flex items-center gap-2">
              <Image
                src="/hp_logo.png"
                alt="HP Logo"
                width={120}
                height={36}
                style={{ height: "36px", width: "auto", maxWidth: "120px" }}
                className="mix-blend-multiply dark:mix-blend-normal object-contain"
              />
              <span className="logo-text">Internal Sales Tool</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {!isAuthenticated && (
              <div className="nav-links flex items-center gap-4">
                <Link
                  href="/login"
                  className="px-4 py-2 rounded-lg bg-[var(--accent-soft)] hover:bg-[var(--accent)] text-[var(--accent)] hover:text-white text-sm font-semibold transition-all duration-200"
                >
                  Login
                </Link>
              </div>
            )}

            <ThemeToggle />
          </div>
        </div>
      </nav>

      {/* Sidebar Backdrop Overlay */}
      {isAuthenticated && isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 transition-opacity duration-300"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar Drawer Panel */}
      {isAuthenticated && (
        <div
          className={`fixed inset-y-0 left-0 w-80 bg-[var(--bg-card)] border-r border-[var(--border)] z-50 shadow-2xl flex flex-col justify-between transition-transform duration-300 ease-in-out ${
            isOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {/* Drawer Header */}
          <div className="p-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--bg-section)]">
            <div className="flex items-center gap-2">
              <Image
                src="/hp_logo.png"
                alt="HP Logo"
                width={100}
                height={30}
                style={{ height: "30px", width: "auto" }}
                className="mix-blend-multiply dark:mix-blend-normal object-contain"
              />
              <span className="font-bold text-xs tracking-tight text-[var(--text-secondary)]">
                Portal
              </span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-2 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Drawer Navigation Links */}
          <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1.5">
            {list.map((item) => {
              return (
                <Link
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                    pathname === item.href
                      ? "bg-[var(--accent-soft)] text-[var(--accent)] font-bold border-l-[1px] border-[var(--accent)] pl-3"
                      : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {item.name}
                </Link>
              );
            })}
          </div>

          {/* Drawer Footer */}
          <div className="p-4 border-t border-[var(--border)] bg-[var(--bg-section)] flex flex-col gap-3">
            <button
              onClick={() => {
                setIsOpen(false);
                handleLogout();
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 text-sm font-semibold transition-all duration-200 border border-red-500/20 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
