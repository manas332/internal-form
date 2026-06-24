"use client";

import React from "react";
import { SessionProvider } from "next-auth/react";

const ProviderWrap = ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) => {
  return <SessionProvider>{children}</SessionProvider>;
};

export default ProviderWrap;
