"use client";

import { useEffect, useState } from "react";
import { SectionCard } from "@/components/ui/section-card";
import { acceptanceCandidates, canProject, projectFileUrl, type CouncilCandidate, type ProjectProduct, type ProjectRecord } from "@/lib/projects-api";

/**
 * Bước 1 của nghiệm thu: mỗi nội dung công việc trong thuyết minh là một sản phẩm (dạng 1–6), do tổ chuyên gia
 * 3–5 người nghiệm thu. Đủ mọi sản phẩm đạt thì chủ nhiệm mới nộp được hồ sơ nghiệm thu cơ sở.
 * Nút hiển thị theo capability máy chủ trả về.
 */

type ProjectFile = { id: string; fileName: string; uploadedById: string; filePurpose?: string };
type Props = {
  project: ProjectRecord;
  files: ProjectFile[];
  busy: boolean;
  run: (path: string, body?: Record<string, unknown>, confirmText?: string, method?: string) => Promise<boolean>;
  upload: (file: File | undefined, purpose: string) => Promise<void>;
};
type DraftProduct = { id?: string; title: string; productForm: number; requirements: string; milestoneId: string; locked: boolean };

const FORMS = [1, 2, 3, 4, 5, 6];
// Ngày thuần (YYYY-MM-DD) đọc theo UTC; thời điểm (có giờ) đọc theo giờ Việt Nam.
function date(value?: string | null) { return value ? new Intl.DateTimeFormat("vi-VN", { timeZone: value.length > 10 ? "Asia/Ho_Chi_Minh" : "UTC" }).format(new Date(value)) : "—"; }

function Files({ ids, files }: { ids?: string[]; files: ProjectFile[] }) {
  if (!ids?.length) return null;
  return <ul>{ids.map((id) => <li key={id}><a href={projectFileUrl(id)}>{files.find((file) => file.id === id)?.fileName ?? "Tệp đính kèm"}</a></li>)}</ul>;
}

function Picker({ files, purpose, selected, onChange, onUpload, busy, label }: { files: ProjectFile[]; purpose: string; selected: string[]; onChange: (ids: string[]) => void; onUpload: (file?: File) => void; busy: boolean; label: string }) {
  const candidates = files.filter((file) => file.filePurpose === purpose);
  return <div className="form-section-inline">
    <label className="field"><span>{label}</span><input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" disabled={busy} onChange={(event) => onUpload(event.target.files?.[0])} /></label>
    {candidates.map((file) => <label className="field" key={file.id}><span><input type="checkbox" checked={selected.includes(file.id)} onChange={(event) => onChange(event.target.checked ? [...selected, file.id] : selected.filter((id) => id !== file.id))} /> {file.fileName}</span></label>)}
  </div>;
}

function ProductCard({ product, project, files, busy, run, upload, candidates }: { product: ProjectProduct; candidates: CouncilCandidate[] } & Omit<Props, "project"> & { project: ProjectRecord }) {
  const allowed = (action: Parameters<typeof canProject>[1]) => canProject(project, action);
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState<string[]>([]);
  const [panel, setPanel] = useState<Array<{ profileId: string; role: "LEADER" | "MEMBER" }>>([{ profileId: "", role: "LEADER" }, { profileId: "", role: "MEMBER" }, { profileId: "", role: "MEMBER" }]);
  const [panelInfo, setPanelInfo] = useState({ reviewDate: "", location: "" });
  const [result, setResult] = useState({ result: "PASSED", conclusion: "", reviewDate: "" });
  const [minutes, setMinutes] = useState<string[]>([]);
  const openReview = product.reviews.find((review) => review.status === "PANEL_FORMED");
  const path = `products/${product.id}`;

  return <article className="list-card">
    <h3>{product.position + 1}. {product.title} · Sản phẩm dạng {product.productForm} · {product.statusLabel}</h3>
    {product.requirements ? <p>Yêu cầu khoa học: {product.requirements}</p> : null}
    {product.submission ? <div><p>Minh chứng đã nộp ({date(product.submission.submittedAt)}){product.submission.note ? `: ${product.submission.note}` : ""}</p><Files ids={product.submission.evidenceFileIds} files={files} /></div> : null}
    {product.reviews.map((review) => <div key={review.id} className="kpi-meta">
      Lần {review.round}: tổ chuyên gia {review.panelMembers.map((member) => `${member.fullName}${member.role === "LEADER" ? " (tổ trưởng)" : ""}`).join(", ")}
      {review.reviewDate ? ` · ngày ${date(review.reviewDate)}` : ""}{review.location ? ` · ${review.location}` : ""}
      {review.result ? ` · kết luận: ${review.result === "PASSED" ? "Đạt" : "Không đạt"}${review.conclusion ? ` — ${review.conclusion}` : ""}` : " · đang nghiệm thu"}
      <Files ids={review.minutesFileIds} files={files} />
    </div>)}

    {allowed("project.product.submit") && ["PLANNED", "FAILED", "SUBMITTED"].includes(product.status) ? <div className="form-section-inline">
      <label className="field"><span>{product.status === "FAILED" ? "Nội dung đã hoàn thiện" : "Mô tả sản phẩm"}</span><textarea value={note} onChange={(event) => setNote(event.target.value)} /></label>
      <Picker files={files} purpose="product_evidence" selected={evidence} onChange={setEvidence} onUpload={(file) => void upload(file, "product_evidence")} busy={busy} label="Minh chứng sản phẩm" />
      <button className="button primary" disabled={busy || !evidence.length} onClick={async () => { if (await run(`${path}/submit`, { note, evidenceFileIds: evidence }, "Nộp minh chứng sản phẩm để tổ chuyên gia nghiệm thu?")) { setNote(""); setEvidence([]); } }}>{product.status === "SUBMITTED" ? "Nộp lại minh chứng" : "Nộp minh chứng"}</button>
    </div> : null}

    {allowed("project.product.review") && product.status === "SUBMITTED" ? <div className="form-section-inline">
      <h4>Lập tổ chuyên gia (3–5 người, 1 tổ trưởng)</h4>
      {panel.map((row, index) => <div className="form-grid two" key={index}>
        <label className="field"><span>Vai trò</span><select value={row.role} onChange={(event) => setPanel(panel.map((item, at) => at === index ? { ...item, role: event.target.value as "LEADER" | "MEMBER" } : item))}><option value="LEADER">Tổ trưởng</option><option value="MEMBER">Thành viên</option></select></label>
        <label className="field"><span>Chuyên gia</span><select value={row.profileId} onChange={(event) => setPanel(panel.map((item, at) => at === index ? { ...item, profileId: event.target.value } : item))}><option value="">Chọn</option>{candidates.map((candidate) => <option key={candidate.profileId} value={candidate.profileId} disabled={candidate.isConflicted}>{candidate.academicTitle ? `${candidate.academicTitle} ` : ""}{candidate.fullName}{candidate.unit ? ` · ${candidate.unit}` : ""}{candidate.conflictReason ? ` — ${candidate.conflictReason}` : ""}</option>)}</select></label>
      </div>)}
      <div className="button-row"><button className="button" type="button" disabled={panel.length >= 5} onClick={() => setPanel([...panel, { profileId: "", role: "MEMBER" }])}>Thêm chuyên gia</button><button className="button" type="button" disabled={panel.length <= 3} onClick={() => setPanel(panel.slice(0, -1))}>Bớt dòng cuối</button></div>
      <div className="form-grid two"><label className="field"><span>Ngày nghiệm thu dự kiến</span><input type="date" value={panelInfo.reviewDate} onChange={(event) => setPanelInfo({ ...panelInfo, reviewDate: event.target.value })} /></label><label className="field"><span>Địa điểm</span><input value={panelInfo.location} onChange={(event) => setPanelInfo({ ...panelInfo, location: event.target.value })} /></label></div>
      <button className="button primary" disabled={busy || panel.some((row) => !row.profileId) || panel.filter((row) => row.role === "LEADER").length !== 1} onClick={() => void run(`${path}/panel`, { members: panel, ...panelInfo }, "Lập tổ chuyên gia nghiệm thu sản phẩm này?")}>Lập tổ chuyên gia</button>
    </div> : null}

    {allowed("project.product.review") && product.status === "UNDER_REVIEW" && openReview ? <div className="form-section-inline">
      <h4>Kết luận của tổ chuyên gia</h4>
      <div className="form-grid two">
        <label className="field"><span>Kết luận</span><select value={result.result} onChange={(event) => setResult({ ...result, result: event.target.value })}><option value="PASSED">Đạt</option><option value="FAILED">Không đạt</option></select></label>
        <label className="field"><span>Ngày nghiệm thu</span><input type="date" value={result.reviewDate || openReview.reviewDate || ""} onChange={(event) => setResult({ ...result, reviewDate: event.target.value })} /></label>
      </div>
      <label className="field"><span>Ý kiến của tổ chuyên gia{result.result === "FAILED" ? " (bắt buộc)" : ""}</span><textarea value={result.conclusion} onChange={(event) => setResult({ ...result, conclusion: event.target.value })} /></label>
      <Picker files={files} purpose="product_review_minutes" selected={minutes} onChange={setMinutes} onUpload={(file) => void upload(file, "product_review_minutes")} busy={busy} label="Biên bản nghiệm thu của tổ chuyên gia" />
      <button className="button primary" disabled={busy || !minutes.length || (result.result === "FAILED" && !result.conclusion.trim()) || !(result.reviewDate || openReview.reviewDate)} onClick={() => void run(`${path}/review`, { ...result, reviewDate: result.reviewDate || openReview.reviewDate, minutesFileIds: minutes }, "Ghi kết luận? Kết luận đã ghi không sửa được.")}>Ghi kết luận</button>
    </div> : null}
  </article>;
}

export function ProjectProductsPanel({ project, files, busy, run, upload }: Props) {
  const products = project.products ?? [];
  const canManage = canProject(project, "project.product.manage");
  const canReview = canProject(project, "project.product.review");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DraftProduct[]>([]);
  const [candidates, setCandidates] = useState<CouncilCandidate[]>([]);

  useEffect(() => { if (canReview) void acceptanceCandidates(project.id).then(setCandidates).catch(() => setCandidates([])); }, [project.id, canReview]);
  function startEditing() {
    setDraft(products.length ? products.map((item) => ({ id: item.id, title: item.title, productForm: item.productForm, requirements: item.requirements ?? "", milestoneId: item.milestoneId ?? "", locked: item.status !== "PLANNED" })) : [{ title: "", productForm: 1, requirements: "", milestoneId: "", locked: false }]);
    setEditing(true);
  }
  if (!products.length && !canManage) return null;
  const passed = products.filter((item) => item.status === "PASSED").length;

  return <SectionCard title="Sản phẩm (nội dung công việc) — nghiệm thu bởi tổ chuyên gia" subtitle={products.length ? `${passed}/${products.length} sản phẩm đạt${passed === products.length ? " — đủ điều kiện nộp hồ sơ nghiệm thu cơ sở" : ""}` : "Chưa có danh sách sản phẩm theo thuyết minh"}>
    {canManage && !editing ? <div className="button-row"><button className="button" type="button" onClick={startEditing}>{products.length ? "Sửa danh sách sản phẩm" : "Nhập danh sách sản phẩm theo thuyết minh"}</button></div> : null}
    {editing ? <div className="form-section-inline">
      <p className="kpi-meta">Mỗi nội dung công việc trong thuyết minh là một sản phẩm. Sản phẩm đã nộp minh chứng không đổi nội dung, dạng và không xoá được.</p>
      {draft.map((item, index) => <div className="form-grid two" key={item.id ?? `new-${index}`}>
        <label className="field"><span>Nội dung công việc #{index + 1}</span><input value={item.title} disabled={item.locked} onChange={(event) => setDraft(draft.map((row, at) => at === index ? { ...row, title: event.target.value } : row))} /></label>
        <label className="field"><span>Dạng sản phẩm</span><select value={item.productForm} disabled={item.locked} onChange={(event) => setDraft(draft.map((row, at) => at === index ? { ...row, productForm: Number(event.target.value) } : row))}>{FORMS.map((form) => <option key={form} value={form}>Dạng {form}</option>)}</select></label>
        <label className="field"><span>Yêu cầu khoa học</span><textarea value={item.requirements} onChange={(event) => setDraft(draft.map((row, at) => at === index ? { ...row, requirements: event.target.value } : row))} /></label>
        <label className="field"><span>Gắn với mốc</span><select value={item.milestoneId} onChange={(event) => setDraft(draft.map((row, at) => at === index ? { ...row, milestoneId: event.target.value } : row))}><option value="">Không gắn</option>{project.milestones.map((milestone) => <option key={milestone.id} value={milestone.id}>{milestone.title}</option>)}</select></label>
        {!item.locked ? <button className="button" type="button" onClick={() => setDraft(draft.filter((_, at) => at !== index))}>Xoá dòng</button> : null}
      </div>)}
      <div className="button-row">
        <button className="button" type="button" onClick={() => setDraft([...draft, { title: "", productForm: 1, requirements: "", milestoneId: "", locked: false }])}>Thêm sản phẩm</button>
        <button className="button primary" disabled={busy || draft.some((item) => !item.title.trim())} onClick={async () => { if (await run("products", { products: draft.map(({ locked: _locked, ...item }) => ({ ...item, milestoneId: item.milestoneId || null })) }, undefined, "PUT")) setEditing(false); }}>Lưu danh sách</button>
        <button className="button" type="button" onClick={() => setEditing(false)}>Huỷ</button>
      </div>
    </div> : null}
    <div className="project-list">{products.map((product) => <ProductCard key={product.id} product={product} project={project} files={files} busy={busy} run={run} upload={upload} candidates={candidates} />)}</div>
  </SectionCard>;
}
