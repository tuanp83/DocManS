"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Eye, Search } from "lucide-react";
import { SectionCard } from "@/components/ui/section-card";
import { useSession } from "@/components/auth/session-provider";
import { createProject, HEALTH_LABELS, HEALTH_TONES, listProjects, projectStatusLabel, type HealthLevel, type ProjectRecord } from "@/lib/projects-api";
import { loadResearchProposal, loadResearchProposals, type ResearchProposal } from "@/lib/research-proposals-api";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { getProposalLevelLabel } from "@/lib/proposal-classification";
import { foldSearchText } from "@/lib/search-text";

function date(value?: string | null) { return value ? new Intl.DateTimeFormat("vi-VN", { timeZone: "UTC" }).format(new Date(value)) : "Chưa có"; }

const LEVEL_ORDER: Record<string, number> = { red: 0, amber: 1, green: 2 };
const STATUS_TONES: Record<string, string> = { preparing: "neutral", executing: "info", paused: "warning", pending_acceptance: "info", pending_superior_acceptance: "info", accepted: "success", failed: "danger", closed: "neutral" };
const TAG = { fontSize: "11px", padding: "1px 6px", borderRadius: "4px", fontWeight: 600 } as const;

/** Số tháng thực hiện (làm tròn), như cột "Thời gian thực hiện" của danh sách hồ sơ. */
function durationMonths(start?: string | null, end?: string | null) {
  if (!start || !end) return null;
  const from = new Date(start);
  const to = new Date(end);
  if (Number.isNaN(from.valueOf()) || Number.isNaN(to.valueOf()) || to < from) return null;
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / (30.44 * 86_400_000)));
}

const piOf = (project: ProjectRecord) => project.members.find((member) => member.participationRole === "TOPIC_PI" && member.status === "ACTIVE")?.name ?? null;

/** Thanh tiến độ thực tế, vạch đứng là tiến độ kế hoạch. */
function ProgressCell({ project }: { project: ProjectRecord }) {
  const summary = project.progressSummary;
  if (!summary || !summary.level) return <span className="record-meta">Chưa đánh giá</span>;
  const actual = Math.min(100, Math.max(0, summary.actualPercent));
  const planned = Math.min(100, Math.max(0, summary.plannedPercent));
  const color = summary.level === "red" ? "#b91c1c" : summary.level === "amber" ? "#b45309" : "#15803d";
  return <div>
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontWeight: 700, marginBottom: "4px" }}>
      <span style={{ color }}>Thực tế {summary.actualPercent}%</span>
      <span style={{ color: "#475569" }}>KH {summary.plannedPercent}%</span>
    </div>
    <div style={{ position: "relative", width: "100%", height: "6px", background: "#e2e8f0", borderRadius: "3px" }} aria-label={`Thực tế ${summary.actualPercent}%, kế hoạch ${summary.plannedPercent}%`}>
      <div style={{ width: `${actual}%`, height: "100%", background: color, borderRadius: "3px" }} />
      <div style={{ position: "absolute", top: "-3px", left: `calc(${planned}% - 1px)`, width: "2px", height: "12px", background: "#0f172a" }} />
    </div>
  </div>;
}

function HealthCell({ project }: { project: ProjectRecord }) {
  const summary = project.progressSummary;
  if (!summary || !summary.level) return <span className="record-meta">—</span>;
  return <div>
    <span className={`status-badge ${HEALTH_TONES[summary.level]}`}>{HEALTH_LABELS[summary.level]}</span>
    <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>
      {summary.spi !== null ? `SPI ${summary.spi.toFixed(2)}` : ""}{summary.maxDaysOverdue ? `${summary.spi !== null ? " · " : ""}trễ ${summary.maxDaysOverdue} ngày` : ""}
      {summary.needsReassessment ? <><br />Cần đánh giá lại</> : null}
    </div>
  </div>;
}

export function ProjectList({ mine = false }: { mine?: boolean }) {
  const confirm = useConfirm();
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [approved, setApproved] = useState<ResearchProposal[]>([]);
  const [filter, setFilter] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const { account } = useSession();
  // Chỉ là gợi ý hiển thị; backend vẫn kiểm tra quyền tạo đề tài (chuyên viên QLKH có phạm vi đơn vị).
  const canCreateProjects = account?.systemRole === "RESEARCH_MANAGEMENT_STAFF";

  async function refresh() {
    setState("loading");
    try {
      const [items, proposals] = await Promise.all([listProjects(mine ? { mine: true } : undefined), mine || !canCreateProjects ? Promise.resolve([]) : loadResearchProposals().catch(() => [])]);
      setProjects(items);
      setApproved(proposals.filter((item) => item.status === "approved" && !items.some((project) => project.proposalId === item.id)));
      setState("ready");
    } catch { setState("error"); }
  }
  useEffect(() => { void refresh(); }, [mine, canCreateProjects]);

  async function create(proposalId: string) {
    if (!(await confirm("Tạo đề tài từ phiên bản đề xuất đã được Lãnh đạo phê duyệt?", { confirmLabel: "Tạo đề tài" }))) return;
    setBusy(true); setMessage("");
    try {
      const proposal = await loadResearchProposal(proposalId);
      const contextVersion = proposal.viewerAuthorization?.contextVersion;
      const result = await createProject(proposalId, contextVersion);
      setMessage("Đã tạo đề tài. Trưởng phòng hoặc Trưởng ban QLKH cần giao chuyên viên phụ trách trước khi thiết lập mốc.");
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Không thể tạo đề tài."); }
    finally { setBusy(false); }
  }

  const levelOf = (project: ProjectRecord) => project.progressSummary?.level ?? null;
  const counts = (["red", "amber", "green"] as HealthLevel[]).map((level) => ({ level, count: projects.filter((project) => levelOf(project) === level).length }));
  const needle = foldSearchText(keyword.trim());
  const visible = projects
    .filter((project) => !needle || foldSearchText([project.title, project.code ?? "", piOf(project) ?? "", project.hostOrganizationUnit?.name ?? "", project.officer?.officerName ?? ""].join(" ")).includes(needle))
    .filter((project) => filter === "all" || (filter === "overdue" ? project.overdue : filter === "approaching" ? project.approaching : filter.startsWith("health:") ? levelOf(project) === filter.slice(7) : project.status === filter))
    .sort((left, right) => (LEVEL_ORDER[levelOf(left) ?? ""] ?? 3) - (LEVEL_ORDER[levelOf(right) ?? ""] ?? 3));
  return <div className="form-section-inline">
    <SectionCard title={mine ? "Đề tài của tôi" : "Theo dõi đề tài"} subtitle="Tiến độ, sức khoẻ và hạn gần nhất của từng đề tài, theo quyền trên từng đề tài">
      <div className="filter-bar" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px", alignItems: "end" }}>
        <label className="filter-field">
          <span>Từ khóa</span>
          <span className="field-input plain">
            <Search size={16} aria-hidden="true" />
            <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Tên đề tài, mã số, chủ nhiệm hoặc đơn vị" />
          </span>
        </label>
        <label className="filter-field">
          <span>Lọc</span>
          <select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">Tất cả</option><option value="preparing">Chuẩn bị triển khai</option><option value="executing">Đang thực hiện</option><option value="overdue">Quá hạn</option><option value="approaching">Sắp đến hạn</option><option value="health:red">{HEALTH_LABELS.red}</option><option value="health:amber">{HEALTH_LABELS.amber}</option><option value="health:green">{HEALTH_LABELS.green}</option></select>
        </label>
        <div className="button-row" style={{ margin: 0 }}><button className="button secondary" type="button" onClick={() => void refresh()}>Tải lại</button></div>
      </div>
      {state === "ready" && counts.some((item) => item.count) ? <div className="button-row" aria-label="Số đề tài theo mức sức khoẻ">{counts.map((item) => <button key={item.level} type="button" className={`status-badge ${HEALTH_TONES[item.level]}`} onClick={() => setFilter(`health:${item.level}`)}>{HEALTH_LABELS[item.level]}: {item.count}</button>)}</div> : null}
      {state === "loading" ? <p className="state-message">Đang tải đề tài…</p> : state === "error" ? <p className="state-message error" role="alert">Không tải được đề tài. Vui lòng thử lại.</p> : visible.length === 0 ? <p className="state-message">Chưa có đề tài phù hợp.</p> : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ minWidth: "260px" }}>Đề tài & Chủ nhiệm</th>
                <th style={{ minWidth: "150px" }}>Thời gian thực hiện</th>
                <th style={{ minWidth: "160px" }}>Tiến độ thực hiện</th>
                <th style={{ minWidth: "130px" }}>Sức khoẻ</th>
                <th style={{ minWidth: "120px" }}>Hạn gần nhất</th>
                <th>Trạng thái</th>
                <th style={{ textAlign: "center" }}>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((project) => {
                const months = durationMonths(project.startDate, project.endDate);
                const pi = piOf(project);
                return (
                  <tr key={project.id}>
                    <td>
                      <Link className="record-title" href={`/projects/${project.id}`}>{project.title}</Link>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginTop: "4px" }}>
                        {project.code ? <span className="record-meta" style={{ fontWeight: 700, color: "#15803d" }}>{project.code}</span> : null}
                        {project.level ? <span style={{ ...TAG, background: "var(--surface-muted, #f1f5f9)", color: "var(--text-primary)" }}>{getProposalLevelLabel(project.level)}</span> : null}
                      </div>
                      <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                        Chủ nhiệm: <strong>{pi ?? "—"}</strong>{project.hostOrganizationUnit?.name ? ` • ${project.hostOrganizationUnit.name}` : ""}
                      </div>
                      {project.officer?.officerName ? <div style={{ fontSize: "12px", color: "#64748b" }}>Chuyên viên phụ trách: {project.officer.officerName}</div> : null}
                    </td>
                    <td>
                      <div style={{ fontSize: "12px", color: "#334155" }}>{project.startDate || project.endDate ? `${date(project.startDate)} - ${date(project.endDate)}` : "Chưa có"}</div>
                      {months ? <div style={{ ...TAG, display: "inline-block", marginTop: "4px", fontWeight: 700, color: "#166534", background: "#f0fdf4" }}>⏱ {months} tháng</div> : null}
                    </td>
                    <td><ProgressCell project={project} /></td>
                    <td><HealthCell project={project} /></td>
                    <td>
                      <div style={{ fontSize: "12px", color: "#334155" }}>{date(project.nearestDeadline)}</div>
                      {project.overdue ? <span style={{ ...TAG, display: "inline-block", marginTop: "4px", color: "#991b1b", background: "#fef2f2" }}>Quá hạn</span> : project.approaching ? <span style={{ ...TAG, display: "inline-block", marginTop: "4px", color: "#854d0e", background: "#fefce8" }}>Sắp đến hạn</span> : null}
                    </td>
                    <td><span className={`status-badge ${STATUS_TONES[project.status] ?? "neutral"}`}>{projectStatusLabel(project.status)}</span></td>
                    <td style={{ textAlign: "center" }}>
                      <Link className="button secondary" href={`/projects/${project.id}`} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><Eye size={15} aria-hidden="true" /> Xem</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {message ? <p role="status">{message}</p> : null}
    </SectionCard>
    {!mine && canCreateProjects && approved.length > 0 ? <SectionCard title="Đề xuất đã phê duyệt chưa tạo đề tài" subtitle="Chuyên viên QLKH trong phạm vi đơn vị có thể tạo đề tài thực hiện">
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Hồ sơ & Chủ nhiệm</th><th>Thời gian thực hiện</th><th style={{ textAlign: "center" }}>Hành động</th></tr></thead>
          <tbody>
            {approved.map((proposal) => <tr key={proposal.id}>
              <td>
                <Link className="record-title" href={`/proposals/${proposal.id}`}>{proposal.title}</Link>
                <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>{proposal.code ? <strong style={{ color: "#15803d" }}>{proposal.code}</strong> : null}{proposal.ownerDisplayName ? ` · Chủ nhiệm: ${proposal.ownerDisplayName}` : ""}{proposal.hostOrganizationUnitName ? ` • ${proposal.hostOrganizationUnitName}` : ""}</div>
              </td>
              <td><div style={{ fontSize: "12px", color: "#334155" }}>{date(proposal.startDate)} - {date(proposal.endDate)}</div></td>
              <td style={{ textAlign: "center" }}><button className="button primary" type="button" disabled={busy} onClick={() => void create(proposal.id)}>Tạo đề tài</button></td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </SectionCard> : null}
  </div>;
}
