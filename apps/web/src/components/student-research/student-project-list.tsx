"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "@/components/auth/session-provider";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import {
  createStudentProject,
  listStudentProjects,
  listStudentResearchUnits,
  listSupervisorCandidates,
  registerStudentProject,
  STUDENT_STATUS_LABELS,
  STUDENT_STATUS_TONES,
  type OrganizationUnitOption,
  type StudentProject,
  type StudentProjectStatus
} from "@/lib/student-research-api";

const EMPTY = { code: "", name: "", studentName: "", studentClass: "", studentContact: "", supervisorId: "", organizationUnitId: "", startDate: "", endDate: "" };
type FormState = typeof EMPTY;

const MANAGER_ROLES = ["RESEARCH_MANAGEMENT_STAFF"];
const REGISTRANT_ROLES = ["RESEARCHER_INTERNAL_USER", "RESEARCH_MANAGEMENT_STAFF"];

export function StudentProjectList() {
  const { account } = useSession();
  // Chỉ là gợi ý hiển thị; máy chủ kiểm tra lại mọi quyền.
  const canCreate = MANAGER_ROLES.includes(account?.systemRole ?? "") && !!account?.organizationScopes?.length;
  const canRegister = REGISTRANT_ROLES.includes(account?.systemRole ?? "");
  const [projects, setProjects] = useState<StudentProject[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY);
  const [mode, setMode] = useState<"none" | "create" | "register">("none");
  const [supervisors, setSupervisors] = useState<Array<{ id: string; displayName: string; username: string; unit: string }>>([]);
  const [units, setUnits] = useState<OrganizationUnitOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | StudentProjectStatus>("");

  async function refresh() {
    setState("loading");
    try { setProjects(await listStudentProjects()); setState("ready"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Không tải được danh sách."); setState("error"); }
  }
  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    if (mode === "create" && !supervisors.length) void listSupervisorCandidates().then(setSupervisors).catch(() => setSupervisors([]));
    if (mode === "register" && !units.length) void listStudentResearchUnits().then(setUnits).catch(() => setUnits([]));
  }, [mode]);

  function open(next: "create" | "register") { setForm(EMPTY); setMode(next); setMessage(""); }

  async function submit() {
    setBusy(true); setMessage("");
    try {
      // Bản đăng ký không có mã (chuyên viên cấp khi duyệt) và giảng viên tự là người hướng dẫn.
      const payload = Object.fromEntries(Object.entries(form).filter(([key, value]) => value !== "" && (mode === "create" || (key !== "supervisorId" && key !== "code"))));
      if (mode === "create") { await createStudentProject(payload); setMessage("Đã tạo đề tài."); }
      else { await registerStudentProject(payload); setMessage("Đã lưu bản nháp đăng ký. Mở đề tài để tải phiếu đăng ký, thuyết minh và nộp cho chuyên viên duyệt."); }
      setForm(EMPTY); setMode("none"); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Không lưu được đề tài."); }
    finally { setBusy(false); }
  }

  const term = keyword.trim().toLowerCase();
  const visible = projects
    .filter((project) => !statusFilter || project.status === statusFilter)
    .filter((project) => !term || [project.code ?? "", project.name, project.studentName, project.studentClass, project.supervisor?.displayName ?? ""].some((value) => value.toLowerCase().includes(term)));
  const waiting = projects.filter((project) => project.status === "SUBMITTED" && project.viewer.actions.includes("approve")).length;
  const set = (key: keyof FormState) => (event: { target: { value: string } }) => setForm({ ...form, [key]: event.target.value });
  const unitOptions = mode === "create" ? (account?.organizationScopes ?? []) : units;
  const ready = (mode === "register" || form.code.trim()) && form.name.trim() && form.studentName.trim() && form.studentClass.trim()
    && (mode === "register" || form.supervisorId) && form.organizationUnitId && (!form.startDate || !form.endDate || form.endDate >= form.startDate);

  return <div className="form-section-inline">
    {canCreate || canRegister ? <SectionCard title={mode === "create" ? "Tạo đề tài đã duyệt" : mode === "register" ? "Đăng ký hướng dẫn đề tài" : "Đề tài mới"} subtitle={mode === "register" ? "Bạn là giảng viên hướng dẫn. Bản nháp chỉ bạn thấy cho tới khi nộp; chuyên viên QLKH của đơn vị sẽ duyệt và cấp mã." : mode === "create" ? "Dùng khi đề tài đã được duyệt ngoài hệ thống: đề tài chuyển ngay sang Đang thực hiện." : undefined}>
      {mode === "none" ? <div className="button-row">
        {canRegister ? <button className="button primary" type="button" onClick={() => open("register")}>Đăng ký hướng dẫn đề tài</button> : null}
        {canCreate ? <button className="button" type="button" onClick={() => open("create")}>Tạo đề tài đã duyệt</button> : null}
      </div> : <div className="form-section-inline">
        <div className="form-grid two">
          {mode === "create" ? <label className="field"><span>Mã đề tài</span><input value={form.code} maxLength={50} onChange={set("code")} /></label> : null}
          <label className="field"><span>Tên đề tài</span><input value={form.name} maxLength={500} onChange={set("name")} /></label>
          <label className="field"><span>Sinh viên chủ nhiệm</span><input value={form.studentName} maxLength={200} onChange={set("studentName")} /></label>
          <label className="field"><span>Lớp</span><input value={form.studentClass} maxLength={100} onChange={set("studentClass")} /></label>
          <label className="field"><span>Liên lạc của sinh viên (tuỳ chọn)</span><input value={form.studentContact} maxLength={100} onChange={set("studentContact")} /></label>
          {mode === "create" ? <label className="field"><span>Giảng viên hướng dẫn</span><select value={form.supervisorId} onChange={set("supervisorId")}><option value="">Chọn giảng viên</option>{supervisors.map((user) => <option key={user.id} value={user.id}>{user.displayName} ({user.username}){user.unit ? ` · ${user.unit}` : ""}</option>)}</select></label> : null}
          <label className="field"><span>Đơn vị quản lý</span><select value={form.organizationUnitId} onChange={set("organizationUnitId")}><option value="">Chọn đơn vị</option>{unitOptions.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
          <label className="field"><span>Ngày bắt đầu (dự kiến)</span><input type="date" value={form.startDate} onChange={set("startDate")} /></label>
          <label className="field"><span>Ngày kết thúc (dự kiến)</span><input type="date" min={form.startDate || undefined} value={form.endDate} onChange={set("endDate")} /></label>
        </div>
        <div className="button-row"><button className="button primary" type="button" disabled={busy || !ready} onClick={() => void submit()}>{mode === "create" ? "Lưu đề tài" : "Lưu bản nháp"}</button><button className="button" type="button" onClick={() => setMode("none")}>Đóng</button></div>
      </div>}
    </SectionCard> : null}

    <SectionCard title="Đề tài NCKH sinh viên" subtitle={waiting ? `${waiting} đề tài đang chờ bạn duyệt` : "Hiển thị theo quyền: đơn vị bạn quản lý, đề tài bạn hướng dẫn"}>
      {message ? <p role="status">{message}</p> : null}
      <div className="form-grid two">
        <label className="field"><span>Tìm kiếm</span><input value={keyword} placeholder="Mã, tên đề tài, sinh viên, lớp, giảng viên…" onChange={(event) => setKeyword(event.target.value)} /></label>
        <label className="field"><span>Trạng thái</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "" | StudentProjectStatus)}><option value="">Tất cả</option>{(Object.keys(STUDENT_STATUS_LABELS) as StudentProjectStatus[]).map((status) => <option key={status} value={status}>{STUDENT_STATUS_LABELS[status]}</option>)}</select></label>
      </div>
      {state === "loading" ? <p>Đang tải…</p> : state === "error" ? <p role="alert">Không tải được danh sách.</p> : !visible.length ? <EmptyState title={projects.length ? "Không có đề tài phù hợp" : "Chưa có đề tài"} message="Đề tài NCKH sinh viên trong phạm vi của bạn sẽ hiện ở đây." /> : <div className="table-wrap"><table className="data-table">
        <thead><tr><th>Mã</th><th>Tên đề tài</th><th>Sinh viên</th><th>Giảng viên hướng dẫn</th><th>Đơn vị</th><th>Trạng thái</th><th /></tr></thead>
        <tbody>{visible.map((project) => <tr key={project.id}>
          <td>{project.code ?? "—"}</td><td>{project.name}</td><td>{project.studentName} · {project.studentClass}</td>
          <td>{project.supervisor?.displayName ?? "—"}</td><td>{project.organizationUnit?.name ?? "—"}</td>
          <td><span className={`status-badge ${STUDENT_STATUS_TONES[project.status] ?? "neutral"}`}>{STUDENT_STATUS_LABELS[project.status] ?? project.status}</span></td>
          <td><Link className="button" href={`/student-research/${project.id}`}>Mở</Link></td>
        </tr>)}</tbody>
      </table></div>}
    </SectionCard>
  </div>;
}
