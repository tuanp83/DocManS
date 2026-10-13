"use client";

import { useEffect, useState } from "react";
import { Save, Settings2 } from "lucide-react";
import {
  loadAdminConfig,
  updateNotificationTemplate,
  updateSystemParameter,
  type ConfigDefinitions,
  type NotificationTemplate,
  type SystemParameter
} from "@/lib/admin-api";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";

export function AdminConfigPanel() {
  const [parameters, setParameters] = useState<SystemParameter[]>([]);
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [definitions, setDefinitions] = useState<ConfigDefinitions>({ parameters: [], templates: [] });
  const [paramKey, setParamKey] = useState("");
  const [templateKey, setTemplateKey] = useState("");

  async function refresh() {
    setState("loading");
    try {
      const data = await loadAdminConfig();
      setParameters(data.parameters);
      setTemplates(data.templates);
      setDefinitions(data.definitions);
      setParamKey((current) => current || data.definitions.parameters[0]?.key || "");
      setTemplateKey((current) => current || data.definitions.templates[0]?.key || "");
      setState("ready");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleParameterSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setFormError("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const definition = definitions.parameters.find((item) => item.key === paramKey);
    const input = {
      key: paramKey,
      value: String(form.get("value") ?? "").trim(),
      label: definition?.label ?? paramKey
    };

    if (!input.key || !input.value) {
      setFormError("Vui lòng chọn tham số và nhập giá trị.");
      return;
    }

    setIsSubmitting(true);
    try {
      await updateSystemParameter(input);
      if (formElement.isConnected) {
        formElement.reset();
      }
      setMessage("Đã cập nhật tham số hệ thống.");
      await refresh();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Không thể cập nhật tham số.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleTemplateSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setFormError("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const input = {
      key: templateKey,
      subject: String(form.get("subject") ?? "").trim(),
      body: String(form.get("body") ?? "").trim()
    };

    if (!input.key || !input.subject || !input.body) {
      setFormError("Vui lòng chọn mẫu và nhập đủ tiêu đề, nội dung.");
      return;
    }

    setIsSubmitting(true);
    try {
      await updateNotificationTemplate(input);
      if (formElement.isConnected) {
        formElement.reset();
      }
      setMessage("Đã cập nhật mẫu thông báo.");
      await refresh();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Không thể cập nhật mẫu thông báo.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid two-column">
      <SectionCard title="Tham số hệ thống" subtitle="Các tham số nền dùng cho vận hành EP-01">
        {state === "loading" ? <p className="state-message">Đang tải cấu hình...</p> : null}
        {state === "error" ? <p className="state-message error">Không thể tải cấu hình hệ thống.</p> : null}
        {state === "ready" && parameters.length === 0 ? (
          <EmptyState title="Chưa có tham số" message="Thêm tham số nền để điều chỉnh vận hành hệ thống." />
        ) : null}
        {state === "ready" && parameters.length > 0 ? (
          <div className="settings-list">
            {parameters.map((parameter) => (
              <article className="setting-row" key={parameter.id}>
                <div>
                  <span className="record-title">{parameter.label}</span>
                  <span className="record-meta">{parameter.key}</span>
                </div>
                <strong>{parameter.value}</strong>
              </article>
            ))}
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Cập nhật tham số" subtitle="Thay đổi được ghi audit log">
        <form className="admin-form" key={`param-${paramKey}`} onSubmit={(event) => void handleParameterSubmit(event)}>
          <label className="field">
            <span>Tham số</span>
            <select value={paramKey} onChange={(event) => setParamKey(event.target.value)}>
              {definitions.parameters.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Giá trị</span>
            <input name="value" defaultValue={parameters.find((item) => item.key === paramKey)?.value ?? ""} />
            <small>{definitions.parameters.find((item) => item.key === paramKey)?.hint}</small>
          </label>
          <button className="button primary" type="submit" disabled={isSubmitting}>
            <Save size={16} aria-hidden="true" />
            {isSubmitting ? "Đang lưu" : "Lưu tham số"}
          </button>
        </form>
      </SectionCard>

      <SectionCard title="Mẫu thông báo" subtitle="Skeleton cho thông báo nội bộ và email">
        {state === "ready" && templates.length === 0 ? (
          <EmptyState title="Chưa có mẫu thông báo" message="Thêm mẫu đầu tiên để chuẩn hóa nội dung gửi đi." />
        ) : null}
        {state === "ready" && templates.length > 0 ? (
          <div className="settings-list">
            {templates.map((template) => (
              <article className="setting-row" key={template.id}>
                <div>
                  <span className="record-title">{template.subject}</span>
                  <span className="record-meta">{template.key}</span>
                </div>
                <StatusBadge status={template.status} />
              </article>
            ))}
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Cập nhật mẫu thông báo" subtitle="Dùng cho các trigger nền ở các story sau">
        <form className="admin-form" key={`template-${templateKey}-${templates.length}`} onSubmit={(event) => void handleTemplateSubmit(event)}>
          <label className="field">
            <span>Mẫu</span>
            <select value={templateKey} onChange={(event) => setTemplateKey(event.target.value)}>
              {definitions.templates.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
            <small>Biến dùng được: {definitions.templates.find((item) => item.key === templateKey)?.placeholders.map((name) => `{{${name}}}`).join(", ")}</small>
          </label>
          <label className="field">
            <span>Tiêu đề</span>
            <input name="subject" defaultValue={templates.find((item) => item.key === templateKey)?.subject ?? ""} />
          </label>
          <label className="field">
            <span>Nội dung</span>
            <textarea name="body" rows={5} defaultValue={templates.find((item) => item.key === templateKey)?.body ?? ""} />
          </label>
          {formError ? <p className="form-error">{formError}</p> : null}
          {message ? <p className="state-message success">{message}</p> : null}
          <button className="button primary" type="submit" disabled={isSubmitting}>
            <Settings2 size={16} aria-hidden="true" />
            {isSubmitting ? "Đang lưu" : "Lưu mẫu"}
          </button>
        </form>
      </SectionCard>
    </div>
  );
}
