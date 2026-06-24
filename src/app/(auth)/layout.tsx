'use client'

import { useAuthStore } from "@/store/authStore";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

  const { user, isAuthenticated } = useAuthStore();
  const router = useRouter();


  useEffect(()=>{
      if(isAuthenticated){
        router.push('/')
      }

  },[isAuthenticated])

  return (
   <>
   
   {
    children
   }</>
  );
}
