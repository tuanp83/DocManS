"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, Download, Edit2, FileCode, FileText, Plus, Scale, ScrollText, Trash2, Upload } from "lucide-react";
import { useSession } from "@/components/auth/session-provider";
import { ModalDialog } from "@/components/ui/modal-dialog";
import {
  createScientificDocument,
  deleteScientificDocument,
  getScientificDocumentDownloadUrl,
  listScientificDocuments,
  updateScientificDocument,
  type ScientificDocument
} from "@/lib/scientific-documents-api";
import { useConfirm } from "@/components/ui/confirm-dialog";

export type SubCategoryKey =
  | "LAW_REGULATION"
  | "INTERNAL_REGULATION"
  | "DOCUMENT_TEMPLATE"
  | "GUIDELINE";

export type SubCategoryDefinition = {
  key: SubCategoryKey;
  label: string;
  shortLabel: string;
  subLabel: string;
  description: string;
  icon: typeof FileText;
};

export const SUB_CATEGORIES: Record<SubCategoryKey, SubCategoryDefinition> = {
  LAW_REGULATION: {
    key: "LAW_REGULATION",
    label: "1. Văn bản quy phạm pháp luật",
    shortLabel: "1. Văn bản QPPL",
    subLabel: "Luật, Nghị định, Thông tư",
    description: "Các văn bản Luật, Nghị định Chính phủ, Thông tư của Bộ KH&CN và các Bộ ngành liên quan.",
    icon: Scale
  },
  INTERNAL_REGULATION: {
    key: "INTERNAL_REGULATION",
    label: "2. Quy chế & Quy định quản lý KH&CN",
    shortLabel: "2. Quy chế & Quy định",
    subLabel: "Quy chế nội bộ Học viện",
    description: "Quy chế Quản lý hoạt động NCKH&CN, quy định chi tiêu và phân bổ kinh phí của Học viện.",
    icon: BookOpen
  },
  DOCUMENT_TEMPLATE: {
    key: "DOCUMENT_TEMPLATE",
    label: "3. Mẫu văn bản",
    shortLabel: "3. Mẫu văn bản",
    subLabel: "Thuyết minh, Đánh giá, Nghiệm thu",
    description: "Hệ thống biểu mẫu văn bản phục vụ đăng ký, thuyết minh đề tài, dự toán kinh phí, lý lịch khoa học và phiếu đánh giá, biên bản nghiệm thu (BM-01, BM-02, BM-04, BM-06...).",
    icon: ScrollText
  },
  GUIDELINE: {
    key: "GUIDELINE",
    label: "4. Hướng dẫn & Quy trình nghiệp vụ",
    shortLabel: "4. Hướng dẫn nghiệp vụ",
    subLabel: "Quy trình nộp & thanh toán",
    description: "Sổ tay hướng dẫn quy trình đăng ký, nộp hồ sơ trực tuyến, quy trình giải ngân và thanh quyết toán.",
    icon: FileCode
  }
};

const CATEGORY_KEYS: SubCategoryKey[] = [
  "LAW_REGULATION",
  "INTERNAL_REGULATION",
  "DOCUMENT_TEMPLATE",
  "GUIDELINE"
];

function normalizeCategoryKey(category: string): SubCategoryKey {
  if (category === "LEGAL_DOCUMENT") return "LAW_REGULATION";
  if (
    category === "DOCUMENT_TEMPLATE" ||
    category === "FORM_TEMPLATE" ||
    category === "PROPOSAL_TEMPLATE" ||
    category === "EVALUATION_TEMPLATE"
  ) {
    return "DOCUMENT_TEMPLATE";
  }
  if (category in SUB_CATEGORIES) return category as SubCategoryKey;
  return "LAW_REGULATION";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateString?: string | null): string {
  if (!dateString) return "—";
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString("vi-VN");
  } catch {
    return dateString;
  }
}

function getFileExtensionBadge(fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  if (ext === "pdf") return { label: "PDF", tone: "pdf" };
  if (ext === "docx" || ext === "doc") return { label: "WORD", tone: "word" };
  if (ext === "xlsx" || ext === "xls") return { label: "EXCEL", tone: "excel" };
  return { label: ext.toUpperCase() || "FILE", tone: "" };
}

export function ScientificDocumentsPanel() {
  const confirm = useConfirm();
  const { account } = useSession();
  const [documents, setDocuments] = useState<ScientificDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [focusedCategory, setFocusedCategory] = useState<SubCategoryKey | "ALL">("ALL");
  const [searchKeyword, setSearchKeyword] = useState("");

  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<ScientificDocument | null>(null);
  const [viewingDoc, setViewingDoc] = useState<ScientificDocument | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successNotice, setSuccessNotice] = useState("");
  const [pageError, setPageError] = useState("");

  // Form State
  const [formDocNumber, setFormDocNumber] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formIssuingAuthority, setFormIssuingAuthority] = useState("");
  const [formCategory, setFormCategory] = useState<SubCategoryKey>("LAW_REGULATION");
  const [formIssuedDate, setFormIssuedDate] = useState("");
  const [formEffectiveDate, setFormEffectiveDate] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formFile, setFormFile] = useState<File | null>(null);

  const canManage = useMemo(() => {
    return (
      account?.systemRole === "RESEARCH_MANAGEMENT_STAFF" ||
      account?.systemRole === "RESEARCH_BOARD_HEAD" ||
      account?.systemRole === "RESEARCH_MANAGEMENT_HEAD" ||
      account?.systemRole === "SYSTEM_ADMIN"
    );
  }, [account]);

  async function loadData() {
    setIsLoading(true);
    try {
      const data = await listScientificDocuments();
      setDocuments(data);
    } catch (err) {
      setPageError(err instanceof Error && err.message ? err.message : "Không thể tải dữ liệu");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  // Filter documents by search keyword
  const searchedDocuments = useMemo(() => {
    if (!searchKeyword.trim()) return documents;
    const term = searchKeyword.toLowerCase().trim();
    return documents.filter(
      (d) =>
        d.title.toLowerCase().includes(term) ||
        d.documentNumber.toLowerCase().includes(term) ||
        (d.description && d.description.toLowerCase().includes(term))
    );
  }, [documents, searchKeyword]);

  // Distribute documents into their respective sub-categories
  const categorizedDocuments = useMemo(() => {
    const map: Record<SubCategoryKey, ScientificDocument[]> = {
      LAW_REGULATION: [],
      INTERNAL_REGULATION: [],
      DOCUMENT_TEMPLATE: [],
      GUIDELINE: []
    };

    for (const doc of searchedDocuments) {
      const key = normalizeCategoryKey(doc.category);
      if (map[key]) {
        map[key].push(doc);
      }
    }
    return map;
  }, [searchedDocuments]);

  function resetForm() {
    setFormDocNumber("");
    setFormTitle("");
    setFormIssuingAuthority("");
    setFormCategory("LAW_REGULATION");
    setFormIssuedDate("");
    setFormEffectiveDate("");
    setFormDescription("");
    setFormFile(null);
    setErrorMessage("");
  }

  function handleOpenCreate(targetCat?: SubCategoryKey) {
    resetForm();
    if (targetCat) {
      setFormCategory(targetCat);
    }
    setIsCreateModalOpen(true);
  }

  function handleOpenEdit(doc: ScientificDocument) {
    setEditingDoc(doc);
    setFormDocNumber(doc.documentNumber);
    setFormTitle(doc.title);
    setFormIssuingAuthority(doc.issuingAuthority || "");
    setFormCategory(normalizeCategoryKey(doc.category));
    setFormIssuedDate(doc.issuedDate ? doc.issuedDate.split("T")[0] : "");
    setFormEffectiveDate(doc.effectiveDate ? doc.effectiveDate.split("T")[0] : "");
    setFormDescription(doc.description || "");
    setFormFile(null);
    setErrorMessage("");
  }

  async function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formDocNumber.trim() || !formTitle.trim()) {
      setErrorMessage("Vui lòng điền số hiệu và tiêu đề văn bản.");
      return;
    }
    if (!formFile) {
      setErrorMessage("Vui lòng đính kèm tệp văn bản / biểu mẫu.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");
    try {
      const fd = new FormData();
      fd.append("documentNumber", formDocNumber.trim());
      fd.append("title", formTitle.trim());
      fd.append("category", formCategory);
      if (formIssuingAuthority.trim()) fd.append("issuingAuthority", formIssuingAuthority.trim());
      if (formIssuedDate) fd.append("issuedDate", formIssuedDate);
      if (formEffectiveDate) fd.append("effectiveDate", formEffectiveDate);
      if (formDescription.trim()) fd.append("description", formDescription.trim());
      fd.append("file", formFile);

      await createScientificDocument(fd);
      setIsCreateModalOpen(false);
      resetForm();
      setSuccessNotice("Đã tải lên văn bản / biểu mẫu thành công!");
      setTimeout(() => setSuccessNotice(""), 4000);
      await loadData();
    } catch (err) {
      setErrorMessage(err instanceof Error && err.message ? err.message : "Lỗi tải lên văn bản.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingDoc) return;
    if (!formDocNumber.trim() || !formTitle.trim()) {
      setErrorMessage("Vui lòng điền số hiệu và tiêu đề văn bản.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");
    try {
      const fd = new FormData();
      fd.append("documentNumber", formDocNumber.trim());
      fd.append("title", formTitle.trim());
      // Nhóm hiển thị gộp nhiều phân loại (vd. mẫu thuyết minh vào "Mẫu văn bản"): giữ phân loại gốc nếu người dùng không đổi nhóm.
      fd.append("category", normalizeCategoryKey(editingDoc.category) === formCategory ? editingDoc.category : formCategory);
      fd.append("issuingAuthority", formIssuingAuthority.trim());
      // Luôn gửi ngày, kể cả rỗng: xoá trống ô ngày là xoá ngày đã lưu.
      fd.append("issuedDate", formIssuedDate);
      fd.append("effectiveDate", formEffectiveDate);
      fd.append("description", formDescription.trim());
      if (formFile) {
        fd.append("file", formFile);
      }

      await updateScientificDocument(editingDoc.id, fd);
      setEditingDoc(null);
      resetForm();
      setSuccessNotice("Đã cập nhật văn bản / biểu mẫu thành công!");
      setTimeout(() => setSuccessNotice(""), 4000);
      await loadData();
    } catch (err) {
      setErrorMessage(err instanceof Error && err.message ? err.message : "Lỗi cập nhật văn bản.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(doc: ScientificDocument) {
    if (!(await confirm(`Xóa văn bản "${doc.documentNumber} - ${doc.title}"?`, { confirmLabel: "Xóa", tone: "danger" }))) {
      return;
    }

    try {
      await deleteScientificDocument(doc.id);
      setSuccessNotice("Đã xóa văn bản thành công!");
      setTimeout(() => setSuccessNotice(""), 4000);
      await loadData();
    } catch (err) {
      setPageError(err instanceof Error && err.message ? err.message : "Không thể xóa văn bản.");
    }
  }

  // Active categories to show: all 5 or single focused category
  const activeCategoryKeys = useMemo(() => {
    if (focusedCategory === "ALL") return CATEGORY_KEYS;
    return [focusedCategory];
  }, [focusedCategory]);

  // Trường nhập dùng chung cho hộp thoại tải lên và chỉnh sửa.
  function renderFormFields(mode: "create" | "edit") {
    return (
      <>
        {errorMessage ? <p className="state-message error" role="alert">{errorMessage}</p> : null}
        <div className="form-grid two">
          <label className="field">
            <span>Số hiệu văn bản *</span>
            <input id={`doc-${mode}-number`} type="text" required placeholder="VD: 05/2023/TT-BKHCN, BM-01/NCKH" value={formDocNumber} onChange={(e) => setFormDocNumber(e.target.value)} />
          </label>
          <label className="field">
            <span>Mục phân loại *</span>
            <select id={`doc-${mode}-category`} value={formCategory} onChange={(e) => setFormCategory(e.target.value as SubCategoryKey)}>
              <option value="LAW_REGULATION">Văn bản quy phạm pháp luật</option>
              <option value="INTERNAL_REGULATION">Quy chế &amp; Quy định quản lý KH&amp;CN</option>
              <option value="DOCUMENT_TEMPLATE">Mẫu văn bản (Thuyết minh, Đánh giá, Nghiệm thu...)</option>
              <option value="GUIDELINE">Hướng dẫn &amp; Quy trình nghiệp vụ</option>
            </select>
          </label>
        </div>
        <label className="field">
          <span>Tên gọi / Trích yếu văn bản *</span>
          <input id={`doc-${mode}-title`} type="text" required placeholder="VD: Thông tư quy định quản lý nhiệm vụ KH&CN..." value={formTitle} onChange={(e) => setFormTitle(e.target.value)} />
        </label>
        <label className="field">
          <span>Cơ quan ban hành</span>
          <input id={`doc-${mode}-authority`} type="text" maxLength={255} placeholder="VD: Bộ Khoa học và Công nghệ, Học viện Quân y" value={formIssuingAuthority} onChange={(e) => setFormIssuingAuthority(e.target.value)} />
        </label>
        <div className="form-grid two">
          <label className="field">
            <span>Ngày ban hành</span>
            <input id={`doc-${mode}-issued`} type="date" value={formIssuedDate} onChange={(e) => setFormIssuedDate(e.target.value)} />
          </label>
          <label className="field">
            <span>Ngày hiệu lực</span>
            <input id={`doc-${mode}-effective`} type="date" value={formEffectiveDate} onChange={(e) => setFormEffectiveDate(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>Mô tả / Tóm tắt nội dung</span>
          <textarea id={`doc-${mode}-description`} rows={3} placeholder="Tóm tắt ngắn gọn nội dung văn bản hoặc mục đích sử dụng của biểu mẫu..." value={formDescription} onChange={(e) => setFormDescription(e.target.value)} />
        </label>
        <label className="field">
          <span>{mode === "create" ? "Tệp đính kèm (.pdf, .doc, .docx, .xls, .xlsx) *" : `Thay thế tệp đính kèm (để trống nếu giữ tệp hiện tại: ${editingDoc?.fileName ?? ""})`}</span>
          <input id={`doc-${mode}-file`} type="file" required={mode === "create"} accept=".pdf,.doc,.docx,.xls,.xlsx" onChange={(e) => setFormFile(e.target.files?.[0] || null)} />
          {formFile ? <span className="field-hint">{mode === "create" ? "Đã chọn" : "Tệp mới"}: {formFile.name} ({formatFileSize(formFile.size)})</span> : null}
        </label>
      </>
    );
  }

  return (
    <div className="profile-layout">
      {successNotice ? <p className="state-message success" role="status">{successNotice}</p> : null}
      {pageError ? <p className="state-message error" role="alert">{pageError}</p> : null}

      <div className="doc-toolbar">
        <label className="filter-field">
          <span>Tìm kiếm</span>
          <input id="documents-search" type="search" placeholder="Tìm theo số hiệu, tên văn bản..." value={searchKeyword} onChange={(e) => setSearchKeyword(e.target.value)} />
        </label>
        {canManage ? (
          <button type="button" onClick={() => handleOpenCreate()} className="button primary" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Plus size={14} aria-hidden="true" />
            Tải lên văn bản
          </button>
        ) : null}
      </div>

      <nav className="tabs-nav" aria-label="Phân mục Văn bản & Biểu mẫu quản lý KH&CN">
        <button type="button" className={`tab-btn ${focusedCategory === "ALL" ? "active" : ""}`} onClick={() => setFocusedCategory("ALL")}>
          Tất cả các mục
          <span className="tab-badge">{documents.length}</span>
        </button>
        {CATEGORY_KEYS.map((key) => (
          <button key={key} type="button" className={`tab-btn ${focusedCategory === key ? "active" : ""}`} onClick={() => setFocusedCategory(key)}>
            {SUB_CATEGORIES[key].shortLabel}
            <span className="tab-badge">{categorizedDocuments[key]?.length ?? 0}</span>
          </button>
        ))}
      </nav>

      {isLoading ? (
        <p className="state-message" role="status">Đang tải văn bản và biểu mẫu...</p>
      ) : (
        <div className="tab-content">
          {activeCategoryKeys.map((catKey) => {
            const cat = SUB_CATEGORIES[catKey];
            const CategoryIcon = cat.icon;
            const items = categorizedDocuments[catKey] || [];

            return (
              <div key={catKey} style={{ marginBottom: focusedCategory === "ALL" ? 32 : 12 }}>
                <div className="sub-section-header">
                  <div>
                    <span className="sub-section-title" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <CategoryIcon size={16} aria-hidden="true" />
                      {cat.label}
                    </span>
                    <p className="sub-section-desc">{cat.description}</p>
                  </div>
                  {canManage ? (
                    <button type="button" className="button primary btn-sm" onClick={() => handleOpenCreate(catKey)} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <Plus size={13} aria-hidden="true" />
                      Thêm vào mục này
                    </button>
                  ) : null}
                </div>

                {items.length === 0 ? (
                  <div className="stm-table-empty">
                    <p>{searchKeyword ? "Không có văn bản nào trong mục này khớp với từ khóa tìm kiếm." : "Chưa có văn bản hoặc biểu mẫu nào trong phân mục này."}</p>
                    {canManage && !searchKeyword ? (
                      <button type="button" className="button btn-sm" style={{ marginTop: 8 }} onClick={() => handleOpenCreate(catKey)}>
                        + Tải lên văn bản đầu tiên
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <div className="table-wrap">
                    <table className="stm-table">
                      <thead>
                        <tr>
                          <th style={{ width: 45, textAlign: "center" }}>TT</th>
                          <th style={{ width: 140 }}>Số hiệu</th>
                          <th>Tên văn bản / Biểu mẫu (bấm để tải về)</th>
                          <th style={{ width: 115 }}>Ngày ban hành</th>
                          <th style={{ width: 115 }}>Ngày hiệu lực</th>
                          <th style={{ width: 130 }}>Tệp đính kèm</th>
                          <th style={{ width: 155, textAlign: "right" }}>Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((doc, idx) => {
                          const fileBadge = getFileExtensionBadge(doc.fileName);
                          const downloadUrl = getScientificDocumentDownloadUrl(doc.id);
                          return (
                            <tr key={doc.id}>
                              <td style={{ textAlign: "center", fontWeight: 600 }}>{idx + 1}</td>
                              <td><span className="doc-number">{doc.documentNumber}</span></td>
                              <td>
                                <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="doc-link" title="Bấm vào tên để tải văn bản này về">
                                  {doc.title}
                                  <Download size={12} aria-hidden="true" />
                                </a>
                                {doc.description ? <p className="doc-description">{doc.description}</p> : null}
                              </td>
                              <td>{doc.issuedDate ? formatDate(doc.issuedDate) : "—"}</td>
                              <td>{doc.effectiveDate ? formatDate(doc.effectiveDate) : "—"}</td>
                              <td>
                                <span className={`file-type ${fileBadge.tone}`}>{fileBadge.label}</span>
                                <span className="file-size">{formatFileSize(doc.fileSize)}</span>
                              </td>
                              <td style={{ textAlign: "right" }}>
                                <div className="action-btn-group" style={{ justifyContent: "flex-end" }}>
                                  <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="button primary btn-sm" style={{ display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none" }} title="Tải về">
                                    <Download size={12} aria-hidden="true" />
                                    Tải
                                  </a>
                                  <button type="button" className="button btn-sm" onClick={() => setViewingDoc(doc)}>
                                    Chi tiết
                                  </button>
                                  {canManage ? (
                                    <>
                                      <button type="button" className="button btn-sm" onClick={() => handleOpenEdit(doc)} title="Chỉnh sửa thông tin" aria-label={`Chỉnh sửa ${doc.documentNumber}`}>
                                        <Edit2 size={11} aria-hidden="true" />
                                      </button>
                                      <button type="button" className="button btn-sm danger" onClick={() => handleDelete(doc)} title="Xóa văn bản" aria-label={`Xóa ${doc.documentNumber}`}>
                                        <Trash2 size={11} aria-hidden="true" />
                                      </button>
                                    </>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isCreateModalOpen ? (
        <ModalDialog
          title="Tải lên văn bản / Biểu mẫu mới"
          icon={<Upload size={16} aria-hidden="true" />}
          onClose={() => setIsCreateModalOpen(false)}
          footer={
            <>
              <button type="button" className="button" onClick={() => setIsCreateModalOpen(false)}>Hủy</button>
              <button type="submit" form="document-create-form" className="button primary" disabled={isSubmitting}>{isSubmitting ? "Đang tải lên..." : "Lưu và tải lên"}</button>
            </>
          }
        >
          <form id="document-create-form" className="admin-form" onSubmit={handleCreateSubmit}>
            {renderFormFields("create")}
          </form>
        </ModalDialog>
      ) : null}

      {editingDoc ? (
        <ModalDialog
          title="Chỉnh sửa văn bản / Biểu mẫu"
          icon={<Edit2 size={16} aria-hidden="true" />}
          onClose={() => setEditingDoc(null)}
          footer={
            <>
              <button type="button" className="button" onClick={() => setEditingDoc(null)}>Hủy</button>
              <button type="submit" form="document-edit-form" className="button primary" disabled={isSubmitting}>{isSubmitting ? "Đang lưu..." : "Cập nhật thay đổi"}</button>
            </>
          }
        >
          <form id="document-edit-form" className="admin-form" onSubmit={handleEditSubmit}>
            {renderFormFields("edit")}
          </form>
        </ModalDialog>
      ) : null}

      {viewingDoc ? (
        <ModalDialog
          title="Chi tiết văn bản & Biểu mẫu"
          icon={<FileText size={16} aria-hidden="true" />}
          onClose={() => setViewingDoc(null)}
          footer={<button type="button" className="button" onClick={() => setViewingDoc(null)}>Đóng</button>}
        >
          <div>
            <span className="doc-number">{viewingDoc.documentNumber}</span>
            <h3 style={{ margin: "8px 0 0" }}>
              <a href={getScientificDocumentDownloadUrl(viewingDoc.id)} target="_blank" rel="noopener noreferrer" className="doc-link" title="Bấm để tải tệp này về">
                {viewingDoc.title}
                <Download size={14} aria-hidden="true" />
              </a>
            </h3>
          </div>
          <div className="meta-grid">
            <div className="meta-item">
              <span className="meta-label">Mục phân loại</span>
              <span className="meta-value">{SUB_CATEGORIES[normalizeCategoryKey(viewingDoc.category)]?.label || viewingDoc.category}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Trạng thái</span>
              <span className="meta-value">{viewingDoc.status === "ACTIVE" ? "Còn hiệu lực" : "Hết hiệu lực"}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Ngày ban hành</span>
              <span className="meta-value">{formatDate(viewingDoc.issuedDate)}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Ngày hiệu lực</span>
              <span className="meta-value">{formatDate(viewingDoc.effectiveDate)}</span>
            </div>
          </div>
          {viewingDoc.description ? (
            <div>
              <span className="meta-label">Tóm tắt nội dung</span>
              <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{viewingDoc.description}</p>
            </div>
          ) : null}
          <div className="doc-file-row">
            <div style={{ minWidth: 0 }}>
              <strong>{viewingDoc.fileName}</strong>
              <span className="file-size" style={{ marginLeft: 0 }}>{formatFileSize(viewingDoc.fileSize)}</span>
            </div>
            <a href={getScientificDocumentDownloadUrl(viewingDoc.id)} target="_blank" rel="noopener noreferrer" className="button primary" style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
              <Download size={14} aria-hidden="true" />
              Tải về
            </a>
          </div>
        </ModalDialog>
      ) : null}
    </div>
  );
}
