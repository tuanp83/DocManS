import type { Metadata } from "next";
import "./globals.css";
import "@/themes/hvqy1.css";
import "@/themes/science-profile.css";
import { SessionProvider } from "@/components/auth/session-provider";
import { AppShell } from "@/components/layout/app-shell";

export const metadata: Metadata = {
  title: "HỆ THỐNG QUẢN LÝ NGHIÊN CỨU KHOA HỌC, CÔNG NGHỆ VÀ ĐỔI MỚI SÁNG TẠO | HỌC VIỆN QUÂN Y",
  description: "Hệ thống quản lý nghiên cứu khoa học của Học viện Quân y",
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png"
  }
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body>
        <SessionProvider>
          <AppShell>{children}</AppShell>
        </SessionProvider>
      </body>
    </html>
  );
}
