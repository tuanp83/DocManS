import { useEffect, useState } from "react";
import { ProposalDeliverable, getProposalDeliverables, createProposalDeliverable } from "@/lib/research-proposals-api";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { FileText, PlusCircle } from "lucide-react";

interface ProposalDeliverablesPanelProps {
  proposalId: string;
}

export function ProposalDeliverablesPanel({ proposalId }: ProposalDeliverablesPanelProps) {
  const [deliverables, setDeliverables] = useState<ProposalDeliverable[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newType, setNewType] = useState("Bài báo khoa học");
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");

  useEffect(() => {
    getProposalDeliverables(proposalId).then(setDeliverables).catch(console.error);
  }, [proposalId]);

  const handleAdd = async () => {
    if (!newTitle) return;
    try {
      const added = await createProposalDeliverable(proposalId, {
        type: newType,
        title: newTitle,
        description: newDesc,
        publishedAt: new Date().toISOString()
      });
      setDeliverables([added, ...deliverables]);
      setIsAdding(false);
      setNewTitle("");
      setNewDesc("");
    } catch (err) {
      console.error(err);
      alert("Lỗi khi khai báo sản phẩm");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0 }}>Sản phẩm đầu ra của đề tài</h3>
        <button type="button" className="button" onClick={() => setIsAdding(!isAdding)}>
          <PlusCircle size={16} style={{ marginRight: 8 }} />
          Khai báo sản phẩm mới
        </button>
      </div>

      {isAdding && (
        <SectionCard title="Khai báo sản phẩm mới" subtitle="Nhập thông tin sản phẩm khoa học/công nghệ">
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>Loại sản phẩm</label>
              <select 
                value={newType} 
                onChange={e => setNewType(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 6 }}
              >
                <option value="Bài báo khoa học">Bài báo khoa học (Tạp chí/Hội nghị)</option>
                <option value="Bằng sáng chế">Bằng sáng chế / Giải pháp hữu ích</option>
                <option value="Sản phẩm công nghệ">Sản phẩm công nghệ (Phần mềm, Mô hình)</option>
                <option value="Sách chuyên khảo">Sách chuyên khảo / Giáo trình</option>
              </select>
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>Tên sản phẩm *</label>
              <input 
                type="text" 
                value={newTitle} 
                onChange={e => setNewTitle(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 6 }}
                placeholder="VD: Bài báo nghiên cứu ứng dụng AI..."
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>Mô tả / Nơi công bố</label>
              <textarea 
                value={newDesc} 
                onChange={e => setNewDesc(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 6, minHeight: 80 }}
                placeholder="VD: Tạp chí Y dược lâm sàng 108..."
              />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
              <button type="button" className="button" onClick={() => setIsAdding(false)}>Hủy</button>
              <button type="button" className="button primary" onClick={handleAdd}>Lưu khai báo</button>
            </div>
          </div>
        </SectionCard>
      )}

      {deliverables.length === 0 && !isAdding && (
        <div style={{ padding: 32, textAlign: "center", color: "#64748b", background: "#f8fafc", borderRadius: 8 }}>
          Đề tài này chưa có khai báo sản phẩm đầu ra nào.
        </div>
      )}

      {deliverables.map(d => (
        <div key={d.id} style={{ padding: 16, border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff", display: "flex", gap: 16 }}>
          <div style={{ padding: 12, background: "#f1f5f9", borderRadius: 8, height: "fit-content" }}>
            <FileText size={24} color="#64748b" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <h4 style={{ margin: "0 0 4px 0", fontSize: "1rem", color: "#0f172a" }}>{d.title}</h4>
              <StatusBadge status={d.status} />
            </div>
            <div style={{ fontSize: "0.875rem", color: "#64748b", marginBottom: 8 }}>
              <span style={{ fontWeight: 500, color: "#334155" }}>{d.type}</span> • Khai báo ngày {new Date(d.createdAt).toLocaleDateString("vi-VN")}
            </div>
            {d.description && (
              <p style={{ fontSize: "0.875rem", color: "#475569", margin: 0, padding: "8px 12px", background: "#f8fafc", borderRadius: 6 }}>
                {d.description}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
