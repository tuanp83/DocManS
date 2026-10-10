"use client";

import { useEffect, useState } from "react";
import { SectionCard } from "@/components/ui/section-card";
import { acceptanceCandidates, canProject, projectDenial, projectFileUrl, type AcceptanceMemberRole, type CouncilCandidate, type ProjectAcceptance, type ProjectRecord } from "@/lib/projects-api";
import { exportAcceptanceMinutesWord } from "@/lib/word-export";

/**
 * Nghiệm thu → thanh lý → đóng đề tài (docs/design/nghiem-thu-thanh-ly-dong-de-tai.md).
 * Nút nào hiện ra do capability máy chủ trả về quyết định; giao diện không tự suy quyền theo vai trò.
 */

type ProjectFile = { id: string; fileName: string; uploadedById: string; filePurpose?: string };
type Props = {
  project: ProjectRecord;
  files: ProjectFile[];
  busy: boolean;
  run: (path: string, body?: Record<string, unknown>, confirmText?: string) => Promise<boolean>;
  upload: (file: File | undefined, purpose: string) => Promise<void>;
};

const ROLE_LABELS: Record<AcceptanceMemberRole, string> = { CHAIRMAN: "Chủ tịch", SECRETARY: "Thư ký", REVIEWER_1: "Ủy viên phản biện 1", REVIEWER_2: "Ủy viên phản biện 2", MEMBER: "Ủy viên" };
const DEFAULT_ROLES: AcceptanceMemberRole[] = ["CHAIRMAN", "SECRETARY", "REVIEWER_1", "REVIEWER_2", "MEMBER"];
const SCORE_FIELDS = [
  { key: "reportScore", label: "Báo cáo tổng kết", max: 30 },
  { key: "scientificProductsScore", label: "Sản phẩm khoa học", max: 30 },
  { key: "trainingProductsScore", label: "Sản phẩm đào tạo", max: 15 },
  { key: "militaryMedicalPracticalScore", label: "Giá trị thực tiễn", max: 25 }
] as const;
const RESOLUTION_LABELS: Record<string, string> = { approved: "Đạt", revise: "Đạt, cần hoàn thiện", rejected: "Không đạt" };
const CLASSIFICATION_LABELS: Record<string, string> = { EXCELLENT: "Xuất sắc", PASSED: "Đạt", FAILED: "Không đạt" };

function money(value: number) { return `${Math.round(value).toLocaleString("vi-VN")} đ`; }
function date(value?: string | null) { return value ? new Intl.DateTimeFormat("vi-VN", { timeZone: "UTC" }).format(new Date(value)) : "—"; }

function FilePicker({ files, purpose, selected, onChange, onUpload, busy, label }: { files: ProjectFile[]; purpose: string; selected: string[]; onChange: (ids: string[]) => void; onUpload: (file?: File) => void; busy: boolean; label: string }) {
  const candidates = files.filter((file) => file.filePurpose === purpose);
  return <div className="form-section-inline">
    <label className="field"><span>{label}</span><input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" disabled={busy} onChange={(event) => onUpload(event.target.files?.[0])} /></label>
    {candidates.length ? candidates.map((file) => <label className="field" key={file.id}><span><input type="checkbox" checked={selected.includes(file.id)} onChange={(event) => onChange(event.target.checked ? [...selected, file.id] : selected.filter((id) => id !== file.id))} /> {file.fileName}</span></label>) : <p className="kpi-meta">Chưa có tệp nào. Tải tệp lên rồi đánh dấu để đính kèm.</p>}
  </div>;
}

function FileLinks({ ids, files }: { ids?: string[]; files: ProjectFile[] }) {
  if (!ids?.length) return null;
  return <ul>{ids.map((id) => <li key={id}><a href={projectFileUrl(id)}>{files.find((file) => file.id === id)?.fileName ?? "Tệp đính kèm"}</a></li>)}</ul>;
}

function RoundSummary({ round, files }: { round: ProjectAcceptance; files: ProjectFile[] }) {
  return <article className="list-card">
    <h3>Vòng {round.round} · {round.statusLabel}{round.legacy ? " (dữ liệu chuyển từ hồ sơ đề xuất)" : ""}</h3>
    {round.dossier?.finalReportSummary ? <p><strong>Tóm tắt báo cáo tổng kết:</strong> {round.dossier.finalReportSummary}</p> : null}
    {round.dossier?.products ? <p><strong>Sản phẩm:</strong> {round.dossier.products}</p> : null}
    {round.dossier?.selfAssessment ? <p><strong>Tự đánh giá:</strong> {round.dossier.selfAssessment}</p> : null}
    <FileLinks ids={round.dossier?.evidenceFileIds} files={files} />
    {round.returnReason ? <p>Lý do trả hồ sơ: {round.returnReason}</p> : null}
    {round.councilMembers.length ? <div><strong>Hội đồng{round.councilType === "FACILITY" ? " cấp cơ sở" : " chính thức"}{round.decisionNumber ? ` — QĐ số ${round.decisionNumber} (${date(round.decisionDate)})` : " — chờ lãnh đạo ký quyết định"}:</strong><ul>{round.councilMembers.map((member) => <li key={member.profileId}>{ROLE_LABELS[member.role] ?? member.role}: {member.academicTitle ? `${member.academicTitle} ` : ""}{member.fullName}{member.unit ? ` · ${member.unit}` : ""}</li>)}</ul><p>Ngày họp: {date(round.meetingDate)}{round.meetingLocation ? ` · ${round.meetingLocation}` : ""}</p></div> : null}
    {round.evaluationResult ? <p><strong>Kết quả:</strong> {round.evaluationResult.totalScore} điểm — {CLASSIFICATION_LABELS[round.evaluationResult.classification] ?? round.evaluationResult.classification}{round.resolution ? ` — kết luận: ${RESOLUTION_LABELS[round.resolution] ?? round.resolution}` : ""}{round.evaluationResult.assessmentComments ? `. ${round.evaluationResult.assessmentComments}` : ""}</p> : null}
    {round.revisionDossier ? <div><strong>Bản hoàn thiện:</strong> {round.revisionDossier.finalReportSummary}<FileLinks ids={round.revisionDossier.evidenceFileIds} files={files} /></div> : null}
    {round.revisionNote ? <p>Ý kiến chuyên viên: {round.revisionNote}</p> : null}
  </article>;
}

export function ProjectClosurePanel({ project, files, busy, run, upload }: Props) {
  const allowed = (action: Parameters<typeof canProject>[1]) => canProject(project, action);
  const rounds = project.acceptances ?? [];
  const current = rounds[0] ?? null;
  const liquidation = project.liquidation ?? null;

  const [dossier, setDossier] = useState({ finalReportSummary: "", products: "", selfAssessment: "" });
  const [dossierFiles, setDossierFiles] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [candidates, setCandidates] = useState<CouncilCandidate[]>([]);
  const [council, setCouncil] = useState<Array<{ role: AcceptanceMemberRole; profileId: string }>>(DEFAULT_ROLES.map((role) => ({ role, profileId: "" })));
  const [meeting, setMeeting] = useState({ councilType: "OFFICIAL", meetingDate: "", meetingLocation: "", tentativeAgenda: "" });
  const [decision, setDecision] = useState({ decisionNumber: "", decisionDate: "" });
  const [scores, setScores] = useState<Record<string, string>>({});
  const [minutes, setMinutes] = useState({ resolution: "", assessmentComments: "", minutesNotes: "", meetingDate: "", meetingLocation: "" });
  const [liquidationForm, setLiquidationForm] = useState({ liquidationDate: "", recoveredAmount: "", productsHandedOver: "", notes: "", liquidationNumber: "" });
  const [liquidationFiles, setLiquidationFiles] = useState<string[]>([]);

  const canPropose = allowed("project.acceptance.council.propose");
  useEffect(() => {
    if (canPropose) void acceptanceCandidates(project.id).then(setCandidates).catch(() => setCandidates([]));
  }, [project.id, canPropose]);
  useEffect(() => {
    if (current?.councilMembers.length) setCouncil(current.councilMembers.map((member) => ({ role: member.role, profileId: member.profileId })));
    if (current?.meetingDate || current?.meetingLocation) setMeeting((value) => ({ ...value, councilType: current.councilType ?? "OFFICIAL", meetingDate: current.meetingDate ?? "", meetingLocation: current.meetingLocation ?? "", tentativeAgenda: current.tentativeAgenda ?? "" }));
  }, [current?.id, current?.status]);
  useEffect(() => {
    if (liquidation) setLiquidationForm((value) => ({ ...value, liquidationDate: liquidation.liquidationDate ?? "", recoveredAmount: String(liquidation.recoveredAmount ?? ""), productsHandedOver: liquidation.productsHandedOver ?? "", notes: liquidation.notes ?? "" }));
    if (liquidation) setLiquidationFiles(liquidation.evidenceFileIds ?? []);
  }, [liquidation?.status, liquidation?.preparedAt]);

  const relevant = ["pending_acceptance", "accepted", "failed", "closed"].includes(project.status) || rounds.length > 0 || allowed("project.acceptance.submit");
  if (!relevant) return null;

  const totalScore = SCORE_FIELDS.reduce((sum, field) => sum + (Number(scores[field.key]) || 0), 0);
  const scoresComplete = SCORE_FIELDS.every((field) => scores[field.key] !== undefined && scores[field.key] !== "" && Number(scores[field.key]) >= 0 && Number(scores[field.key]) <= field.max);
  const finance = project.finance;
  const recovered = Number(liquidationForm.recoveredAmount) || 0;
  const outstanding = finance ? finance.totalDisbursed - finance.totalSettled - recovered : 0;

  return <>
    <SectionCard title="Nghiệm thu đề tài" subtitle={current ? `Vòng ${current.round}: ${current.statusLabel}` : "Chưa nộp hồ sơ nghiệm thu"}>
      {rounds.length ? <div className="project-list">{rounds.map((round) => <RoundSummary key={round.id} round={round} files={files} />)}</div> : <p>Khi mọi mốc đã hoàn thành (báo cáo mốc được chấp nhận), chủ nhiệm nộp hồ sơ nghiệm thu gồm báo cáo tổng kết và sản phẩm.</p>}

      {current?.evaluationResult ? <div className="button-row"><button className="button" type="button" onClick={() => exportAcceptanceMinutesWord({ id: project.proposalId, code: project.code ?? undefined, title: project.title, ownerDisplayName: project.members.find((member) => member.participationRole === "TOPIC_PI")?.name, hostOrganizationUnit: project.hostOrganizationUnit?.name }, { councilType: current.councilType ?? undefined, meetingDate: current.meetingDate ?? undefined, meetingLocation: current.meetingLocation ?? undefined, decisionNumber: current.decisionNumber ?? undefined, members: current.councilMembers, evaluationResult: current.evaluationResult ?? undefined })}>Xuất biên bản nghiệm thu (Word)</button></div> : null}

      {allowed("project.acceptance.submit") || allowed("project.acceptance.revision.submit") ? <div className="form-section-inline">
        <h3>{allowed("project.acceptance.submit") ? "Nộp hồ sơ nghiệm thu" : "Nộp bản hoàn thiện theo kết luận hội đồng"}</h3>
        <label className="field"><span>{allowed("project.acceptance.submit") ? "Tóm tắt báo cáo tổng kết" : "Nội dung đã hoàn thiện"}</span><textarea value={dossier.finalReportSummary} onChange={(event) => setDossier({ ...dossier, finalReportSummary: event.target.value })} /></label>
        {allowed("project.acceptance.submit") ? <><label className="field"><span>Sản phẩm khoa học, đào tạo</span><textarea value={dossier.products} onChange={(event) => setDossier({ ...dossier, products: event.target.value })} /></label><label className="field"><span>Tự đánh giá</span><textarea value={dossier.selfAssessment} onChange={(event) => setDossier({ ...dossier, selfAssessment: event.target.value })} /></label></> : null}
        <FilePicker files={files} purpose="acceptance_dossier" selected={dossierFiles} onChange={setDossierFiles} onUpload={(file) => void upload(file, "acceptance_dossier")} busy={busy} label="Tệp hồ sơ (báo cáo tổng kết, sản phẩm)" />
        <button className="button primary" disabled={busy || !dossier.finalReportSummary.trim() || !dossierFiles.length} onClick={async () => { const path = allowed("project.acceptance.submit") ? "acceptance/submit" : "acceptance/revision"; if (await run(path, { ...dossier, evidenceFileIds: dossierFiles }, "Nộp hồ sơ? Sau khi nộp, các tệp đã chọn bị khoá.")) { setDossier({ finalReportSummary: "", products: "", selfAssessment: "" }); setDossierFiles([]); } }}>Nộp hồ sơ</button>
      </div> : null}

      {allowed("project.acceptance.return") ? <div className="form-section-inline"><h3>Kiểm tra hồ sơ</h3><label className="field"><span>Lý do trả hồ sơ (nếu chưa đạt yêu cầu)</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label><button className="button" disabled={busy || !reason.trim()} onClick={async () => { if (await run("acceptance/return", { reason }, "Trả hồ sơ để chủ nhiệm hoàn thiện? Đề tài quay lại trạng thái đang thực hiện.")) setReason(""); }}>Trả hồ sơ</button></div> : null}

      {canPropose ? <div className="form-section-inline">
        <h3>{current?.status === "COUNCIL_PROPOSED" ? "Sửa đề xuất hội đồng" : "Đề xuất hội đồng nghiệm thu"}</h3>
        <p className="kpi-meta">3–15 thành viên: đúng một Chủ tịch, một Thư ký, ít nhất một Ủy viên phản biện. Chủ nhiệm và thành viên đề tài không được tham gia.</p>
        {council.map((row, index) => <div className="form-grid two" key={index}>
          <label className="field"><span>Vai trò</span><select value={row.role} onChange={(event) => setCouncil(council.map((item, at) => at === index ? { ...item, role: event.target.value as AcceptanceMemberRole } : item))}>{DEFAULT_ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select></label>
          <label className="field"><span>Nhà khoa học</span><select value={row.profileId} onChange={(event) => setCouncil(council.map((item, at) => at === index ? { ...item, profileId: event.target.value } : item))}><option value="">Chọn</option>{candidates.map((candidate) => <option key={candidate.profileId} value={candidate.profileId} disabled={candidate.isConflicted}>{candidate.academicTitle ? `${candidate.academicTitle} ` : ""}{candidate.fullName}{candidate.unit ? ` · ${candidate.unit}` : ""}{candidate.conflictReason ? ` — ${candidate.conflictReason}` : ""}</option>)}</select></label>
        </div>)}
        <div className="button-row"><button className="button" type="button" disabled={council.length >= 15} onClick={() => setCouncil([...council, { role: "MEMBER", profileId: "" }])}>Thêm thành viên</button><button className="button" type="button" disabled={council.length <= 3} onClick={() => setCouncil(council.slice(0, -1))}>Bớt dòng cuối</button></div>
        <div className="form-grid two">
          <label className="field"><span>Loại hội đồng</span><select value={meeting.councilType} onChange={(event) => setMeeting({ ...meeting, councilType: event.target.value })}><option value="OFFICIAL">Chính thức</option><option value="FACILITY">Cấp cơ sở</option></select></label>
          <label className="field"><span>Ngày họp dự kiến</span><input type="date" value={meeting.meetingDate} onChange={(event) => setMeeting({ ...meeting, meetingDate: event.target.value })} /></label>
          <label className="field"><span>Địa điểm</span><input value={meeting.meetingLocation} onChange={(event) => setMeeting({ ...meeting, meetingLocation: event.target.value })} /></label>
          <label className="field"><span>Chương trình dự kiến</span><textarea value={meeting.tentativeAgenda} onChange={(event) => setMeeting({ ...meeting, tentativeAgenda: event.target.value })} /></label>
        </div>
        <button className="button primary" disabled={busy || council.some((row) => !row.profileId)} onClick={() => void run("acceptance/council", { members: council, ...meeting }, "Gửi đề xuất hội đồng nghiệm thu lên lãnh đạo?")}>Gửi đề xuất hội đồng</button>
      </div> : null}

      {allowed("project.acceptance.council.establish") ? <div className="form-section-inline"><h3>Quyết định thành lập hội đồng</h3><div className="form-grid two"><label className="field"><span>Số quyết định (để trống để hệ thống cấp số)</span><input value={decision.decisionNumber} onChange={(event) => setDecision({ ...decision, decisionNumber: event.target.value })} /></label><label className="field"><span>Ngày quyết định</span><input type="date" value={decision.decisionDate} onChange={(event) => setDecision({ ...decision, decisionDate: event.target.value })} /></label></div><button className="button primary" disabled={busy} onClick={() => void run("acceptance/council/establish", decision, "Ký quyết định thành lập hội đồng nghiệm thu?")}>Thành lập hội đồng</button></div> : null}

      {allowed("project.acceptance.minutes.record") ? <div className="form-section-inline">
        <h3>Biên bản họp hội đồng</h3>
        <div className="form-grid two">{SCORE_FIELDS.map((field) => <label className="field" key={field.key}><span>{field.label} (0–{field.max})</span><input type="number" min={0} max={field.max} step={0.5} value={scores[field.key] ?? ""} onChange={(event) => setScores({ ...scores, [field.key]: event.target.value })} /></label>)}</div>
        <p className="kpi-meta">Tổng: {Math.round(totalScore * 10) / 10}/100 — {totalScore >= 90 ? "Xuất sắc" : totalScore >= 70 ? "Đạt" : "Không đạt"} (dưới 70 điểm chỉ được kết luận không đạt).</p>
        <div className="form-grid two">
          <label className="field"><span>Kết luận</span><select value={minutes.resolution} onChange={(event) => setMinutes({ ...minutes, resolution: event.target.value })}><option value="">Theo điểm</option><option value="approved" disabled={totalScore < 70}>Đạt</option><option value="revise" disabled={totalScore < 70}>Đạt, cần hoàn thiện</option><option value="rejected">Không đạt</option></select></label>
          <label className="field"><span>Ngày họp</span><input type="date" value={minutes.meetingDate} onChange={(event) => setMinutes({ ...minutes, meetingDate: event.target.value })} /></label>
          <label className="field"><span>Địa điểm</span><input value={minutes.meetingLocation} onChange={(event) => setMinutes({ ...minutes, meetingLocation: event.target.value })} /></label>
        </div>
        <label className="field"><span>Nhận xét của hội đồng</span><textarea value={minutes.assessmentComments} onChange={(event) => setMinutes({ ...minutes, assessmentComments: event.target.value })} /></label>
        <label className="field"><span>Ghi chú biên bản</span><textarea value={minutes.minutesNotes} onChange={(event) => setMinutes({ ...minutes, minutesNotes: event.target.value })} /></label>
        <button className="button primary" disabled={busy || !scoresComplete} onClick={() => void run("acceptance/minutes", { ...Object.fromEntries(SCORE_FIELDS.map((field) => [field.key, Number(scores[field.key])])), ...minutes }, "Ghi biên bản? Kết quả nghiệm thu không sửa được sau khi ghi.")}>Ghi biên bản và kết luận</button>
      </div> : null}

      {allowed("project.acceptance.revision.confirm") ? <div className="form-section-inline"><h3>Xác nhận bản hoàn thiện</h3><label className="field"><span>Ý kiến (bắt buộc khi yêu cầu hoàn thiện tiếp)</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label><div className="button-row"><button className="button primary" disabled={busy} onClick={() => void run("acceptance/revision/confirm", { outcome: "accept", note: reason }, "Xác nhận bản hoàn thiện đạt yêu cầu? Đề tài sẽ được ghi nhận đã nghiệm thu.")}>Xác nhận đạt</button><button className="button" disabled={busy || !reason.trim()} onClick={() => void run("acceptance/revision/confirm", { outcome: "return", note: reason }, "Yêu cầu chủ nhiệm hoàn thiện tiếp?")}>Yêu cầu hoàn thiện tiếp</button></div></div> : null}
    </SectionCard>

    {["accepted", "failed", "closed"].includes(project.status) || liquidation ? <SectionCard title="Thanh lý đề tài" subtitle={liquidation ? (liquidation.status === "APPROVED" ? `Đã phê duyệt — biên bản số ${liquidation.liquidationNumber}` : "Dự thảo chờ lãnh đạo phê duyệt") : "Chưa lập biên bản thanh lý"}>
      {finance ? <p>Kinh phí được duyệt {money(finance.totalBudget)} · đã giải ngân {money(finance.totalDisbursed)} · đã quyết toán {money(finance.totalSettled)}.</p> : <p>Chưa có dữ liệu kinh phí; nếu đề tài đã được cấp kinh phí, cập nhật mục Kinh phí và giải ngân trước khi thanh lý.</p>}
      {liquidation ? <article className="list-card"><p>Kết quả nghiệm thu: {liquidation.outcome === "accepted" ? "Đạt" : "Không đạt"} · Ngày thanh lý: {date(liquidation.liquidationDate)}</p><p>Thu hồi: {money(liquidation.recoveredAmount)} · Chênh lệch còn lại: {money(liquidation.outstanding)}</p>{liquidation.productsHandedOver ? <p>Sản phẩm bàn giao: {liquidation.productsHandedOver}</p> : null}{liquidation.notes ? <p>Ghi chú: {liquidation.notes}</p> : null}<FileLinks ids={liquidation.evidenceFileIds} files={files} /><p className="kpi-meta">Lập bởi {liquidation.preparedBy ?? "—"}{liquidation.approvedBy ? ` · phê duyệt bởi ${liquidation.approvedBy} (${date(liquidation.approvedAt)})` : ""}</p></article> : null}

      {allowed("project.liquidation.prepare") ? <div className="form-section-inline">
        <h3>{liquidation ? "Cập nhật dự thảo thanh lý" : "Lập biên bản thanh lý"}</h3>
        <div className="form-grid two">
          <label className="field"><span>Ngày thanh lý</span><input type="date" value={liquidationForm.liquidationDate} onChange={(event) => setLiquidationForm({ ...liquidationForm, liquidationDate: event.target.value })} /></label>
          <label className="field"><span>Số tiền thu hồi (đồng)</span><input type="number" min={0} value={liquidationForm.recoveredAmount} onChange={(event) => setLiquidationForm({ ...liquidationForm, recoveredAmount: event.target.value })} /></label>
        </div>
        {finance ? <p className={outstanding === 0 ? "kpi-meta" : "form-error"}>Đã giải ngân − đã quyết toán − thu hồi = {money(outstanding)}{outstanding === 0 ? " (đã cân đối)" : " — phải bằng 0 thì lãnh đạo mới phê duyệt được."}</p> : null}
        <label className="field"><span>Sản phẩm bàn giao</span><textarea value={liquidationForm.productsHandedOver} onChange={(event) => setLiquidationForm({ ...liquidationForm, productsHandedOver: event.target.value })} /></label>
        <label className="field"><span>Ghi chú</span><textarea value={liquidationForm.notes} onChange={(event) => setLiquidationForm({ ...liquidationForm, notes: event.target.value })} /></label>
        <FilePicker files={files} purpose="liquidation_record" selected={liquidationFiles} onChange={setLiquidationFiles} onUpload={(file) => void upload(file, "liquidation_record")} busy={busy} label="Biên bản thanh lý, tài liệu kèm theo" />
        <button className="button primary" disabled={busy} onClick={() => void run("liquidation", { liquidationDate: liquidationForm.liquidationDate, recoveredAmount: liquidationForm.recoveredAmount || 0, productsHandedOver: liquidationForm.productsHandedOver, notes: liquidationForm.notes, evidenceFileIds: liquidationFiles })}>Lưu dự thảo thanh lý</button>
      </div> : null}

      {allowed("project.liquidation.approve") ? <div className="form-section-inline"><h3>Phê duyệt thanh lý</h3><label className="field"><span>Số biên bản (để trống để hệ thống cấp số)</span><input value={liquidationForm.liquidationNumber} onChange={(event) => setLiquidationForm({ ...liquidationForm, liquidationNumber: event.target.value })} /></label><button className="button primary" disabled={busy} onClick={() => void run("liquidation/approve", { liquidationNumber: liquidationForm.liquidationNumber }, "Phê duyệt biên bản thanh lý? Sau khi phê duyệt, kinh phí đề tài bị khoá.")}>Phê duyệt thanh lý</button></div> : null}
    </SectionCard> : null}

    {["accepted", "failed", "closed"].includes(project.status) ? <SectionCard title="Đóng đề tài" subtitle={project.status === "closed" ? `Đã đóng ngày ${date(project.closedAt)}` : "Đóng hồ sơ sau khi thanh lý được phê duyệt"}>
      {project.closureNote ? <p>{project.closureNote}</p> : null}
      {project.status !== "closed" ? <><label className="field"><span>Ghi chú đóng đề tài</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label><button className="button primary" disabled={busy || !allowed("project.close")} title={allowed("project.close") ? undefined : projectDenial(project, "project.close")} onClick={() => void run("close", { note: reason }, "Đóng đề tài? Sau khi đóng, đề tài chỉ còn xem.")}>Đóng đề tài</button></> : null}
    </SectionCard> : null}
  </>;
}
