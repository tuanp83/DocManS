export const DOCUMENT_CATEGORIES = {
  LAW_REGULATION: "LAW_REGULATION",
  INTERNAL_REGULATION: "INTERNAL_REGULATION",
  PROPOSAL_TEMPLATE: "PROPOSAL_TEMPLATE",
  EVALUATION_TEMPLATE: "EVALUATION_TEMPLATE",
  GUIDELINE: "GUIDELINE",
  LEGAL_DOCUMENT: "LEGAL_DOCUMENT",
  FORM_TEMPLATE: "FORM_TEMPLATE"
} as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[keyof typeof DOCUMENT_CATEGORIES];

export type CreateScientificDocumentDto = {
  documentNumber: string;
  title: string;
  category: string;
  issuingAuthority?: string;
  issuedDate?: string;
  effectiveDate?: string;
  description?: string;
};

export type UpdateScientificDocumentDto = {
  documentNumber?: string;
  title?: string;
  category?: string;
  issuingAuthority?: string;
  issuedDate?: string;
  effectiveDate?: string;
  description?: string;
  status?: string;
};

export type QueryScientificDocumentsDto = {
  category?: string;
  search?: string;
  status?: string;
};

export type UploadedDocumentFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};
