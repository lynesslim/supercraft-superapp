import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getAuthContext } from "@/utils/auth";
import AppShell from "./AppShell";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Supercraft Superapp",
  description: "AI-powered superapp builder.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const auth = await getAuthContext();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        <AppShell auth={auth}>{children}</AppShell>
      </body>
    </html>
  );
}
