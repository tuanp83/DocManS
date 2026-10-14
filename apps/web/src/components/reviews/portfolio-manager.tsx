"use client";

import { useEffect, useState } from "react";
import { Plus, RefreshCw, X } from "lucide-react";
import { SectionCard } from "@/components/ui/section-card";
import { autoAssignUnassigned, loadPortfolios, savePortfolio, type PortfolioList, type PortfolioRule } from "@/lib/evaluation-coordination-api";

/**
 * Trưởng phòng giao mảng cho từng chuyên viên: mỗi mảng là cấp đề tài, tính chất (Quân sự / Dân sự), hoặc tổ hợp
 * cả hai. Hồ sơ nộp vào được tự giao cho chuyên viên có mảng khớp; hồ sơ chưa có người phụ trách giao bù bằng nút
 * bên dưới. Máy chủ kiểm tra lại quyền Trưởng phòng và danh mục.
 */
export function PortfolioManager({ onAssigned }: { onAssigned: () => void }) {
  const [data, setData] = useState<PortfolioList | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [savingId, setSavingId] = useState("");
  const [draft, setDraft] = useState<Record<string, { proposalLevel: string; militaryScope: string }>>({});
  const [assigning, setAssigning] = useState(false);

  async function load() {
    try {
      setData(await loadPortfolios());
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không tải được danh sách chuyên viên.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(officerUserId: string, rules: PortfolioRule[]) {
    setSavingId(officerUserId);
    setError("");
    setMessage("");
    try {
      setData(await savePortfolio(officerUserId, rules));
      setDraft((current) => ({ ...current, [officerUserId]: { proposalLevel: "", militaryScope: "" } }));
      setMessage("Đã cập nhật mảng phụ trách. Hồ sơ nộp từ nay được tự giao theo mảng mới.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không lưu được mảng phụ trách.");
    } finally {
      setSavingId("");
    }
  }

  async function assignUnassigned() {
    setAssigning(true);
    setError("");
    setMessage("");
    try {
      const result = await autoAssignUnassigned();
      setMessage(`Đã giao ${result.assigned} hồ sơ theo mảng.${result.unmatched ? ` ${result.unmatched} hồ sơ không khớp mảng nào — giao tay ở bảng tổng quan.` : ""}`);
      await load();
      onAssigned();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không giao được hồ sơ.");
    } finally {
      setAssigning(false);
    }
  }

  if (!data) {
    return <p className={error ? "state-message error" : "state-message"}>{error || "Đang tải danh sách chuyên viên..."}</p>;
  }

  return (
    <SectionCard
      title="Mảng phụ trách của chuyên viên"
      subtitle="Mỗi chuyên viên phụ trách một hoặc nhiều mảng: theo cấp đề tài, theo tính chất (Quân sự / Dân sự), hoặc tổ hợp cả hai."
      action={
        <button type="button" className="button primary" disabled={assigning} onClick={() => void assignUnassigned()} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <RefreshCw size={14} aria-hidden="true" />
          {assigning ? "Đang giao..." : "Giao các hồ sơ chưa có người phụ trách"}
        </button>
      }
    >
      {error ? <p className="state-message error">{error}</p> : null}
      {message ? <p className="state-message success" role="status">{message}</p> : null}
      {data.officers.length === 0 ? (
        <p className="state-message">Chưa có chuyên viên quản lý khoa học trong phạm vi đơn vị của đồng chí.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Chuyên viên</th>
                <th>Đang phụ trách</th>
                <th style={{ minWidth: "260px" }}>Mảng phụ trách</th>
                <th style={{ minWidth: "340px" }}>Thêm mảng</th>
              </tr>
            </thead>
            <tbody>
              {data.officers.map((officer) => {
                const pending = draft[officer.id] ?? { proposalLevel: "", militaryScope: "" };
                const busy = savingId === officer.id;
                return (
                  <tr key={officer.id}>
                    <td>
                      <span className="record-title">{officer.displayName}</span>
                      <span className="record-meta">{officer.username}{officer.unit ? ` · ${officer.unit}` : ""}</span>
                    </td>
                    <td>{officer.activeProposalCount} hồ sơ</td>
                    <td>
                      {officer.rules.length === 0 ? (
                        <span className="record-meta">Chưa giao mảng</span>
                      ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                          {officer.rules.map((rule) => (
                            <span key={rule.id} style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "#ecfdf5", color: "#065f46", borderRadius: "12px", padding: "3px 4px 3px 10px", fontSize: "12px", fontWeight: 600 }}>
                              {rule.label}
                              <button
                                type="button"
                                aria-label={`Bỏ mảng ${rule.label} của ${officer.displayName}`}
                                disabled={busy}
                                onClick={() => void save(officer.id, officer.rules.filter((item) => item.id !== rule.id))}
                                style={{ border: "none", background: "transparent", cursor: "pointer", color: "#065f46", display: "inline-flex", padding: "2px" }}
                              >
                                <X size={12} aria-hidden="true" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                        <select aria-label="Cấp đề tài" style={{ padding: "6px 10px", fontSize: "13px", borderRadius: "6px", border: "1px solid #cbd5e1" }} value={pending.proposalLevel} disabled={busy} onChange={(event) => setDraft({ ...draft, [officer.id]: { ...pending, proposalLevel: event.target.value } })}>
                          <option value="">Mọi cấp</option>
                          {data.levels.map((level) => (
                            <option key={level.code} value={level.code}>{level.name}</option>
                          ))}
                        </select>
                        <select aria-label="Tính chất" style={{ padding: "6px 10px", fontSize: "13px", borderRadius: "6px", border: "1px solid #cbd5e1" }} value={pending.militaryScope} disabled={busy} onChange={(event) => setDraft({ ...draft, [officer.id]: { ...pending, militaryScope: event.target.value } })}>
                          <option value="">Mọi tính chất</option>
                          {data.militaryScopes.map((scope) => (
                            <option key={scope.code} value={scope.code}>{scope.name}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="button"
                          disabled={busy || (!pending.proposalLevel && !pending.militaryScope)}
                          title={!pending.proposalLevel && !pending.militaryScope ? "Chọn cấp đề tài, tính chất, hoặc cả hai" : undefined}
                          onClick={() => void save(officer.id, [...officer.rules, { proposalLevel: pending.proposalLevel || null, militaryScope: pending.militaryScope || null }])}
                          style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
                        >
                          <Plus size={14} aria-hidden="true" /> Thêm
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
