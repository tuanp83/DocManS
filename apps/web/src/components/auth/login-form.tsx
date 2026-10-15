"use client";

import { ArrowRight, LockKeyhole, UserRound } from "lucide-react";
import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/auth/session-provider";
import { loginWithPassword } from "@/lib/auth-api";

export function LoginForm() {
  const router = useRouter();
  const { refreshCurrentUser } = useSession();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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

    const refreshedAccount = await refreshCurrentUser();
    if (!refreshedAccount) {
      setError("Không thể xác nhận phiên đăng nhập. Vui lòng thử lại.");
      return;
    }

    startTransition(() => {
      // Nhà nghiên cứu vào thẳng lý lịch khoa học; lãnh đạo và cán bộ QLKH (cũng có lý lịch) vào dashboard.
      const researcher = refreshedAccount.systemRole === "RESEARCHER_INTERNAL_USER" || refreshedAccount.systemRole === "EXTERNAL_RESEARCHER_USER";
      router.replace(refreshedAccount.mustChangePassword ? "/change-password" : researcher && refreshedAccount.researcherProfileId ? "/my-profile" : "/dashboard");
      router.refresh();
    });
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
