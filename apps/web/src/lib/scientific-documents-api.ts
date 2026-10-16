import { apiRequest } from "@/lib/api-client";
import { getApiBaseUrl } from "./session";

export type ScientificDocumentCategory =
  | "LAW_REGULATION"
  | "INTERNAL_REGULATION"
  | "PROPOSAL_TEMPLATE"
  | "EVALUATION_TEMPLATE"
  | "GUIDELINE"
  | "LEGAL_DOCUMENT"
  | "FORM_TEMPLATE"
  | string;

export type ScientificDocument = {
  id: string;
  documentNumber: string;
  title: string;
  category: ScientificDocumentCategory;
  issuingAuthority?: string | null;
  issuedDate?: string | null;
  effectiveDate?: string | null;
  description?: string | null;
  status: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  storageObjectKey: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: {
    id: string;
    displayName: string;
    username?: string;
    unit?: string;
  };
};

export async function listScientificDocuments(params?: {
  category?: string;
  search?: string;
}): Promise<ScientificDocument[]> {
  const query = new URLSearchParams();
  if (params?.category && params.category !== "ALL") {
    query.set("category", params.category);
  }
  if (params?.search?.trim()) {
    query.set("search", params.search.trim());
  }

  const queryString = query.toString();
  const data = await apiRequest<{ documents?: ScientificDocument[] }>(
    `/scientific-documents${queryString ? `?${queryString}` : ""}`,
    undefined,
    "Không thể tải danh sách văn bản và biểu mẫu."
  );
  return data.documents ?? [];
}

export async function createScientificDocument(formData: FormData): Promise<ScientificDocument> {
  const data = await apiRequest<{ document: ScientificDocument }>("/scientific-documents", { method: "POST", body: formData }, "Không thể tải lên văn bản / biểu mẫu.");
  return data.document;
}

export async function updateScientificDocument(
  id: string,
  formData: FormData
): Promise<ScientificDocument> {
  const data = await apiRequest<{ document: ScientificDocument }>(`/scientific-documents/${id}`, { method: "PATCH", body: formData }, "Không thể cập nhật văn bản / biểu mẫu.");
  return data.document;
}

export async function deleteScientificDocument(id: string): Promise<void> {
  await apiRequest(`/scientific-documents/${id}`, { method: "DELETE" }, "Không thể xóa văn bản / biểu mẫu.");
}

export function getScientificDocumentDownloadUrl(id: string): string {
  return `${getApiBaseUrl()}/scientific-documents/${id}/download`;
}
