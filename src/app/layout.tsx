import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Header from "@/components/Header";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import "./globals.css";
import { SessionProvider } from "next-auth/react";
import ProviderWrap from "@/components/ProviderWrap";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  ),
  title: "Invoice Generator — Internal Sales Tool",
  description:
    "Internal invoice generation form for the sales team. Create and download invoices via Zoho Billing.",
  icons: {
    icon: "/hp_logo.png",
  },
  openGraph: {
    images: [
      {
        url: "/hp_logo.png",
        width: 800,
        height: 600,
        alt: "HP Logo",
      },
    ],
  },
};

export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#7c3aed" />
        <link rel="apple-touch-icon" href="/logo-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-MGLCG6Q9');`,
          }}
        />
      </head>
      <body className={`${inter.variable} antialiased`}>
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-MGLCG6Q9"
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          ></iframe>
        </noscript>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <ProviderWrap>
            <Header />
            <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
              {children}
            </main>
            <Toaster position="top-center" richColors />
          </ProviderWrap>
        </ThemeProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(
      (reg) => console.log('SW registered:', reg.scope),
      (err) => console.log('SW registration failed:', err)
    );
  });
}`,
          }}
        />
      </body>
    </html>
  );
}
