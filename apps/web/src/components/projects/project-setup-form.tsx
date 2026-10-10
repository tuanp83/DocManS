"use client";

import { useState } from "react";
import type { ProjectRecord } from "@/lib/projects-api";

type Row = { title: string; dueDate: string; plannedStartDate: string; weightPercent: string; responsibleMemberId: string; isImportant: boolean };

const emptyRow = (): Row => ({ title: "", dueDate: "", plannedStartDate: "", weightPercent: "", responsibleMemberId: "", isImportant: true });

/**
 * Thiết lập nhiều mốc khi đề tài còn ở bước chuẩn bị. Trọng số: để trống tất cả (chia đều) hoặc nhập cho mọi mốc
 * với tổng = 100 — máy chủ kiểm tra lại cùng quy tắc (validateDeclaredWeights). Mỗi mốc kèm một kỳ báo cáo cùng hạn.
 */
export function ProjectSetupForm({ project, busy, onSubmit }: { project: ProjectRecord; busy: boolean; onSubmit: (body: Record<string, unknown>) => Promise<boolean> }) {
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const day = (value?: string | null) => value?.slice(0, 10) ?? "";
  const filledWeights = rows.filter((row) => row.weightPercent.trim() !== "");
  const total = filledWeights.reduce((sum, row) => sum + Number(row.weightPercent), 0);
  const weightProblem = filledWeights.length === 0 ? "" : filledWeights.length !== rows.length ? "Nhập trọng số cho mọi mốc, hoặc để trống tất cả để chia đều." : filledWeights.some((row) => !Number.isInteger(Number(row.weightPercent)) || Number(row.weightPercent) < 0 || Number(row.weightPercent) > 100) ? "Trọng số là số nguyên từ 0 đến 100." : total !== 100 ? `Tổng trọng số phải bằng 100 (hiện là ${total}).` : "";
  const start = day(project.startDate);
  const rowProblem = rows.some((row) => !row.title.trim() || !row.dueDate || (row.plannedStartDate && (row.plannedStartDate > row.dueDate || (start && row.plannedStartDate < start))) || (project.endDate && row.dueDate > day(project.endDate)));
  const update = (index: number, patch: Partial<Row>) => setRows((current) => current.map((row, position) => position === index ? { ...row, ...patch } : row));
  const members = project.members.filter((item) => item.status === "ACTIVE");

  async function submit() {
    const ordered = rows.map((row) => ({ ...row, title: row.title.trim() }));
    const ok = await onSubmit({
      milestones: ordered.map((row) => ({ title: row.title, dueDate: row.dueDate, isImportant: row.isImportant, ...(row.plannedStartDate ? { plannedStartDate: row.plannedStartDate } : {}), ...(row.weightPercent.trim() !== "" ? { weightPercent: Number(row.weightPercent) } : {}), ...(row.responsibleMemberId ? { responsibleMemberId: row.responsibleMemberId } : {}) })),
      checkpoints: ordered.map((row, position) => ({ title: `Báo cáo ${row.title}`, dueDate: row.dueDate, milestonePosition: position }))
    });
    if (ok) setRows([emptyRow()]);
  }

  return <div className="form-section-inline">
    <p>Thời gian đề tài: {day(project.startDate) || "—"} đến {day(project.endDate) || "—"}. Mỗi mốc tạo kèm một kỳ báo cáo cùng hạn.</p>
    {rows.map((row, index) => <fieldset key={index} className="form-section-inline">
      <legend>Mốc {index + 1}</legend>
      <div className="form-grid two">
        <label className="field"><span>Tên mốc</span><input value={row.title} maxLength={1000} onChange={(event) => update(index, { title: event.target.value })} /></label>
        <label className="field"><span>Hạn hoàn thành</span><input type="date" min={day(project.startDate)} max={day(project.endDate)} value={row.dueDate} onChange={(event) => update(index, { dueDate: event.target.value })} /></label>
        <label className="field"><span>Bắt đầu dự kiến (tuỳ chọn)</span><input type="date" min={day(project.startDate)} max={row.dueDate || day(project.endDate)} value={row.plannedStartDate} onChange={(event) => update(index, { plannedStartDate: event.target.value })} /></label>
        <label className="field"><span>Trọng số % (tuỳ chọn)</span><input type="number" min={0} max={100} step={1} value={row.weightPercent} onChange={(event) => update(index, { weightPercent: event.target.value })} /></label>
        <label className="field"><span>Thành viên phụ trách</span><select value={row.responsibleMemberId} onChange={(event) => update(index, { responsibleMemberId: event.target.value })}><option value="">Chủ nhiệm đề tài</option>{members.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="field"><span><input type="checkbox" checked={row.isImportant} onChange={(event) => update(index, { isImportant: event.target.checked })} /> Mốc quan trọng (đổi hạn phải qua đề nghị điều chỉnh)</span></label>
      </div>
      {rows.length > 1 ? <button className="button" type="button" onClick={() => setRows((current) => current.filter((_, position) => position !== index))}>Bỏ mốc này</button> : null}
    </fieldset>)}
    <div className="button-row">
      <button className="button" type="button" disabled={rows.length >= 100} onClick={() => setRows((current) => [...current, emptyRow()])}>Thêm mốc</button>
      <button className="button primary" type="button" disabled={busy || rowProblem || !!weightProblem} onClick={() => void submit()}>Lưu các mốc</button>
    </div>
    <p className="kpi-meta">{filledWeights.length ? `Tổng trọng số: ${total}%` : "Chưa nhập trọng số: các mốc sẽ được chia đều."}</p>
    {weightProblem ? <p role="alert" className="form-error">{weightProblem}</p> : null}
  </div>;
}
