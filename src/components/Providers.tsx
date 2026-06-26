"use client";

import { SessionProvider, useSession } from "next-auth/react";
import { useEffect, useRef } from "react";
import { useAuthStore } from "@/store/authStore";

function AuthSync({ children }: { children: React.ReactNode }) {
  const setAuth = useAuthStore((state) => state.setAuth);
  const { data: session } = useSession();
  const initialized = useRef(false);

  useEffect(() => {
    if (session?.user) {
      setAuth({
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
      });
    } else if (initialized.current) {
      setAuth(null);
    }
    initialized.current = true;
  }, [session, setAuth]);

  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AuthSync>{children}</AuthSync>
    </SessionProvider>
  );
}
