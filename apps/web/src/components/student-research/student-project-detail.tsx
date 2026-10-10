"use client";

import { useEffect, useState } from "react";
import { SectionCard } from "@/components/ui/section-card";
import { attachStudentDocument, completeStudentProject, getStudentProject, STUDENT_DOCUMENT_LABELS, STUDENT_STATUS_LABELS, type StudentProject } from "@/lib/student-research-api";

function date(value?: string | null) { return value ? new Intl.DateTimeFormat("vi-VN", { timeZone: "UTC" }).format(new Date(value)) : "—"; }

export function StudentProjectDetail({ id }: { id: string }) {
  const [project, setProject] = useState<StudentProject | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [documentType, setDocumentType] = useState("PROGRESS_REPORT");
  const [fileId, setFileId] = useState("");
  const [score, setScore] = useState("");
  const [award, setAward] = useState("");

  async function refresh() {
    try { setProject(await getStudentProject(id)); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Không tải được đề tài."); setProject(null); }
  }
  useEffect(() => { void refresh(); }, [id]);

  async function run(work: () => Promise<unknown>, done: string) {
    setBusy(true); setMessage("");
    try { await work(); setMessage(done); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Không thực hiện được thao tác."); }
    finally { setBusy(false); }
  }

  if (!project) return <p role="alert">{message || "Đang tải…"}</p>;
  const scoreValue = score.trim() === "" ? undefined : Number(score);
  const scoreValid = scoreValue === undefined || (Number.isFinite(scoreValue) && scoreValue >= 0 && scoreValue <= 10);

  return <div className="form-section-inline">
    {message ? <p role="status">{message}</p> : null}
    <SectionCard title={`${project.code} · ${project.name}`} subtitle={STUDENT_STATUS_LABELS[project.status] ?? project.status}>
      <p>Sinh viên: {project.studentName} · Lớp {project.studentClass}{project.studentContact ? ` · Liên lạc: ${project.studentContact}` : ""}</p>
      <p>Giảng viên hướng dẫn: {project.supervisor?.displayName ?? "—"} · Chuyên viên quản lý: {project.officer?.displayName ?? "—"}</p>
      <p>Đơn vị: {project.organizationUnit?.name ?? "Chưa gắn đơn vị"} · Thời gian: {date(project.startDate)} – {date(project.endDate)}</p>
      {project.status === "COMPLETED" ? <p>Kết quả: {project.score !== null ? `${project.score}/10` : "chưa ghi điểm"}{project.award ? ` · Giải thưởng: ${project.award}` : ""}</p> : null}
    </SectionCard>

    <SectionCard title="Tài liệu">
      {!project.documents?.length ? <p>Chưa có tài liệu.</p> : <ul>{project.documents.map((doc) => <li key={doc.id}>{STUDENT_DOCUMENT_LABELS[doc.documentType] ?? doc.documentType} · {doc.file?.originalFileName ?? "Tệp"} · {doc.uploadedBy?.displayName ?? ""} · {date(doc.uploadedAt)}</li>)}</ul>}
      {project.viewer.canAttach && project.status === "ACTIVE" ? <div className="form-section-inline">
        <p className="kpi-meta">Hiện chỉ gắn được tệp do chính bạn đã tải lên hệ thống (nhập mã tệp), và người xem chưa tải xuống được từ trang này. Tải lên và tải xuống trực tiếp cho đề tài sinh viên sẽ có ở đợt hoàn thiện module.</p>
        <div className="form-grid two">
          <label className="field"><span>Loại tài liệu</span><select value={documentType} onChange={(event) => setDocumentType(event.target.value)}>{Object.entries(STUDENT_DOCUMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="field"><span>Mã tệp</span><input value={fileId} maxLength={80} onChange={(event) => setFileId(event.target.value)} /></label>
        </div>
        <button className="button" type="button" disabled={busy || !fileId.trim()} onClick={() => void run(() => attachStudentDocument(id, { documentType, fileId: fileId.trim() }).then(() => setFileId("")), "Đã gắn tài liệu.")}>Gắn tài liệu</button>
      </div> : null}
    </SectionCard>

    {project.viewer.canManage && project.status === "ACTIVE" ? <SectionCard title="Ghi nhận hoàn thành">
      <div className="form-grid two">
        <label className="field"><span>Điểm (thang 10, tuỳ chọn)</span><input type="number" min={0} max={10} step={0.01} value={score} onChange={(event) => setScore(event.target.value)} /></label>
        <label className="field"><span>Giải thưởng (tuỳ chọn)</span><input value={award} maxLength={200} onChange={(event) => setAward(event.target.value)} /></label>
      </div>
      <button className="button primary" type="button" disabled={busy || !scoreValid} onClick={() => { if (window.confirm("Ghi nhận đề tài đã hoàn thành? Sau bước này không sửa được kết quả.")) void run(() => completeStudentProject(id, { ...(scoreValue !== undefined ? { score: scoreValue } : {}), ...(award.trim() ? { award: award.trim() } : {}) }), "Đã ghi nhận hoàn thành."); }}>Ghi nhận hoàn thành</button>
    </SectionCard> : null}
  </div>;
}
