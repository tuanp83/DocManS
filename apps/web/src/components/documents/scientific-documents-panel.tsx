"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Calendar,
  Download,
  Edit2,
  FileCode,
  FileSpreadsheet,
  FileText,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
  FileCheck2,
  File,
  Scale,
  ScrollText,
  ClipboardList,
  Eye,
  Maximize2,
  RotateCcw
} from "lucide-react";
import { useSession } from "@/components/auth/session-provider";
import { EmptyState } from "@/components/ui/empty-state";
import {
  createScientificDocument,
  deleteScientificDocument,
  getScientificDocumentDownloadUrl,
  listScientificDocuments,
  updateScientificDocument,
  type ScientificDocument
} from "@/lib/scientific-documents-api";

export type SubCategoryKey =
  | "LAW_REGULATION"
  | "INTERNAL_REGULATION"
  | "PROPOSAL_TEMPLATE"
  | "EVALUATION_TEMPLATE"
  | "GUIDELINE";

export type SubCategoryDefinition = {
  key: SubCategoryKey;
  label: string;
  shortLabel: string;
  subLabel: string;
  description: string;
  icon: typeof FileText;
  containerBg: string;
  headerBg: string;
  borderColor: string;
  iconColor: string;
  badgeStyle: string;
};

export const SUB_CATEGORIES: Record<SubCategoryKey, SubCategoryDefinition> = {
  LAW_REGULATION: {
    key: "LAW_REGULATION",
    label: "1. Văn bản quy phạm pháp luật",
    shortLabel: "1. Văn bản QPPL",
    subLabel: "Luật, Nghị định, Thông tư",
    description: "Các văn bản Luật, Nghị định Chính phủ, Thông tư của Bộ KH&CN và các Bộ ngành liên quan.",
    icon: Scale,
    containerBg: "bg-blue-50/20 dark:bg-blue-950/10",
    headerBg: "bg-blue-100/60 dark:bg-blue-950/40 text-blue-950 dark:text-blue-100",
    borderColor: "border-blue-200/80 dark:border-blue-800/60",
    iconColor: "text-blue-600 dark:text-blue-400 bg-blue-500/15",
    badgeStyle: "bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300"
  },
  INTERNAL_REGULATION: {
    key: "INTERNAL_REGULATION",
    label: "2. Quy chế & Quy định quản lý KH&CN",
    shortLabel: "2. Quy chế & Quy định",
    subLabel: "Quy chế nội bộ Học viện",
    description: "Quy chế Quản lý hoạt động NCKH&CN, quy định chi tiêu và phân bổ kinh phí của Học viện.",
    icon: BookOpen,
    containerBg: "bg-indigo-50/20 dark:bg-indigo-950/10",
    headerBg: "bg-indigo-100/60 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-100",
    borderColor: "border-indigo-200/80 dark:border-indigo-800/60",
    iconColor: "text-indigo-600 dark:text-indigo-400 bg-indigo-500/15",
    badgeStyle: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300"
  },
  PROPOSAL_TEMPLATE: {
    key: "PROPOSAL_TEMPLATE",
    label: "3. Biểu mẫu đăng ký & Thuyết minh đề tài",
    shortLabel: "3. Mẫu Thuyết minh",
    subLabel: "BM-01, BM-02, BM-06",
    description: "Biểu mẫu thuyết minh đề tài, dự toán kinh phí, lý lịch khoa học cá nhân (BM-01, BM-02, BM-06).",
    icon: ScrollText,
    containerBg: "bg-emerald-50/20 dark:bg-emerald-950/10",
    headerBg: "bg-emerald-100/60 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-100",
    borderColor: "border-emerald-200/80 dark:border-emerald-800/60",
    iconColor: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/15",
    badgeStyle: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300"
  },
  EVALUATION_TEMPLATE: {
    key: "EVALUATION_TEMPLATE",
    label: "4. Biểu mẫu thẩm định, đánh giá & Nghiệm thu",
    shortLabel: "4. Mẫu Đánh giá",
    subLabel: "BM-04, Hội đồng, Nghiệm thu",
    description: "Phiếu nhận xét đánh giá của chuyên gia phản biện, biên bản họp hội đồng tư vấn, nghiệm thu (BM-04).",
    icon: ClipboardList,
    containerBg: "bg-purple-50/20 dark:bg-purple-950/10",
    headerBg: "bg-purple-100/60 dark:bg-purple-950/40 text-purple-950 dark:text-purple-100",
    borderColor: "border-purple-200/80 dark:border-purple-800/60",
    iconColor: "text-purple-600 dark:text-purple-400 bg-purple-500/15",
    badgeStyle: "bg-purple-100 text-purple-700 dark:bg-purple-900/60 dark:text-purple-300"
  },
  GUIDELINE: {
    key: "GUIDELINE",
    label: "5. Hướng dẫn & Quy trình nghiệp vụ",
    shortLabel: "5. Hướng dẫn nghiệp vụ",
    subLabel: "Quy trình nộp & thanh toán",
    description: "Sổ tay hướng dẫn quy trình đăng ký, nộp hồ sơ trực tuyến, quy trình giải ngân và thanh quyết toán.",
    icon: FileCode,
    containerBg: "bg-amber-50/20 dark:bg-amber-950/10",
    headerBg: "bg-amber-100/60 dark:bg-amber-950/40 text-amber-950 dark:text-amber-100",
    borderColor: "border-amber-200/80 dark:border-amber-800/60",
    iconColor: "text-amber-600 dark:text-amber-400 bg-amber-500/15",
    badgeStyle: "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300"
  }
};

const CATEGORY_KEYS: SubCategoryKey[] = [
  "LAW_REGULATION",
  "INTERNAL_REGULATION",
  "PROPOSAL_TEMPLATE",
  "EVALUATION_TEMPLATE",
  "GUIDELINE"
];

function normalizeCategoryKey(category: string): SubCategoryKey {
  if (category === "LEGAL_DOCUMENT") return "LAW_REGULATION";
  if (category === "FORM_TEMPLATE") return "PROPOSAL_TEMPLATE";
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
  if (ext === "pdf") {
    return { ext: "PDF", bg: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300" };
  }
  if (ext === "docx" || ext === "doc") {
    return { ext: "WORD", bg: "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300" };
  }
  if (ext === "xlsx" || ext === "xls") {
    return { ext: "EXCEL", bg: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300" };
  }
  return { ext: ext.toUpperCase() || "FILE", bg: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300" };
}

export function ScientificDocumentsPanel() {
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

  // Form State
  const [formDocNumber, setFormDocNumber] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formCategory, setFormCategory] = useState<SubCategoryKey>("LAW_REGULATION");
  const [formIssuedDate, setFormIssuedDate] = useState("");
  const [formEffectiveDate, setFormEffectiveDate] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formFile, setFormFile] = useState<File | null>(null);

  const canManage = useMemo(() => {
    return (
      account?.systemRole === "SCIENTIFIC_MANAGEMENT_STAFF" ||
      account?.systemRole === "SYSTEM_ADMIN"
    );
  }, [account]);

  async function loadData() {
    setIsLoading(true);
    try {
      const data = await listScientificDocuments();
      setDocuments(data);
    } catch (err: any) {
      setErrorMessage(err.message || "Không thể tải dữ liệu");
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
      PROPOSAL_TEMPLATE: [],
      EVALUATION_TEMPLATE: [],
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
    } catch (err: any) {
      setErrorMessage(err.message || "Lỗi tải lên văn bản.");
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
      fd.append("category", formCategory);
      if (formIssuedDate) fd.append("issuedDate", formIssuedDate);
      if (formEffectiveDate) fd.append("effectiveDate", formEffectiveDate);
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
    } catch (err: any) {
      setErrorMessage(err.message || "Lỗi cập nhật văn bản.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(doc: ScientificDocument) {
    if (!confirm(`Bạn có chắc chắn muốn xóa văn bản "${doc.documentNumber} - ${doc.title}" không?`)) {
      return;
    }

    try {
      await deleteScientificDocument(doc.id);
      setSuccessNotice("Đã xóa văn bản thành công!");
      setTimeout(() => setSuccessNotice(""), 4000);
      await loadData();
    } catch (err: any) {
      alert(err.message || "Không thể xóa văn bản.");
    }
  }

  // Active categories to show: all 5 or single focused category
  const activeCategoryKeys = useMemo(() => {
    if (focusedCategory === "ALL") return CATEGORY_KEYS;
    return [focusedCategory];
  }, [focusedCategory]);

  return (
    <div className="profile-layout">
      {/* Success Notification Alert */}
      {successNotice && (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 animate-in fade-in">
          <FileCheck2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{successNotice}</span>
        </div>
      )}

      {/* TOP CONTROL & SEARCH TOOLBAR */}
      <div className="flex flex-col gap-3 rounded-lg border border-border/80 bg-slate-50/70 dark:bg-slate-900/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Tìm theo số hiệu, tên văn bản..."
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            className="w-full rounded-lg border border-input bg-background pl-8 pr-8 py-1.5 text-xs placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {searchKeyword && (
            <button
              type="button"
              onClick={() => setSearchKeyword("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {canManage && (
          <button
            type="button"
            onClick={() => handleOpenCreate()}
            className="button primary btn-sm shrink-0"
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Tải lên văn bản</span>
          </button>
        )}
      </div>

      {/* 5 TAB NAVIGATION CHUẨN LÝ LỊCH KHOA HỌC */}
      <nav className="tabs-nav" aria-label="Phân mục Văn bản & Biểu mẫu quản lý KH&CN">
        <button
          type="button"
          className={`tab-btn ${focusedCategory === "ALL" ? "active" : ""}`}
          onClick={() => setFocusedCategory("ALL")}
        >
          Tất cả các mục
          <span className="tab-badge">{documents.length}</span>
        </button>
        {CATEGORY_KEYS.map((key) => {
          const cat = SUB_CATEGORIES[key];
          const count = categorizedDocuments[key]?.length ?? 0;
          return (
            <button
              key={key}
              type="button"
              className={`tab-btn ${focusedCategory === key ? "active" : ""}`}
              onClick={() => setFocusedCategory(key)}
            >
              {cat.shortLabel}
              <span className="tab-badge">{count}</span>
            </button>
          );
        })}
      </nav>

      {/* SECTIONS CONTENT - PHÂN MỤC VÀ BẢNG CHUẨN LÝ LỊCH KHOA HỌC */}
      {isLoading ? (
        <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-border bg-card">
          <div className="flex flex-col items-center gap-2">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-xs text-muted-foreground">Đang tải văn bản và biểu mẫu...</span>
          </div>
        </div>
      ) : (
        <div className="tab-content">
          {activeCategoryKeys.map((catKey) => {
            const cat = SUB_CATEGORIES[catKey];
            const items = categorizedDocuments[catKey] || [];

            return (
              <div key={catKey} style={{ marginBottom: focusedCategory === "ALL" ? 32 : 12 }}>
                {/* SUB-SECTION HEADER CHUẨN LÝ LỊCH KHOA HỌC */}
                <div className="sub-section-header">
                  <div>
                    <span className="sub-section-title">
                      {cat.label}
                    </span>
                    <p className="sub-section-desc">
                      {cat.description}
                    </p>
                  </div>
                  {canManage && (
                    <button
                      type="button"
                      className="button primary btn-sm"
                      onClick={() => handleOpenCreate(catKey)}
                      style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Thêm vào mục này</span>
                    </button>
                  )}
                </div>

                {/* DANH SÁCH VĂN BẢN TRONG MỤC DẠNG BẢNG CHUẨN STM */}
                {items.length === 0 ? (
                  <div className="stm-table-empty">
                    <p>
                      {searchKeyword
                        ? "Không có văn bản nào trong mục này khớp với từ khóa tìm kiếm."
                        : "Chưa có văn bản hoặc biểu mẫu nào trong phân mục này."}
                    </p>
                    {canManage && !searchKeyword && (
                      <button
                        type="button"
                        className="button btn-sm"
                        style={{ marginTop: 8 }}
                        onClick={() => handleOpenCreate(catKey)}
                      >
                        + Tải lên văn bản đầu tiên
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="table-wrap">
                    <table className="stm-table">
                      <thead>
                        <tr>
                          <th style={{ width: 45, textAlign: "center" }}>TT</th>
                          <th style={{ width: 140 }}>Số hiệu</th>
                          <th>Tên văn bản / Biểu mẫu (Nhấp để tải về)</th>
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
                              <td>
                                <span className="inline-block rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                                  {doc.documentNumber}
                                </span>
                              </td>
                              <td>
                                <a
                                  href={downloadUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-bold text-slate-900 dark:text-slate-100 hover:text-red-700 dark:hover:text-red-400 hover:underline inline-flex items-baseline gap-1"
                                  title="Nhấp vào tên để tải về văn bản này ngay"
                                >
                                  <span>{doc.title}</span>
                                  <Download className="h-3 w-3 text-red-700 dark:text-red-400 shrink-0 translate-y-0.5" />
                                </a>
                                {doc.description && (
                                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                                    {doc.description}
                                  </p>
                                )}
                              </td>
                              <td style={{ fontSize: 12, color: "#64748b" }}>
                                {doc.issuedDate ? formatDate(doc.issuedDate) : "—"}
                              </td>
                              <td style={{ fontSize: 12, color: "#64748b" }}>
                                {doc.effectiveDate ? formatDate(doc.effectiveDate) : "—"}
                              </td>
                              <td>
                                <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold border ${fileBadge.bg}`}>
                                  {fileBadge.ext}
                                </span>
                                <span className="text-xs text-slate-500 ml-1">
                                  {formatFileSize(doc.fileSize)}
                                </span>
                              </td>
                              <td style={{ textAlign: "right" }}>
                                <div className="action-btn-group" style={{ justifyContent: "flex-end" }}>
                                  <a
                                    href={downloadUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="button primary btn-sm"
                                    style={{ display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none" }}
                                    title="Tải về ngay"
                                  >
                                    <Download style={{ width: 12, height: 12 }} />
                                    <span>Tải</span>
                                  </a>
                                  <button
                                    type="button"
                                    className="button btn-sm"
                                    onClick={() => setViewingDoc(doc)}
                                  >
                                    Chi tiết
                                  </button>
                                  {canManage && (
                                    <>
                                      <button
                                        type="button"
                                        className="button btn-sm"
                                        onClick={() => handleOpenEdit(doc)}
                                        title="Chỉnh sửa thông tin"
                                      >
                                        <Edit2 style={{ width: 11, height: 11 }} />
                                      </button>
                                      <button
                                        type="button"
                                        className="button btn-sm"
                                        onClick={() => handleDelete(doc)}
                                        title="Xóa văn bản"
                                        style={{ color: "#b91c1c" }}
                                      >
                                        <Trash2 style={{ width: 11, height: 11 }} />
                                      </button>
                                    </>
                                  )}
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

      {/* Modal: Tải lên văn bản / Biểu mẫu mới */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-xl rounded-xl border border-border bg-card p-5 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Upload className="h-4 w-4 text-primary" />
                Tải lên văn bản / Biểu mẫu mới
              </h2>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {errorMessage && (
              <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
                {errorMessage}
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="mt-3.5 space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Số hiệu văn bản <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: 05/2023/TT-BKHCN, BM-01/NCKH"
                    value={formDocNumber}
                    onChange={(e) => setFormDocNumber(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Mục phân loại <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as SubCategoryKey)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="LAW_REGULATION">Văn bản quy phạm pháp luật</option>
                    <option value="INTERNAL_REGULATION">Quy chế & Quy định quản lý KH&CN</option>
                    <option value="PROPOSAL_TEMPLATE">Biểu mẫu đăng ký & Thuyết minh đề tài</option>
                    <option value="EVALUATION_TEMPLATE">Biểu mẫu thẩm định, đánh giá & Nghiệm thu</option>
                    <option value="GUIDELINE">Hướng dẫn & Quy trình nghiệp vụ</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Tên gọi / Trích yếu văn bản <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="VD: Thông tư quy định quản lý nhiệm vụ KH&CN..."
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Ngày ban hành
                  </label>
                  <input
                    type="date"
                    value={formIssuedDate}
                    onChange={(e) => setFormIssuedDate(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Ngày hiệu lực
                  </label>
                  <input
                    type="date"
                    value={formEffectiveDate}
                    onChange={(e) => setFormEffectiveDate(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Mô tả / Tóm tắt nội dung
                </label>
                <textarea
                  rows={3}
                  placeholder="Tóm tắt ngắn gọn nội dung văn bản hoặc mục đích sử dụng của biểu mẫu..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background p-2 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Tệp đính kèm (.pdf, .doc, .docx, .xls, .xlsx) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="file"
                  required
                  accept=".pdf,.doc,.docx,.xls,.xlsx"
                  onChange={(e) => setFormFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary hover:file:bg-primary/20"
                />
                {formFile && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Đã chọn: <span className="font-medium text-foreground">{formFile.name}</span> ({formatFileSize(formFile.size)})
                  </p>
                )}
              </div>

              <div className="mt-4 flex justify-end gap-2 border-t border-border pt-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="rounded-lg border border-input bg-background px-3.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:opacity-50"
                >
                  {isSubmitting ? "Đang tải lên..." : "Lưu & Tải lên"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Chỉnh sửa văn bản */}
      {editingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-xl rounded-xl border border-border bg-card p-5 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Edit2 className="h-4 w-4 text-primary" />
                Chỉnh sửa văn bản / Biểu mẫu
              </h2>
              <button
                type="button"
                onClick={() => setEditingDoc(null)}
                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {errorMessage && (
              <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
                {errorMessage}
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="mt-3.5 space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Số hiệu văn bản <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formDocNumber}
                    onChange={(e) => setFormDocNumber(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Mục phân loại <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as SubCategoryKey)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="LAW_REGULATION">Văn bản quy phạm pháp luật</option>
                    <option value="INTERNAL_REGULATION">Quy chế & Quy định quản lý KH&CN</option>
                    <option value="PROPOSAL_TEMPLATE">Biểu mẫu đăng ký & Thuyết minh đề tài</option>
                    <option value="EVALUATION_TEMPLATE">Biểu mẫu thẩm định, đánh giá & Nghiệm thu</option>
                    <option value="GUIDELINE">Hướng dẫn & Quy trình nghiệp vụ</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Tên gọi / Trích yếu văn bản <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Ngày ban hành
                  </label>
                  <input
                    type="date"
                    value={formIssuedDate}
                    onChange={(e) => setFormIssuedDate(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Ngày hiệu lực
                  </label>
                  <input
                    type="date"
                    value={formEffectiveDate}
                    onChange={(e) => setFormEffectiveDate(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Mô tả / Tóm tắt nội dung
                </label>
                <textarea
                  rows={3}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background p-2 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Thay thế tệp đính kèm (Để trống nếu giữ tệp hiện tại: {editingDoc.fileName})
                </label>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx"
                  onChange={(e) => setFormFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary hover:file:bg-primary/20"
                />
                {formFile && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Tệp mới: <span className="font-medium text-foreground">{formFile.name}</span> ({formatFileSize(formFile.size)})
                  </p>
                )}
              </div>

              <div className="mt-4 flex justify-end gap-2 border-t border-border pt-3">
                <button
                  type="button"
                  onClick={() => setEditingDoc(null)}
                  className="rounded-lg border border-input bg-background px-3.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:opacity-50"
                >
                  {isSubmitting ? "Đang lưu..." : "Cập nhật thay đổi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Xem chi tiết văn bản (Không hiển thị nơi ban hành) */}
      {viewingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-xl rounded-xl border border-border bg-card p-5 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-bold text-foreground">Chi tiết văn bản & Biểu mẫu</h2>
              </div>
              <button
                type="button"
                onClick={() => setViewingDoc(null)}
                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3.5 space-y-3.5">
              <div>
                <span className="text-[11px] font-mono font-bold uppercase text-primary bg-primary/10 px-2 py-0.5 rounded">
                  {viewingDoc.documentNumber}
                </span>
                {/* Title with clickable download link */}
                <h3 className="mt-2 text-sm font-bold text-foreground">
                  <a
                    href={getScientificDocumentDownloadUrl(viewingDoc.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-primary hover:underline transition inline-flex items-center gap-1.5"
                    title="Nhấn để tải về tệp này"
                  >
                    <span>{viewingDoc.title}</span>
                    <Download className="h-3.5 w-3.5 text-primary" />
                  </a>
                </h3>
              </div>

              <div className="grid grid-cols-2 gap-2.5 rounded-lg bg-muted/40 p-2.5 text-xs">
                <div>
                  <span className="text-muted-foreground text-[11px]">Mục phân loại:</span>
                  <p className="font-semibold text-foreground">
                    {SUB_CATEGORIES[normalizeCategoryKey(viewingDoc.category)]?.label || viewingDoc.category}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground text-[11px]">Trạng thái:</span>
                  <p className="font-semibold text-emerald-600 dark:text-emerald-400">Hiệu lực áp dụng</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-[11px]">Ngày ban hành:</span>
                  <p className="font-medium text-foreground">{formatDate(viewingDoc.issuedDate)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-[11px]">Ngày hiệu lực:</span>
                  <p className="font-medium text-foreground">{formatDate(viewingDoc.effectiveDate)}</p>
                </div>
              </div>

              {viewingDoc.description && (
                <div>
                  <h4 className="text-[11px] font-bold text-foreground mb-1">Tóm tắt nội dung:</h4>
                  <p className="rounded-lg border border-border/60 bg-background p-2.5 text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
                    {viewingDoc.description}
                  </p>
                </div>
              )}

              <div className="rounded-lg border border-border bg-card p-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2 overflow-hidden">
                  <File className="h-4 w-4 text-primary shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-foreground truncate max-w-xs">{viewingDoc.fileName}</p>
                    <p className="text-[10px] text-muted-foreground">{formatFileSize(viewingDoc.fileSize)}</p>
                  </div>
                </div>
                <a
                  href={getScientificDocumentDownloadUrl(viewingDoc.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Tải về ngay</span>
                </a>
              </div>
            </div>

            <div className="mt-4 flex justify-end border-t border-border pt-2.5">
              <button
                type="button"
                onClick={() => setViewingDoc(null)}
                className="rounded-lg border border-input bg-background px-3.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
