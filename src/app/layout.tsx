import type { Metadata, Viewport } from "next";
import { DotGothic16 } from "next/font/google";
import "./globals.css";

const dot = DotGothic16({ weight: "400", subsets: ["latin"], variable: "--font-dotgothic", display: "swap" });

export const metadata: Metadata = {
  title: "ボキクエ ─ 道具屋の帳簿",
  description: "道具屋を経営しながら日商簿記3級を学ぶレトロRPG",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#161a3a" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={dot.variable}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
