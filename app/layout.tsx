import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "每日晨報",
  description: "天氣、台積電股價、科技新聞與每日鼓勵",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-Hant-TW"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* 瀏覽器擴充套件（如 ColorZilla）會在 body 加屬性，避免 hydration 警告 */}
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
