import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Base Creator Coins Dashboard",
  description: "Track top buyers and collector activity on Base creator coins",
  keywords: ["Base", "Creator Coins", "Zora", "NFT", "Leaderboard"],
  openGraph: {
    title: "Base Creator Coins Dashboard",
    description: "Track top buyers and collector activity on Base creator coins",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
