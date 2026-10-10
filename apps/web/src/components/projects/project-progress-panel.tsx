"use client";

import { useEffect, useState } from "react";
import { SectionCard } from "@/components/ui/section-card";
import { BASELINE_SOURCE_LABELS, canProject, getProjectProgress, HEALTH_LABELS, HEALTH_TONES, type HealthLevel, type MilestoneProgressRow, type ProjectProgress, type ProjectRecord } from "@/lib/projects-api";

type Run = (path: string, body?: Record<string, unknown>, confirmText?: string) => Promise<boolean>;

function date(value?: string | null) { return value ? new Intl.DateTimeFormat("vi-VN", { timeZone: "UTC" }).format(new Date(value)) : "—"; }
function percent(value: number) { return `${Number.isInteger(value) ? value : value.toFixed(1)}%`; }

function HealthBadge({ level }: { level: HealthLevel | null }) {
  if (!level) return <span className="status-badge neutral">Chưa áp dụng</span>;
  return <span className={`status-badge ${HEALTH_TONES[level]}`}>{HEALTH_LABELS[level]}</span>;
}

/** Dòng thời gian từng mốc: thanh kế hoạch, phần đã hoàn thành, hạn gốc (◇) và hạn hiện tại (◆), vạch "hôm nay". */
function MilestoneTimeline({ rows, startDate, endDate, asOf }: { rows: MilestoneProgressRow[]; startDate: string | null; endDate: string | null; asOf: string }) {
  if (!rows.length) return null;
  const time = (value: string | null | undefined) => (value ? new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value).getTime() : NaN);
  const points = [time(startDate), time(endDate), time(asOf), ...rows.flatMap((row) => [time(row.currentDueDate), time(row.originalDueDate), time(row.baselineDueDate)])].filter((value) => Number.isFinite(value));
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = Math.max(max - min, 86_400_000);
  const width = 640;
  const label = 0;
  const rowHeight = 30;
  const x = (value: number) => label + ((value - min) / span) * (width - label - 12) + 6;
  const height = rows.length * rowHeight + 24;
  const today = time(asOf);
  return <figure className="progress-timeline" aria-label="Dòng thời gian các mốc">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" preserveAspectRatio="none" style={{ width: "100%", height }}>
      <title>Kế hoạch và tiến độ các mốc</title>
      {rows.map((row, index) => {
        const y = index * rowHeight + 8;
        const previous = index === 0 ? time(startDate) : time(rows[index - 1]!.currentDueDate);
        const begin = Number.isFinite(previous) ? previous : min;
        const due = time(row.currentDueDate);
        const barStart = x(Math.min(begin, due));
        const barWidth = Math.max(x(due) - barStart, 2);
        const tone = row.status === "completed" ? "var(--success)" : row.overdueDays > 0 ? "var(--danger)" : "var(--institutional-green)";
        return <g key={row.id}>
          <rect x={barStart} y={y} width={barWidth} height={12} rx={3} fill="var(--neutral-soft)" stroke="var(--border)" />
          <rect x={barStart} y={y} width={(barWidth * row.progressPercent) / 100} height={12} rx={3} fill={tone} />
          {row.originalDueDate && row.originalDueDate !== row.currentDueDate ? <path d={`M ${x(time(row.originalDueDate))} ${y - 1} l 6 7 l -6 7 l -6 -7 z`} fill="var(--surface)" stroke="var(--text-secondary)" strokeWidth={1.5}><title>Hạn gốc {date(row.originalDueDate)}</title></path> : null}
          <path d={`M ${x(due)} ${y - 1} l 6 7 l -6 7 l -6 -7 z`} fill={tone}><title>{row.title}: hạn {date(row.currentDueDate)}, {row.progressPercent}%</title></path>
        </g>;
      })}
      {Number.isFinite(today) ? <g><line x1={x(today)} x2={x(today)} y1={0} y2={height - 14} stroke="var(--brand-maroon)" strokeDasharray="4 3" /><text x={x(today)} y={height - 2} fontSize={11} textAnchor="middle" fill="var(--brand-maroon)">Hôm nay</text></g> : null}
    </svg>
    <figcaption className="kpi-meta">Thanh: thời gian kế hoạch của mốc, phần tô đậm là phần trăm hoàn thành. ◆ hạn hiện tại, ◇ hạn trong kế hoạch ban đầu (khi đã đổi).</figcaption>
  </figure>;
}

export function ProjectProgressPanel({ project, run, busy }: { project: ProjectRecord; run: Run; busy: boolean }) {
  const [progress, setProgress] = useState<ProjectProgress | null>(null);
  const [error, setError] = useState("");
  const [milestoneId, setMilestoneId] = useState("");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [level, setLevel] = useState<HealthLevel>("green");
  const [reason, setReason] = useState("");

  useEffect(() => {
    let active = true;
    getProjectProgress(project.id).then((result) => { if (active) { setProgress(result); setError(""); } }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Không tải được tiến độ."); });
    return () => { active = false; };
  }, [project]);

  if (error) return <SectionCard title="Kế hoạch và tiến độ"><p role="alert">{error}</p></SectionCard>;
  if (!progress) return <SectionCard title="Kế hoạch và tiến độ"><p>Đang tính tiến độ…</p></SectionCard>;
  const updatable = progress.milestones.filter((row) => progress.updatableMilestoneIds.includes(row.id));
  const selected = progress.milestones.find((row) => row.id === milestoneId);
  const canAssess = canProject(project, "project.health.assess");
  const spiTone = progress.spi === null ? "info" : progress.spi < 0.75 ? "danger" : progress.spi < 0.9 ? "warning" : "";
  const percentValue = Number(value);
  const validPercent = value !== "" && Number.isInteger(percentValue) && percentValue >= 0 && percentValue <= 99;

  return <SectionCard title="Kế hoạch và tiến độ" subtitle={progress.baselineVersion ? `Theo kế hoạch đã duyệt phiên bản ${progress.baselineVersion} · tính lúc ${date(progress.asOf)}` : "Chưa có kế hoạch gốc; tạm tính theo các mốc hiện tại"}>
    <div className="grid kpi-grid">
      <article className="kpi-card info"><p className="kpi-label">Kế hoạch đến hôm nay</p><p className="kpi-value">{percent(progress.plannedPercent)}</p><p className="kpi-meta">{progress.weightsConfigured ? "Theo trọng số mốc" : "Các mốc chia đều trọng số"}</p></article>
      <article className="kpi-card"><p className="kpi-label">Thực tế</p><p className="kpi-value">{percent(progress.actualPercent)}</p><p className="kpi-meta">Mốc chỉ đủ 100% khi báo cáo được chấp nhận</p></article>
      <article className={`kpi-card ${spiTone}`}><p className="kpi-label">Chỉ số tiến độ (SPI)</p><p className="kpi-value">{progress.spi === null ? "—" : progress.spi.toFixed(2)}</p><p className="kpi-meta">{progress.spi === null ? "Chưa đủ dữ liệu kế hoạch" : "Thực tế ÷ kế hoạch"}</p></article>
      <article className={`kpi-card ${progress.maxDaysOverdue > 30 ? "danger" : progress.maxDaysOverdue > 7 ? "warning" : ""}`}><p className="kpi-label">Sức khoẻ</p><p className="kpi-value" style={{ fontSize: 20 }}><HealthBadge level={progress.effectiveLevel} /></p><p className="kpi-meta">{progress.maxDaysOverdue ? `Trễ lớn nhất ${progress.maxDaysOverdue} ngày` : "Không có mốc quá hạn"}{progress.lateReports ? ` · ${progress.lateReports} kỳ báo cáo trễ` : ""}</p></article>
    </div>
    {progress.applicable ? <div className="form-section-inline">
      <p>
        {progress.levelSource === "assessment" ? `Mức do chuyên viên đánh giá (hệ thống tính: ${progress.level ? HEALTH_LABELS[progress.level] : "—"}).` : "Mức do hệ thống tính."}
        {progress.needsReassessment ? " Đánh giá trước của chuyên viên đã hết hiệu lực vì tình hình đã thay đổi; cần đánh giá lại." : ""}
      </p>
      {progress.reasons.length ? <ul>{progress.reasons.map((item) => <li key={item}>{item}</li>)}</ul> : null}
    </div> : <p>Chỉ số sức khoẻ áp dụng khi đề tài đang thực hiện hoặc tạm dừng.</p>}

    <MilestoneTimeline rows={progress.milestones} startDate={project.startDate} endDate={project.endDate} asOf={progress.asOf} />

    {progress.milestones.length ? <div className="table-wrap"><table className="data-table">
      <thead><tr><th>Mốc</th><th>Trọng số</th><th>Hoàn thành</th><th>Hạn hiện tại</th><th>Hạn ban đầu</th><th>Lệch</th></tr></thead>
      <tbody>{progress.milestones.map((row) => <tr key={row.id}>
        <td>{row.title}{row.status === "completed" ? " · Hoàn thành" : row.overdueDays ? ` · Quá hạn ${row.overdueDays} ngày` : ""}</td>
        <td>{percent(row.weightPercent)}</td>
        <td><progress max={100} value={row.progressPercent} aria-label={`${row.title}: ${row.progressPercent}%`} /> {row.progressPercent}%</td>
        <td>{date(row.currentDueDate)}</td>
        <td>{date(row.originalDueDate)}</td>
        <td>{row.slipDays === null ? "—" : row.slipDays > 0 ? `Trễ ${row.slipDays} ngày` : row.slipDays < 0 ? `Sớm ${-row.slipDays} ngày` : "Đúng hạn"}</td>
      </tr>)}</tbody>
    </table></div> : <p>Đề tài chưa có mốc.</p>}

    {updatable.length ? <div className="form-section-inline">
      <h3>Cập nhật tiến độ mốc</h3>
      <div className="form-grid two">
        <label className="field"><span>Mốc</span><select value={milestoneId} onChange={(event) => { setMilestoneId(event.target.value); const row = progress.milestones.find((item) => item.id === event.target.value); setValue(row ? String(row.progressPercent) : ""); }}><option value="">Chọn mốc</option>{updatable.map((row) => <option key={row.id} value={row.id}>{row.title} ({row.progressPercent}%)</option>)}</select></label>
        <label className="field"><span>Phần trăm hoàn thành (0–99)</span><input type="number" min={0} max={99} step={1} value={value} onChange={(event) => setValue(event.target.value)} /></label>
      </div>
      <p className="kpi-meta">Mốc được tính 100% khi báo cáo của mốc được chuyên viên chấp nhận.</p>
      <label className="field"><span>Ghi chú (đã làm gì, vướng mắc)</span><textarea value={note} maxLength={2000} onChange={(event) => setNote(event.target.value)} /></label>
      <button className="button primary" type="button" disabled={busy || !selected || !validPercent} onClick={() => void run(`milestones/${milestoneId}/progress`, { progressPercent: percentValue, ...(note.trim() ? { note: note.trim() } : {}) }).then((ok) => { if (ok) setNote(""); })}>Lưu tiến độ</button>
    </div> : null}

    {progress.applicable && canAssess ? <div className="form-section-inline">
      <h3>Đánh giá sức khoẻ của chuyên viên</h3>
      <div className="form-grid two">
        <label className="field"><span>Mức</span><select value={level} onChange={(event) => setLevel(event.target.value as HealthLevel)}><option value="green">{HEALTH_LABELS.green}</option><option value="amber">{HEALTH_LABELS.amber}</option><option value="red">{HEALTH_LABELS.red}</option></select></label>
        <label className="field"><span>Lý do (bắt buộc)</span><textarea value={reason} maxLength={2000} onChange={(event) => setReason(event.target.value)} /></label>
      </div>
      <button className="button" type="button" disabled={busy || !reason.trim()} onClick={() => void run("health-assessments", { level, reason: reason.trim() }, "Ghi nhận đánh giá sức khoẻ này?").then((ok) => { if (ok) setReason(""); })}>Ghi nhận đánh giá</button>
    </div> : null}

    {progress.assessments.length ? <><h3>Đánh giá của chuyên viên</h3><ul>{progress.assessments.map((item) => <li key={item.id}>{date(item.createdAt)} · <HealthBadge level={item.level} /> · {item.assessedBy ?? ""}{item.reason ? `: ${item.reason}` : ""}{item.computedLevel && item.computedLevel !== item.level ? ` (hệ thống tính: ${HEALTH_LABELS[item.computedLevel]})` : ""}</li>)}</ul></> : null}
    {progress.updates.length ? <><h3>Nhật ký cập nhật tiến độ</h3><ul>{progress.updates.map((item) => <li key={item.id}>{date(item.createdAt)} · {item.milestoneTitle ?? "Mốc"}: {item.previousPercent}% → {item.progressPercent}% · {item.author ?? ""}{item.note ? ` · ${item.note}` : ""}</li>)}</ul></> : null}
    {progress.baselines.length ? <><h3>Các phiên bản kế hoạch</h3><ul>{progress.baselines.map((item) => <li key={item.id}>Phiên bản {item.version} · {BASELINE_SOURCE_LABELS[item.source] ?? item.source} · {date(item.createdAt)} · kết thúc {date(item.endDate)} · {item.milestoneCount} mốc</li>)}</ul></> : null}
  </SectionCard>;
}
