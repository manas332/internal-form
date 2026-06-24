"use client";

import { useEffect, useState } from "react";

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // const [authorized, setAuthorized] = useState(false);

  // useEffect(() => {
  //   const password = window.prompt("Enter Admin Password");

  //   if (password === process.env.NEXT_PUBLIC_ADMIN_PASS) {
  //     setAuthorized(true);
  //   } else {
  //     alert("Access Denied");
  //     window.location.href = "/";
  //   }
  // }, []);

  // if (!authorized) {
  //   return <div>Checking access...</div>;
  // }

  return <>{children}</>;
}
