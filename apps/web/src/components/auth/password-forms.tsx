"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/auth/session-provider";
import { changePassword, completeAccountActivation, completePasswordReset, setLoginOtpEnabled } from "@/lib/auth-api";

export function ChangePasswordForm() {
  const router = useRouter(); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  return <form className="admin-form" onSubmit={async (event) => {
    event.preventDefault(); setError(""); const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get("currentPassword") ?? ""); const newPassword = String(form.get("newPassword") ?? "");
    if (newPassword !== String(form.get("confirmPassword") ?? "")) return setError("Mật khẩu xác nhận không khớp.");
    setBusy(true); try { await changePassword(currentPassword, newPassword); router.replace("/login"); router.refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể đổi mật khẩu."); } finally { setBusy(false); }
  }}>
    <label className="field"><span>Mật khẩu hiện tại</span><input name="currentPassword" type="password" autoComplete="current-password" /></label>
    <label className="field"><span>Mật khẩu mới</span><input name="newPassword" type="password" autoComplete="new-password" /></label>
    <label className="field"><span>Xác nhận mật khẩu mới</span><input name="confirmPassword" type="password" autoComplete="new-password" /></label>
    <p className="record-meta">Tối thiểu 12 ký tự, gồm chữ hoa, chữ thường và chữ số; không có khoảng trắng.</p>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <button className="button primary" disabled={busy} type="submit">{busy ? "Đang xử lý" : "Đổi mật khẩu"}</button>
  </form>;
}

/** Xác thực hai lớp qua thư: vai trò bắt buộc chỉ xem trạng thái; vai trò khác tự bật, tắt. */
export function LoginOtpSettings() {
  const { account, refreshCurrentUser } = useSession(); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const state = account?.loginOtp;
  if (!state) return null;
  return <div className="admin-form">
    <h2>Xác thực hai lớp</h2>
    <p className="record-meta">{state.required
      ? "Vai trò của đồng chí bắt buộc xác thực hai lớp: mỗi lần đăng nhập, hệ thống gửi mã 6 chữ số tới thư công vụ."
      : state.enabled
        ? "Đang bật: mỗi lần đăng nhập, hệ thống gửi mã 6 chữ số tới thư công vụ của đồng chí."
        : "Đang tắt. Bật để mỗi lần đăng nhập cần thêm mã gửi tới thư công vụ, kể cả khi mật khẩu bị lộ."}</p>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {state.required ? null : <button className="button" disabled={busy} type="button" onClick={async () => {
      setError(""); setBusy(true);
      try { await setLoginOtpEnabled(!state.enabled); await refreshCurrentUser(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể thay đổi xác thực hai lớp."); } finally { setBusy(false); }
    }}>{busy ? "Đang xử lý" : state.enabled ? "Tắt xác thực hai lớp" : "Bật xác thực hai lớp"}</button>}
  </div>;
}

export function ResetPasswordForm() {
  const router = useRouter(); const [activationToken, setActivationToken] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { const params = new URLSearchParams(window.location.search); setActivationToken(params.get("mode") === "activation" ? params.get("token") ?? "" : ""); }, []);
  return <form className="admin-form" onSubmit={async (event) => {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement);
    const token = activationToken || String(form.get("token") ?? "");
    const newPassword = String(form.get("newPassword") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");
    if (!token) return setError("Cần mã đặt lại mật khẩu do quản trị viên cung cấp.");
    if (newPassword !== confirmPassword) return setError("Mật khẩu xác nhận không khớp.");
    setBusy(true); try { if (activationToken) await completeAccountActivation(token, newPassword, confirmPassword); else await completePasswordReset(token, newPassword); router.replace("/login"); } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể thiết lập mật khẩu."); } finally { formElement.reset(); setBusy(false); }
  }}>
    {activationToken ? null : <label className="field"><span>Mã đặt lại mật khẩu</span><input name="token" autoComplete="one-time-code" /></label>}
    <label className="field"><span>Mật khẩu mới</span><input name="newPassword" type="password" autoComplete="new-password" /></label>
    <label className="field"><span>Xác nhận mật khẩu mới</span><input name="confirmPassword" type="password" autoComplete="new-password" /></label>
    <p className="record-meta">Tối thiểu 12 ký tự, gồm chữ hoa, chữ thường và chữ số; không có khoảng trắng.</p>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <button className="button primary" disabled={busy} type="submit">{busy ? "Đang xử lý" : activationToken ? "Thiết lập mật khẩu" : "Đặt lại mật khẩu"}</button>
  </form>;
}
