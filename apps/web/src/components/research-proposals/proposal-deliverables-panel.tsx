import { useCallback, useEffect, useState } from "react";
import {
  DELIVERABLE_TYPES,
  createProposalDeliverable,
  deleteProposalDeliverable,
  getProposalDeliverables,
  updateProposalDeliverable,
  type ProposalDeliverable
} from "@/lib/research-proposals-api";
import { SectionCard } from "@/components/ui/section-card";
import { FileText, Pencil, PlusCircle, Trash2 } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";

interface ProposalDeliverablesPanelProps {
  proposalId: string;
}

type Draft = { id: string | null; type: string; title: string; description: string };

const EMPTY_DRAFT: Draft = { id: null, type: DELIVERABLE_TYPES[0], title: "", description: "" };

/**
 * Sản phẩm dự kiến chủ nhiệm cam kết trong hồ sơ đề xuất. Chủ nhiệm/thư ký sửa được khi hồ sơ còn nháp hoặc
 * đang bổ sung; sản phẩm hoàn thành và nghiệm thu từng sản phẩm được quản lý trong đề tài sau khi hồ sơ được duyệt.
 */
export function ProposalDeliverablesPanel({ proposalId }: ProposalDeliverablesPanelProps) {
  const confirm = useConfirm();
  const [deliverables, setDeliverables] = useState<ProposalDeliverable[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setState("loading");
    try {
      const result = await getProposalDeliverables(proposalId);
      setDeliverables(result.deliverables);
      setCanEdit(result.canEdit);
      setState("ready");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Không tải được sản phẩm dự kiến.");
      setState("error");
    }
  }, [proposalId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function save() {
    if (!draft) return;
    if (!draft.title.trim()) {
      setFormError("Vui lòng nhập tên sản phẩm.");
      return;
    }
    setBusy(true);
    setFormError("");
    const input = { type: draft.type, title: draft.title.trim(), description: draft.description.trim() || null };
    try {
      if (draft.id) await updateProposalDeliverable(proposalId, draft.id, input);
      else await createProposalDeliverable(proposalId, input);
      setDraft(null);
      await refresh();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Không lưu được sản phẩm dự kiến.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: ProposalDeliverable) {
    if (!(await confirm(`Xoá sản phẩm dự kiến "${item.title}"?`, { confirmLabel: "Xoá", tone: "danger" }))) return;
    setBusy(true);
    setFormError("");
    try {
      await deleteProposalDeliverable(proposalId, item.id);
      await refresh();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Không xoá được sản phẩm dự kiến.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <h3 style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0 }}>Sản phẩm dự kiến</h3>
          <p style={{ margin: "4px 0 0", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
            Sản phẩm chủ nhiệm cam kết khi đề xuất. Sản phẩm hoàn thành và nghiệm thu từng sản phẩm được quản lý trong đề tài sau khi hồ sơ được duyệt.
          </p>
        </div>
        {canEdit && !draft ? (
          <button type="button" className="button" onClick={() => { setFormError(""); setDraft({ ...EMPTY_DRAFT }); }}>
            <PlusCircle size={16} style={{ marginRight: 8 }} aria-hidden="true" />
            Thêm sản phẩm dự kiến
          </button>
        ) : null}
      </div>

      {draft ? (
        <SectionCard title={draft.id ? "Sửa sản phẩm dự kiến" : "Thêm sản phẩm dự kiến"} subtitle="Loại, tên và mô tả sản phẩm cam kết">
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
            <label className="field">
              <span>Loại sản phẩm</span>
              <select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })}>
                {DELIVERABLE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Tên sản phẩm *</span>
              <input type="text" maxLength={300} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="VD: 02 bài báo trên tạp chí trong nước" />
            </label>
            <label className="field">
              <span>Mô tả, yêu cầu khoa học</span>
              <textarea maxLength={2000} rows={3} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="VD: Tạp chí Y dược lâm sàng 108 hoặc tương đương" />
            </label>
            {formError ? <p className="form-error">{formError}</p> : null}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="button" onClick={() => setDraft(null)} disabled={busy}>Huỷ</button>
              <button type="button" className="button primary" onClick={() => void save()} disabled={busy}>{busy ? "Đang lưu…" : "Lưu"}</button>
            </div>
          </div>
        </SectionCard>
      ) : null}

      {!draft && formError ? <p className="form-error">{formError}</p> : null}
      {state === "loading" ? <p className="state-message">Đang tải sản phẩm dự kiến…</p> : null}
      {state === "error" ? <p className="state-message error">{loadError}</p> : null}
      {state === "ready" && deliverables.length === 0 && !draft ? (
        <p className="state-message">Hồ sơ chưa khai báo sản phẩm dự kiến.</p>
      ) : null}

      {deliverables.map((item) => (
        <div key={item.id} style={{ padding: 16, border: "1px solid var(--border, #e2e8f0)", borderRadius: 8, display: "flex", gap: 16 }}>
          <FileText size={22} aria-hidden="true" style={{ flexShrink: 0, color: "var(--text-secondary)" }} />
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <h4 style={{ margin: "0 0 4px 0", fontSize: "1rem" }}>{item.title}</h4>
              {canEdit ? (
                <div style={{ display: "flex", gap: 4 }}>
                  <button type="button" className="button" disabled={busy} aria-label={`Sửa ${item.title}`} onClick={() => { setFormError(""); setDraft({ id: item.id, type: item.type, title: item.title, description: item.description ?? "" }); }}>
                    <Pencil size={14} aria-hidden="true" />
                  </button>
                  <button type="button" className="button" disabled={busy} aria-label={`Xoá ${item.title}`} onClick={() => void remove(item)}>
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>
              ) : null}
            </div>
            <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>{item.type}</div>
            {item.description ? <p style={{ fontSize: "0.875rem", margin: "8px 0 0" }}>{item.description}</p> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
