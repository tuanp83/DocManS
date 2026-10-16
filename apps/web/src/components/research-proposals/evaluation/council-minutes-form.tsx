"use client";

import type { ViewerAuthorizationV1 } from "@rtms/permissions";
import { useEffect, useState } from "react";
import { Award, FileDown } from "lucide-react";
import { intakeDateToIso } from "@/lib/intake-dates";
import { recordProposalCouncilMinutes, type CouncilMetadata, type ResearchProposal } from "@/lib/research-proposals-api";
import { exportCouncilMinutesWord } from "@/lib/word-export";
import { formatDate } from "./evaluation-format";

export type MinutesConclusion = "approved" | "revision_required" | "rejected";

/** Kết luận của Hội đồng, dùng để điền sẵn phần tổng hợp kết quả đánh giá. */
export type MinutesOutcome = { conclusion: MinutesConclusion; averageScore: number; comments: string };

/** Giai đoạn 2: ghi nhận biên bản và kết luận phiên họp Hội đồng. */
export function CouncilMinutesForm({
  proposalId,
  proposal,
  council,
  contextVersion,
  onRecorded
}: {
  proposalId: string;
  proposal: ResearchProposal | null;
  council: CouncilMetadata | null | undefined;
  contextVersion?: ViewerAuthorizationV1["contextVersion"];
  /** Gọi sau khi ghi nhận thành công: trang cha điền sẵn tổng hợp, tải lại dữ liệu và báo cho trang cha của panel. */
  onRecorded: (outcome: MinutesOutcome) => Promise<void>;
}) {
  const [minutesConductedAt, setMinutesConductedAt] = useState("");
  const [minutesConclusion, setMinutesConclusion] = useState<MinutesConclusion>("approved");
  const [minutesAverageScore, setMinutesAverageScore] = useState<number>(0);
  const [minutesComments, setMinutesComments] = useState("");
  const [minutesModifications, setMinutesModifications] = useState("");
  const [isSavingMinutes, setIsSavingMinutes] = useState(false);
  const [minutesError, setMinutesError] = useState("");
  const [minutesSuccess, setMinutesSuccess] = useState("");

  const savedMinutes = council?.councilMinutes;
  useEffect(() => {
    if (!savedMinutes) return;
    setMinutesConductedAt(savedMinutes.meetingConductedAt ? savedMinutes.meetingConductedAt.split("T")[0] : "");
    setMinutesConclusion(savedMinutes.conclusion || "approved");
    setMinutesAverageScore(savedMinutes.averageScore ?? 0);
    setMinutesComments(savedMinutes.summaryComments || "");
    setMinutesModifications(savedMinutes.modificationsRequired || "");
  }, [savedMinutes]);

  async function handleSaveMinutes(e: React.FormEvent) {
    e.preventDefault();
    setMinutesError("");
    setMinutesSuccess("");
    setIsSavingMinutes(true);
    try {
      await recordProposalCouncilMinutes(proposalId, {
        meetingConductedAt: minutesConductedAt ? intakeDateToIso(minutesConductedAt) : undefined,
        conclusion: minutesConclusion,
        averageScore: Number(minutesAverageScore) || 0,
        summaryComments: minutesComments,
        modificationsRequired: minutesModifications,
        contextVersion
      });
      setMinutesSuccess("Đã ghi nhận Biên bản & Kết luận phiên họp Hội đồng thành công!");
      await onRecorded({ conclusion: minutesConclusion, averageScore: minutesAverageScore, comments: minutesComments });
    } catch (err) {
      setMinutesError(err instanceof Error ? err.message : "Không thể lưu biên bản Hội đồng.");
    } finally {
      setIsSavingMinutes(false);
    }
  }

  return (
            <div
              style={{
                marginTop: "12px",
                border: "1px solid #cbd5e1",
                borderRadius: "8px",
                padding: "16px",
                background: "#f8fafc"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <Award size={18} color="#15803d" />
                <h4 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#0f172a" }}>
                  Giai đoạn 2: Biên bản & Kết luận phiên họp Hội đồng
                </h4>
              </div>

              {council?.councilMinutes ? (
                <div style={{ background: "#ffffff", padding: "14px", borderRadius: "6px", border: "1px solid #e2e8f0", marginBottom: "14px", fontSize: "13px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontWeight: 700, color: "#166534", fontSize: "14px" }}>
                        Kết luận: {council.councilMinutes.conclusionLabel}
                      </span>
                      <button
                        type="button"
                        className="button secondary"
                        style={{ padding: "2px 8px", fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "4px" }}
                        onClick={() => proposal && exportCouncilMinutesWord(proposal)}
                        title="Tải Biên bản họp Hội đồng dưới dạng file Word (.docx)"
                      >
                        <FileDown size={13} /> Lưu Biên bản (Word)
                      </button>
                    </div>
                    <span style={{ fontWeight: 700, background: "#dcfce7", color: "#166534", padding: "2px 8px", borderRadius: "10px" }}>
                      Điểm trung bình: {council.councilMinutes.averageScore}/100
                    </span>
                  </div>
                  <p style={{ margin: "4px 0", color: "#334155" }}>
                    <strong>Nhận xét chung:</strong> {council.councilMinutes.summaryComments || "Chưa có"}
                  </p>
                  {council.councilMinutes.modificationsRequired && (
                    <p style={{ margin: "4px 0", color: "#92400e" }}>
                      <strong>Yêu cầu chỉnh sửa:</strong> {council.councilMinutes.modificationsRequired}
                    </p>
                  )}
                  <p style={{ margin: "6px 0 0 0", fontSize: "12px", color: "#64748b" }}>
                    Biên bản ghi nhận bởi: <strong>{council.councilMinutes.recordedByName}</strong> lúc{" "}
                    {council.councilMinutes.recordedAt ? formatDate(council.councilMinutes.recordedAt) : "—"}
                  </p>
                </div>
              ) : null}

              {/* Form cập nhật biên bản họp */}
              <form onSubmit={handleSaveMinutes} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#475569" }}>
                  Ghi nhận / Cập nhật nội dung phiên họp Hội đồng:
                </span>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
                  <label className="field" style={{ margin: 0 }}>
                    <span style={{ fontSize: "12px" }}>Ngày họp thực tế:</span>
                    <input
                      type="date"
                      value={minutesConductedAt}
                      onChange={(e) => setMinutesConductedAt(e.target.value)}
                      style={{ padding: "6px 10px", fontSize: "13px" }}
                    />
                  </label>
                  <label className="field" style={{ margin: 0 }}>
                    <span style={{ fontSize: "12px" }}>Kết luận Hội đồng:</span>
                    <select
                      value={minutesConclusion}
                      onChange={(e) => setMinutesConclusion(e.target.value as MinutesConclusion)}
                      style={{ padding: "6px 10px", fontSize: "13px" }}
                    >
                      <option value="approved">Đạt yêu cầu (Đề nghị phê duyệt)</option>
                      <option value="revision_required">Đạt nhưng cần chỉnh sửa bổ sung</option>
                      <option value="rejected">Không đạt yêu cầu</option>
                    </select>
                  </label>
                  <label className="field" style={{ margin: 0 }}>
                    <span style={{ fontSize: "12px" }}>Điểm TB của Hội đồng (/100):</span>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="100"
                      value={minutesAverageScore}
                      onChange={(e) => setMinutesAverageScore(Number(e.target.value))}
                      style={{ padding: "6px 10px", fontSize: "13px" }}
                    />
                  </label>
                </div>

                <label className="field" style={{ margin: 0 }}>
                  <span style={{ fontSize: "12px" }}>Nhận xét, đánh giá chung của Hội đồng:</span>
                  <textarea
                    rows={2}
                    value={minutesComments}
                    onChange={(e) => setMinutesComments(e.target.value)}
                    placeholder="Tóm tắt nhận xét về tính cấp thiết, tính khả thi, phương pháp nghiên cứu..."
                    style={{ padding: "6px 10px", fontSize: "13px" }}
                  />
                </label>

                <label className="field" style={{ margin: 0 }}>
                  <span style={{ fontSize: "12px" }}>Nội dung yêu cầu Chủ nhiệm chỉnh sửa, bổ sung (nếu có):</span>
                  <textarea
                    rows={2}
                    value={minutesModifications}
                    onChange={(e) => setMinutesModifications(e.target.value)}
                    placeholder="Các nội dung cần chỉnh sửa theo biên bản họp..."
                    style={{ padding: "6px 10px", fontSize: "13px" }}
                  />
                </label>

                {minutesError && <p className="form-error">{minutesError}</p>}
                {minutesSuccess && <p className="state-message success">{minutesSuccess}</p>}

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                  <button
                    type="button"
                    className="button secondary"
                    style={{ fontSize: "13px", display: "inline-flex", alignItems: "center", gap: "6px" }}
                    onClick={() => {
                      if (!proposal) return;
                      const draftProposal = {
                        ...proposal,
                        councilMetadata: {
                          ...proposal.councilMetadata,
                          councilMinutes: {
                            meetingDate: minutesConductedAt || new Date().toISOString(),
                            averageScore: minutesAverageScore,
                            conclusion: minutesConclusion,
                            conclusionLabel: minutesConclusion === "approved" ? "Đạt yêu cầu (Đề nghị phê duyệt)" : minutesConclusion === "revision_required" ? "Đạt nhưng cần chỉnh sửa" : "Không đạt yêu cầu",
                            summaryComments: minutesComments,
                            modificationsRequired: minutesModifications
                          }
                        }
                      };
                      exportCouncilMinutesWord(draftProposal);
                    }}
                    title="Tải biên bản họp theo nội dung đang soạn thảo (.docx)"
                  >
                    <FileDown size={14} /> Xuất dự thảo Biên bản (Word)
                  </button>
                  <button
                    type="submit"
                    className="button"
                    style={{ background: "#15803d", color: "#ffffff", borderColor: "#15803d", fontSize: "13px" }}
                    disabled={isSavingMinutes}
                  >
                    {isSavingMinutes ? "Đang lưu..." : "Lưu Biên bản & Kết luận Hội đồng"}
                  </button>
                </div>
              </form>
            </div>
  );
}
