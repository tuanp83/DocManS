import Image from "next/image";
import Link from "next/link";
import { Building2, ShieldCheck } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <div className="login-shell">
      <div className="login-container">
        <header className="login-header">
          <h1 className="login-header-title" id="login-title">
            HỆ THỐNG QUẢN LÝ NGHIÊN CỨU KHOA HỌC, CÔNG NGHỆ VÀ ĐỔI MỚI SÁNG TẠO - HỌC VIỆN QUÂN Y
          </h1>
        </header>

        <div className="login-body">
          <section className="login-info" aria-labelledby="academy-info-title">
            <div className="login-brand" style={{ marginBottom: 20 }}>
              <div className="login-brand-mark">
                <Image src="/logo.png" alt="Học viện Quân y" width={64} height={66} priority />
              </div>
              <div>
                <p className="login-kicker">Cổng thông tin nghiên cứu khoa học</p>
                <h2 id="academy-info-title" style={{ fontSize: 18, fontWeight: 700, margin: "2px 0", color: "var(--primary-dark)" }}>
                  Học viện Quân y
                </h2>
                <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
                  Vietnam Military Medical University (VMMU)
                </p>
              </div>
            </div>

            <section className="login-summary-card" aria-live="polite" style={{ marginBottom: 16 }}>
              <p className="login-summary-label">Tài khoản được cấp</p>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: "4px 0 8px" }}>Truy cập hệ thống</h3>
              <dl className="summary-grid">
                <div>
                  <dt>Phạm vi</dt>
                  <dd>Người dùng nội bộ và nhà nghiên cứu bên ngoài được cấp tài khoản</dd>
                </div>
                <div>
                  <dt>Bảo vệ</dt>
                  <dd>Phiên đăng nhập được kiểm tra trước khi vào khu vực nghiệp vụ</dd>
                </div>
              </dl>
            </section>

            <section className="login-note-card" style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 8px" }}>Nguyên tắc truy cập</h3>
              <ul className="login-note-list">
                <li>Sử dụng tài khoản được cấp đúng vai trò và đơn vị công tác.</li>
                <li>Thông tin điều hướng và ngữ cảnh người dùng được nạp từ phiên đăng nhập hiện hành.</li>
                <li>Kết thúc phiên làm việc bằng chức năng đăng xuất trong menu người dùng.</li>
              </ul>
            </section>

            <div className="access-status-row" style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 8 }}>
              <ShieldCheck size={18} aria-hidden="true" style={{ color: "var(--success)" }} />
              <span>Phiên đăng nhập được mã hóa an toàn</span>
            </div>
          </section>

          <section className="login-form-col" aria-labelledby="login-form-title">
            <div className="login-form-col-header">
              <h2 id="login-form-title" style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--primary-dark)" }}>
                Đăng nhập hệ thống
              </h2>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--primary)", background: "var(--primary-soft)", padding: "4px 8px", borderRadius: 4 }}>
                Tiếng Việt (VN)
              </span>
            </div>

            <div style={{ marginTop: 24 }}>
              <LoginForm />
            </div>

            <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Link href="/password-reset" className="login-forgot-link">
                Quên mật khẩu?
              </Link>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6 }}>
                <Building2 size={16} aria-hidden="true" />
                <span>HVQY Portal</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
