import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Client as MinioClient } from "minio";

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for prisma seed. Set it explicitly before running npm run prisma:seed.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl })
});

// Demo/local seed accounts. All seeded users share the password "1234"
// (scrypt-hashed below, salt = user id, matching apps/api/src/auth/password.service.ts).
// This is for local development and demos only — never use in production.
const users = [
  {
    id: "user-admin",
    username: "admin",
    passwordHash:
      "scrypt:user-admin:88577689e88df3ec17a117384f8a68ff4e516d4ccc3c4a7783764eb66f4a72a8c35ae574d915e01d7ba3fe5e3a800b30463e721c488544ca3fc90192544e0c43",
    displayName: "TS. Đỗ Tiến Thành",
    status: "active",
    systemRole: "SYSTEM_ADMIN",
    unit: "Khoa Toán - Tin học"
  },
  {
    id: "user-admin2",
    username: "admin2",
    passwordHash:
      "scrypt:user-admin2:ed227cd890900c9018d82e5beeffcad1b8eecaf534b6d30fa5e91d674e0454225563312ec5037e1a38ae9cf01bf6a74a1966fd597a8f178a8dd7352d4493b514",
    displayName: "TS. Phạm Anh Tuấn",
    status: "active",
    systemRole: "SYSTEM_ADMIN",
    unit: "Khoa Toán - Tin học"
  },
  {
    id: "user-leadership",
    username: "tvtien",
    passwordHash:
      "scrypt:user-leadership:ee6993e65023030a9cf863925cf50c6a8e94a829eaeb344059bfb66e2c5419622123ea57a1891543a9f3aa308e48e24057a41bd16860c6150bbfac36614ef657",
    displayName: "GS. TS. Trần Viết Tiến",
    status: "active",
    systemRole: "LEADERSHIP_APPROVAL_AUTHORITY",
    unit: "Ban Giám Đốc"
  },
  {
    id: "user-staff",
    username: "nmphuong",
    passwordHash:
      "scrypt:user-staff:ea925bf5f31fe306cb863a45afec44a4e67d84423e431cb93de5af91425c6723cb66ac59963afe1f47ad86d3c16aec95f73bffc74c22d75b032fd1093f7a71d5",
    displayName: "PGS. TS. Nguyễn Minh Phương",
    status: "active",
    systemRole: "SCIENTIFIC_MANAGEMENT_STAFF",
    unit: "Trưởng Phòng KHQS"
  },
  {
    id: "user-pi",
    username: "patuan",
    passwordHash:
      "scrypt:user-pi:a2b881672bd86b9b7bc23fa6b11a507a1d4142e00c19a9ff0f66f815bee1882f417f0253352b0bd54c66772e4a3949671c0c7f37a691a43c5d05e556e6919a38",
    displayName: "TS. Phạm Anh Tuấn",
    status: "active",
    systemRole: "RESEARCHER_INTERNAL_USER",
    unit: "Khoa Toán - Tin học"
  },
  {
    id: "user-reviewer",
    username: "dmtrung",
    passwordHash:
      "scrypt:user-reviewer:b0782812a1c75cef9db6596a7c88ae497fac0d08b7c7230c908d3c413fc08c2bed386eccfc0cbc10a64a088f1ad9bf6a2f6507410ea3d833bbb0907d958ac12a",
    displayName: "TS. Đỗ Minh Trung",
    status: "active",
    systemRole: "SCIENTIFIC_MANAGEMENT_STAFF",
    unit: "Trưởng Ban QLKH, Phòng KHQS"
  },
  {
    id: "user-researcher1",
    username: "researcher1",
    passwordHash:
      "scrypt:user-researcher1:92f9d00035d2de8b73b915edd703fdbad5e80e7ec85a8d340fe8c0d7f422fa19c0f2355193a706ec3efcf89d4308318a4c9f330d6a505d7e61314457ea537901",
    displayName: "Nhà nghiên cứu nội bộ 1",
    status: "active",
    systemRole: "RESEARCHER_INTERNAL_USER",
    unit: "Khoa Toán - Tin học"
  },
  {
    id: "user-researcher2",
    username: "researcher2",
    passwordHash:
      "scrypt:user-researcher2:8e740d0ffeb3de7b31c9c947c0729cd6599bf5b63af938eb9ab67a1d90dd87c9471bd1c97249e08f1e1cf64af95ccb49741554828017ade8884cce3492cc6650",
    displayName: "Nhà nghiên cứu nội bộ 2",
    status: "active",
    systemRole: "RESEARCHER_INTERNAL_USER",
    unit: "Khoa Toán - Tin học"
  },
  {
    id: "user-researcher3",
    username: "researcher3",
    passwordHash:
      "scrypt:user-researcher3:302088f55364c04f9a67f05137beb70f53c2a62011912b8e46f10e0e91e5671fdf0a63b46909f88414006dc2b49eb83aba48a126fc858c95323b471ed8246204",
    displayName: "Nhà nghiên cứu nội bộ 3",
    status: "active",
    systemRole: "RESEARCHER_INTERNAL_USER",
    unit: "Khoa Toán - Tin học"
  },
  {
    id: "user-external1",
    username: "external1",
    passwordHash:
      "scrypt:user-external1:cd7a9b317c30cc69b15b34b309e5751ecd3e3b89aa133de3d7004d0b7434b70f6b4b0c399a10cd7b2b3b0c4c68162dc54a7e05b2318eee70a5806c5885ebc2eb",
    displayName: "Nhà nghiên cứu bên ngoài 1",
    status: "active",
    systemRole: "EXTERNAL_RESEARCHER_USER",
    unit: "Đơn vị ngoài"
  },
  {
    id: "user-external2",
    username: "external2",
    passwordHash:
      "scrypt:user-external2:512345665da515aa85dfeacdf5ade9d6d37b864b16f981f36ea248033c37185b91787d44fc1e53c8ec28b1512c13f334306060040ee0cd943759c7f85cf84cbc",
    displayName: "Nhà nghiên cứu bên ngoài 2",
    status: "active",
    systemRole: "EXTERNAL_RESEARCHER_USER",
    unit: "Đơn vị ngoài"
  },
  {
    id: "user-external3",
    username: "external3",
    passwordHash:
      "scrypt:user-external3:b88095f2007342656ee147cb06475f58254a67a78ae71bb02294e4fba4f866106ee03fd46a33d0eefd64bc582428299ae9a478ed634ebc9e2e01a9efbe62a3d3",
    displayName: "Nhà nghiên cứu bên ngoài 3",
    status: "active",
    systemRole: "EXTERNAL_RESEARCHER_USER",
    unit: "Đơn vị ngoài"
  },
  {
    id: "user-staff-hdtien1",
    username: "hdtien1",
    passwordHash:
      "scrypt:user-staff-hdtien1:0ca10cf0ed59766007948d5e2010afb69514a438a457e62f20eb392bfae619b1d91f2fed126c591a8a9f2d945e1d0705fbf6545f1e371e3ce692d19ab1ecdea0",
    displayName: "ThS. Hoàng Đình Tiến",
    status: "active",
    systemRole: "SCIENTIFIC_MANAGEMENT_STAFF",
    unit: "Chuyên viên QLKH, Phòng KHQS"
  },
  {
    id: "user-staff-hdtien2",
    username: "hdtien2",
    passwordHash:
      "scrypt:user-staff-hdtien2:3fcf32d5cd6957b752759325f0ee8c06f19db00e53ba051225606826fe336f7fe8bf4655570b109ee0a59eb1e90bf02c40e9a5f7d67f93562cbbac1774e7ad74",
    displayName: "Chuyên viên HD Tiến 2",
    status: "active",
    systemRole: "SCIENTIFIC_MANAGEMENT_STAFF",
    unit: "Chuyên viên QLKH, Phòng KHQS"
  }
];

const organizationUnits = [
  // Ban Giám đốc & Cơ quan chỉ đạo
  ["org-hvqy", "HVQY", "Học viện Quân y"],
  ["org-bgq", "BGD", "Ban Giám Đốc"],

  // Khối Bệnh viện, Viện
  ["org-bv103", "BV103", "Bệnh viện Quân y 103"],
  ["org-bvbong", "BVBONG", "Bệnh viện Bỏng Quốc gia Lê Hữu Trác"],
  ["org-vmps", "VMPS", "Viện Mô phôi lâm sàng Quân đội"],

  // Khối Cơ quan
  ["org-pct", "PCT", "Phòng Chính trị"],
  ["org-vp", "VP", "Văn phòng"],
  ["org-phckt", "PHCKT", "Phòng Hậu cần – Kỹ thuật"],
  ["org-pdt", "PDT", "Phòng Đào tạo"],
  ["org-khqs", "KHQS", "Phòng Khoa học Quân sự"],
  ["org-bqlkhqs", "BQLKHQS", "Ban Quản lý KHQS"],
  ["org-ptbvt", "PTBVT", "Phòng Trang bị – Vật tư"],
  ["org-ptc", "PTC", "Phòng Tài chính"],
  ["org-pttkhqs", "PTTKHQS", "Phòng Thông tin Khoa học Quân sự"],
  ["org-psdh", "PSDH", "Phòng Sau đại học"],
  ["org-pktbdcl", "PKTBDCL", "Phòng Khảo thí và Bảo đảm chất lượng GD&ĐT"],
  ["org-tcydqs", "TCYDQS", "Tạp chí Y dược học Quân sự"],
  ["org-bqlda", "BQLDA", "Ban Quản lý dự án"],
  ["org-tthra", "TTHRA", "Thanh tra"],

  // Khối Phân hiệu, Viện, Trung tâm Nghiên cứu
  ["org-phpn", "PHPN", "Phân hiệu phía Nam"],
  ["org-ttncudt", "TTNCUDT", "Trung tâm Nghiên cứu ứng dụng sản xuất thuốc"],
  ["org-vdtd", "VDTD", "Viện đào tạo Dược"],
  ["org-ttdtrndhpx", "TTDTRNDHPX", "Trung tâm Đào tạo, nghiên cứu Độc học và Phóng xạ"],

  // Khối Bộ môn, Khoa - Khối Khoa học cơ bản
  ["org-llmln", "LLMLN", "Khoa Lý luận Mác – Lê-nin"],
  ["org-k30", "K30", "Khoa Công tác Đảng, công tác chính trị"],
  ["org-khti", "KHTI", "Khoa Toán - Tin học"],
  ["org-k81", "K81", "Khoa Vật lý – Lý sinh"],
  ["org-k82", "K82", "Khoa Hóa"],
  ["org-shdtyh", "SHDTYH", "Bộ môn Sinh học và Di truyền y học"],
  ["org-k84", "K84", "Khoa Ngoại ngữ"],

  // Khối Bộ môn, Khoa - Khối Y học cơ sở
  ["org-bmsl", "BMSL", "Bộ môn Sinh lý"],
  ["org-bmslb", "BMSLB", "Bộ môn Sinh lý bệnh"],
  ["org-bmgp", "BMGP", "Bộ môn Giải phẫu"],
  ["org-bmptth", "BMPTTH", "Bộ môn Phẫu thuật thực hành, thực nghiệm"],
  ["org-bmksc", "BMKSC", "Bộ môn Ký sinh trùng và Côn trùng"],
  ["org-bmmd", "BMMD", "Bộ môn Miễn dịch"],

  // Khối Bộ môn, Khoa - Khối Y học Quân sự
  ["org-kchtmqy", "KCHTMQY", "Khoa Chỉ huy tham mưu Quân y"],
  ["org-kqs", "KQS", "Khoa Quân sự"],
  ["org-kyhqbc", "KYHQBC", "Khoa Y học Quân binh chủng"],
  ["org-kvsqd", "KVSQD", "Khoa Vệ sinh Quân đội"],
  ["org-kdthqs", "KDTHQS", "Khoa Dịch tễ học Quân sự"],

  // Khối Bộ môn, Khoa - Khối Y học Lâm sàng – Khối Nội
  ["org-bmkth", "BMKTH", "Bộ môn – Khoa Tiêu hóa"],
  ["org-bmktm", "BMKTM", "Bộ môn – Khoa Tim mạch"],
  ["org-bmkknt", "BMKKNT", "Bộ môn – Khoa Khớp – Nội tiết"],
  ["org-bmktlm", "BMKTLM", "Bộ môn – Khoa Thận – Lọc máu"],
  ["org-bmttnhh", "BMTTNHH", "Bộ môn – Trung tâm Nội hô hấp"],
  ["org-bmtk", "BMTK", "Bộ môn Thần kinh"],
  ["org-bmtn", "BMTN", "Bộ môn Truyền nhiễm"],
  ["org-bmtt", "BMTT", "Bộ môn Tâm thần"],
  ["org-bmndc", "BMNDC", "Bộ môn Nội dã chiến"],
  ["org-bmkdl", "BMKDL", "Bộ môn Khoa Da liễu"],
  ["org-bmkyhct", "BMKYHCT", "Bộ môn Khoa Y học cổ truyền"],
  ["org-bmkn", "BMKN", "Bộ môn Khoa Nhi"],
  ["org-bmkvltl", "BMKVLTL", "Bộ môn Khoa Vật lý trị liệu – Phục hồi chức năng"],
  ["org-bmttub", "BMTTUB", "Bộ môn – Trung tâm Ung bướu"],

  // Khối Bộ môn, Khoa - Khối Y học lâm sàng – Khối Ngoại
  ["org-bmttctch", "BMTTCTCH", "Bộ môn Trung tâm Chấn thương chỉnh hình"],
  ["org-bmptth2", "BMPTTH2", "Bộ môn Phẫu thuật tiêu hóa"],
  ["org-bmbyhth", "BMBYHTH", "Bộ môn Bỏng và Y học thảm họa"],
  ["org-bmptthtm", "BMPTTHTM", "Bộ môn Phẫu thuật tạo hình và thẩm mỹ"],
  ["org-bmkm", "BMKM", "Bộ môn Khoa Mắt"],
  ["org-bmkgm", "BMKGM", "Bộ môn Khoa Gây mê"],
  ["org-bmktmh", "BMKTMH", "Bộ môn Khoa Tai – Mũi – Họng"],
  ["org-bmkntn", "BMKNTN", "Bộ môn Khoa Ngoại Tiết niệu"],
  ["org-bmkphm", "BMKPHM", "Bộ môn Khoa Phẫu thuật hàm mặt và Tạo hình"],
  ["org-bmkpttk", "BMKPTTK", "Bộ môn Khoa Phẫu thuật thần kinh"],
  ["org-bmkps", "BMKPS", "Bộ môn Khoa Phụ sản"],
  ["org-bmtthscc", "BMTTHSCC", "Bộ môn Trung tâm Hồi sức cấp cứu và chống độc"],
  ["org-bmkptln", "BMKPTLN", "Bộ môn Khoa Phẫu thuật lồng ngực"],
  ["org-bmkrm", "BMKRM", "Bộ môn Khoa Răng miệng"],
  ["org-bmkndc", "BMKNDC", "Bộ môn – Khoa Ngoại dã chiến"],

  // Khối Bộ môn, Khoa - Khối Y học lâm sàng – Khối Cận lâm sàng
  ["org-bmtthhtm", "BMTTHHTM", "Bộ môn – Trung tâm Huyết học truyền máu"],
  ["org-bmksh", "BMKSH", "Bộ môn Khoa Sinh hóa"],
  ["org-bmgpb", "BMGPB", "Bộ môn Giải phẫu bệnh"],
  ["org-bmdd", "BMDD", "Bộ môn Điều dưỡng"],
  ["org-bmkvsyh", "BMKVSYH", "Bộ môn – Khoa Vi sinh y học"],
  ["org-bmkdd", "BMKDD", "Bộ môn – Khoa Dinh dưỡng"],
  ["org-bmttcdha", "BMTTCDHA", "Bộ môn – Trung tâm Chẩn đoán hình ảnh"],
  ["org-bmkcdcn", "BMKCDCN", "Bộ môn – Khoa Chẩn đoán chức năng"],

  // Đơn vị Quản lý Học viên
  ["org-he1", "HE1", "Hệ 1"],
  ["org-he2", "HE2", "Hệ 2"],
  ["org-he3", "HE3", "Hệ 3"],
  ["org-he4", "HE4", "Hệ 4"],
  ["org-he5", "HE5", "Hệ 5"],

  // Đơn vị ngoài
  ["org-external", "EXT", "Đơn vị ngoài"]
];

const allUnitIds = organizationUnits.map(([id]) => id);

// Scientific management staff operate the intake, supplement, assignment and consolidation flows
// for the units they oversee, not only for their own department. Without this the seeded staff
// accounts sit in Phòng KHQS while the seeded PI files under Khoa Toán - Tin học, so every
// scope-checked staff action (ST-3.1 supplement, ST-3.2 assignment, ST-3.4 consolidation) is
// refused and the demo cannot reach the approval step.
const additionalOrganizationScopes = {
  "user-admin": allUnitIds,
  "user-admin2": allUnitIds,
  "user-leadership": allUnitIds,
  "user-staff": allUnitIds,
  "user-reviewer": allUnitIds,
  "user-staff-hdtien1": allUnitIds,
  "user-staff-hdtien2": allUnitIds
};

for (const [id, code, name] of organizationUnits) {
  await prisma.organizationUnit.upsert({
    where: { code },
    update: { name, status: "active" },
    create: { id, code, name, status: "active" }
  });
}

for (const user of users) {
  await prisma.user.upsert({
    where: { id: user.id },
    update: {
      username: user.username,
      usernameKey: user.username.toLowerCase(),
      displayName: user.displayName,
      passwordHash: user.passwordHash,
      status: user.status,
      systemRole: user.systemRole,
      unit: user.unit
    },
    create: {
      ...user,
      usernameKey: user.username.toLowerCase()
    }
  });

  let organizationUnit = await prisma.organizationUnit.findFirst({ where: { name: user.unit } });

  if (!organizationUnit) {
    if (user.unit?.includes("Phòng KHQS") || user.unit?.includes("KHQS")) {
      organizationUnit = await prisma.organizationUnit.findUnique({ where: { id: "org-khqs" } });
    } else if (user.unit?.includes("Ban Giám Đốc") || user.unit?.includes("Ban Giám đốc")) {
      organizationUnit = await prisma.organizationUnit.findUnique({ where: { id: "org-bgq" } });
    } else if (user.unit?.includes("Đơn vị ngoài")) {
      organizationUnit = await prisma.organizationUnit.findUnique({ where: { id: "org-external" } });
    }
  }

  if (organizationUnit) {
    await prisma.userOrganizationScope.upsert({
      where: {
        userId_organizationUnitId: {
          userId: user.id,
          organizationUnitId: organizationUnit.id
        }
      },
      update: { isPrimary: true },
      create: { userId: user.id, organizationUnitId: organizationUnit.id, isPrimary: true }
    });
  }

  for (const organizationUnitId of additionalOrganizationScopes[user.id] ?? []) {
    await prisma.userOrganizationScope.upsert({
      where: {
        userId_organizationUnitId: { userId: user.id, organizationUnitId }
      },
      update: { isPrimary: false },
      create: { userId: user.id, organizationUnitId, isPrimary: false }
    });
  }
}

const catalogs = [
  ["research-field", "military-medicine", "Y học quân sự"],
  ["research-field", "basic-medicine", "Y học cơ sở"],
  ["research-field", "clinical-medicine", "Y học lâm sàng"],
  ["research-field", "preventive-medicine", "Y học dự phòng"],
  ["research-field", "public-health", "Y tế công cộng"],
  ["research-field", "pharmacy", "Dược học"],
  ["research-field", "biotechnology", "Công nghệ sinh học"],
  ["research-field", "life-sciences", "Khoa học sự sống"],
  ["research-field", "biomedical-tech", "Công nghệ y sinh"],
  ["research-field", "chemistry", "Hóa học"],
  ["research-field", "physics", "Vật lý"],
  ["research-field", "information-technology", "Công nghệ thông tin"],
  ["research-field", "social-humanities", "Khoa học xã hội và nhân văn"],
  ["academic-rank", "professor", "Giáo sư"],
  ["academic-rank", "associate-professor", "Phó giáo sư"],
  ["academic-degree", "doctor", "Tiến sĩ"],
  ["academic-degree", "master", "Thạc sĩ"],
  ["academic-degree", "bscki", "BSCKI"],
  ["academic-degree", "bsckii", "BSCKII"],
  ["proposal-type", "national-level", "Đề tài cấp Quốc gia"],
  ["proposal-type", "ministry-level", "Đề tài cấp Bộ Quốc phòng"],
  ["proposal-type", "branch-level", "Đề tài cấp Ngành / Cục"],
  ["proposal-type", "academy-level", "Đề tài cấp Học viện"],
  ["proposal-type", "grassroots-level", "Đề tài cấp Cơ sở"],
  ["proposal-type", "student-level", "Đề tài Sinh viên / Học viên NCKH"],
  ["military-scope", "military", "Nhiệm vụ Quân sự - Quốc phòng"],
  ["military-scope", "civilian", "Nhiệm vụ Dân sự / Ngoài quân đội"],
  ["military-scope", "dual-use", "Lưỡng dụng (Quân - Dân y kết hợp)"],
  ["priority", "high", "Ưu tiên cao"],
  ["report-type", "periodic", "Báo cáo định kỳ"],
  ["scoring-criterion", "scientific-value", "Giá trị khoa học"]
];

for (const [type, code, name] of catalogs) {
  await prisma.catalogItem.upsert({
    where: {
      type_code: { type, code }
    },
    update: { name, status: "active", deletedAt: null },
    create: { type, code, name, status: "active" }
  });
}

const intakeStartsAt = new Date();
intakeStartsAt.setDate(intakeStartsAt.getDate() - 1);
const intakeEndsAt = new Date();
intakeEndsAt.setDate(intakeEndsAt.getDate() + 30);

await prisma.proposalIntakePeriod.upsert({
  where: { code: "INTAKE-2026-SEED" },
  update: {
    title: "Đợt tiếp nhận hồ sơ nghiên cứu 2026",
    description: "Đợt tiếp nhận mẫu phục vụ kiểm thử EP-02.",
    startsAt: intakeStartsAt,
    endsAt: intakeEndsAt,
    status: "open",
    applicableOrganizationUnitId: "org-khti",
    requiredPackage: [
      {
        code: "proposal-form",
        label: "Thuyết minh đề tài",
        allowedMimeTypes: ["application/pdf"],
        maxSizeMb: 5
      },
      {
        code: "budget-form",
        label: "Dự toán kinh phí",
        allowedMimeTypes: ["application/pdf"],
        maxSizeMb: 5
      }
    ]
  },
  create: {
    code: "INTAKE-2026-SEED",
    title: "Đợt tiếp nhận hồ sơ nghiên cứu 2026",
    description: "Đợt tiếp nhận mẫu phục vụ kiểm thử EP-02.",
    startsAt: intakeStartsAt,
    endsAt: intakeEndsAt,
    status: "open",
    applicableOrganizationUnitId: "org-khti",
    requiredPackage: [
      {
        code: "proposal-form",
        label: "Thuyết minh đề tài",
        allowedMimeTypes: ["application/pdf"],
        maxSizeMb: 5
      },
      {
        code: "budget-form",
        label: "Dự toán kinh phí",
        allowedMimeTypes: ["application/pdf"],
        maxSizeMb: 5
      }
    ]
  }
});

await prisma.systemParameter.upsert({
  where: { key: "session_timeout_minutes" },
  update: { value: "720", label: "Thời gian phiên đăng nhập" },
  create: { key: "session_timeout_minutes", value: "720", label: "Thời gian phiên đăng nhập" }
});

await prisma.notificationTemplate.upsert({
  where: { key: "user_created" },
  update: {
    subject: "Tài khoản RTMS đã được tạo",
    body: "Tài khoản của đồng chí đã được tạo trên hệ thống RTMS.",
    status: "active"
  },
  create: {
    key: "user_created",
    subject: "Tài khoản RTMS đã được tạo",
    body: "Tài khoản của đồng chí đã được tạo trên hệ thống RTMS.",
    status: "active"
  }
});

await prisma.notificationTemplate.upsert({
  where: { key: "researcher_account_activation" },
  update: {
    subject: "Kích hoạt tài khoản DocManS",
    body: "Xin chào {{displayName}}, vui lòng thiết lập mật khẩu để kích hoạt tài khoản DocManS.",
    status: "active"
  },
  create: {
    key: "researcher_account_activation",
    subject: "Kích hoạt tài khoản DocManS",
    body: "Xin chào {{displayName}}, vui lòng thiết lập mật khẩu để kích hoạt tài khoản DocManS.",
    status: "active"
  }
});

// Seed researcher profiles for internal researchers
const doctorDegree = await prisma.catalogItem.findFirst({ where: { type: "academic-degree", code: "doctor" } });

const patuanProfile = await prisma.researcherProfile.upsert({
  where: { linkedUserId: "user-pi" },
  update: {
    fullName: "TS. Phạm Anh Tuấn",
    fullNameKey: "pham anh tuan",
    profileType: "INTERNAL",
    managementOrganizationUnitId: "org-khti",
    academicDegreeCatalogItemId: doctorDegree?.id,
    title: "Tiến sĩ",
    position: "Chủ nhiệm Bộ môn",
    militaryRank: "Thượng tá",
    contactEmail: "patuan@hvqy.edu.vn",
    contactEmailKey: "patuan@hvqy.edu.vn",
    contactPhone: "0912345678",
    contactPhoneKey: "0912345678",
    status: "ACTIVE",
    curriculumVitae: {
      personalInfo: {
        avatarUrl: "/logo.png",
        scientistType: "domestic",
        fullName: "TS. Phạm Anh Tuấn",
        gender: "Nam",
        birthDate: "1978-08-15",
        birthPlace: "Hà Nội",
        nationality: "Việt Nam",
        idNumber: "001078009876",
        idIssueDate: "2021-04-12",
        idIssuePlace: "Cục Cảnh sát QLHC về TTXH",
        organization: "Học viện Quân y",
        position: "Chủ nhiệm Bộ môn Toán - Tin học",
        militaryRank: "Thượng tá",
        academicTitle: "Tiến sĩ",
        highestDegree: "Tiến sĩ",
        degreeYear: "2012",
        academicRankEn: "PhD. Senior Lecturer",
        researchFieldDetail: "Trí tuệ nhân tạo, Xử lý ảnh y tế, Hệ thống quản lý dữ liệu y học quân sự",
        keywords: "AI in Medicine, Medical Imaging, Deep Learning, Health Informatics",
        phone: "0912345678",
        email: "patuan@hvqy.edu.vn",
        address: "Số 160 Phùng Hưng, Phường Phúc La, Quận Hà Đông, TP. Hà Nội",
        bankAccount: "19028889998888",
        bankName: "Ngân hàng TMCP Quân đội (MB Bank)",
        bankBranch: "Chi nhánh Thanh Xuân, Hà Nội",
        smartCaSerial: "VMMU-CA-PAT-2026-99",
        dataSharingConsent: true,
        languages: [
          { language: "Tiếng Anh", level: "Thành thạo", certificate: "IELTS 7.5" },
          { language: "Tiếng Nga", level: "Khá", certificate: "B2 Quân sự" }
        ]
      },
      training: [
        {
          degree: "Đại học",
          field: "Công nghệ thông tin",
          institution: "Đại học Bách khoa Hà Nội",
          graduationYear: "2000",
          trainingType: "Chính quy",
          thesisTitle: "Hệ thống truyền tải ảnh y tế chuẩn DICOM"
        },
        {
          degree: "Thạc sĩ",
          field: "Khoa học máy tính",
          institution: "Học viện Kỹ thuật Quân sự",
          graduationYear: "2005",
          trainingType: "Chính quy",
          thesisTitle: "Phân đoạn ảnh cộng hưởng từ não bộ bằng mạng nơ-ron nhân tạo"
        },
        {
          degree: "Tiến sĩ",
          field: "Khoa học máy tính",
          institution: "Đại học Tổng hợp Sydney (Australia)",
          graduationYear: "2012",
          trainingType: "Chính quy",
          thesisTitle: "Machine learning algorithms for early detection of neurological disorders from 3D MRI scans"
        }
      ],
      workHistory: [
        {
          period: "2001 - 2006",
          institution: "Học viện Quân y",
          position: "Giảng viên Bộ môn Tin học",
          address: "160 Phùng Hưng, Hà Đông, Hà Nội"
        },
        {
          period: "2007 - 2012",
          institution: "Đại học Tổng hợp Sydney (Australia)",
          position: "Nghiên cứu sinh - Trợ lý nghiên cứu",
          address: "Camperdown NSW 2006, Australia"
        },
        {
          period: "2013 - 2018",
          institution: "Học viện Quân y",
          position: "Phó Chủ nhiệm Bộ môn Toán - Tin học",
          address: "160 Phùng Hưng, Hà Đông, Hà Nội"
        },
        {
          period: "2019 - Nay",
          institution: "Học viện Quân y",
          position: "Chủ nhiệm Bộ môn Toán - Tin học",
          address: "160 Phùng Hưng, Hà Đông, Hà Nội"
        }
      ],
      researchSummary: "Chuyên gia về trí tuệ nhân tạo trong y tế với hơn 20 năm kinh nghiệm nghiên cứu và giảng dạy tại Học viện Quân y. Đã chủ nhiệm và tham gia 8 đề tài nghiên cứu khoa học các cấp, công bố hơn 35 bài báo quốc tế thuộc danh mục ISI/Scopus và nhiều công trình tiêu biểu phục vụ y học quân sự.",
      publications: [
        {
          category: "Tạp chí quốc tế ISI/Scopus",
          title: "A multimodal deep learning framework for brain trauma outcome prediction",
          year: "2024",
          journalOrPublisher: "IEEE Journal of Biomedical and Health Informatics",
          issnOrIsbn: "2168-2194",
          role: "Tác giả chính"
        },
        {
          category: "Tạp chí uy tín trong nước",
          title: "Nghiên cứu ứng dụng mạng học sâu nhận dạng tổn thương xuất huyết sọ não trên phim cắt lớp vi tính",
          year: "2025",
          journalOrPublisher: "Tạp chí Y - Dược học Quân sự",
          issnOrIsbn: "1859-1892",
          role: "Tác giả chính"
        },
        {
          category: "Sách chuyên khảo / Giáo trình",
          title: "Giáo trình Tin học ứng dụng trong Y học lâm sàng",
          year: "2023",
          journalOrPublisher: "NXB Quân đội nhân dân",
          issnOrIsbn: "978-604-51-1234-5",
          role: "Chủ biên"
        }
      ],
      intellectualProperty: [
        {
          category: "Bản quyền phần mềm",
          title: "Hệ thống phần mềm hỗ trợ chẩn đoán tự động xuất huyết nội sọ trên ảnh CT",
          number: "Số 1234/2024/QTG",
          year: "2024",
          authority: "Cục Bản quyền tác giả",
          role: "Chủ trì"
        },
        {
          category: "Giải pháp hữu ích",
          title: "Quy trình phân tầng nguy cơ tổn thương đa chấn thương sử dụng mô hình học máy",
          number: "Số 5678/GPHI",
          year: "2023",
          authority: "Cục Sở hữu trí tuệ",
          role: "Đồng tác giả"
        }
      ],
      awards: [
        {
          title: "Giải thưởng Nhân tài Đất Việt trong lĩnh vực Y Dược học",
          year: "2024",
          authority: "Ban Tổ chức Nhân tài Đất Việt & Bộ Y tế",
          description: "Công trình giải pháp chuyển đổi số y tế quân sự"
        },
        {
          title: "Danh hiệu Thầy thuốc Ưu tú",
          year: "2023",
          authority: "Chủ tịch nước CHXHCN Việt Nam",
          description: "Đóng góp xuất sắc trong đào tạo và nghiên cứu khoa học quân y"
        }
      ],
      projects: [
        {
          level: "Cấp Học viện",
          code: "HVQY-2026-NC01",
          title: "Nghiên cứu ứng dụng trí tuệ nhân tạo trong hỗ trợ chẩn đoán hình ảnh chấn thương sọ não",
          period: "2026 - 2027",
          role: "Chủ nhiệm đề tài",
          status: "Đang thực hiện"
        },
        {
          level: "Cấp Bộ Quốc phòng",
          code: "BQP-2024-Y04",
          title: "Đánh giá hiệu quả phác đồ can thiệp sớm ở bệnh nhân đa chấn thương tại tuyến quân y cơ sở",
          period: "2024 - 2025",
          role: "Thành viên nghiên cứu chính",
          status: "Đã nghiệm thu Xuất sắc"
        }
      ]
    }
  },
  create: {
    id: "profile-patuan",
    managementOrganizationUnitId: "org-khti",
    linkedUserId: "user-pi",
    fullName: "TS. Phạm Anh Tuấn",
    fullNameKey: "pham anh tuan",
    profileType: "INTERNAL",
    academicDegreeCatalogItemId: doctorDegree?.id,
    title: "Tiến sĩ",
    position: "Chủ nhiệm Bộ môn",
    militaryRank: "Thượng tá",
    contactEmail: "patuan@hvqy.edu.vn",
    contactEmailKey: "patuan@hvqy.edu.vn",
    contactPhone: "0912345678",
    contactPhoneKey: "0912345678",
    status: "ACTIVE",
    createdById: "user-admin",
    updatedById: "user-admin",
    curriculumVitae: {
      personalInfo: {
        avatarUrl: "/logo.png",
        scientistType: "domestic",
        fullName: "TS. Phạm Anh Tuấn",
        gender: "Nam",
        birthDate: "1978-08-15",
        birthPlace: "Hà Nội",
        nationality: "Việt Nam",
        idNumber: "001078009876",
        idIssueDate: "2021-04-12",
        idIssuePlace: "Cục Cảnh sát QLHC về TTXH",
        organization: "Học viện Quân y",
        position: "Chủ nhiệm Bộ môn Toán - Tin học",
        militaryRank: "Thượng tá",
        academicTitle: "Tiến sĩ",
        highestDegree: "Tiến sĩ",
        degreeYear: "2012",
        academicRankEn: "PhD. Senior Lecturer",
        researchFieldDetail: "Trí tuệ nhân tạo, Xử lý ảnh y tế, Hệ thống quản lý dữ liệu y học quân sự",
        keywords: "AI in Medicine, Medical Imaging, Deep Learning, Health Informatics",
        phone: "0912345678",
        email: "patuan@hvqy.edu.vn",
        address: "Số 160 Phùng Hưng, Phường Phúc La, Quận Hà Đông, TP. Hà Nội",
        bankAccount: "19028889998888",
        bankName: "Ngân hàng TMCP Quân đội (MB Bank)",
        bankBranch: "Chi nhánh Thanh Xuân, Hà Nội",
        smartCaSerial: "VMMU-CA-PAT-2026-99",
        dataSharingConsent: true,
        languages: [
          { language: "Tiếng Anh", level: "Thành thạo", certificate: "IELTS 7.5" },
          { language: "Tiếng Nga", level: "Khá", certificate: "B2 Quân sự" }
        ]
      },
      training: [
        {
          degree: "Đại học",
          field: "Công nghệ thông tin",
          institution: "Đại học Bách khoa Hà Nội",
          graduationYear: "2000",
          trainingType: "Chính quy",
          thesisTitle: "Hệ thống truyền tải ảnh y tế chuẩn DICOM"
        },
        {
          degree: "Thạc sĩ",
          field: "Khoa học máy tính",
          institution: "Học viện Kỹ thuật Quân sự",
          graduationYear: "2005",
          trainingType: "Chính quy",
          thesisTitle: "Phân đoạn ảnh cộng hưởng từ não bộ bằng mạng nơ-ron nhân tạo"
        },
        {
          degree: "Tiến sĩ",
          field: "Khoa học máy tính",
          institution: "Đại học Tổng hợp Sydney (Australia)",
          graduationYear: "2012",
          trainingType: "Chính quy",
          thesisTitle: "Machine learning algorithms for early detection of neurological disorders from 3D MRI scans"
        }
      ],
      workHistory: [
        {
          period: "2001 - 2006",
          institution: "Học viện Quân y",
          position: "Giảng viên Bộ môn Tin học",
          address: "160 Phùng Hưng, Hà Đông, Hà Nội"
        },
        {
          period: "2007 - 2012",
          institution: "Đại học Tổng hợp Sydney (Australia)",
          position: "Nghiên cứu sinh - Trợ lý nghiên cứu",
          address: "Camperdown NSW 2006, Australia"
        },
        {
          period: "2013 - 2018",
          institution: "Học viện Quân y",
          position: "Phó Chủ nhiệm Bộ môn Toán - Tin học",
          address: "160 Phùng Hưng, Hà Đông, Hà Nội"
        },
        {
          period: "2019 - Nay",
          institution: "Học viện Quân y",
          position: "Chủ nhiệm Bộ môn Toán - Tin học",
          address: "160 Phùng Hưng, Hà Đông, Hà Nội"
        }
      ],
      researchSummary: "Chuyên gia về trí tuệ nhân tạo trong y tế với hơn 20 năm kinh nghiệm nghiên cứu và giảng dạy tại Học viện Quân y. Đã chủ nhiệm và tham gia 8 đề tài nghiên cứu khoa học các cấp, công bố hơn 35 bài báo quốc tế thuộc danh mục ISI/Scopus và nhiều công trình tiêu biểu phục vụ y học quân sự.",
      publications: [
        {
          category: "Tạp chí quốc tế ISI/Scopus",
          title: "A multimodal deep learning framework for brain trauma outcome prediction",
          year: "2024",
          journalOrPublisher: "IEEE Journal of Biomedical and Health Informatics",
          issnOrIsbn: "2168-2194",
          role: "Tác giả chính"
        },
        {
          category: "Tạp chí uy tín trong nước",
          title: "Nghiên cứu ứng dụng mạng học sâu nhận dạng tổn thương xuất huyết sọ não trên phim cắt lớp vi tính",
          year: "2025",
          journalOrPublisher: "Tạp chí Y - Dược học Quân sự",
          issnOrIsbn: "1859-1892",
          role: "Tác giả chính"
        },
        {
          category: "Sách chuyên khảo / Giáo trình",
          title: "Giáo trình Tin học ứng dụng trong Y học lâm sàng",
          year: "2023",
          journalOrPublisher: "NXB Quân đội nhân dân",
          issnOrIsbn: "978-604-51-1234-5",
          role: "Chủ biên"
        }
      ],
      intellectualProperty: [
        {
          category: "Bản quyền phần mềm",
          title: "Hệ thống phần mềm hỗ trợ chẩn đoán tự động xuất huyết nội sọ trên ảnh CT",
          number: "Số 1234/2024/QTG",
          year: "2024",
          authority: "Cục Bản quyền tác giả",
          role: "Chủ trì"
        },
        {
          category: "Giải pháp hữu ích",
          title: "Quy trình phân tầng nguy cơ tổn thương đa chấn thương sử dụng mô hình học máy",
          number: "Số 5678/GPHI",
          year: "2023",
          authority: "Cục Sở hữu trí tuệ",
          role: "Đồng tác giả"
        }
      ],
      awards: [
        {
          title: "Giải thưởng Nhân tài Đất Việt trong lĩnh vực Y Dược học",
          year: "2024",
          authority: "Ban Tổ chức Nhân tài Đất Việt & Bộ Y tế",
          description: "Công trình giải pháp chuyển đổi số y tế quân sự"
        },
        {
          title: "Danh hiệu Thầy thuốc Ưu tú",
          year: "2023",
          authority: "Chủ tịch nước CHXHCN Việt Nam",
          description: "Đóng góp xuất sắc trong đào tạo và nghiên cứu khoa học quân y"
        }
      ],
      projects: [
        {
          level: "Cấp Học viện",
          code: "HVQY-2026-NC01",
          title: "Nghiên cứu ứng dụng trí tuệ nhân tạo trong hỗ trợ chẩn đoán hình ảnh chấn thương sọ não",
          period: "2026 - 2027",
          role: "Chủ nhiệm đề tài",
          status: "Đang thực hiện"
        },
        {
          level: "Cấp Bộ Quốc phòng",
          code: "BQP-2024-Y04",
          title: "Đánh giá hiệu quả phác đồ can thiệp sớm ở bệnh nhân đa chấn thương tại tuyến quân y cơ sở",
          period: "2024 - 2025",
          role: "Thành viên nghiên cứu chính",
          status: "Đã nghiệm thu Xuất sắc"
        }
      ]
    }
  }
});

const existingLinkPatuan = await prisma.researcherProfileAccountLink.findFirst({
  where: { researcherProfileId: patuanProfile.id, status: "ACTIVE" }
});
if (!existingLinkPatuan) {
  await prisma.researcherProfileAccountLink.create({
    data: {
      id: "link-patuan",
      researcherProfileId: patuanProfile.id,
      userId: "user-pi",
      status: "ACTIVE",
      effectiveFrom: new Date(),
      reason: "seed-profile-link",
      createdById: "user-admin"
    }
  });
}

const nmtrungProfile = await prisma.researcherProfile.upsert({
  where: { linkedUserId: "user-reviewer" },
  update: {
    fullName: "TS. Đỗ Minh Trung",
    fullNameKey: "do minh trung",
    profileType: "INTERNAL",
    managementOrganizationUnitId: "org-bqlkhqs",
    academicDegreeCatalogItemId: doctorDegree?.id,
    title: "Tiến sĩ",
    position: "Trưởng Ban QLKH, Phòng KHQS",
    militaryRank: "Thượng tá",
    contactEmail: "dmtrung@hvqy.edu.vn",
    contactEmailKey: "dmtrung@hvqy.edu.vn",
    externalAffiliation: "Phòng KHQS - Ban QLKH",
    contactPhone: "0987654321",
    contactPhoneKey: "0987654321",
    status: "ACTIVE"
  },
  create: {
    id: "profile-nmtrung",
    managementOrganizationUnitId: "org-bqlkhqs",
    linkedUserId: "user-reviewer",
    fullName: "TS. Đỗ Minh Trung",
    fullNameKey: "do minh trung",
    profileType: "INTERNAL",
    academicDegreeCatalogItemId: doctorDegree?.id,
    title: "Tiến sĩ",
    position: "Trưởng Ban QLKH, Phòng KHQS",
    militaryRank: "Thượng tá",
    contactEmail: "dmtrung@hvqy.edu.vn",
    contactEmailKey: "dmtrung@hvqy.edu.vn",
    externalAffiliation: "Phòng KHQS - Ban QLKH",
    contactPhone: "0987654321",
    contactPhoneKey: "0987654321",
    status: "ACTIVE",
    createdById: "user-admin",
    updatedById: "user-admin"
  }
});

const existingLinkTrung = await prisma.researcherProfileAccountLink.findFirst({
  where: { researcherProfileId: nmtrungProfile.id, status: "ACTIVE" }
});
if (!existingLinkTrung) {
  await prisma.researcherProfileAccountLink.create({
    data: {
      id: "link-nmtrung",
      researcherProfileId: nmtrungProfile.id,
      userId: "user-reviewer",
      status: "ACTIVE",
      effectiveFrom: new Date(),
      reason: "seed-profile-link",
      createdById: "user-admin"
    }
  });
}

const hdtien1Profile = await prisma.researcherProfile.upsert({
  where: { linkedUserId: "user-staff-hdtien1" },
  update: {
    fullName: "ThS. Hoàng Đình Tiến",
    fullNameKey: "hoang dinh tien",
    profileType: "INTERNAL",
    managementOrganizationUnitId: "org-khqs",
    title: "Thạc sĩ",
    position: "Chuyên viên QLKH, Phòng KHQS",
    militaryRank: "Đại úy",
    contactEmail: "hdtien1@hvqy.edu.vn",
    contactEmailKey: "hdtien1@hvqy.edu.vn",
    externalAffiliation: "Phòng KHQS",
    contactPhone: "0912345678",
    contactPhoneKey: "0912345678",
    status: "ACTIVE"
  },
  create: {
    id: "profile-hdtien1",
    managementOrganizationUnitId: "org-khqs",
    linkedUserId: "user-staff-hdtien1",
    fullName: "ThS. Hoàng Đình Tiến",
    fullNameKey: "hoang dinh tien",
    profileType: "INTERNAL",
    title: "Thạc sĩ",
    position: "Chuyên viên QLKH, Phòng KHQS",
    militaryRank: "Đại úy",
    contactEmail: "hdtien1@hvqy.edu.vn",
    contactEmailKey: "hdtien1@hvqy.edu.vn",
    externalAffiliation: "Phòng KHQS",
    contactPhone: "0912345678",
    contactPhoneKey: "0912345678",
    status: "ACTIVE",
    createdById: "user-admin",
    updatedById: "user-admin"
  }
});

const existingLinkTien = await prisma.researcherProfileAccountLink.findFirst({
  where: { researcherProfileId: hdtien1Profile.id, status: "ACTIVE" }
});
if (!existingLinkTien) {
  await prisma.researcherProfileAccountLink.create({
    data: {
      id: "link-hdtien1",
      researcherProfileId: hdtien1Profile.id,
      userId: "user-staff-hdtien1",
      status: "ACTIVE",
      effectiveFrom: new Date(),
      reason: "seed-profile-link",
      createdById: "user-admin"
    }
  });
}

// Seed sample proposals
const seedIntake = await prisma.proposalIntakePeriod.findFirst({ where: { code: "INTAKE-2026-SEED" } });

const proposal1 = await prisma.researchProposal.upsert({
  where: { code: "HVQY-2026-NC01" },
  update: {
    title: "Nghiên cứu ứng dụng trí tuệ nhân tạo trong hỗ trợ chẩn đoán hình ảnh chấn thương sọ não",
    status: "ready_for_approval",
    ownerId: "user-pi",
    hostOrganizationUnitId: "org-khti",
    intakePeriodId: seedIntake.id,
    proposalTypeCode: "academy-level",
    researchFieldCode: "military-medicine",
    budgetMetadata: {
      amount: 450000000,
      currency: "VND",
      note: "Ngân sách sự nghiệp NCKH Học viện Quân y năm 2026"
    },
    councilMetadata: {
      status: "approved",
      decisionNumber: "QĐ-TLHĐ-HVQY2026NC01/HVQY",
      decidedAt: "2026-09-15T08:30:00.000Z",
      decidedById: "user-leadership",
      decidedByName: "GS. TS. Trần Viết Tiến",
      approvalNote: "Nhất trí thành lập Hội đồng theo đề nghị của Trưởng phòng KHQS. Giao Hội đồng hoàn thành đánh giá trước ngày 25/09/2026.",
      proposedAt: "2026-09-12T10:00:00.000Z",
      proposedById: "user-staff",
      proposedByName: "TS. Nguyễn Minh Phương",
      meetingDate: "2026-09-18T09:00:00.000Z",
      meetingLocation: "Phòng họp 1 - Tòa nhà Trung tâm - Học viện Quân y",
      tentativeAgenda: "1. Tuyên bố lý do, giới thiệu đại biểu. 2. Công bố Quyết định thành lập Hội đồng. 3. Chủ nhiệm báo cáo tóm tắt thuyết minh. 4. Phản biện và thành viên cho ý kiến. 5. Hội đồng bỏ phiếu và kết luận.",
      members: [
        {
          role: "chair",
          roleLabel: "Chủ tịch Hội đồng",
          userId: "user-leadership",
          displayName: "GS. TS. Trần Viết Tiến",
          academicTitle: "Giáo sư, Tiến sĩ",
          unit: "Ban Giám đốc Học viện"
        },
        {
          role: "secretary",
          roleLabel: "Thư ký khoa học",
          userId: "user-staff",
          displayName: "TS. Nguyễn Minh Phương",
          academicTitle: "Tiến sĩ",
          unit: "Phòng Khoa học Quân sự"
        },
        {
          role: "reviewer_1",
          roleLabel: "Ủy viên Phản biện 1",
          userId: "user-reviewer",
          displayName: "TS. Đỗ Minh Trung",
          academicTitle: "Tiến sĩ",
          unit: "Ban Quản lý KHQS"
        },
        {
          role: "reviewer_2",
          roleLabel: "Ủy viên Phản biện 2",
          userId: "user-researcher2",
          displayName: "Nhà nghiên cứu nội bộ 2",
          academicTitle: "Tiến sĩ",
          unit: "Khoa Toán - Tin học"
        },
        {
          role: "member",
          roleLabel: "Ủy viên",
          userId: "user-researcher3",
          displayName: "Nhà nghiên cứu nội bộ 3",
          academicTitle: "Thạc sĩ, Bác sĩ CKII",
          unit: "Trung tâm Chẩn đoán hình ảnh"
        }
      ],
      councilMinutes: {
        meetingConductedAt: "2026-09-18T09:00:00.000Z",
        attendance: ["user-leadership", "user-staff", "user-reviewer", "user-researcher2", "user-researcher3"],
        conclusion: "approved",
        conclusionLabel: "Đạt yêu cầu (Đề nghị phê duyệt)",
        averageScore: 88.5,
        summaryComments: "Đề tài có tính thời sự cao trong điều kiện y học quân sự và dã chiến. Thuyết minh rõ ràng, phương pháp nghiên cứu chặt chẽ.",
        modificationsRequired: "Cần bổ sung thêm cỡ mẫu lâm sàng tại các Bệnh viện Quân y tuyến dưới.",
        recordedById: "user-staff",
        recordedByName: "TS. Nguyễn Minh Phương",
        recordedAt: "2026-09-18T11:30:00.000Z"
      }
    }
  },
  create: {
    id: "prop-seed-001",
    code: "HVQY-2026-NC01",
    title: "Nghiên cứu ứng dụng trí tuệ nhân tạo trong hỗ trợ chẩn đoán hình ảnh chấn thương sọ não",
    intakePeriodId: seedIntake.id,
    ownerId: "user-pi",
    hostOrganizationUnitId: "org-khti",
    status: "ready_for_approval",
    proposalTypeCode: "academy-level",
    researchFieldCode: "military-medicine",
    budgetMetadata: {
      amount: 450000000,
      currency: "VND",
      note: "Ngân sách sự nghiệp NCKH Học viện Quân y năm 2026"
    },
    councilMetadata: {
      status: "approved",
      decisionNumber: "QĐ-TLHĐ-HVQY2026NC01/HVQY",
      decidedAt: "2026-09-15T08:30:00.000Z",
      decidedById: "user-leadership",
      decidedByName: "GS. TS. Trần Viết Tiến",
      approvalNote: "Nhất trí thành lập Hội đồng theo đề nghị của Trưởng phòng KHQS. Giao Hội đồng hoàn thành đánh giá trước ngày 25/09/2026.",
      proposedAt: "2026-09-12T10:00:00.000Z",
      proposedById: "user-staff",
      proposedByName: "TS. Nguyễn Minh Phương",
      meetingDate: "2026-09-18T09:00:00.000Z",
      meetingLocation: "Phòng họp 1 - Tòa nhà Trung tâm - Học viện Quân y",
      tentativeAgenda: "1. Tuyên bố lý do, giới thiệu đại biểu. 2. Công bố Quyết định thành lập Hội đồng. 3. Chủ nhiệm báo cáo tóm tắt thuyết minh. 4. Phản biện và thành viên cho ý kiến. 5. Hội đồng bỏ phiếu và kết luận.",
      members: [
        {
          role: "chair",
          roleLabel: "Chủ tịch Hội đồng",
          userId: "user-leadership",
          displayName: "GS. TS. Trần Viết Tiến",
          academicTitle: "Giáo sư, Tiến sĩ",
          unit: "Ban Giám đốc Học viện"
        },
        {
          role: "secretary",
          roleLabel: "Thư ký khoa học",
          userId: "user-staff",
          displayName: "TS. Nguyễn Minh Phương",
          academicTitle: "Tiến sĩ",
          unit: "Phòng Khoa học Quân sự"
        },
        {
          role: "reviewer_1",
          roleLabel: "Ủy viên Phản biện 1",
          userId: "user-reviewer",
          displayName: "TS. Đỗ Minh Trung",
          academicTitle: "Tiến sĩ",
          unit: "Ban Quản lý KHQS"
        },
        {
          role: "reviewer_2",
          roleLabel: "Ủy viên Phản biện 2",
          userId: "user-researcher2",
          displayName: "Nhà nghiên cứu nội bộ 2",
          academicTitle: "Tiến sĩ",
          unit: "Khoa Toán - Tin học"
        },
        {
          role: "member",
          roleLabel: "Ủy viên",
          userId: "user-researcher3",
          displayName: "Nhà nghiên cứu nội bộ 3",
          academicTitle: "Thạc sĩ, Bác sĩ CKII",
          unit: "Trung tâm Chẩn đoán hình ảnh"
        }
      ],
      councilMinutes: {
        meetingConductedAt: "2026-09-18T09:00:00.000Z",
        attendance: ["user-leadership", "user-staff", "user-reviewer", "user-researcher2", "user-researcher3"],
        conclusion: "approved",
        conclusionLabel: "Đạt yêu cầu (Đề nghị phê duyệt)",
        averageScore: 88.5,
        summaryComments: "Đề tài có tính thời sự cao trong điều kiện y học quân sự và dã chiến. Thuyết minh rõ ràng, phương pháp nghiên cứu chặt chẽ.",
        modificationsRequired: "Cần bổ sung thêm cỡ mẫu lâm sàng tại các Bệnh viện Quân y tuyến dưới.",
        recordedById: "user-staff",
        recordedByName: "TS. Nguyễn Minh Phương",
        recordedAt: "2026-09-18T11:30:00.000Z"
      }
    },
    submittedAt: new Date(),
    submittedById: "user-pi"
  }
});

await prisma.proposalEvaluationSummary.upsert({
  where: { proposalId: "prop-seed-001" },
  update: {
    summary: "Hồ sơ đã được Hội đồng tư vấn đánh giá sơ tuyển thông qua với điểm trung bình 88.5/100, xếp loại Xuất sắc. Các tiêu chí về tính cấp thiết quân sự, tính khả thi và dự toán phù hợp quy định.",
    recommendation: "Kính trình Giám đốc Học viện xem xét phê duyệt thực hiện đề tài.",
    status: "ready",
    markedReadyAt: new Date()
  },
  create: {
    proposalId: "prop-seed-001",
    summary: "Hồ sơ đã được Hội đồng tư vấn đánh giá sơ tuyển thông qua với điểm trung bình 88.5/100, xếp loại Xuất sắc. Các tiêu chí về tính cấp thiết quân sự, tính khả thi và dự toán phù hợp quy định.",
    recommendation: "Kính trình Giám đốc Học viện xem xét phê duyệt thực hiện đề tài.",
    status: "ready",
    createdById: "user-staff",
    updatedById: "user-staff",
    markedReadyAt: new Date()
  }
});

const proposal2 = await prisma.researchProposal.upsert({
  where: { code: "BQP-2026-Y03" },
  update: {
    title: "Nghiên cứu hiệu quả điều trị phục hồi chức năng sau ghép tạng tại các bệnh viện quân đội",
    status: "approved",
    ownerId: "user-researcher1",
    hostOrganizationUnitId: "org-khti",
    intakePeriodId: seedIntake.id,
    proposalTypeCode: "ministry-level",
    researchFieldCode: "military-medicine",
    budgetMetadata: {
      amount: 1200000000,
      currency: "VND",
      note: "Ngân sách sự nghiệp NCKH - Quốc phòng giao kế hoạch năm 2026"
    }
  },
  create: {
    id: "prop-seed-002",
    code: "BQP-2026-Y03",
    title: "Nghiên cứu hiệu quả điều trị phục hồi chức năng sau ghép tạng tại các bệnh viện quân đội",
    intakePeriodId: seedIntake.id,
    ownerId: "user-researcher1",
    hostOrganizationUnitId: "org-khti",
    status: "approved",
    proposalTypeCode: "ministry-level",
    researchFieldCode: "military-medicine",
    budgetMetadata: {
      amount: 1200000000,
      currency: "VND",
      note: "Ngân sách sự nghiệp NCKH - Quốc phòng giao kế hoạch năm 2026"
    },
    submittedAt: new Date(),
    submittedById: "user-researcher1"
  }
});

await prisma.proposalEvaluationSummary.upsert({
  where: { proposalId: "prop-seed-002" },
  update: {
    summary: "Hội đồng đánh giá độc lập và chuyên môn Cục Quân y thống nhất thông qua đề tài với tỷ lệ 100% đồng thuận.",
    recommendation: "Kính trình Thủ trưởng phê duyệt chính thức giao nhiệm vụ.",
    status: "ready",
    markedReadyAt: new Date()
  },
  create: {
    proposalId: "prop-seed-002",
    summary: "Hội đồng đánh giá độc lập và chuyên môn Cục Quân y thống nhất thông qua đề tài với tỷ lệ 100% đồng thuận.",
    recommendation: "Kính trình Thủ trưởng phê duyệt chính thức giao nhiệm vụ.",
    status: "ready",
    createdById: "user-staff",
    updatedById: "user-staff",
    markedReadyAt: new Date()
  }
});

await prisma.proposalDecision.upsert({
  where: { id: "decision-seed-002" },
  update: {
    decision: "approved",
    note: "Đồng ý phê duyệt đề tài theo kết luận của Hội đồng đánh giá và dự toán đã được thẩm định.",
    decidedById: "user-leadership",
    decidedAt: new Date(),
    fromStatus: "ready_for_approval",
    toStatus: "approved"
  },
  create: {
    id: "decision-seed-002",
    proposalId: "prop-seed-002",
    decision: "approved",
    note: "Đồng ý phê duyệt đề tài theo kết luận của Hội đồng đánh giá và dự toán đã được thẩm định.",
    decidedById: "user-leadership",
    decidedAt: new Date(),
    fromStatus: "ready_for_approval",
    toStatus: "approved"
  }
});

const proposal3 = await prisma.researchProposal.upsert({
  where: { id: "prop-seed-003" },
  update: {
    title: "Nghiên cứu ứng dụng cảm biến y sinh thông minh trong theo dõi sức khỏe bộ đội cơ động dã chiến",
    status: "submitted",
    ownerId: "user-researcher1",
    hostOrganizationUnitId: "org-khti",
    intakePeriodId: seedIntake.id,
    proposalTypeCode: "ministry-level",
    researchFieldCode: "military-medicine",
    budgetMetadata: {
      amount: 850000000,
      currency: "VND",
      note: "Ngân sách sự nghiệp NCKH - Quốc phòng giao kế hoạch năm 2026"
    },
    councilMetadata: {
      status: "submitted",
      proposedAt: "2026-09-18T14:30:00.000Z",
      proposedById: "user-staff",
      proposedByName: "TS. Nguyễn Minh Phương",
      meetingDate: "2026-09-24T08:30:00.000Z",
      meetingLocation: "Phòng họp Ban Giám đốc (Tầng 3, Nhà Trung tâm)",
      tentativeAgenda: "1. Công bố Quyết định thành lập Hội đồng. 2. Chủ nhiệm báo cáo tóm tắt thuyết minh. 3. Các thành viên phản biện và ủy viên nhận xét. 4. Hội đồng thảo luận và bỏ phiếu đánh giá.",
      members: [
        {
          role: "chair",
          roleLabel: "Chủ tịch Hội đồng",
          userId: "user-leadership",
          displayName: "GS. TS. Trần Viết Tiến",
          academicTitle: "Giáo sư, Tiến sĩ",
          unit: "Ban Giám đốc Học viện"
        },
        {
          role: "secretary",
          roleLabel: "Thư ký khoa học",
          userId: "user-staff",
          displayName: "TS. Nguyễn Minh Phương",
          academicTitle: "Tiến sĩ",
          unit: "Phòng Khoa học Quân sự"
        },
        {
          role: "reviewer_1",
          roleLabel: "Ủy viên Phản biện 1",
          userId: "user-reviewer",
          displayName: "TS. Đỗ Minh Trung",
          academicTitle: "Tiến sĩ",
          unit: "Ban Quản lý KHQS"
        },
        {
          role: "reviewer_2",
          roleLabel: "Ủy viên Phản biện 2",
          userId: "user-pi",
          displayName: "TS. Phạm Anh Tuấn",
          academicTitle: "Tiến sĩ",
          unit: "Khoa Toán - Tin học"
        },
        {
          role: "member",
          roleLabel: "Ủy viên",
          userId: "user-researcher2",
          displayName: "Nhà nghiên cứu nội bộ 2",
          academicTitle: "Thạc sĩ",
          unit: "Khoa Toán - Tin học"
        }
      ]
    }
  },
  create: {
    id: "prop-seed-003",
    code: "HVQY-2026-NC03",
    title: "Nghiên cứu ứng dụng cảm biến y sinh thông minh trong theo dõi sức khỏe bộ đội cơ động dã chiến",
    intakePeriodId: seedIntake.id,
    ownerId: "user-researcher1",
    hostOrganizationUnitId: "org-khti",
    status: "submitted",
    proposalTypeCode: "ministry-level",
    researchFieldCode: "military-medicine",
    budgetMetadata: {
      amount: 850000000,
      currency: "VND",
      note: "Ngân sách sự nghiệp NCKH - Quốc phòng giao kế hoạch năm 2026"
    },
    councilMetadata: {
      status: "submitted",
      proposedAt: "2026-09-18T14:30:00.000Z",
      proposedById: "user-staff",
      proposedByName: "TS. Nguyễn Minh Phương",
      meetingDate: "2026-09-24T08:30:00.000Z",
      meetingLocation: "Phòng họp Ban Giám đốc (Tầng 3, Nhà Trung tâm)",
      tentativeAgenda: "1. Công bố Quyết định thành lập Hội đồng. 2. Chủ nhiệm báo cáo tóm tắt thuyết minh. 3. Các thành viên phản biện và ủy viên nhận xét. 4. Hội đồng thảo luận và bỏ phiếu đánh giá.",
      members: [
        {
          role: "chair",
          roleLabel: "Chủ tịch Hội đồng",
          userId: "user-leadership",
          displayName: "GS. TS. Trần Viết Tiến",
          academicTitle: "Giáo sư, Tiến sĩ",
          unit: "Ban Giám đốc Học viện"
        },
        {
          role: "secretary",
          roleLabel: "Thư ký khoa học",
          userId: "user-staff",
          displayName: "TS. Nguyễn Minh Phương",
          academicTitle: "Tiến sĩ",
          unit: "Phòng Khoa học Quân sự"
        },
        {
          role: "reviewer_1",
          roleLabel: "Ủy viên Phản biện 1",
          userId: "user-reviewer",
          displayName: "TS. Đỗ Minh Trung",
          academicTitle: "Tiến sĩ",
          unit: "Ban Quản lý KHQS"
        },
        {
          role: "reviewer_2",
          roleLabel: "Ủy viên Phản biện 2",
          userId: "user-pi",
          displayName: "TS. Phạm Anh Tuấn",
          academicTitle: "Tiến sĩ",
          unit: "Khoa Toán - Tin học"
        },
        {
          role: "member",
          roleLabel: "Ủy viên",
          userId: "user-researcher2",
          displayName: "Nhà nghiên cứu nội bộ 2",
          academicTitle: "Thạc sĩ",
          unit: "Khoa Toán - Tin học"
        }
      ]
    },
    submittedAt: new Date(),
    submittedById: "user-researcher1"
  }
});

// Seed Reviewer assignments
const dueIn14Days = new Date();
dueIn14Days.setDate(dueIn14Days.getDate() + 14);

await prisma.proposalReviewAssignment.upsert({
  where: { id: "assignment-patuan-002" },
  update: {
    status: "assigned",
    dueDate: dueIn14Days
  },
  create: {
    id: "assignment-patuan-002",
    proposalId: proposal2.id,
    reviewerUserId: "user-pi",
    researcherProfileId: patuanProfile.id,
    assignmentRole: "independent_reviewer",
    status: "assigned",
    assignedById: "user-staff",
    dueDate: dueIn14Days
  }
});

await prisma.proposalReviewAssignment.upsert({
  where: { id: "assignment-nmtrung-001" },
  update: {
    status: "assigned",
    dueDate: dueIn14Days
  },
  create: {
    id: "assignment-nmtrung-001",
    proposalId: proposal1.id,
    reviewerUserId: "user-reviewer",
    researcherProfileId: nmtrungProfile.id,
    assignmentRole: "council_member",
    status: "assigned",
    assignedById: "user-staff",
    dueDate: dueIn14Days
  }
});

// Seed notifications
await prisma.userNotification.upsert({
  where: { id: "notif-patuan-001" },
  update: {
    title: "Mời phản biện đề tài: BQP-2026-Y03",
    message: "Bạn được mời tham gia phản biện độc lập cho đề tài \"Nghiên cứu hiệu quả điều trị phục hồi chức năng sau ghép tạng tại các bệnh viện quân đội\". Thời hạn nhận xét đến ngày " + dueIn14Days.toLocaleDateString("vi-VN") + ".",
    type: "INVITATION_TO_REVIEW",
    link: "/invitation-to-review",
    isRead: false
  },
  create: {
    id: "notif-patuan-001",
    userId: "user-pi",
    title: "Mời phản biện đề tài: BQP-2026-Y03",
    message: "Bạn được mời tham gia phản biện độc lập cho đề tài \"Nghiên cứu hiệu quả điều trị phục hồi chức năng sau ghép tạng tại các bệnh viện quân đội\". Thời hạn nhận xét đến ngày " + dueIn14Days.toLocaleDateString("vi-VN") + ".",
    type: "INVITATION_TO_REVIEW",
    link: "/invitation-to-review",
    isRead: false
  }
});

await prisma.userNotification.upsert({
  where: { id: "notif-nmtrung-001" },
  update: {
    title: "Mời tham gia Hội đồng đánh giá đề tài: HVQY-2026-NC01",
    message: "Bạn được mời làm thành viên Hội đồng đánh giá đề tài \"Nghiên cứu ứng dụng trí tuệ nhân tạo trong hỗ trợ chẩn đoán hình ảnh chấn thương sọ não\".",
    type: "INVITATION_TO_REVIEW",
    link: "/invitation-to-review",
    isRead: false
  },
  create: {
    id: "notif-nmtrung-001",
    userId: "user-reviewer",
    title: "Mời tham gia Hội đồng đánh giá đề tài: HVQY-2026-NC01",
    message: "Bạn được mời làm thành viên Hội đồng đánh giá đề tài \"Nghiên cứu ứng dụng trí tuệ nhân tạo trong hỗ trợ chẩn đoán hình ảnh chấn thương sọ não\".",
    type: "INVITATION_TO_REVIEW",
    link: "/invitation-to-review",
    isRead: false
  }
});

// Seed scientific regulatory documents & form templates
const minioEndpoint = process.env.MINIO_ENDPOINT || "localhost";
const minioPort = Number(process.env.MINIO_PORT || 9000);
const minioAccessKey = process.env.MINIO_ACCESS_KEY || "minioadmin";
const minioSecretKey = process.env.MINIO_SECRET_KEY || "minioadmin";
const minioBucket = process.env.MINIO_BUCKET_NAME || "rtms-files";

const minioClient = new MinioClient({
  endPoint: minioEndpoint,
  port: minioPort,
  useSSL: false,
  accessKey: minioAccessKey,
  secretKey: minioSecretKey
});

try {
  const bucketExists = await minioClient.bucketExists(minioBucket);
  if (!bucketExists) {
    await minioClient.makeBucket(minioBucket, "us-east-1");
  }
} catch (err) {
  console.warn("MinIO bucket check warning:", err.message);
}

const sampleDocs = [
  {
    id: "doc-tt-05-2023",
    documentNumber: "05/2023/TT-BKHCN",
    title: "Thông tư số 05/2023/TT-BKHCN quy định chi tiết một số điều của Nghị định số 70/2018/NĐ-CP và quản lý các nhiệm vụ KH&CN cấp quốc gia",
    category: "LAW_REGULATION",
    issuingAuthority: "Bộ Khoa học và Công nghệ",
    issuedDate: new Date("2023-05-25"),
    effectiveDate: new Date("2023-07-09"),
    description: "Quy định trình tự, thủ tục xác định, tuyển chọn, giao trực tiếp và quản lý thực hiện nhiệm vụ khoa học và công nghệ cấp quốc gia sử dụng ngân sách nhà nước.",
    fileName: "Thong_tu_05_2023_TT_BKHCN.pdf",
    mimeType: "application/pdf",
    sampleContent: "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n0000000101 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n185\n%%EOF"
  },
  {
    id: "doc-qc-hvqy-2024",
    documentNumber: "1258/QC-HVQY",
    title: "Quy chế Quản lý hoạt động Nghiên cứu khoa học và Công nghệ tại Học viện Quân y",
    category: "INTERNAL_REGULATION",
    issuingAuthority: "Học viện Quân y",
    issuedDate: new Date("2024-01-15"),
    effectiveDate: new Date("2024-02-01"),
    description: "Quy chế toàn diện về tổ chức, quản lý, phân bổ kinh phí, đánh giá nghiệm thu các đề tài, dự án KH&CN cấp cơ sở và phối hợp nghiên cứu.",
    fileName: "Quy_che_QLKH_Hoc_vien_Quan_y_2024.pdf",
    mimeType: "application/pdf",
    sampleContent: "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n0000000101 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n185\n%%EOF"
  },
  {
    id: "doc-bm-01-thuyet-minh",
    documentNumber: "BM-01/NCKH",
    title: "Mẫu BM-01: Thuyết minh đề tài Nghiên cứu khoa học và Công nghệ",
    category: "DOCUMENT_TEMPLATE",
    issuingAuthority: "Phòng Quản lý Khoa học Quân sự",
    issuedDate: new Date("2024-01-20"),
    effectiveDate: new Date("2024-01-20"),
    description: "Biểu mẫu thuyết minh đề tài chuẩn quy định tính cấp thiết, mục tiêu nghiên cứu, nội dung triển khai, phương pháp tiếp cận và dự kiến sản phẩm bàn giao.",
    fileName: "BM01_Thuyet_minh_de_tai_NCKH_CN.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    sampleContent: "PK\x03\x04\x14\x00\x06\x00\x08\x00\x00\x00!\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x0b\x00\x00\x00_rels/.relsPK\x05\x06\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00"
  },
  {
    id: "doc-bm-02-du-toan",
    documentNumber: "BM-02/DTKP",
    title: "Mẫu BM-02: Bảng lập dự toán kinh phí thực hiện đề tài KH&CN",
    category: "DOCUMENT_TEMPLATE",
    issuingAuthority: "Phòng Quản lý Khoa học Quân sự",
    issuedDate: new Date("2024-01-20"),
    effectiveDate: new Date("2024-01-20"),
    description: "Biểu mẫu bảng tính Excel dự toán kinh phí chi tiết theo định mức kinh tế kỹ thuật, tiền công lao động khoa học, nguyên vật liệu và hội thảo.",
    fileName: "BM02_Du_toan_kinh_phi_de_tai.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    sampleContent: "PK\x03\x04\x14\x00\x06\x00\x08\x00\x00\x00!\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x0b\x00\x00\x00_rels/.relsPK\x05\x06\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00"
  },
  {
    id: "doc-bm-06-ly-lich",
    documentNumber: "BM-06/LLKH",
    title: "Mẫu BM-06: Lý lịch khoa học của cá nhân thực hiện nhiệm vụ KH&CN",
    category: "DOCUMENT_TEMPLATE",
    issuingAuthority: "Bộ Khoa học và Công nghệ",
    issuedDate: new Date("2023-05-25"),
    effectiveDate: new Date("2023-07-09"),
    description: "Mẫu chuẩn lý lịch khoa học cá nhân theo quy định Bộ KH&CN (thông tin cá nhân, quá trình đào tạo, công tác, công trình công bố, giải thưởng và bằng sáng chế).",
    fileName: "BM06_Ly_lich_khoa_hoc_ca_nhan.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    sampleContent: "PK\x03\x04\x14\x00\x06\x00\x08\x00\x00\x00!\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x0b\x00\x00\x00_rels/.relsPK\x05\x06\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00"
  },
  {
    id: "doc-bm-04-danh-gia",
    documentNumber: "BM-04/HĐĐG",
    title: "Mẫu BM-04: Phiếu nhận xét, đánh giá hồ sơ đề tài KH&CN của chuyên gia",
    category: "DOCUMENT_TEMPLATE",
    issuingAuthority: "Phòng Quản lý Khoa học Quân sự",
    issuedDate: new Date("2024-01-20"),
    effectiveDate: new Date("2024-01-20"),
    description: "Mẫu phiếu nhận xét dành cho chuyên gia phản biện và thành viên hội đồng đánh giá tính mới, phương pháp nghiên cứu và năng lực chủ nhiệm.",
    fileName: "BM04_Phieu_nhan_xet_danh_gia_de_tai.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    sampleContent: "PK\x03\x04\x14\x00\x06\x00\x08\x00\x00\x00!\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x0b\x00\x00\x00_rels/.relsPK\x05\x06\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00"
  },
  {
    id: "doc-hd-01-quy-trinh",
    documentNumber: "HD-01/QLKH",
    title: "Hướng dẫn quy trình đăng ký, nộp hồ sơ và nghiệm thu đề tài NCKH trực tuyến",
    category: "GUIDELINE",
    issuingAuthority: "Phòng Quản lý Khoa học Quân sự",
    issuedDate: new Date("2024-02-10"),
    effectiveDate: new Date("2024-02-10"),
    description: "Tài liệu hướng dẫn thao tác trên hệ thống DocManS: cách nộp hồ sơ thuyết minh, phản hồi yêu cầu bổ sung, nhận thông báo phản biện và theo dõi tiến độ.",
    fileName: "Huong_dan_nop_va_theo_doi_de_tai_truc_tuyen.pdf",
    mimeType: "application/pdf",
    sampleContent: "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n0000000101 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n185\n%%EOF"
  }
];

for (const doc of sampleDocs) {
  const objectKey = `scientific-documents/${doc.id}/${doc.fileName}`;
  const buffer = Buffer.from(doc.sampleContent);

  try {
    await minioClient.putObject(minioBucket, objectKey, buffer, buffer.length, {
      "Content-Type": doc.mimeType
    });
  } catch (err) {
    console.warn(`MinIO putObject warning for ${objectKey}:`, err.message);
  }

  await prisma.scientificDocument.upsert({
    where: { id: doc.id },
    update: {
      documentNumber: doc.documentNumber,
      title: doc.title,
      category: doc.category,
      issuingAuthority: doc.issuingAuthority,
      issuedDate: doc.issuedDate,
      effectiveDate: doc.effectiveDate,
      description: doc.description,
      status: "ACTIVE",
      fileName: doc.fileName,
      fileSize: buffer.length,
      mimeType: doc.mimeType,
      storageObjectKey: objectKey,
      deletedAt: null
    },
    create: {
      id: doc.id,
      documentNumber: doc.documentNumber,
      title: doc.title,
      category: doc.category,
      issuingAuthority: doc.issuingAuthority,
      issuedDate: doc.issuedDate,
      effectiveDate: doc.effectiveDate,
      description: doc.description,
      status: "ACTIVE",
      fileName: doc.fileName,
      fileSize: buffer.length,
      mimeType: doc.mimeType,
      storageObjectKey: objectKey,
      createdById: "user-staff"
    }
  });
}

await prisma.$disconnect();

