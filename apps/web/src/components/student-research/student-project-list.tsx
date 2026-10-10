"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "@/components/auth/session-provider";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { createStudentProject, listStudentProjects, listSupervisorCandidates, STUDENT_STATUS_LABELS, type StudentProject } from "@/lib/student-research-api";

const EMPTY = { code: "", name: "", studentName: "", studentClass: "", studentContact: "", supervisorId: "", organizationUnitId: "", startDate: "", endDate: "" };

export function StudentProjectList() {
  const { account } = useSession();
  // Chỉ là gợi ý hiển thị; máy chủ kiểm tra lại quyền tạo (chuyên viên/Trưởng phòng QLKH có phạm vi đơn vị).
  const canCreate = (account?.systemRole === "RESEARCH_MANAGEMENT_STAFF" || account?.systemRole === "RESEARCH_MANAGEMENT_HEAD") && !!account?.organizationScopes?.length;
  const [projects, setProjects] = useState<StudentProject[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [supervisors, setSupervisors] = useState<Array<{ id: string; displayName: string; username: string; unit: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [keyword, setKeyword] = useState("");

  async function refresh() {
    setState("loading");
    try { setProjects(await listStudentProjects()); setState("ready"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Không tải được danh sách."); setState("error"); }
  }
  useEffect(() => { void refresh(); }, []);
  useEffect(() => { if (showForm && canCreate && !supervisors.length) void listSupervisorCandidates().then(setSupervisors).catch(() => setSupervisors([])); }, [showForm, canCreate]);

  async function submit() {
    setBusy(true); setMessage("");
    try {
      await createStudentProject(Object.fromEntries(Object.entries(form).filter(([, value]) => value !== "")));
      setForm(EMPTY); setShowForm(false); setMessage("Đã tạo đề tài."); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Không tạo được đề tài."); }
    finally { setBusy(false); }
  }

  const term = keyword.trim().toLowerCase();
  const visible = term ? projects.filter((project) => [project.code, project.name, project.studentName, project.studentClass, project.supervisor?.displayName ?? ""].some((value) => value.toLowerCase().includes(term))) : projects;
  const set = (key: keyof typeof EMPTY) => (event: { target: { value: string } }) => setForm({ ...form, [key]: event.target.value });
  const ready = form.code.trim() && form.name.trim() && form.studentName.trim() && form.studentClass.trim() && form.supervisorId && form.organizationUnitId && (!form.startDate || !form.endDate || form.endDate >= form.startDate);

  return <div className="form-section-inline">
    {canCreate ? <SectionCard title="Tạo đề tài NCKH sinh viên">
      {!showForm ? <button className="button primary" type="button" onClick={() => setShowForm(true)}>Tạo đề tài mới</button> : <div className="form-section-inline">
        <div className="form-grid two">
          <label className="field"><span>Mã đề tài</span><input value={form.code} maxLength={50} onChange={set("code")} /></label>
          <label className="field"><span>Tên đề tài</span><input value={form.name} maxLength={500} onChange={set("name")} /></label>
          <label className="field"><span>Sinh viên chủ nhiệm</span><input value={form.studentName} maxLength={200} onChange={set("studentName")} /></label>
          <label className="field"><span>Lớp</span><input value={form.studentClass} maxLength={100} onChange={set("studentClass")} /></label>
          <label className="field"><span>Liên lạc của sinh viên (tuỳ chọn)</span><input value={form.studentContact} maxLength={100} onChange={set("studentContact")} /></label>
          <label className="field"><span>Giảng viên hướng dẫn</span><select value={form.supervisorId} onChange={set("supervisorId")}><option value="">Chọn giảng viên</option>{supervisors.map((user) => <option key={user.id} value={user.id}>{user.displayName} ({user.username}){user.unit ? ` · ${user.unit}` : ""}</option>)}</select></label>
          <label className="field"><span>Đơn vị quản lý</span><select value={form.organizationUnitId} onChange={set("organizationUnitId")}><option value="">Chọn đơn vị</option>{(account?.organizationScopes ?? []).map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
          <label className="field"><span>Ngày bắt đầu</span><input type="date" value={form.startDate} onChange={set("startDate")} /></label>
          <label className="field"><span>Ngày kết thúc</span><input type="date" min={form.startDate || undefined} value={form.endDate} onChange={set("endDate")} /></label>
        </div>
        <div className="button-row"><button className="button primary" type="button" disabled={busy || !ready} onClick={() => void submit()}>Lưu đề tài</button><button className="button" type="button" onClick={() => setShowForm(false)}>Huỷ</button></div>
      </div>}
    </SectionCard> : null}

    <SectionCard title="Đề tài NCKH sinh viên" subtitle="Hiển thị theo quyền: đơn vị bạn quản lý, đề tài bạn hướng dẫn">
      {message ? <p role="status">{message}</p> : null}
      <label className="field"><span>Tìm kiếm</span><input value={keyword} placeholder="Mã, tên đề tài, sinh viên, lớp, giảng viên…" onChange={(event) => setKeyword(event.target.value)} /></label>
      {state === "loading" ? <p>Đang tải…</p> : state === "error" ? <p role="alert">Không tải được danh sách.</p> : !visible.length ? <EmptyState title={projects.length ? "Không có đề tài phù hợp" : "Chưa có đề tài"} message="Đề tài NCKH sinh viên trong phạm vi của bạn sẽ hiện ở đây." /> : <div className="table-wrap"><table className="data-table">
        <thead><tr><th>Mã</th><th>Tên đề tài</th><th>Sinh viên</th><th>Giảng viên hướng dẫn</th><th>Đơn vị</th><th>Trạng thái</th><th /></tr></thead>
        <tbody>{visible.map((project) => <tr key={project.id}>
          <td>{project.code}</td><td>{project.name}</td><td>{project.studentName} · {project.studentClass}</td>
          <td>{project.supervisor?.displayName ?? "—"}</td><td>{project.organizationUnit?.name ?? "—"}</td>
          <td><span className={`status-badge ${project.status === "COMPLETED" ? "success" : project.status === "CANCELLED" ? "danger" : project.status === "ACTIVE" ? "info" : "neutral"}`}>{STUDENT_STATUS_LABELS[project.status] ?? project.status}</span></td>
          <td><Link className="button" href={`/student-research/${project.id}`}>Mở</Link></td>
        </tr>)}</tbody>
      </table></div>}
    </SectionCard>
  </div>;
}
