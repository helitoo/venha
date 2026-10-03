import type { Metadata } from "next";
import { Inter, Geist } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "vietnamese"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Xem Camera Giao Thông TP.HCM - Trực Tiếp & Thời Gian Thực",
  description:
    "Hệ thống theo dõi luồng hình ảnh trực tiếp từ hàng trăm camera giao thông trên toàn địa bàn TP. Hồ Chí Minh.",
  icons: {
    icon: [
      { url: "/logo-cat.png", type: "image/png" },
      { url: "/favicon.ico" },
    ],
    shortcut: "/logo-cat.png",
    apple: "/logo-cat.png",
  },
};

import GoogleAnalytics from "@/components/GoogleAnalytics";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className={cn("font-sans", geist.variable)} suppressHydrationWarning>
      <body className="min-h-screen font-sans bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased selection:bg-blue-500 selection:text-white">
        <GoogleAnalytics />
        {children}
      </body>
    </html>
  );
}
