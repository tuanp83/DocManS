"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SectionCard } from "@/components/ui/section-card";
import { useSession } from "@/components/auth/session-provider";
import { createProject, HEALTH_LABELS, HEALTH_TONES, listProjects, projectStatusLabel, type HealthLevel, type ProjectRecord } from "@/lib/projects-api";
import { loadResearchProposal, loadResearchProposals, type ResearchProposal } from "@/lib/research-proposals-api";

function date(value?: string | null) { return value ? new Intl.DateTimeFormat("vi-VN", { timeZone: "UTC" }).format(new Date(value)) : "Chưa có"; }

const LEVEL_ORDER: Record<string, number> = { red: 0, amber: 1, green: 2 };

function ProgressLine({ project }: { project: ProjectRecord }) {
  const summary = project.progressSummary;
  if (!summary || !summary.level) return null;
  return <p>
    <span className={`status-badge ${HEALTH_TONES[summary.level]}`}>{HEALTH_LABELS[summary.level]}</span>
    {" "}Thực tế {summary.actualPercent}% / kế hoạch {summary.plannedPercent}%{summary.spi !== null ? ` · SPI ${summary.spi.toFixed(2)}` : ""}{summary.maxDaysOverdue ? ` · trễ ${summary.maxDaysOverdue} ngày` : ""}{summary.needsReassessment ? " · cần đánh giá lại" : ""}
  </p>;
}

export function ProjectList({ mine = false }: { mine?: boolean }) {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [approved, setApproved] = useState<ResearchProposal[]>([]);
  const [filter, setFilter] = useState("all");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const { account } = useSession();
  // Chỉ là gợi ý hiển thị; backend vẫn kiểm tra quyền tạo đề tài (chuyên viên QLKH có phạm vi đơn vị).
  const canCreateProjects = account?.systemRole === "RESEARCH_MANAGEMENT_STAFF";

  async function refresh() {
    setState("loading");
    try {
      const [items, proposals] = await Promise.all([listProjects(), mine || !canCreateProjects ? Promise.resolve([]) : loadResearchProposals().catch(() => [])]);
      setProjects(items);
      setApproved(proposals.filter((item) => item.status === "approved" && !items.some((project) => project.proposalId === item.id)));
      setState("ready");
    } catch { setState("error"); }
  }
  useEffect(() => { void refresh(); }, [mine, canCreateProjects]);

  async function create(proposalId: string) {
    if (!window.confirm("Tạo đề tài từ phiên bản đề xuất đã được Lãnh đạo phê duyệt?")) return;
    setBusy(true); setMessage("");
    try {
      const proposal = await loadResearchProposal(proposalId);
      const contextVersion = proposal.viewerAuthorization?.contextVersion;
      const result = await createProject(proposalId, contextVersion);
      setMessage("Đã tạo đề tài. Lãnh đạo hoặc chuyên viên QLKH cần phân công chuyên viên phụ trách trước khi thiết lập mốc.");
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Không thể tạo đề tài."); }
    finally { setBusy(false); }
  }

  const levelOf = (project: ProjectRecord) => project.progressSummary?.level ?? null;
  const counts = (["red", "amber", "green"] as HealthLevel[]).map((level) => ({ level, count: projects.filter((project) => levelOf(project) === level).length }));
  const visible = projects
    .filter((project) => filter === "all" || (filter === "overdue" ? project.overdue : filter === "approaching" ? project.approaching : filter.startsWith("health:") ? levelOf(project) === filter.slice(7) : project.status === filter))
    .sort((left, right) => (LEVEL_ORDER[levelOf(left) ?? ""] ?? 3) - (LEVEL_ORDER[levelOf(right) ?? ""] ?? 3));
  return <div className="form-section-inline">
    <SectionCard title={mine ? "Đề tài của tôi" : "Theo dõi đề tài"} subtitle="Dữ liệu theo quyền trên từng đề tài">
      <div className="button-row"><label className="field"><span>Lọc</span><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">Tất cả</option><option value="preparing">Chuẩn bị triển khai</option><option value="executing">Đang thực hiện</option><option value="overdue">Quá hạn</option><option value="approaching">Sắp đến hạn</option><option value="health:red">{HEALTH_LABELS.red}</option><option value="health:amber">{HEALTH_LABELS.amber}</option><option value="health:green">{HEALTH_LABELS.green}</option></select></label><button className="button" type="button" onClick={() => void refresh()}>Tải lại</button></div>
      {state === "ready" && counts.some((item) => item.count) ? <div className="button-row" aria-label="Số đề tài theo mức sức khoẻ">{counts.map((item) => <button key={item.level} type="button" className={`status-badge ${HEALTH_TONES[item.level]}`} onClick={() => setFilter(`health:${item.level}`)}>{HEALTH_LABELS[item.level]}: {item.count}</button>)}</div> : null}
      {state === "loading" ? <p>Đang tải đề tài…</p> : state === "error" ? <p role="alert">Không tải được đề tài. Vui lòng thử lại.</p> : visible.length === 0 ? <p>Chưa có đề tài phù hợp.</p> : <div className="project-list">{visible.map((project) => <article className="list-card" key={project.id}><h3><Link href={`/projects/${project.id}`}>{project.title}</Link></h3><p>{projectStatusLabel(project.status)} · {project.hostOrganizationUnit?.name ?? ""}</p><p>Hạn: {date(project.nearestDeadline)} {project.overdue ? "· Quá hạn" : project.approaching ? "· Sắp đến hạn" : ""}</p><ProgressLine project={project} /><Link className="button" href={`/projects/${project.id}`}>Mở đề tài</Link></article>)}</div>}
      {message ? <p role="status">{message}</p> : null}
    </SectionCard>
    {!mine && canCreateProjects && approved.length > 0 ? <SectionCard title="Đề xuất đã phê duyệt chưa tạo đề tài" subtitle="Chuyên viên QLKH trong phạm vi đơn vị có thể tạo đề tài thực hiện"><div className="project-list">{approved.map((proposal) => <article className="list-card" key={proposal.id}><Link href={`/proposals/${proposal.id}`}>{proposal.title}</Link><button className="button" type="button" disabled={busy} onClick={() => void create(proposal.id)}>Tạo đề tài</button></article>)}</div></SectionCard> : null}
  </div>;
}
