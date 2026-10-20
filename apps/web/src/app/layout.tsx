import type { Metadata } from "next";
import { connection } from "next/server";
// Phông Roboto lưu ngay trong ứng dụng (có bảng chữ tiếng Việt), không tải từ Google Fonts: chính sách bảo mật
// nội dung chỉ cho phông từ chính máy chủ, và máy chủ build không cần ra Internet để lấy phông.
import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import "./globals.css";
import "@/themes/hvqy1.css";
import "@/themes/science-profile.css";
import { SessionProvider } from "@/components/auth/session-provider";
import { AppShell } from "@/components/layout/app-shell";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";

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
  // Dựng động mọi trang: nonce của chính sách bảo mật nội dung (src/proxy.ts) chỉ gắn được khi dựng theo yêu cầu.
  await connection();
  return (
    <html lang="vi" suppressHydrationWarning>
      <body>
        <SessionProvider>
          <ConfirmProvider>
            <AppShell>{children}</AppShell>
          </ConfirmProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
