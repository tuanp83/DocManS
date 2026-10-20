"use client";

import { ArrowRight, KeyRound, LockKeyhole, UserRound } from "lucide-react";
import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/auth/session-provider";
import { loginWithPassword, resendLoginOtp, verifyLoginOtp, type LoginOtpChallenge } from "@/lib/auth-api";
import { getHomeRoute } from "@/lib/navigation";

export function LoginForm() {
  const router = useRouter();
  const { refreshCurrentUser } = useSession();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Bước 2 (xác thực hai lớp): lượt đăng nhập chờ mã gửi qua thư.
  const [otp, setOtp] = useState<LoginOtpChallenge | null>(null);
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState("");
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!username.trim() || !password) {
      setError("Vui lòng nhập đầy đủ tên đăng nhập/email và mật khẩu.");
      return;
    }

    setIsSubmitting(true);
    const result = await loginWithPassword(username, password);
    setIsSubmitting(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    if ("otp" in result) {
      setOtp(result.otp);
      setCode("");
      setPassword("");
      setNotice(`Mã xác thực 6 chữ số đã được gửi tới ${result.otp.emailHint}. Mã có hiệu lực 10 phút.`);
      setResendIn(result.otp.resendAfterSeconds);
      return;
    }

    await finishLogin();
  }

  async function handleVerify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!otp) return;
    setError("");
    if (!/^\d{6}$/.test(code.trim())) {
      setError("Mã xác thực gồm 6 chữ số.");
      return;
    }
    setIsSubmitting(true);
    const result = await verifyLoginOtp(otp.challengeId, code.trim());
    setIsSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      if (result.expired) backToPassword();
      return;
    }
    await finishLogin();
  }

  async function handleResend() {
    if (!otp || resendIn > 0) return;
    setError("");
    const result = await resendLoginOtp(otp.challengeId);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setOtp(result.otp);
    setCode("");
    setNotice(`Đã gửi mã mới tới ${result.otp.emailHint}. Mã cũ không còn dùng được.`);
    setResendIn(result.otp.resendAfterSeconds);
  }

  function backToPassword() {
    setOtp(null);
    setCode("");
    setNotice("");
  }

  async function finishLogin() {
    const refreshedAccount = await refreshCurrentUser();
    if (!refreshedAccount) {
      setError("Không thể xác nhận phiên đăng nhập. Vui lòng thử lại.");
      return;
    }

    startTransition(() => {
      // Nhà nghiên cứu vào thẳng lý lịch khoa học; vai trò khác vào trang đầu của vai trò (Quản trị: Người dùng).
      const researcher = refreshedAccount.systemRole === "RESEARCHER_INTERNAL_USER" || refreshedAccount.systemRole === "EXTERNAL_RESEARCHER_USER";
      router.replace(refreshedAccount.mustChangePassword ? "/change-password" : researcher && refreshedAccount.researcherProfileId ? "/my-profile" : getHomeRoute(refreshedAccount.systemRole));
      router.refresh();
    });
  }

  if (otp) {
    return (
      <form className="login-form" onSubmit={handleVerify}>
        <p className="record-meta" role="status">{notice}</p>
        <div className="field">
          <label htmlFor="login-otp">Mã xác thực</label>
          <div className="field-input with-icon">
            <KeyRound size={18} aria-hidden="true" />
            <input
              autoComplete="one-time-code"
              autoFocus
              id="login-otp"
              inputMode="numeric"
              maxLength={6}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              placeholder="Nhập 6 chữ số"
              type="text"
              value={code}
            />
          </div>
        </div>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <button className="button primary login-submit" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Đang xác thực..." : "Xác nhận đăng nhập"}
          <ArrowRight size={17} aria-hidden="true" />
        </button>
        <div className="button-row">
          <button className="button" disabled={resendIn > 0} onClick={handleResend} type="button">
            {resendIn > 0 ? `Gửi lại mã (${resendIn} giây)` : "Gửi lại mã"}
          </button>
          <button className="button" onClick={backToPassword} type="button">
            Đăng nhập bằng tài khoản khác
          </button>
        </div>
      </form>
    );
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="username">Tên đăng nhập hoặc email</label>
        <div className="field-input with-icon">
          <UserRound size={18} aria-hidden="true" />
          <input
            autoComplete="username"
            id="username"
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Nhập tên đăng nhập hoặc email"
            type="text"
            value={username}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="password">Mật khẩu</label>
        <div className="field-input with-icon">
          <LockKeyhole size={18} aria-hidden="true" />
          <input
            autoComplete="current-password"
            id="password"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Nhập mật khẩu"
            type="password"
            value={password}
          />
        </div>
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <button className="button primary login-submit" disabled={isSubmitting} type="submit">
        {isSubmitting ? "Đang đăng nhập..." : "Đăng nhập hệ thống"}
        <ArrowRight size={17} aria-hidden="true" />
      </button>
    </form>
  );
}
