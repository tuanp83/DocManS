/**
 * Có bắt buộc STARTTLS không. Mặc định bắt buộc, trừ máy chủ thư trên chính máy (localhost). Máy chủ chuyển
 * tiếp nội bộ không hỗ trợ STARTTLS thì đặt SMTP_REQUIRE_TLS=false; khi đó mật khẩu SMTP (nếu có) đi dạng rõ.
 */
export function smtpRequireTls(host: string) {
  const setting = process.env.SMTP_REQUIRE_TLS?.trim().toLowerCase();
  if (setting === "true") return true;
  if (setting === "false") return false;
  return !/^(localhost|127\.0\.0\.1|::1)$/i.test(host);
}
