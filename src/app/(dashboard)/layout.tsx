'use client'

import { useAuthStore } from "@/store/authStore";
import { useRouter } from "next/navigation";
import { useEffect } from "react";





export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

  const { user, isAuthenticated } = useAuthStore();
    const router = useRouter();
  
  
    useEffect(()=>{
  
        if(!isAuthenticated){
          router.push('/login')
        }
  
    },[isAuthenticated])


  return (
   <>
   
   {
    children
   }
   </>
  );
}
