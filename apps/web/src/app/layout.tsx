import type { Metadata } from "next";
import { Cinzel, Inter } from "next/font/google";
import type { ReactNode } from "react";
import { QueryProvider } from "@/lib/query-provider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
// Cinzel is for the WANDERER name only.
const cinzel = Cinzel({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-cinzel" });

export const metadata: Metadata = {
  title: "Wanderer",
  description: "Text roleplay with AI characters.",
  icons: { icon: "/logo.webp" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${cinzel.variable}`}>
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
