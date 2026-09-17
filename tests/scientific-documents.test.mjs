import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ScientificDocumentsService } from "../dist/apps/api/scientific-documents/scientific-documents.service.js";

describe("ScientificDocumentsService", () => {
  const researcherActor = {
    id: "user-pi",
    username: "patuan",
    displayName: "TS. Phạm Anh Tuấn",
    systemRole: "RESEARCHER_INTERNAL_USER"
  };

  const staffActor = {
    id: "user-staff",
    username: "nmphuong",
    displayName: "TS. Nguyễn Minh Phương",
    systemRole: "SCIENTIFIC_MANAGEMENT_STAFF"
  };

  const adminActor = {
    id: "user-admin",
    username: "admin",
    displayName: "TS. Đỗ Tiến Thành",
    systemRole: "SYSTEM_ADMIN"
  };

  const sampleDoc = {
    id: "doc-1",
    documentNumber: "05/2023/TT-BKHCN",
    title: "Thông tư 05/2023/TT-BKHCN",
    category: "LEGAL_DOCUMENT",
    issuingAuthority: "Bộ KH&CN",
    issuedDate: new Date("2023-05-25"),
    effectiveDate: new Date("2023-07-09"),
    description: "Quy định quản lý nhiệm vụ KH&CN",
    status: "ACTIVE",
    fileName: "tt05.pdf",
    fileSize: 1024,
    mimeType: "application/pdf",
    storageObjectKey: "scientific-documents/doc-1/tt05.pdf",
    createdById: staffActor.id,
    deletedAt: null
  };

  it("allows all authenticated users (including researchers) to list documents", async () => {
    const prisma = {
      scientificDocument: {
        findMany: async (args) => {
          assert.equal(args.where.deletedAt, null);
          return [sampleDoc];
        }
      }
    };

    const auditLog = { record: async () => {} };
    const service = new ScientificDocumentsService(prisma, auditLog, {});

    const docs = await service.listDocuments(researcherActor, {});
    assert.equal(docs.length, 1);
    assert.equal(docs[0].documentNumber, "05/2023/TT-BKHCN");
  });

  it("filters documents by category and search keyword", async () => {
    let capturedWhere = null;
    const prisma = {
      scientificDocument: {
        findMany: async (args) => {
          capturedWhere = args.where;
          return [sampleDoc];
        }
      }
    };

    const auditLog = { record: async () => {} };
    const service = new ScientificDocumentsService(prisma, auditLog, {});

    await service.listDocuments(researcherActor, {
      category: "LEGAL_DOCUMENT",
      search: "Thông tư"
    });

    assert.equal(capturedWhere.category, "LEGAL_DOCUMENT");
    assert.ok(capturedWhere.OR);
    assert.equal(capturedWhere.OR.length, 4);
  });

  it("denies researchers from creating documents with 403 Forbidden", async () => {
    const service = new ScientificDocumentsService({}, {}, {});

    await assert.rejects(
      async () => {
        await service.createDocument(
          researcherActor,
          {
            documentNumber: "QC-01",
            title: "Quy chế mới",
            category: "LEGAL_DOCUMENT"
          },
          {
            originalname: "qc.pdf",
            mimetype: "application/pdf",
            size: 100,
            buffer: Buffer.from("test")
          }
        );
      },
      (err) => {
        assert.equal(err.status, 403);
        assert.match(err.message, /Chỉ nhà quản lý khoa học/);
        return true;
      }
    );
  });

  it("allows management staff to create documents and stores file", async () => {
    let putObjectArgs = null;
    let createArgs = null;

    const storage = {
      putObject: async (args) => {
        putObjectArgs = args;
      }
    };

    const prisma = {
      scientificDocument: {
        create: async (args) => {
          createArgs = args;
          return { id: "new-doc-id", ...args.data };
        }
      }
    };

    let audited = false;
    const auditLog = {
      record: async () => {
        audited = true;
      }
    };

    const service = new ScientificDocumentsService(prisma, auditLog, storage);

    const result = await service.createDocument(
      staffActor,
      {
        documentNumber: "BM-01/NCKH",
        title: "Thuyết minh đề tài",
        category: "FORM_TEMPLATE",
        issuingAuthority: "Phòng KHQS"
      },
      {
        originalname: "thuyetminh.docx",
        mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size: 500,
        buffer: Buffer.from("dummy-doc-content")
      }
    );

    assert.ok(result.id);
    assert.equal(createArgs.data.documentNumber, "BM-01/NCKH");
    assert.equal(createArgs.data.category, "FORM_TEMPLATE");
    assert.ok(putObjectArgs);
    assert.equal(putObjectArgs.sizeBytes, 500);
    assert.equal(audited, true);
  });

  it("allows admin to delete documents and denies researchers", async () => {
    let updatedWhere = null;
    let updatedData = null;

    const prisma = {
      scientificDocument: {
        findFirst: async (args) => {
          if (args.where.id === "doc-1") return sampleDoc;
          return null;
        },
        update: async (args) => {
          updatedWhere = args.where;
          updatedData = args.data;
          return { ...sampleDoc, ...args.data };
        }
      }
    };

    const auditLog = { record: async () => {} };
    const service = new ScientificDocumentsService(prisma, auditLog, {});

    // Denied for researcher
    await assert.rejects(
      async () => {
        await service.deleteDocument(researcherActor, "doc-1");
      },
      (err) => err.status === 403
    );

    // Allowed for admin
    const result = await service.deleteDocument(adminActor, "doc-1");
    assert.equal(result.success, true);
    assert.equal(updatedWhere.id, "doc-1");
    assert.equal(updatedData.status, "DELETED");
    assert.ok(updatedData.deletedAt instanceof Date);
  });

  it("downloads file stream and records audit log", async () => {
    const dummyBuffer = Buffer.from("pdf-content");
    const storage = {
      getObject: async (key) => {
        assert.equal(key, sampleDoc.storageObjectKey);
        return dummyBuffer;
      }
    };

    const prisma = {
      scientificDocument: {
        findFirst: async (args) => {
          if (args.where.id === sampleDoc.id) return sampleDoc;
          return null;
        }
      }
    };

    let audited = false;
    const auditLog = {
      record: async (event) => {
        assert.equal(event.action, "download-scientific-document");
        audited = true;
      }
    };

    const service = new ScientificDocumentsService(prisma, auditLog, storage);
    const download = await service.downloadDocument(researcherActor, sampleDoc.id);

    assert.equal(download.fileName, sampleDoc.fileName);
    assert.equal(download.mimeType, sampleDoc.mimeType);
    assert.equal(audited, true);
  });
});
