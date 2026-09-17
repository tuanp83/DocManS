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
  const url = `${getApiBaseUrl()}/scientific-documents${queryString ? `?${queryString}` : ""}`;

  const response = await fetch(url, {
    credentials: "include"
  });

  if (!response.ok) {
    throw new Error("Không thể tải danh sách văn bản và biểu mẫu.");
  }

  const data = await response.json();
  return data.documents ?? [];
}

export async function createScientificDocument(formData: FormData): Promise<ScientificDocument> {
  const response = await fetch(`${getApiBaseUrl()}/scientific-documents`, {
    method: "POST",
    credentials: "include",
    body: formData
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.message || "Không thể tải lên văn bản / biểu mẫu.");
  }

  const data = await response.json();
  return data.document;
}

export async function updateScientificDocument(
  id: string,
  formData: FormData
): Promise<ScientificDocument> {
  const response = await fetch(`${getApiBaseUrl()}/scientific-documents/${id}`, {
    method: "PATCH",
    credentials: "include",
    body: formData
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.message || "Không thể cập nhật văn bản / biểu mẫu.");
  }

  const data = await response.json();
  return data.document;
}

export async function deleteScientificDocument(id: string): Promise<void> {
  const response = await fetch(`${getApiBaseUrl()}/scientific-documents/${id}`, {
    method: "DELETE",
    credentials: "include"
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.message || "Không thể xóa văn bản / biểu mẫu.");
  }
}

export function getScientificDocumentDownloadUrl(id: string): string {
  return `${getApiBaseUrl()}/scientific-documents/${id}/download`;
}
