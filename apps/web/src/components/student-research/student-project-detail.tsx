"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/components/auth/session-provider";
import { SectionCard } from "@/components/ui/section-card";
import {
  completeStudentProject,
  deleteStudentDocument,
  getStudentProject,
  listStudentResearchUnits,
  listSupervisorCandidates,
  STUDENT_DOCUMENT_LABELS,
  STUDENT_EVENT_LABELS,
  STUDENT_STATUS_LABELS,
  STUDENT_STATUS_TONES,
  studentDocumentDownloadUrl,
  transitionStudentProject,
  updateStudentProject,
  uploadStudentDocument,
  type OrganizationUnitOption,
  type StudentProject
} from "@/lib/student-research-api";

function date(value?: string | null) { return value ? new Intl.DateTimeFormat("vi-VN", { timeZone: "UTC" }).format(new Date(value)) : "—"; }
function dateTime(value?: string | null) { return value ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value)) : "—"; }
function day(value?: string | null) { return value ? value.slice(0, 10) : ""; }
function size(bytes: number) { return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`; }

type Dialog = "none" | "edit" | "approve" | "return" | "cancel" | "complete";

export function StudentProjectDetail({ id }: { id: string }) {
  const { account } = useSession();
  const router = useRouter();
  const [project, setProject] = useState<StudentProject | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<Dialog>("none");
  const [reason, setReason] = useState("");
  const [code, setCode] = useState("");
  const [score, setScore] = useState("");
  const [award, setAward] = useState("");
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [supervisors, setSupervisors] = useState<Array<{ id: string; displayName: string; username: string }>>([]);
  const [units, setUnits] = useState<OrganizationUnitOption[]>([]);
  const [documentType, setDocumentType] = useState("REGISTRATION");
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function refresh() {
    try { setProject(await getStudentProject(id)); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Không tải được đề tài."); setProject(null); }
  }
  useEffect(() => { void refresh(); }, [id]);

  async function run(work: () => Promise<unknown>, done: string) {
    setBusy(true); setMessage("");
    try { await work(); setMessage(done); setDialog("none"); setReason(""); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Không thực hiện được thao tác."); await refresh(); }
    finally { setBusy(false); }
  }

  if (!project) return <p role="alert">{message || "Đang tải…"}</p>;
  const can = (action: StudentProject["viewer"]["actions"][number]) => project.viewer.actions.includes(action);
  const version = project.version;
  const lastReturn = project.status === "DRAFT" ? project.events?.find((event) => event.action === "return") : undefined;
  const returnedSinceSubmit = lastReturn && !project.events?.some((event) => event.action === "submit" && event.createdAt > lastReturn.createdAt);
  const cancelEvent = project.status === "CANCELLED" ? project.events?.find((event) => event.action === "cancel") : undefined;
  const scoreValue = score.trim() === "" ? undefined : Number(score);
  const scoreValid = scoreValue === undefined || (Number.isFinite(scoreValue) && scoreValue >= 0 && scoreValue <= 10);

  function openEdit() {
    setEdit({ code: project!.code ?? "", name: project!.name, studentName: project!.studentName, studentClass: project!.studentClass, studentContact: project!.studentContact ?? "", supervisorId: project!.supervisorId, organizationUnitId: project!.organizationUnitId ?? "", startDate: day(project!.startDate), endDate: day(project!.endDate) });
    if (project!.viewer.canManage && !supervisors.length) void listSupervisorCandidates().then(setSupervisors).catch(() => setSupervisors([]));
    if (!project!.viewer.canManage && !units.length) void listStudentResearchUnits().then(setUnits).catch(() => setUnits([]));
    setDialog("edit");
  }

  function saveEdit() {
    const original: Record<string, string> = { code: project!.code ?? "", name: project!.name, studentName: project!.studentName, studentClass: project!.studentClass, studentContact: project!.studentContact ?? "", supervisorId: project!.supervisorId, organizationUnitId: project!.organizationUnitId ?? "", startDate: day(project!.startDate), endDate: day(project!.endDate) };
    const changes = Object.fromEntries(Object.entries(edit).filter(([key, value]) => value !== original[key]));
    if (!Object.keys(changes).length) { setDialog("none"); return; }
    // Mã đề tài chỉ người quản lý sửa; để trống thì không gửi (mã được cấp khi duyệt).
    if (changes.code === "" || !project!.viewer.canManage) delete changes.code;
    void run(() => updateStudentProject(id, { ...changes, version }), "Đã lưu thay đổi.");
  }

  const editUnits = project.viewer.canManage ? (account?.organizationScopes ?? []) : units;
  const setField = (key: string) => (event: { target: { value: string } }) => setEdit({ ...edit, [key]: event.target.value });
  const editReady = edit.name?.trim() && edit.studentName?.trim() && edit.studentClass?.trim() && edit.organizationUnitId && (project.status !== "ACTIVE" || edit.code?.trim()) && (!edit.startDate || !edit.endDate || edit.endDate >= edit.startDate);

  return <div className="form-section-inline">
    {message ? <p role="status">{message}</p> : null}
    {returnedSinceSubmit ? <div className="callout warning" role="note"><strong>Đề tài được trả lại để chỉnh sửa</strong><p>{lastReturn!.reason} — {lastReturn!.actor?.displayName ?? ""}, {dateTime(lastReturn!.createdAt)}</p></div> : null}
    {cancelEvent ? <div className="callout danger" role="note"><strong>Đề tài đã huỷ</strong><p>{cancelEvent.reason} — {cancelEvent.actor?.displayName ?? ""}, {dateTime(cancelEvent.createdAt)}</p></div> : null}

    <SectionCard title={`${project.code ?? "(chưa có mã)"} · ${project.name}`} subtitle={undefined}>
      <p><span className={`status-badge ${STUDENT_STATUS_TONES[project.status] ?? "neutral"}`}>{STUDENT_STATUS_LABELS[project.status] ?? project.status}</span></p>
      <p>Sinh viên: {project.studentName} · Lớp {project.studentClass}{project.studentContact ? ` · Liên lạc: ${project.studentContact}` : ""}</p>
      <p>Giảng viên hướng dẫn: {project.supervisor?.displayName ?? "—"} · Chuyên viên quản lý: {project.officer?.displayName ?? "chưa có (chờ duyệt)"}</p>
      <p>Đơn vị: {project.organizationUnit?.name ?? "Chưa gắn đơn vị"} · Thời gian: {date(project.startDate)} – {date(project.endDate)}</p>
      {project.status === "COMPLETED" ? <p>Kết quả: {project.score !== null ? `${project.score}/10` : "chưa ghi điểm"}{project.award ? ` · Giải thưởng: ${project.award}` : ""}</p> : null}
      {project.status === "DRAFT" && can("submit") ? <p className="kpi-meta">Bản nháp chỉ bạn thấy. Tải phiếu đăng ký và thuyết minh ở mục Tài liệu, rồi bấm “Nộp để duyệt”.</p> : null}

      <div className="button-row">
        {can("edit") ? <button className="button" type="button" disabled={busy} onClick={openEdit}>Sửa thông tin</button> : null}
        {can("submit") ? <button className="button primary" type="button" disabled={busy} onClick={() => { if (window.confirm("Nộp đề tài cho chuyên viên QLKH duyệt? Sau khi nộp bạn không sửa được, trừ khi đề tài bị trả lại.")) void run(() => transitionStudentProject(id, "submit", { version }), "Đã nộp đề tài, chờ duyệt."); }}>Nộp để duyệt</button> : null}
        {can("approve") ? <button className="button primary" type="button" disabled={busy} onClick={() => { setCode(project.code ?? ""); setDialog("approve"); }}>Duyệt</button> : null}
        {can("return") ? <button className="button" type="button" disabled={busy} onClick={() => { setReason(""); setDialog("return"); }}>Trả lại</button> : null}
        {can("complete") ? <button className="button" type="button" disabled={busy} onClick={() => setDialog("complete")}>Ghi nhận hoàn thành</button> : null}
        {can("cancel") ? <button className="button danger" type="button" disabled={busy} onClick={() => { setReason(""); setDialog("cancel"); }}>{project.status === "ACTIVE" ? "Huỷ đề tài" : "Huỷ / rút đăng ký"}</button> : null}
      </div>
    </SectionCard>

    {dialog === "edit" ? <SectionCard title="Sửa thông tin đề tài">
      <div className="form-grid two">
        {project.viewer.canManage ? <label className="field"><span>{project.status === "ACTIVE" ? "Mã đề tài" : "Mã đề tài (cấp khi duyệt)"}</span><input value={edit.code} maxLength={50} onChange={setField("code")} /></label> : null}
        <label className="field"><span>Tên đề tài</span><input value={edit.name} maxLength={500} onChange={setField("name")} /></label>
        <label className="field"><span>Sinh viên chủ nhiệm</span><input value={edit.studentName} maxLength={200} onChange={setField("studentName")} /></label>
        <label className="field"><span>Lớp</span><input value={edit.studentClass} maxLength={100} onChange={setField("studentClass")} /></label>
        <label className="field"><span>Liên lạc của sinh viên</span><input value={edit.studentContact} maxLength={100} onChange={setField("studentContact")} /></label>
        {project.viewer.canManage ? <label className="field"><span>Giảng viên hướng dẫn</span><select value={edit.supervisorId} onChange={setField("supervisorId")}>{!supervisors.some((user) => user.id === edit.supervisorId) ? <option value={edit.supervisorId}>{project.supervisor?.displayName ?? edit.supervisorId}</option> : null}{supervisors.map((user) => <option key={user.id} value={user.id}>{user.displayName} ({user.username})</option>)}</select></label> : null}
        <label className="field"><span>Đơn vị quản lý</span><select value={edit.organizationUnitId} onChange={setField("organizationUnitId")}>{project.organizationUnit && !editUnits.some((unit) => unit.id === project.organizationUnit!.id) ? <option value={project.organizationUnit.id}>{project.organizationUnit.name}</option> : null}{editUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
        <label className="field"><span>Ngày bắt đầu</span><input type="date" value={edit.startDate} onChange={setField("startDate")} /></label>
        <label className="field"><span>Ngày kết thúc</span><input type="date" min={edit.startDate || undefined} value={edit.endDate} onChange={setField("endDate")} /></label>
      </div>
      <div className="button-row"><button className="button primary" type="button" disabled={busy || !editReady} onClick={saveEdit}>Lưu</button><button className="button" type="button" onClick={() => setDialog("none")}>Đóng</button></div>
    </SectionCard> : null}

    {dialog === "approve" ? <SectionCard title="Duyệt đề tài" subtitle="Đề tài chuyển sang Đang thực hiện; bạn trở thành chuyên viên quản lý đề tài.">
      <label className="field"><span>Mã đề tài</span><input value={code} maxLength={50} onChange={(event) => setCode(event.target.value)} /></label>
      <div className="button-row"><button className="button primary" type="button" disabled={busy || !code.trim()} onClick={() => void run(() => transitionStudentProject(id, "approve", { version, code: code.trim() }), "Đã duyệt đề tài.")}>Xác nhận duyệt</button><button className="button" type="button" onClick={() => setDialog("none")}>Đóng</button></div>
    </SectionCard> : null}

    {dialog === "return" || dialog === "cancel" ? <SectionCard title={dialog === "return" ? "Trả lại để chỉnh sửa" : "Huỷ đề tài"} subtitle={dialog === "return" ? "Đề tài về lại bản nháp của giảng viên hướng dẫn, kèm lý do." : "Đề tài bị huỷ không mở lại được."}>
      <label className="field"><span>Lý do</span><textarea rows={3} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <div className="button-row"><button className={`button ${dialog === "cancel" ? "danger" : "primary"}`} type="button" disabled={busy || !reason.trim()} onClick={() => {
        if (dialog === "cancel") { void run(() => transitionStudentProject(id, "cancel", { version, reason: reason.trim() }), "Đã huỷ đề tài."); return; }
        // Đề tài trả lại thành bản nháp riêng của giảng viên: quay về danh sách.
        setBusy(true); setMessage("");
        void transitionStudentProject(id, "return", { version, reason: reason.trim() }).then(() => router.push("/student-research")).catch(async (error) => { setMessage(error instanceof Error ? error.message : "Không trả lại được đề tài."); setBusy(false); await refresh(); });
      }}>{dialog === "return" ? "Trả lại" : "Xác nhận huỷ"}</button><button className="button" type="button" onClick={() => setDialog("none")}>Đóng</button></div>
    </SectionCard> : null}

    {dialog === "complete" ? <SectionCard title="Ghi nhận hoàn thành">
      <div className="form-grid two">
        <label className="field"><span>Điểm (thang 10, tuỳ chọn)</span><input type="number" min={0} max={10} step={0.01} value={score} onChange={(event) => setScore(event.target.value)} /></label>
        <label className="field"><span>Giải thưởng (tuỳ chọn)</span><input value={award} maxLength={200} onChange={(event) => setAward(event.target.value)} /></label>
      </div>
      <div className="button-row"><button className="button primary" type="button" disabled={busy || !scoreValid} onClick={() => { if (window.confirm("Ghi nhận đề tài đã hoàn thành? Sau bước này không sửa được kết quả.")) void run(() => completeStudentProject(id, { version, ...(scoreValue !== undefined ? { score: scoreValue } : {}), ...(award.trim() ? { award: award.trim() } : {}) }), "Đã ghi nhận hoàn thành."); }}>Xác nhận hoàn thành</button><button className="button" type="button" onClick={() => setDialog("none")}>Đóng</button></div>
    </SectionCard> : null}

    <SectionCard title="Tài liệu" subtitle="Định dạng .doc, .docx, .pdf, .xls, .xlsx">
      {!project.documents?.length ? <p>Chưa có tài liệu.</p> : <ul className="plain-list">{project.documents.map((doc) => <li key={doc.id}>
        <strong>{STUDENT_DOCUMENT_LABELS[doc.documentType] ?? doc.documentType}</strong> · {doc.file && !doc.legacy ? <a href={studentDocumentDownloadUrl(id, doc.id)}>{doc.file.originalFileName}</a> : `${doc.file?.originalFileName ?? "Tệp"} (gắn theo cách cũ, mở tại hồ sơ gốc)`}{doc.file ? ` (${size(doc.file.sizeBytes)})` : ""} · {doc.uploadedBy?.displayName ?? ""} · {dateTime(doc.uploadedAt)}
        {doc.canDelete ? <> {" "}<button className="button small" type="button" disabled={busy} onClick={() => { if (window.confirm(`Xoá tài liệu “${doc.file?.originalFileName ?? ""}”?`)) void run(() => deleteStudentDocument(id, doc.id), "Đã xoá tài liệu."); }}>Xoá</button></> : null}
      </li>)}</ul>}
      {project.viewer.canAttach ? <div className="form-section-inline">
        <div className="form-grid two">
          <label className="field"><span>Loại tài liệu</span><select value={documentType} onChange={(event) => setDocumentType(event.target.value)}>{Object.entries(STUDENT_DOCUMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="field"><span>Tệp</span><input ref={fileInput} type="file" accept=".doc,.docx,.pdf,.xls,.xlsx" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
        </div>
        <button className="button" type="button" disabled={busy || !file} onClick={() => void run(async () => { await uploadStudentDocument(id, documentType, file!); setFile(null); if (fileInput.current) fileInput.current.value = ""; }, "Đã tải tài liệu lên.")}>Tải lên</button>
      </div> : null}
    </SectionCard>

    <SectionCard title="Lịch sử">
      {!project.events?.length ? <p>Chưa có thao tác.</p> : <ul className="plain-list">{project.events.map((event) => <li key={event.id}>
        {dateTime(event.createdAt)} · <strong>{STUDENT_EVENT_LABELS[event.action] ?? event.action}</strong> · {event.actor?.displayName ?? ""}
        {event.fromStatus && event.toStatus && event.fromStatus !== event.toStatus ? ` · ${STUDENT_STATUS_LABELS[event.fromStatus as keyof typeof STUDENT_STATUS_LABELS] ?? event.fromStatus} → ${STUDENT_STATUS_LABELS[event.toStatus as keyof typeof STUDENT_STATUS_LABELS] ?? event.toStatus}` : ""}
        {event.reason ? ` · Lý do: ${event.reason}` : ""}
      </li>)}</ul>}
    </SectionCard>
  </div>;
}
