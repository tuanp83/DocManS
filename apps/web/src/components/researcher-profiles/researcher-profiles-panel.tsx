"use client";

import { useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import {
  createResearcherProfile,
  getResearcherProfile,
  loadResearcherProfileCatalogs,
  loadResearcherProfiles,
  profileRequest,
  setResearcherProfileStatus,
  updateResearcherProfile,
  type Participation,
  type ProfileHistory,
  type Publication,
  type ResearcherProfile,
  type ResearcherProfileInput,
  type ResearcherProfileSummary,
  type ResearcherOrganization,
  type ScientificCurriculumVitae
} from "@/lib/researcher-profiles-api";

const initialCv: ScientificCurriculumVitae = {
  personalInfo: {
    avatarUrl: "",
    gender: "Nam",
    birthDate: "",
    birthPlace: "",
    nationality: "Việt Nam",
    idNumber: "",
    idIssueDate: "",
    idIssuePlace: "",
    englishAcademicTitle: "",
    bankAccount: "",
    bankName: "",
    bankBranch: "",
    smartCaSerial: "",
    shareDataAgreement: true,
    contactAddress: "",
    languages: []
  },
  educationHistory: [],
  workHistory: { summary: "", items: [] },
  researchExperience: {
    intellectualProperty: [],
    awards: []
  }
};

const emptyForm: ResearcherProfileInput = {
  fullName: "",
  profileType: "INTERNAL",
  managementOrganizationUnitId: "",
  researchFieldIds: [],
  expertiseKeywords: [],
  publications: [],
  participations: [],
  curriculumVitae: initialCv
};

const levels = {
  ACADEMY_INSTITUTIONAL: "Cấp Học viện / cơ sở",
  MINISTRY: "Cấp Bộ",
  OTHER: "Cấp khác"
};

const historyActions: Record<string, string> = {
  CREATE: "Tạo hồ sơ",
  UPDATE: "Cập nhật hồ sơ",
  SELF_UPDATE: "Nhà nghiên cứu cập nhật",
  ACTIVATE: "Kích hoạt",
  DEACTIVATE: "Ngừng hoạt động",
  ACCOUNT_CREATED: "Tạo và liên kết tài khoản",
  ACCOUNT_LINKED: "Liên kết tài khoản",
  ACCOUNT_UNLINKED: "Hủy liên kết",
  ACCOUNT_RESET: "Gửi lại email kích hoạt"
};

type TabType = "info" | "training" | "work" | "experience" | "print";

export function ResearcherProfilesPanel({ self = false }: { self?: boolean }) {
  const [profiles, setProfiles] = useState<ResearcherProfileSummary[]>([]);
  const [organizations, setOrganizations] = useState<ResearcherOrganization[]>([]);
  const [catalogs, setCatalogs] = useState<Awaited<ReturnType<typeof loadResearcherProfileCatalogs>>>({
    researchFields: [],
    academicRanks: [],
    academicDegrees: []
  });
  const [editing, setEditing] = useState<ResearcherProfile | null>(null);
  const [form, setForm] = useState<ResearcherProfileInput>(emptyForm);
  const [activeTab, setActiveTab] = useState<TabType>("info");
  const [cvLanguage, setCvLanguage] = useState<"VI" | "EN">("VI");

  const [researchFieldQuery, setResearchFieldQuery] = useState("");
  const [researchFieldOpen, setResearchFieldOpen] = useState(false);
  const [keywords, setKeywords] = useState("");
  const [organizationUnitName, setOrganizationUnitName] = useState("");
  const [filters, setFilters] = useState({ keyword: "", profileType: "", status: "", organizationUnitId: "", researchFieldId: "", page: "1" });
  const [total, setTotal] = useState(0);
  const [canCreate, setCanCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [duplicates, setDuplicates] = useState<Array<{ id: string; fullName: string }>>([]);
  const [history, setHistory] = useState<ProfileHistory[] | null>(null);
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [accountQuery, setAccountQuery] = useState("");
  const [accounts, setAccounts] = useState<Array<{ id: string; username: string; displayName: string }>>([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const loadVersion = useRef(0);

  const allowed = (action: string) => editing?.viewerAuthorization.allowedActions.some((value) => value === action) ?? false;
  const editable = editing ? allowed(self ? "researcher-profile.self.update" : "researcher-profile.update") : canCreate;
  const selectedResearchFields = catalogs.researchFields.filter((item) => form.researchFieldIds.includes(item.id));
  const visibleResearchFields = catalogs.researchFields.filter((item) => item.name.toLowerCase().includes(researchFieldQuery.trim().toLowerCase()));
  const accountProvisionOnCreate = !editing && !self && ((form.profileType ?? "INTERNAL") === "INTERNAL" || form.provisionAccount === true);

  function select(profile: ResearcherProfile) {
    setEditing(profile);
    const cv = (profile.curriculumVitae as ScientificCurriculumVitae | null) ?? initialCv;
    const initialUnit = profile.externalAffiliation || cv.personalInfo?.organization || profile.managementOrganization?.name || "";
    setOrganizationUnitName(initialUnit);
    setForm({
      fullName: profile.fullName,
      profileType: profile.profileType,
      managementOrganizationUnitId: profile.managementOrganization.id,
      externalAffiliation: initialUnit,
      academicRankCatalogItemId: profile.academicRank?.id ?? "",
      academicDegreeCatalogItemId: profile.academicDegree?.id ?? "",
      title: profile.title,
      position: profile.position,
      militaryRank: profile.militaryRank,
      contactEmail: profile.contactEmail,
      contactPhone: profile.contactPhone,
      contactNote: profile.contactNote,
      researchFieldIds: profile.researchFields.map((field) => field.id),
      publications: profile.publications,
      participations: profile.participations
        .filter((item) => item.status !== "SUPERSEDED")
        .map(({ id, projectTitle, participationRole, level, startsOn, endsOn, status, notes }) => ({
          id,
          projectTitle,
          participationRole,
          level,
          startsOn,
          endsOn,
          status,
          notes
        })),
      curriculumVitae: {
        personalInfo: { ...initialCv.personalInfo, ...(cv.personalInfo ?? {}), organization: initialUnit },
        educationHistory: cv.educationHistory ?? [],
        workHistory: { summary: cv.workHistory?.summary ?? "", items: cv.workHistory?.items ?? [] },
        researchExperience: {
          intellectualProperty: cv.researchExperience?.intellectualProperty ?? [],
          awards: cv.researchExperience?.awards ?? []
        }
      },
      username: profile.account?.username ?? ""
    });
    setKeywords(profile.expertiseKeywords.join(", "));
    setResearchFieldQuery("");
    setResearchFieldOpen(false);
    setEmail(profile.credentialDelivery?.recipientEmail ?? profile.account?.email ?? profile.contactEmail ?? "");
    setReason("");
    setAccounts([]);
    setSelectedAccount("");
    setHistory(null);
    setDuplicates([]);
    setActiveTab("info");
  }

  async function load() {
    const version = ++loadVersion.current;
    setLoading(true);
    try {
      if (self) {
        const result = await getResearcherProfile("my-profile");
        const nextCatalogs = await loadResearcherProfileCatalogs();
        if (version !== loadVersion.current) return;
        select(result.profile);
        setCatalogs(nextCatalogs);
        if (nextCatalogs.organizations) {
          setOrganizations(nextCatalogs.organizations);
        }
      } else {
        const [data, nextCatalogs] = await Promise.all([loadResearcherProfiles(filters), loadResearcherProfileCatalogs()]);
        if (version !== loadVersion.current) return;
        setProfiles(data.profiles);
        setOrganizations(data.organizationOptions);
        setCatalogs(nextCatalogs);
        setTotal(data.total);
        setCanCreate(data.canCreate);
        setForm((current) => ({
          ...current,
          managementOrganizationUnitId: current.managementOrganizationUnitId || data.organizationOptions[0]?.id || "",
          externalAffiliation: current.externalAffiliation || data.organizationOptions[0]?.name || ""
        }));
        setOrganizationUnitName((current) => current || data.organizationOptions[0]?.name || "");
      }
    } catch (cause) {
      if (version === loadVersion.current) setError(cause instanceof Error ? cause.message : "Không thể tải hồ sơ.");
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    return () => {
      loadVersion.current++;
    };
  }, [self, filters]);

  function startCreate() {
    setEditing(null);
    setForm({
      ...emptyForm,
      managementOrganizationUnitId: organizations[0]?.id ?? "",
      externalAffiliation: organizations[0]?.name ?? "",
      provisionAccount: false,
      curriculumVitae: initialCv
    });
    setOrganizationUnitName(organizations[0]?.name ?? "");
    setKeywords("");
    setResearchFieldQuery("");
    setResearchFieldOpen(false);
    setDuplicates([]);
    setHistory(null);
    setMessage("");
    setError("");
    setActiveTab("info");
  }

  function field(key: keyof ResearcherProfileInput, value: unknown) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function cvPersonalInfo(key: string, value: unknown) {
    setForm((current) => ({
      ...current,
      curriculumVitae: {
        ...current.curriculumVitae,
        personalInfo: {
          ...current.curriculumVitae?.personalInfo,
          [key]: value
        }
      }
    }));
  }

  function filter(key: keyof typeof filters, value: string) {
    setFilters((current) => ({ ...current, [key]: value, ...(key === "page" ? {} : { page: "1" }) }));
  }

  async function perform(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể thực hiện thao tác.");
    } finally {
      setBusy(false);
    }
  }

  function toggleResearchField(id: string) {
    setForm((current) => ({
      ...current,
      researchFieldIds: current.researchFieldIds.includes(id)
        ? current.researchFieldIds.filter((value) => value !== id)
        : [...current.researchFieldIds, id]
    }));
  }

  function handleOrganizationUnitChange(value: string) {
    setOrganizationUnitName(value);
    const normalized = value.trim().toLowerCase();
    const matched = organizations.find((item) =>
      item.name.toLowerCase().trim() === normalized ||
      item.code.toLowerCase().trim() === normalized ||
      normalized.includes(item.name.toLowerCase()) ||
      item.name.toLowerCase().includes(normalized)
    );
    setForm((current) => ({
      ...current,
      externalAffiliation: value,
      managementOrganizationUnitId: matched ? matched.id : (current.managementOrganizationUnitId || organizations[0]?.id || ""),
      curriculumVitae: {
        ...current.curriculumVitae,
        personalInfo: {
          ...current.curriculumVitae?.personalInfo,
          organization: value
        }
      }
    }));
  }

  async function save(confirmDuplicate = false) {
    if (form.researchFieldIds.length === 0) {
      setError("Cần chọn ít nhất một lĩnh vực nghiên cứu.");
      return;
    }
    await perform(async () => {
      const { managementOrganizationUnitId, profileType, provisionAccount, username: nextUsername, ...personal } = form;
      const unitText = (form.externalAffiliation?.trim() || organizationUnitName.trim() || (form.curriculumVitae?.personalInfo as any)?.organization?.trim() || "");
      const normalized = unitText.toLowerCase();
      const matched = organizations.find((item) =>
        item.name.toLowerCase().trim() === normalized ||
        item.code.toLowerCase().trim() === normalized ||
        normalized.includes(item.name.toLowerCase()) ||
        item.name.toLowerCase().includes(normalized)
      );
      const effectiveOrgUnitId = matched?.id || managementOrganizationUnitId || organizations[0]?.id || "";
      const effectiveAffiliation = unitText || undefined;
      const input = {
        ...personal,
        externalAffiliation: effectiveAffiliation,
        curriculumVitae: {
          ...form.curriculumVitae,
          personalInfo: {
            ...form.curriculumVitae?.personalInfo,
            organization: effectiveAffiliation
          }
        },
        expertiseKeywords: keywords.split(",").map((value) => value.trim()).filter(Boolean)
      };
      if (editing) {
        const result = await updateResearcherProfile(self ? "my-profile" : editing.id, {
          ...input,
          managementOrganizationUnitId: effectiveOrgUnitId,
          ...(self ? { username: nextUsername } : { profileType }),
          contextVersion: editing.viewerAuthorization.contextVersion
        });
        select(result.profile);
      } else {
        const result = await createResearcherProfile({
          ...input,
          managementOrganizationUnitId: effectiveOrgUnitId,
          profileType,
          provisionAccount,
          confirmDuplicate
        });
        if (result.requiresConfirmation) {
          setDuplicates(result.duplicateCandidates);
          return;
        }
        if (result.profile) select(result.profile);
      }
      setMessage("Đã lưu lý lịch khoa học thành công.");
      if (!self) await load();
    });
  }

  async function accountAction(action: "" | "/link" | "/unlink" | "/resend-activation") {
    if (!editing) return;
    await perform(async () => {
      const result = await profileRequest<{ delivery?: { status: string; expiresAt?: string } }>(`/${editing.id}/account${action}`, {
        method: "POST",
        body: JSON.stringify({
          contextVersion: editing.viewerAuthorization.contextVersion,
          ...(action === "" || action === "/resend-activation" ? { email } : {}),
          ...(action === "/link" ? { userId: selectedAccount } : {}),
          reason: reason || undefined
        })
      });
      select((await getResearcherProfile(editing.id)).profile);
      setMessage(
        result.delivery
          ? result.delivery.status === "ACCEPTED"
            ? "Máy chủ email đã nhận thư kích hoạt."
            : "Chưa xác nhận gửi email. Có thể gửi lại email kích hoạt."
          : "Đã cập nhật liên kết tài khoản."
      );
      await load();
    });
  }

  // Quản lý Ngoại ngữ (Tab 1)
  function addLanguage() {
    setForm((current) => {
      const langs = current.curriculumVitae?.personalInfo?.languages ?? [];
      return {
        ...current,
        curriculumVitae: {
          ...current.curriculumVitae,
          personalInfo: {
            ...current.curriculumVitae?.personalInfo,
            languages: [...langs, { language: "Tiếng Anh", proficiency: "Khá", certificate: "" }]
          }
        }
      };
    });
  }

  function updateLanguage(index: number, key: string, value: unknown) {
    setForm((current) => {
      const langs = [...(current.curriculumVitae?.personalInfo?.languages ?? [])];
      langs[index] = { ...langs[index], [key]: value };
      return {
        ...current,
        curriculumVitae: {
          ...current.curriculumVitae,
          personalInfo: {
            ...current.curriculumVitae?.personalInfo,
            languages: langs
          }
        }
      };
    });
  }

  function removeLanguage(index: number) {
    setForm((current) => ({
      ...current,
      curriculumVitae: {
        ...current.curriculumVitae,
        personalInfo: {
          ...current.curriculumVitae?.personalInfo,
          languages: current.curriculumVitae?.personalInfo?.languages?.filter((_, i) => i !== index) ?? []
        }
      }
    }));
  }

  // Quản lý đào tạo (Tab 2)
  function addEducation() {
    setForm((current) => {
      const history = current.curriculumVitae?.educationHistory ?? [];
      return {
        ...current,
        curriculumVitae: {
          ...current.curriculumVitae,
          educationHistory: [...history, { degreeLevel: "Đại học", major: "", institution: "", graduationYear: new Date().getFullYear(), trainingMode: "Chính quy" }]
        }
      };
    });
  }

  function updateEducation(index: number, key: string, value: unknown) {
    setForm((current) => {
      const history = [...(current.curriculumVitae?.educationHistory ?? [])];
      history[index] = { ...history[index], [key]: value };
      return {
        ...current,
        curriculumVitae: {
          ...current.curriculumVitae,
          educationHistory: history
        }
      };
    });
  }

  function removeEducation(index: number) {
    setForm((current) => ({
      ...current,
      curriculumVitae: {
        ...current.curriculumVitae,
        educationHistory: current.curriculumVitae?.educationHistory?.filter((_, i) => i !== index) ?? []
      }
    }));
  }

  // Quản lý công tác (Tab 3)
  function addWork() {
    setForm((current) => {
      const items = current.curriculumVitae?.workHistory?.items ?? [];
      return {
        ...current,
        curriculumVitae: {
          ...current.curriculumVitae,
          workHistory: {
            summary: current.curriculumVitae?.workHistory?.summary ?? "",
            items: [...items, { period: "", organization: "", position: "", workField: "Nghiên cứu & Giảng dạy" }]
          }
        }
      };
    });
  }

  function updateWork(index: number, key: string, value: unknown) {
    setForm((current) => {
      const items = [...(current.curriculumVitae?.workHistory?.items ?? [])];
      items[index] = { ...items[index], [key]: value };
      return {
        ...current,
        curriculumVitae: {
          ...current.curriculumVitae,
          workHistory: {
            summary: current.curriculumVitae?.workHistory?.summary ?? "",
            items
          }
        }
      };
    });
  }

  function removeWork(index: number) {
    setForm((current) => ({
      ...current,
      curriculumVitae: {
        ...current.curriculumVitae,
        workHistory: {
          summary: current.curriculumVitae?.workHistory?.summary ?? "",
          items: current.curriculumVitae?.workHistory?.items?.filter((_, i) => i !== index) ?? []
        }
      }
    }));
  }

  // Quản lý SHTT & Giải thưởng (Tab 4)
  function addIp() {
    setForm((current) => {
      const list = current.curriculumVitae?.researchExperience?.intellectualProperty ?? [];
      return {
        ...current,
        curriculumVitae: {
          ...current.curriculumVitae,
          researchExperience: {
            ...current.curriculumVitae?.researchExperience,
            intellectualProperty: [...list, { title: "", issueYear: new Date().getFullYear(), patentNumber: "", issueAgency: "Cục Sở hữu trí tuệ" }]
          }
        }
      };
    });
  }

  function updateIp(index: number, key: string, value: unknown) {
    setForm((current) => {
      const list = [...(current.curriculumVitae?.researchExperience?.intellectualProperty ?? [])];
      list[index] = { ...list[index], [key]: value };
      return {
        ...current,
        curriculumVitae: {
          ...current.curriculumVitae,
          researchExperience: {
            ...current.curriculumVitae?.researchExperience,
            intellectualProperty: list
          }
        }
      };
    });
  }

  function removeIp(index: number) {
    setForm((current) => ({
      ...current,
      curriculumVitae: {
        ...current.curriculumVitae,
        researchExperience: {
          ...current.curriculumVitae?.researchExperience,
          intellectualProperty: current.curriculumVitae?.researchExperience?.intellectualProperty?.filter((_, i) => i !== index) ?? []
        }
      }
    }));
  }

  function addAward() {
    setForm((current) => {
      const list = current.curriculumVitae?.researchExperience?.awards ?? [];
      return {
        ...current,
        curriculumVitae: {
          ...current.curriculumVitae,
          researchExperience: {
            ...current.curriculumVitae?.researchExperience,
            awards: [...list, { name: "", awardYear: new Date().getFullYear(), grantingAgency: "" }]
          }
        }
      };
    });
  }

  function updateAward(index: number, key: string, value: unknown) {
    setForm((current) => {
      const list = [...(current.curriculumVitae?.researchExperience?.awards ?? [])];
      list[index] = { ...list[index], [key]: value };
      return {
        ...current,
        curriculumVitae: {
          ...current.curriculumVitae,
          researchExperience: {
            ...current.curriculumVitae?.researchExperience,
            awards: list
          }
        }
      };
    });
  }

  function removeAward(index: number) {
    setForm((current) => ({
      ...current,
      curriculumVitae: {
        ...current.curriculumVitae,
        researchExperience: {
          ...current.curriculumVitae?.researchExperience,
          awards: current.curriculumVitae?.researchExperience?.awards?.filter((_, i) => i !== index) ?? []
        }
      }
    }));
  }

  function publicationField(index: number, key: keyof Publication, value: string | number | null) {
    setForm((current) => ({ ...current, publications: current.publications?.map((item, i) => (i === index ? { ...item, [key]: value } : item)) }));
  }

  function participationField(index: number, key: keyof Participation, value: string) {
    setForm((current) => ({ ...current, participations: current.participations?.map((item, i) => (i === index ? { ...item, [key]: value } : item)) }));
  }

  const cv = form.curriculumVitae ?? initialCv;
  const pInfo = cv.personalInfo ?? {};
  const academicRankName = catalogs.academicRanks.find((r) => r.id === form.academicRankCatalogItemId)?.name ?? "";
  const academicDegreeName = catalogs.academicDegrees.find((d) => d.id === form.academicDegreeCatalogItemId)?.name ?? "";
  const workSummaryWords = (cv.workHistory?.summary ?? "").trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="grid">
      {error ? (
        <p className="state-message error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="state-message success" role="status">
          {message}
        </p>
      ) : null}
      {loading ? <p role="status">Đang tải hồ sơ…</p> : null}

      {!self ? (
        <section className="section-card">
          <div className="section-header">
            <h2>Hồ sơ & Lý lịch khoa học</h2>
            <button className="button primary" disabled={!canCreate || busy} onClick={startCreate}>
              Tạo hồ sơ
            </button>
          </div>
          <div className="form-grid two">
            <label className="field">
              <span>Tìm tên, email hoặc chuyên môn</span>
              <input value={filters.keyword} onChange={(event) => filter("keyword", event.target.value)} />
            </label>
            <label className="field">
              <span>Loại nhà khoa học</span>
              <select value={filters.profileType} onChange={(event) => filter("profileType", event.target.value)}>
                <option value="">Tất cả</option>
                <option value="INTERNAL">Trong nước (Nội bộ)</option>
                <option value="EXTERNAL">Nước ngoài (Bên ngoài)</option>
              </select>
            </label>
            <label className="field">
              <span>Trạng thái hồ sơ</span>
              <select value={filters.status} onChange={(event) => filter("status", event.target.value)}>
                <option value="">Tất cả</option>
                <option value="ACTIVE">Hoạt động</option>
                <option value="INACTIVE">Ngừng hoạt động</option>
              </select>
            </label>
            <label className="field">
              <span>Đơn vị quản lý</span>
              <select value={filters.organizationUnitId} onChange={(event) => filter("organizationUnitId", event.target.value)}>
                <option value="">Tất cả đơn vị được cấp</option>
                {organizations.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Lĩnh vực</span>
              <select value={filters.researchFieldId} onChange={(event) => filter("researchFieldId", event.target.value)}>
                <option value="">Tất cả</option>
                {catalogs.researchFields.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!profiles.length && !loading ? (
            <EmptyState title="Không có hồ sơ phù hợp" message="Thay đổi bộ lọc hoặc tạo hồ sơ trong phạm vi được cấp." />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Họ tên</th>
                    <th>Loại / đơn vị</th>
                    <th>Trạng thái</th>
                    <th>Tài khoản</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {profiles.map((profile) => (
                    <tr key={profile.id}>
                      <td>
                        <strong>{profile.fullName}</strong>
                      </td>
                      <td>
                        {profile.profileType === "EXTERNAL" ? "Nước ngoài" : "Trong nước"}
                        <br />
                        <small className="text-secondary">{profile.externalAffiliation || (profile as any).curriculumVitae?.personalInfo?.organization || profile.managementOrganization.name}</small>
                      </td>
                      <td>
                        <span className={`status-badge ${profile.status === "ACTIVE" ? "success" : "neutral"}`}>
                          {profile.status === "ACTIVE" ? "Hoạt động" : "Ngừng hoạt động"}
                        </span>
                      </td>
                      <td>{accountLabel(profile.account)}</td>
                      <td>
                        <button
                          className="button primary"
                          disabled={busy}
                          onClick={() => void perform(async () => select((await getResearcherProfile(profile.id)).profile))}
                        >
                          Xem / Sửa lý lịch
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="button-row">
            <button className="button" disabled={Number(filters.page) <= 1 || loading} onClick={() => filter("page", String(Number(filters.page) - 1))}>
              Trang trước
            </button>
            <span>
              Trang {filters.page} · {total} hồ sơ
            </span>
            <button className="button" disabled={Number(filters.page) * 20 >= total || loading} onClick={() => filter("page", String(Number(filters.page) + 1))}>
              Trang sau
            </button>
          </div>
        </section>
      ) : null}

      {self && !editing ? (
        !loading ? (
          <EmptyState title="Chưa có hồ sơ được liên kết" message="Liên hệ cán bộ quản lý khoa học để kiểm tra liên kết tài khoản." />
        ) : null
      ) : (
        <section className="section-card">
          <div className="section-header">
            <div>
              <h2>{self ? "Lý lịch khoa học của tôi" : editing ? `Lý lịch khoa học: ${editing.fullName}` : "Tạo mới lý lịch khoa học"}</h2>
              <p className="record-meta">Chuẩn hóa theo Cổng thông tin Khoa học & Công nghệ Quốc gia (STM - Bộ KH&CN) & Học viện Quân y</p>
            </div>
            {editing ? (
              <div className="button-row">
                <button
                  type="button"
                  className={`button ${activeTab === "print" ? "primary" : ""}`}
                  onClick={() => setActiveTab(activeTab === "print" ? "info" : "print")}
                >
                  {activeTab === "print" ? "Quay lại chỉnh sửa" : "Xem & In Lý lịch khoa học"}
                </button>
              </div>
            ) : null}
          </div>

          {/* 5 Tab Navigation Chuẩn STM */}
          <nav className="tabs-nav" aria-label="Các phần của lý lịch khoa học">
            <button
              type="button"
              className={`tab-btn ${activeTab === "info" ? "active" : ""}`}
              onClick={() => setActiveTab("info")}
            >
              1. Thông tin chung
            </button>
            <button
              type="button"
              className={`tab-btn ${activeTab === "training" ? "active" : ""}`}
              onClick={() => setActiveTab("training")}
            >
              2. Quá trình đào tạo
              <span className="tab-badge">{cv.educationHistory?.length ?? 0}</span>
            </button>
            <button
              type="button"
              className={`tab-btn ${activeTab === "work" ? "active" : ""}`}
              onClick={() => setActiveTab("work")}
            >
              3. Quá trình công tác & Kinh nghiệm chuyên môn
              <span className="tab-badge">{cv.workHistory?.items?.length ?? 0}</span>
            </button>
            <button
              type="button"
              className={`tab-btn ${activeTab === "experience" ? "active" : ""}`}
              onClick={() => setActiveTab("experience")}
            >
              4. Kinh nghiệm & Thành tích nghiên cứu
              <span className="tab-badge">{(form.publications?.length ?? 0) + (form.participations?.length ?? 0) + (cv.researchExperience?.intellectualProperty?.length ?? 0) + (cv.researchExperience?.awards?.length ?? 0)}</span>
            </button>
            {editing ? (
              <button
                type="button"
                className={`tab-btn ${activeTab === "print" ? "active" : ""}`}
                onClick={() => setActiveTab("print")}
              >
                5. Xem & In Lý lịch khoa học
              </button>
            ) : null}
          </nav>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <fieldset disabled={busy || !editable} style={{ border: 0, padding: 0, minWidth: 0 }}>
              {/* TAB 1: THÔNG TIN CHUNG (CHUẨN STM BỘ KH&CN) */}
              {activeTab === "info" ? (
                <div className="tab-content">
                  {/* A. Loại nhà khoa học & Ảnh đại diện */}
                  <div className="sub-section-header">
                    <span className="sub-section-title">A. Loại nhà khoa học & Ảnh đại diện (3x4)</span>
                  </div>

                  <div className="stm-avatar-container">
                    <div className="stm-avatar-box">
                      {pInfo.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={pInfo.avatarUrl} alt={form.fullName || "Ảnh chân dung"} className="stm-avatar-img" />
                      ) : (
                        <div className="stm-avatar-placeholder">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                          <span>Ảnh 3x4</span>
                        </div>
                      )}
                    </div>
                    <div className="stm-avatar-info">
                      <div className="stm-avatar-title">Ảnh chân dung nhà khoa học (Khung chuẩn 3x4)</div>
                      <p className="stm-avatar-desc">Hiển thị trên hồ sơ nghiên cứu khoa học và trang in Lý lịch khoa học BM-06</p>
                      <label className="field" style={{ margin: 0 }}>
                        <span>Đường dẫn ảnh chân dung (URL hoặc ảnh tải lên)</span>
                        <input
                          value={pInfo.avatarUrl ?? ""}
                          onChange={(e) => cvPersonalInfo("avatarUrl", e.target.value)}
                          placeholder="https://... hoặc đường dẫn tệp ảnh 3x4"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="stm-form-card" style={{ marginBottom: 16 }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>Loại nhà khoa học *</span>
                    <div className="stm-radio-group">
                      <label className="stm-radio-option">
                        <input
                          type="radio"
                          name="profileTypeRadio"
                          checked={(form.profileType ?? "INTERNAL") === "INTERNAL"}
                          disabled={!!editing?.account}
                          onChange={() => {
                            field("profileType", "INTERNAL");
                            if (!pInfo.nationality) cvPersonalInfo("nationality", "Việt Nam");
                          }}
                        />
                        <span>Nhà khoa học trong nước</span>
                      </label>
                      <label className="stm-radio-option">
                        <input
                          type="radio"
                          name="profileTypeRadio"
                          checked={form.profileType === "EXTERNAL"}
                          disabled={!!editing?.account}
                          onChange={() => {
                            field("profileType", "EXTERNAL");
                          }}
                        />
                        <span>Nhà khoa học nước ngoài</span>
                      </label>
                    </div>
                  </div>

                  {/* B. Thông tin cơ bản & Công tác */}
                  <div className="sub-section-header">
                    <span className="sub-section-title">B. Thông tin cơ bản & Công tác</span>
                  </div>
                  <div className="form-grid two">
                    <label className="field">
                      <span>Họ và tên *</span>
                      <input required maxLength={240} value={form.fullName} onChange={(event) => field("fullName", event.target.value)} placeholder="Nguyễn Văn A" />
                    </label>
                    <label className="field">
                      <span>Giới tính *</span>
                      <select value={pInfo.gender ?? "Nam"} onChange={(event) => cvPersonalInfo("gender", event.target.value)}>
                        <option value="Nam">Nam</option>
                        <option value="Nữ">Nữ</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>Ngày sinh</span>
                      <input type="date" value={pInfo.birthDate ?? ""} onChange={(event) => cvPersonalInfo("birthDate", event.target.value)} />
                    </label>
                    <label className="field">
                      <span>Nơi sinh</span>
                      <input value={pInfo.birthPlace ?? ""} onChange={(event) => cvPersonalInfo("birthPlace", event.target.value)} placeholder="Tỉnh/Thành phố hoặc Quốc gia" />
                    </label>
                    <label className="field">
                      <span>Quốc gia / Quốc tịch</span>
                      <input value={pInfo.nationality ?? "Việt Nam"} onChange={(event) => cvPersonalInfo("nationality", event.target.value)} placeholder="Việt Nam" />
                    </label>
                    <label className="field">
                      <span>Mã định danh cá nhân (Số CCCD / Hộ chiếu) *</span>
                      <input value={pInfo.idNumber ?? ""} onChange={(event) => cvPersonalInfo("idNumber", event.target.value)} placeholder="Số căn cước công dân hoặc Hộ chiếu" />
                    </label>
                    <label className="field">
                      <span>Ngày cấp</span>
                      <input type="date" value={pInfo.idIssueDate ?? ""} onChange={(event) => cvPersonalInfo("idIssueDate", event.target.value)} />
                    </label>
                    <label className="field">
                      <span>Nơi cấp</span>
                      <input value={pInfo.idIssuePlace ?? ""} onChange={(event) => cvPersonalInfo("idIssuePlace", event.target.value)} placeholder="Cục CSQLHC về TTXH" />
                    </label>
                    <label className="field">
                      <span>Cơ quan / Đơn vị công tác cụ thể (theo lý lịch khoa học)</span>
                      <input
                        value={form.externalAffiliation ?? organizationUnitName ?? ""}
                        onChange={(event) => handleOrganizationUnitChange(event.target.value)}
                        placeholder="VD: Ban Giám Đốc, Bệnh viện Quân y 103, Viện Y học Cổ truyền..."
                      />
                    </label>
                    <label className="field">
                      <span>Chức vụ hiện tại</span>
                      <input value={form.position ?? ""} onChange={(event) => field("position", event.target.value)} placeholder="Trưởng bộ môn, Giảng viên, Nghiên cứu viên..." />
                    </label>
                    <label className="field">
                      <span>Quân hàm (HVQY)</span>
                      <input value={form.militaryRank ?? ""} onChange={(event) => field("militaryRank", event.target.value)} placeholder="Đại tá, Thượng tá, Trung tá..." />
                    </label>
                    <label className="field">
                      <span>Chức danh khoa học khác</span>
                      <input value={form.title ?? ""} onChange={(event) => field("title", event.target.value)} placeholder="Chuyên gia y khoa, Giảng viên cao cấp..." />
                    </label>
                    <label className="field">
                      <span>Điện thoại di động</span>
                      <input type="tel" value={form.contactPhone ?? ""} onChange={(event) => field("contactPhone", event.target.value)} placeholder="0912345678" />
                    </label>
                    <label className="field">
                      <span>Email đăng nhập / liên hệ *</span>
                      <input type="email" required={accountProvisionOnCreate} value={form.contactEmail ?? ""} onChange={(event) => field("contactEmail", event.target.value)} placeholder="email@vmmu.edu.vn" />
                    </label>
                    <label className="field" style={{ gridColumn: "1 / -1" }}>
                      <span>Địa chỉ liên hệ</span>
                      <input value={pInfo.contactAddress ?? ""} onChange={(event) => cvPersonalInfo("contactAddress", event.target.value)} placeholder="Số nhà, đường phố, Quận/Huyện, Tỉnh/Thành phố hoặc địa chỉ cơ quan" />
                    </label>
                    <label className="field" style={{ gridColumn: "1 / -1" }}>
                      <span>Đơn vị quản lý / Đơn vị công tác *</span>
                      <input
                        type="text"
                        required
                        list="management-org-suggestions"
                        value={organizationUnitName || form.externalAffiliation || ""}
                        onChange={(event) => handleOrganizationUnitChange(event.target.value)}
                        placeholder="Nhà khoa học tự nhập tên đơn vị (VD: Ban Giám Đốc, Bộ môn Sinh lý học, Khoa Ngoại, Bệnh viện Quân y 103, Học viện Quân y...)"
                      />
                      <datalist id="management-org-suggestions">
                        {organizations.map((item) => (
                          <option key={item.id} value={item.name}>
                            {item.code}
                          </option>
                        ))}
                      </datalist>
                      <small className="field-hint" style={{ color: "var(--color-text-secondary, #64748b)", marginTop: 4 }}>
                        Nhà khoa học tự đánh tên đơn vị trực tiếp theo lý lịch khoa học thay vì bắt buộc lựa chọn dropdown.
                      </small>
                    </label>
                  </div>

                  {/* C. Học hàm, học vị & Lĩnh vực nghiên cứu */}
                  <div className="sub-section-header">
                    <span className="sub-section-title">C. Học hàm, học vị & Lĩnh vực nghiên cứu</span>
                  </div>
                  <div className="form-grid two">
                    <label className="field">
                      <span>Học hàm (Tiếng Việt)</span>
                      <select value={form.academicRankCatalogItemId ?? ""} onChange={(event) => field("academicRankCatalogItemId", event.target.value)}>
                        <option value="">Chưa có / Không</option>
                        {catalogs.academicRanks.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Học vị (Tiếng Việt)</span>
                      <select value={form.academicDegreeCatalogItemId ?? ""} onChange={(event) => field("academicDegreeCatalogItemId", event.target.value)}>
                        <option value="">Chưa có / Không</option>
                        {catalogs.academicDegrees.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field" style={{ gridColumn: "1 / -1" }}>
                      <span>Học hàm, học vị (Tiếng Anh)</span>
                      <input value={pInfo.englishAcademicTitle ?? ""} onChange={(event) => cvPersonalInfo("englishAcademicTitle", event.target.value)} placeholder="Prof. Dr., Assoc. Prof. PhD, MD, etc." />
                    </label>
                  </div>

                  <div className="field researcher-field-picker" style={{ marginTop: 12 }}>
                    <span id="research-fields-label">Ngành / Lĩnh vực nghiên cứu chính *</span>
                    <div className="multi-select-control" role="group" aria-labelledby="research-fields-label">
                      {selectedResearchFields.length ? (
                        <div className="multi-select-chips" aria-label="Lĩnh vực đã chọn">
                          {selectedResearchFields.map((item) => (
                            <button key={item.id} type="button" className="multi-select-chip" onClick={() => toggleResearchField(item.id)} aria-label={`Bỏ ${item.name}`}>
                              {item.name}
                              <span aria-hidden="true">×</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <input
                        type="search"
                        value={researchFieldQuery}
                        placeholder={selectedResearchFields.length ? "Tìm thêm lĩnh vực" : "Chưa chọn lĩnh vực"}
                        onFocus={() => setResearchFieldOpen(true)}
                        onChange={(event) => {
                          setResearchFieldQuery(event.target.value);
                          setResearchFieldOpen(true);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") setResearchFieldOpen(false);
                        }}
                        aria-controls="research-fields-options"
                        aria-expanded={researchFieldOpen}
                        aria-labelledby="research-fields-label"
                      />
                      <button type="button" className="multi-select-toggle" onClick={() => setResearchFieldOpen((value) => !value)} aria-expanded={researchFieldOpen} aria-controls="research-fields-options">
                        Chọn
                      </button>
                    </div>
                    {researchFieldOpen ? (
                      <div id="research-fields-options" className="multi-select-menu" role="group" aria-label="Chọn lĩnh vực nghiên cứu">
                        {visibleResearchFields.length ? (
                          visibleResearchFields.map((item) => (
                            <label key={item.id} className="multi-select-option">
                              <input type="checkbox" checked={form.researchFieldIds.includes(item.id)} onChange={() => toggleResearchField(item.id)} />
                              {item.name}
                            </label>
                          ))
                        ) : (
                          <p className="field-hint">Không có lĩnh vực phù hợp.</p>
                        )}
                      </div>
                    ) : null}
                    <small className="field-hint">Chọn một hoặc nhiều lĩnh vực chuyên môn của nhà khoa học.</small>
                  </div>

                  <label className="field" style={{ marginTop: 12 }}>
                    <span>Từ khóa tương ứng với hướng nghiên cứu chính, chuyên môn hoạt động</span>
                    <input value={keywords} onChange={(event) => setKeywords(event.target.value)} placeholder="Ví dụ: Phẫu thuật nội soi, Vi sinh y học, Dược liệu học, Công nghệ sinh học y dược..." />
                  </label>

                  {/* D. Ngoại ngữ sử dụng */}
                  <div className="sub-section-header" style={{ marginTop: 24 }}>
                    <div>
                      <span className="sub-section-title">D. Ngoại ngữ sử dụng</span>
                      <p className="sub-section-desc">Kê khai các ngoại ngữ sử dụng trong nghiên cứu khoa học và giảng dạy</p>
                    </div>
                    <button type="button" className="button primary btn-sm" onClick={addLanguage}>
                      + Thêm ngoại ngữ
                    </button>
                  </div>

                  {pInfo.languages?.length ? (
                    <div className="table-wrap">
                      <table className="stm-table">
                        <thead>
                          <tr>
                            <th style={{ width: 45 }}>TT</th>
                            <th style={{ width: 180 }}>Ngoại ngữ *</th>
                            <th style={{ width: 160 }}>Mức độ thành thạo</th>
                            <th>Chứng chỉ / Bằng cấp</th>
                            <th style={{ width: 60 }}>Xóa</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pInfo.languages.map((item, index) => (
                            <tr key={index}>
                              <td>{index + 1}</td>
                              <td>
                                <input
                                  required
                                  value={item.language}
                                  onChange={(e) => updateLanguage(index, "language", e.target.value)}
                                  placeholder="Tiếng Anh, Tiếng Pháp, Tiếng Nga..."
                                />
                              </td>
                              <td>
                                <select
                                  value={item.proficiency ?? "Khá"}
                                  onChange={(e) => updateLanguage(index, "proficiency", e.target.value)}
                                >
                                  <option value="Tốt">Tốt</option>
                                  <option value="Khá">Khá</option>
                                  <option value="Trung bình">Trung bình</option>
                                </select>
                              </td>
                              <td>
                                <input
                                  value={item.certificate ?? ""}
                                  onChange={(e) => updateLanguage(index, "certificate", e.target.value)}
                                  placeholder="IELTS 7.0, TOEFL iBT 90, C1, Bằng cử nhân ngoại ngữ..."
                                />
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="button btn-sm"
                                  onClick={() => removeLanguage(index)}
                                  title="Xóa ngoại ngữ này"
                                >
                                  ×
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="stm-table-empty">
                      <p>Chưa có thông tin ngoại ngữ. Bấm "+ Thêm ngoại ngữ" để bổ sung.</p>
                    </div>
                  )}

                  {/* E. Tài khoản ngân hàng, Chữ ký số SmartCA & Dữ liệu */}
                  <div className="sub-section-header" style={{ marginTop: 24 }}>
                    <span className="sub-section-title">E. Tài khoản ngân hàng, Chữ ký số SmartCA & Chia sẻ dữ liệu</span>
                  </div>
                  <div className="form-grid two">
                    <label className="field">
                      <span>Số tài khoản ngân hàng</span>
                      <input value={pInfo.bankAccount ?? ""} onChange={(event) => cvPersonalInfo("bankAccount", event.target.value)} placeholder="Số tài khoản nhận thù lao NCKH" />
                    </label>
                    <label className="field">
                      <span>Tên ngân hàng</span>
                      <input value={pInfo.bankName ?? ""} onChange={(event) => cvPersonalInfo("bankName", event.target.value)} placeholder="MBBank, Vietcombank, BIDV..." />
                    </label>
                    <label className="field">
                      <span>Chi nhánh ngân hàng</span>
                      <input value={pInfo.bankBranch ?? ""} onChange={(event) => cvPersonalInfo("bankBranch", event.target.value)} placeholder="Chi nhánh Hà Nội, v.v." />
                    </label>
                    <label className="field">
                      <span>Tài khoản SmartCA / Serial chứng thư số</span>
                      <input value={pInfo.smartCaSerial ?? ""} onChange={(event) => cvPersonalInfo("smartCaSerial", event.target.value)} placeholder="Mã định danh chứng thư số SmartCA" />
                    </label>
                  </div>

                  <div className="stm-form-card" style={{ marginTop: 12 }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>Bạn có đồng ý chia sẻ dữ liệu? *</span>
                    <p style={{ fontSize: 12, color: "#64748b", margin: "4px 0 8px 0" }}>
                      Cho phép liên thông dữ liệu nghiên cứu khoa học với Cổng thông tin Khoa học & Công nghệ Quốc gia (STM - Bộ KH&CN).
                    </p>
                    <div className="stm-radio-group">
                      <label className="stm-radio-option">
                        <input
                          type="radio"
                          name="shareDataRadio"
                          checked={pInfo.shareDataAgreement !== false}
                          onChange={() => cvPersonalInfo("shareDataAgreement", true)}
                        />
                        <span>Đồng ý</span>
                      </label>
                      <label className="stm-radio-option">
                        <input
                          type="radio"
                          name="shareDataRadio"
                          checked={pInfo.shareDataAgreement === false}
                          onChange={() => cvPersonalInfo("shareDataAgreement", false)}
                        />
                        <span>Không đồng ý</span>
                      </label>
                    </div>
                  </div>

                  <label className="field" style={{ marginTop: 12 }}>
                    <span>Ghi chú hồ sơ</span>
                    <textarea value={form.contactNote ?? ""} onChange={(event) => field("contactNote", event.target.value)} placeholder="Thông tin bổ sung..." />
                  </label>
                </div>
              ) : null}

              {/* TAB 2: QUÁ TRÌNH ĐÀO TẠO */}
              {activeTab === "training" ? (
                <div className="tab-content">
                  <div className="sub-section-header">
                    <div>
                      <span className="sub-section-title">Quá trình đào tạo đại học và sau đại học</span>
                      <p className="sub-section-desc">Kê khai từ bậc đại học trở lên theo chuẩn Lý lịch khoa học của Bộ KH&CN (BM-06)</p>
                    </div>
                    <button type="button" className="button primary btn-sm" onClick={addEducation}>
                      + Thêm quá trình đào tạo
                    </button>
                  </div>

                  {cv.educationHistory?.length ? (
                    <div className="table-wrap">
                      <table className="stm-table">
                        <thead>
                          <tr>
                            <th style={{ width: 45 }}>TT</th>
                            <th style={{ width: 140 }}>Bậc đào tạo</th>
                            <th>Ngành đào tạo (Chuyên ngành)</th>
                            <th>Cơ sở đào tạo (Tiếng Việt)</th>
                            <th style={{ width: 110 }}>Năm tốt nghiệp</th>
                            <th style={{ width: 130 }}>Hình thức đào tạo</th>
                            <th>Tên luận án / đề tài</th>
                            <th style={{ width: 60 }}>Xóa</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cv.educationHistory.map((item, index) => (
                            <tr key={item.id ?? index}>
                              <td>{index + 1}</td>
                              <td>
                                <select value={item.degreeLevel} onChange={(e) => updateEducation(index, "degreeLevel", e.target.value)}>
                                  <option value="Đại học">Đại học</option>
                                  <option value="Thạc sĩ">Thạc sĩ</option>
                                  <option value="Tiến sĩ">Tiến sĩ</option>
                                  <option value="Bác sĩ nội trú">Bác sĩ nội trú</option>
                                  <option value="Bác sĩ CKII">Bác sĩ CKII</option>
                                  <option value="Bác sĩ CKI">Bác sĩ CKI</option>
                                  <option value="Sau tiến sĩ">Sau tiến sĩ (Postdoc)</option>
                                </select>
                              </td>
                              <td>
                                <input value={item.major} onChange={(e) => updateEducation(index, "major", e.target.value)} placeholder="Y đa khoa, Dược, v.v." />
                              </td>
                              <td>
                                <input value={item.institution} onChange={(e) => updateEducation(index, "institution", e.target.value)} placeholder="Học viện Quân y, ĐH Y Hà Nội..." />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  min={1950}
                                  max={2100}
                                  value={item.graduationYear ?? ""}
                                  onChange={(e) => updateEducation(index, "graduationYear", e.target.value ? Number(e.target.value) : null)}
                                />
                              </td>
                              <td>
                                <select value={item.trainingMode ?? "Chính quy"} onChange={(e) => updateEducation(index, "trainingMode", e.target.value)}>
                                  <option value="Chính quy">Chính quy</option>
                                  <option value="Vừa làm vừa học">Vừa làm vừa học</option>
                                  <option value="Liên kết quốc tế">Liên kết quốc tế</option>
                                  <option value="Khác">Khác</option>
                                </select>
                              </td>
                              <td>
                                <input value={item.thesisTitle ?? ""} onChange={(e) => updateEducation(index, "thesisTitle", e.target.value)} placeholder="Đề tài luận văn / luận án tốt nghiệp" />
                              </td>
                              <td>
                                <button type="button" className="button btn-sm" onClick={() => removeEducation(index)} title="Xóa dòng này">
                                  ×
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="stm-table-empty">
                      <p>Chưa có thông tin quá trình đào tạo. Bấm "+ Thêm quá trình đào tạo" để bổ sung.</p>
                    </div>
                  )}
                </div>
              ) : null}

              {/* TAB 3: QUÁ TRÌNH CÔNG TÁC & KINH NGHIỆM CHUYÊN MÔN */}
              {activeTab === "work" ? (
                <div className="tab-content">
                  <div className="stm-form-card">
                    <label className="field">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontWeight: 700 }}>
                          Tóm tắt chuyên môn{" "}
                          <small style={{ fontWeight: "normal", color: "#64748b" }}>
                            (Tóm tắt tối đa 100 từ về công việc chính, lĩnh vực chuyên môn, kinh nghiệm R&D, chuyển giao công nghệ, quản lý nhiệm vụ KH&CN hoặc đổi mới sáng tạo.)
                          </small>
                        </span>
                        <span className={`stm-word-count ${workSummaryWords > 100 ? "exceeded" : ""}`}>
                          Số từ: {workSummaryWords}/100 từ
                        </span>
                      </div>
                      <textarea
                        rows={4}
                        value={cv.workHistory?.summary ?? ""}
                        onChange={(e) =>
                          setForm((current) => ({
                            ...current,
                            curriculumVitae: {
                              ...current.curriculumVitae,
                              workHistory: {
                                summary: e.target.value,
                                items: current.curriculumVitae?.workHistory?.items ?? []
                              }
                            }
                          }))
                        }
                        placeholder="Nêu tóm tắt kinh nghiệm giảng dạy, nghiên cứu, quản lý khoa học..."
                      />
                    </label>
                  </div>

                  <div className="sub-section-header">
                    <div>
                      <span className="sub-section-title">Lịch sử quá trình công tác</span>
                      <p className="sub-section-desc">Kê khai các giai đoạn công tác và vị trí chuyên môn đã đảm nhận</p>
                    </div>
                    <button type="button" className="button primary btn-sm" onClick={addWork}>
                      + Thêm giai đoạn công tác
                    </button>
                  </div>

                  {cv.workHistory?.items?.length ? (
                    <div className="table-wrap">
                      <table className="stm-table">
                        <thead>
                          <tr>
                            <th style={{ width: 45 }}>TT</th>
                            <th style={{ width: 160 }}>Thời gian (Từ - Đến)</th>
                            <th>Đơn vị / Cơ quan công tác</th>
                            <th>Chức danh / Chức vụ</th>
                            <th>Lĩnh vực công việc</th>
                            <th style={{ width: 60 }}>Xóa</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cv.workHistory.items.map((item, index) => (
                            <tr key={item.id ?? index}>
                              <td>{index + 1}</td>
                              <td>
                                <input value={item.period} onChange={(e) => updateWork(index, "period", e.target.value)} placeholder="Ví dụ: 2018 - 2022" />
                              </td>
                              <td>
                                <input value={item.organization} onChange={(e) => updateWork(index, "organization", e.target.value)} placeholder="Bộ môn / Viện / Bệnh viện" />
                              </td>
                              <td>
                                <input value={item.position ?? ""} onChange={(e) => updateWork(index, "position", e.target.value)} placeholder="Giảng viên, Bác sĩ điều trị, Viện trưởng..." />
                              </td>
                              <td>
                                <input value={item.workField ?? ""} onChange={(e) => updateWork(index, "workField", e.target.value)} placeholder="Nghiên cứu, Giảng dạy, Khám chữa bệnh..." />
                              </td>
                              <td>
                                <button type="button" className="button btn-sm" onClick={() => removeWork(index)} title="Xóa dòng này">
                                  ×
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="stm-table-empty">
                      <p>Chưa có lịch sử công tác. Bấm "+ Thêm giai đoạn công tác" để bổ sung.</p>
                    </div>
                  )}
                </div>
              ) : null}

              {/* TAB 4: THÀNH TÍCH & KINH NGHIỆM NCKH */}
              {activeTab === "experience" ? (
                <div className="tab-content">
                  {/* 4.1. Công bố khoa học */}
                  <div className="sub-section-header">
                    <div>
                      <span className="sub-section-title">1. Công bố khoa học:</span>
                      <p className="sub-section-desc">
                        * Bài báo trên tạp chí quốc tế có uy tín (ISI/Scopus)/trong nước (HĐGSNN), báo cáo hội nghị/sách/khác.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="button primary btn-sm"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          publications: [...(current.publications ?? []), { title: "", status: "ACTIVE" }]
                        }))
                      }
                    >
                      + Thêm công bố
                    </button>
                  </div>

                  {form.publications?.length ? (
                    <div className="table-wrap">
                      <table className="stm-table">
                        <thead>
                          <tr>
                            <th style={{ width: 45 }}>TT</th>
                            <th style={{ width: 140 }}>Tác giả</th>
                            <th style={{ width: 85 }}>Năm CB</th>
                            <th>Tên công trình / Bài báo *</th>
                            <th style={{ width: 160 }}>Tạp chí / NXB</th>
                            <th style={{ width: 120 }}>ISSN / DOI</th>
                            <th style={{ width: 140 }}>Ghi chú / Minh chứng</th>
                            <th style={{ width: 100 }}>Trạng thái</th>
                            <th style={{ width: 50 }}>Xóa</th>
                          </tr>
                        </thead>
                        <tbody>
                          {form.publications.map((item, index) => (
                            <tr key={item.id ?? index}>
                              <td>{index + 1}</td>
                              <td>
                                <input value={item.authors ?? ""} onChange={(e) => publicationField(index, "authors", e.target.value)} placeholder="Tên các tác giả" />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  min={1950}
                                  max={2100}
                                  value={item.publicationYear ?? ""}
                                  onChange={(e) => publicationField(index, "publicationYear", e.target.value ? Number(e.target.value) : null)}
                                  placeholder="2024"
                                />
                              </td>
                              <td>
                                <input required value={item.title} onChange={(e) => publicationField(index, "title", e.target.value)} placeholder="Tên bài báo / công trình *" />
                              </td>
                              <td>
                                <input value={item.venue ?? ""} onChange={(e) => publicationField(index, "venue", e.target.value)} placeholder="Tên tạp chí hoặc NXB" />
                              </td>
                              <td>
                                <input value={item.doi ?? ""} onChange={(e) => publicationField(index, "doi", e.target.value)} placeholder="ISSN hoặc DOI" />
                              </td>
                              <td>
                                <input value={item.notes ?? ""} onChange={(e) => publicationField(index, "notes", e.target.value)} placeholder="Minh chứng / link..." />
                              </td>
                              <td>
                                <select value={item.status ?? "ACTIVE"} onChange={(e) => publicationField(index, "status", e.target.value)}>
                                  <option value="ACTIVE">Hiển thị</option>
                                  <option value="INACTIVE">Lưu nháp</option>
                                </select>
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="button btn-sm"
                                  onClick={() => setForm((current) => ({ ...current, publications: current.publications?.filter((_, i) => i !== index) }))}
                                  title="Xóa dòng"
                                >
                                  ×
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="stm-table-empty">
                      <p>Chưa có công bố khoa học. Bấm "+ Thêm công bố" để kê khai.</p>
                    </div>
                  )}

                  {/* 4.2. Văn bằng bảo hộ quyền SHTT */}
                  <div className="sub-section-header" style={{ marginTop: 32 }}>
                    <div>
                      <span className="sub-section-title">2. Văn bằng bảo hộ quyền sở hữu trí tuệ:</span>
                      <p className="sub-section-desc">Bằng độc quyền sáng chế, giải pháp hữu ích, kiểu dáng công nghiệp, bản quyền phần mềm.</p>
                    </div>
                    <button type="button" className="button primary btn-sm" onClick={addIp}>
                      + Thêm văn bằng SHTT
                    </button>
                  </div>

                  {cv.researchExperience?.intellectualProperty?.length ? (
                    <div className="table-wrap">
                      <table className="stm-table">
                        <thead>
                          <tr>
                            <th style={{ width: 45 }}>TT</th>
                            <th style={{ width: 140 }}>Tác giả</th>
                            <th style={{ width: 85 }}>Năm cấp</th>
                            <th>Tên văn bằng / Sáng chế *</th>
                            <th style={{ width: 130 }}>Số bằng / Số đơn</th>
                            <th style={{ width: 160 }}>Cơ quan cấp</th>
                            <th style={{ width: 140 }}>Ghi chú / Minh chứng</th>
                            <th style={{ width: 50 }}>Xóa</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cv.researchExperience.intellectualProperty.map((item, index) => (
                            <tr key={item.id ?? index}>
                              <td>{index + 1}</td>
                              <td>
                                <input value={item.authors ?? ""} onChange={(e) => updateIp(index, "authors", e.target.value)} placeholder="Tác giả / Đồng tác giả" />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  min={1950}
                                  max={2100}
                                  value={item.issueYear ?? ""}
                                  onChange={(e) => updateIp(index, "issueYear", e.target.value ? Number(e.target.value) : null)}
                                  placeholder="2024"
                                />
                              </td>
                              <td>
                                <input value={item.title} onChange={(e) => updateIp(index, "title", e.target.value)} placeholder="Tên sáng chế / giải pháp hữu ích *" />
                              </td>
                              <td>
                                <input value={item.patentNumber ?? ""} onChange={(e) => updateIp(index, "patentNumber", e.target.value)} placeholder="Số bằng / đơn..." />
                              </td>
                              <td>
                                <input value={item.issueAgency ?? ""} onChange={(e) => updateIp(index, "issueAgency", e.target.value)} placeholder="Cục Sở hữu trí tuệ..." />
                              </td>
                              <td>
                                <input value={item.notes ?? ""} onChange={(e) => updateIp(index, "notes", e.target.value)} placeholder="Minh chứng / link..." />
                              </td>
                              <td>
                                <button type="button" className="button btn-sm" onClick={() => removeIp(index)} title="Xóa dòng">
                                  ×
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="stm-table-empty">
                      <p>Chưa có văn bằng bảo hộ sở hữu trí tuệ. Bấm "+ Thêm văn bằng SHTT" để bổ sung.</p>
                    </div>
                  )}

                  {/* 4.3. Giải thưởng KH&CN */}
                  <div className="sub-section-header" style={{ marginTop: 32 }}>
                    <div>
                      <span className="sub-section-title">3. Giải thưởng KH&CN, danh hiệu chuyên môn:</span>
                      <p className="sub-section-desc">
                        Bao gồm minh chứng đáp ứng tiêu chí về Nhân tài về khoa học, công nghệ và đổi mới sáng tạo/Nhà khoa học trẻ tài năng, kỹ sư trẻ tài năng.
                      </p>
                    </div>
                    <button type="button" className="button primary btn-sm" onClick={addAward}>
                      + Thêm giải thưởng / danh hiệu
                    </button>
                  </div>

                  {cv.researchExperience?.awards?.length ? (
                    <div className="table-wrap">
                      <table className="stm-table">
                        <thead>
                          <tr>
                            <th style={{ width: 45 }}>TT</th>
                            <th>Tên giải thưởng / Danh hiệu chuyên môn *</th>
                            <th style={{ width: 95 }}>Năm nhận</th>
                            <th style={{ width: 180 }}>Cơ quan / Tổ chức trao tặng</th>
                            <th style={{ width: 160 }}>Ghi chú / Minh chứng</th>
                            <th style={{ width: 50 }}>Xóa</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cv.researchExperience.awards.map((item, index) => (
                            <tr key={item.id ?? index}>
                              <td>{index + 1}</td>
                              <td>
                                <input value={item.name} onChange={(e) => updateAward(index, "name", e.target.value)} placeholder="Tên giải thưởng hoặc danh hiệu *" />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  min={1950}
                                  max={2100}
                                  value={item.awardYear ?? ""}
                                  onChange={(e) => updateAward(index, "awardYear", e.target.value ? Number(e.target.value) : null)}
                                  placeholder="2024"
                                />
                              </td>
                              <td>
                                <input value={item.grantingAgency ?? ""} onChange={(e) => updateAward(index, "grantingAgency", e.target.value)} placeholder="Bộ Quốc phòng, Bộ Y tế..." />
                              </td>
                              <td>
                                <input value={item.notes ?? ""} onChange={(e) => updateAward(index, "notes", e.target.value)} placeholder="Minh chứng hoặc ghi chú" />
                              </td>
                              <td>
                                <button type="button" className="button btn-sm" onClick={() => removeAward(index)} title="Xóa dòng">
                                  ×
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="stm-table-empty">
                      <p>Chưa có giải thưởng KH&CN hoặc danh hiệu chuyên môn. Bấm "+ Thêm giải thưởng / danh hiệu" để bổ sung.</p>
                    </div>
                  )}

                  {/* 4.4. Đề tài / Nhiệm vụ KH&CN */}
                  <div className="sub-section-header" style={{ marginTop: 32 }}>
                    <div>
                      <span className="sub-section-title">4. Kinh nghiệm chủ nhiệm/tham gia nhiệm vụ, chương trình:</span>
                      <p className="sub-section-desc">Các nhiệm vụ, đề tài, chương trình KH&CN các cấp đã và đang thực hiện.</p>
                    </div>
                    <button
                      type="button"
                      className="button primary btn-sm"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          participations: [
                            ...(current.participations ?? []),
                            { projectTitle: "", participationRole: "Chủ nhiệm", level: "ACADEMY_INSTITUTIONAL", status: "ACTIVE" }
                          ]
                        }))
                      }
                    >
                      + Thêm nhiệm vụ, chương trình
                    </button>
                  </div>

                  {form.participations?.length ? (
                    <div className="table-wrap">
                      <table className="stm-table">
                        <thead>
                          <tr>
                            <th style={{ width: 45 }}>TT</th>
                            <th>Tên nhiệm vụ, Chương trình *</th>
                            <th style={{ width: 150 }}>Cơ quan quản lý (Cấp) *</th>
                            <th style={{ width: 120 }}>Vai trò *</th>
                            <th style={{ width: 110 }}>Bắt đầu</th>
                            <th style={{ width: 110 }}>Kết thúc</th>
                            <th style={{ width: 110 }}>Tình trạng</th>
                            <th style={{ width: 120 }}>Ghi chú</th>
                            <th style={{ width: 50 }}>Xóa</th>
                          </tr>
                        </thead>
                        <tbody>
                          {form.participations.map((item, index) => (
                            <tr key={item.id ?? index}>
                              <td>{index + 1}</td>
                              <td>
                                <input required value={item.projectTitle} onChange={(e) => participationField(index, "projectTitle", e.target.value)} placeholder="Tên đề tài / nhiệm vụ *" />
                              </td>
                              <td>
                                <select value={item.level} onChange={(e) => participationField(index, "level", e.target.value)}>
                                  {Object.entries(levels).map(([val, label]) => (
                                    <option key={val} value={val}>
                                      {label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <input required value={item.participationRole} onChange={(e) => participationField(index, "participationRole", e.target.value)} placeholder="Chủ nhiệm, Thư ký..." />
                              </td>
                              <td>
                                <input type="date" value={item.startsOn ?? ""} onChange={(e) => participationField(index, "startsOn", e.target.value)} />
                              </td>
                              <td>
                                <input type="date" value={item.endsOn ?? ""} min={item.startsOn ?? undefined} onChange={(e) => participationField(index, "endsOn", e.target.value)} />
                              </td>
                              <td>
                                <select value={item.status ?? "ACTIVE"} onChange={(e) => participationField(index, "status", e.target.value)}>
                                  <option value="ACTIVE">Đang thực hiện</option>
                                  <option value="INACTIVE">Đã nghiệm thu</option>
                                </select>
                              </td>
                              <td>
                                <input value={item.notes ?? ""} onChange={(e) => participationField(index, "notes", e.target.value)} placeholder="Mã số, ghi chú..." />
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="button btn-sm"
                                  onClick={() => setForm((current) => ({ ...current, participations: current.participations?.filter((_, i) => i !== index) }))}
                                  title="Xóa dòng"
                                >
                                  ×
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="stm-table-empty">
                      <p>Chưa có đề tài / nhiệm vụ KH&CN được kê khai. Bấm "+ Thêm nhiệm vụ, chương trình" để bổ sung.</p>
                    </div>
                  )}
                </div>
              ) : null}

              {/* TAB 5: XEM VÀ IN LÝ LỊCH KHOA HỌC (CHUẨN MẪU BM-06 BỘ KH&CN) */}
              {activeTab === "print" ? (
                <div className="tab-content">
                  <div className="cv-preview-container">
                    <div className="cv-action-bar">
                      <div className="action-btn-group">
                        <button type="button" className={`button ${cvLanguage === "VI" ? "primary" : ""}`} onClick={() => setCvLanguage("VI")}>
                          Tiếng Việt (Mẫu BM-06)
                        </button>
                        <button type="button" className={`button ${cvLanguage === "EN" ? "primary" : ""}`} onClick={() => setCvLanguage("EN")}>
                          English (Curriculum Vitae)
                        </button>
                      </div>
                      <div className="action-btn-group">
                        <button type="button" className="button primary" onClick={() => window.print()}>
                          In lý lịch khoa học (A4)
                        </button>
                      </div>
                    </div>

                    <article className="cv-paper" id="printable-cv">
                      {cvLanguage === "VI" ? (
                        <>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                            <div>
                              <div className="cv-badge-bm06">MẪU BM-06</div>
                              <div style={{ fontSize: 11, fontStyle: "italic", color: "#475569" }}>Phụ lục II ban hành kèm theo quy định quản lý KH&CN</div>
                            </div>
                            <div className="cv-national-header" style={{ marginBottom: 0 }}>
                              <h4>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</h4>
                              <h5>Độc lập - Tự do - Hạnh phúc</h5>
                              <div className="divider" />
                            </div>
                            <div style={{ width: 140 }} />
                          </div>

                          <h3 className="cv-main-title">LÝ LỊCH KHOA HỌC</h3>
                          <p className="cv-sub-title">(Cá nhân thực hiện nhiệm vụ khoa học và công nghệ)</p>

                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24, marginTop: 16 }}>
                            <div style={{ flex: 1 }}>
                              <h4 className="cv-section-title" style={{ marginTop: 0 }}>I. THÔNG TIN CHUNG</h4>
                              <div className="cv-field-row">
                                <span className="cv-field-label">1. Họ và tên:</span>
                                <span className="cv-field-value">
                                  <strong>{form.fullName.toUpperCase()}</strong>
                                </span>
                              </div>
                              <div className="cv-field-row">
                                <span className="cv-field-label">2. Ngày sinh:</span>
                                <span className="cv-field-value">
                                  {pInfo.birthDate ? new Date(pInfo.birthDate).toLocaleDateString("vi-VN") : "—"} &nbsp;&nbsp;&nbsp;&nbsp;
                                  <strong>Giới tính:</strong> {pInfo.gender ?? "Nam"} &nbsp;&nbsp;&nbsp;&nbsp;
                                  <strong>Nơi sinh:</strong> {pInfo.birthPlace || "—"} &nbsp;&nbsp;&nbsp;&nbsp;
                                  <strong>Quốc tịch:</strong> {pInfo.nationality ?? "Việt Nam"}
                                </span>
                              </div>
                              <div className="cv-field-row">
                                <span className="cv-field-label">3. Số CCCD/Hộ chiếu:</span>
                                <span className="cv-field-value">
                                  {pInfo.idNumber || "—"} &nbsp;&nbsp;&nbsp;&nbsp;
                                  <strong>Ngày cấp:</strong> {pInfo.idIssueDate ? new Date(pInfo.idIssueDate).toLocaleDateString("vi-VN") : "—"} &nbsp;&nbsp;&nbsp;&nbsp;
                                  <strong>Nơi cấp:</strong> {pInfo.idIssuePlace || "—"}
                                </span>
                              </div>
                              <div className="cv-field-row">
                                <span className="cv-field-label">4. Quân hàm / Chức vụ:</span>
                                <span className="cv-field-value">
                                  {form.militaryRank || "—"} &nbsp;|&nbsp; {form.position || "—"}
                                </span>
                              </div>
                              <div className="cv-field-row">
                                <span className="cv-field-label">5. Học hàm, học vị:</span>
                                <span className="cv-field-value">
                                  {[academicRankName, academicDegreeName, form.title].filter(Boolean).join(", ") || "—"}
                                </span>
                              </div>
                              <div className="cv-field-row">
                                <span className="cv-field-label">6. Cơ quan công tác:</span>
                                <span className="cv-field-value">
                                   {form.externalAffiliation || (form.curriculumVitae?.personalInfo as any)?.organization || organizationUnitName || editing?.managementOrganization.name || "Học viện Quân y"}
                                </span>
                              </div>
                              <div className="cv-field-row">
                                <span className="cv-field-label">7. Địa chỉ liên hệ:</span>
                                <span className="cv-field-value">{pInfo.contactAddress || "—"}</span>
                              </div>
                              <div className="cv-field-row">
                                <span className="cv-field-label">8. Điện thoại / Email:</span>
                                <span className="cv-field-value">
                                  {form.contactPhone || "—"} &nbsp;|&nbsp; {form.contactEmail || "—"}
                                </span>
                              </div>
                              <div className="cv-field-row">
                                <span className="cv-field-label">9. Lĩnh vực nghiên cứu:</span>
                                <span className="cv-field-value">{selectedResearchFields.map((f) => f.name).join("; ") || "—"}</span>
                              </div>
                              <div className="cv-field-row">
                                <span className="cv-field-label">10. Hướng NC chính:</span>
                                <span className="cv-field-value">{keywords || "—"}</span>
                              </div>
                              <div className="cv-field-row">
                                <span className="cv-field-label">11. Ngoại ngữ sử dụng:</span>
                                <span className="cv-field-value">
                                  {pInfo.languages?.length
                                    ? pInfo.languages
                                        .map((l) => `${l.language} (${[l.proficiency, l.certificate].filter(Boolean).join(" - ") || "Sử dụng tốt"})`)
                                        .join("; ")
                                    : "—"}
                                </span>
                              </div>
                              {pInfo.bankAccount || pInfo.smartCaSerial ? (
                                <div className="cv-field-row">
                                  <span className="cv-field-label">12. Tài khoản / SmartCA:</span>
                                  <span className="cv-field-value">
                                    {pInfo.bankAccount ? `Số TK: ${pInfo.bankAccount} tại ${pInfo.bankName || "Ngân hàng"}${pInfo.bankBranch ? ` - CN ${pInfo.bankBranch}` : ""}` : ""}
                                    {pInfo.smartCaSerial ? ` | Serial SmartCA: ${pInfo.smartCaSerial}` : ""}
                                  </span>
                                </div>
                              ) : null}
                            </div>

                            <div className="cv-photo-box-print" title="Ảnh đại diện 3x4">
                              {pInfo.avatarUrl ? (
                                <img src={pInfo.avatarUrl} alt={form.fullName} />
                              ) : (
                                <span>Ảnh 3x4 cm</span>
                              )}
                            </div>
                          </div>

                          <h4 className="cv-section-title">II. QUÁ TRÌNH ĐÀO TẠO</h4>
                          {cv.educationHistory?.length ? (
                            <table className="cv-table">
                              <thead>
                                <tr>
                                  <th style={{ width: 40 }}>TT</th>
                                  <th style={{ width: 110 }}>Bậc đào tạo</th>
                                  <th>Ngành đào tạo (Chuyên ngành)</th>
                                  <th>Cơ sở đào tạo</th>
                                  <th style={{ width: 80 }}>Năm TN</th>
                                  <th style={{ width: 100 }}>Hình thức</th>
                                  <th>Tên luận án / đề tài</th>
                                </tr>
                              </thead>
                              <tbody>
                                {cv.educationHistory.map((item, i) => (
                                  <tr key={i}>
                                    <td style={{ textAlign: "center" }}>{i + 1}</td>
                                    <td>{item.degreeLevel}</td>
                                    <td>{item.major}</td>
                                    <td>{item.institution}</td>
                                    <td style={{ textAlign: "center" }}>{item.graduationYear || "—"}</td>
                                    <td>{item.trainingMode || "Chính quy"}</td>
                                    <td>{item.thesisTitle || "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <p style={{ fontStyle: "italic", color: "#64748b" }}>— Chưa kê khai quá trình đào tạo —</p>
                          )}

                          <h4 className="cv-section-title">III. QUÁ TRÌNH CÔNG TÁC VÀ KINH NGHIỆM CHUYÊN MÔN</h4>
                          {cv.workHistory?.summary ? (
                            <p style={{ fontStyle: "italic", marginBottom: 10, lineHeight: 1.5 }}>
                              <strong>1. Tóm tắt hoạt động chuyên môn (tối đa 100 từ):</strong> {cv.workHistory.summary}
                            </p>
                          ) : null}
                          <p style={{ fontWeight: 700, margin: "6px 0 4px 0" }}>2. Quá trình công tác:</p>
                          {cv.workHistory?.items?.length ? (
                            <table className="cv-table">
                              <thead>
                                <tr>
                                  <th style={{ width: 40 }}>TT</th>
                                  <th style={{ width: 140 }}>Thời gian</th>
                                  <th>Đơn vị / Cơ quan công tác</th>
                                  <th style={{ width: 160 }}>Chức danh / Chức vụ</th>
                                  <th style={{ width: 160 }}>Lĩnh vực công việc</th>
                                </tr>
                              </thead>
                              <tbody>
                                {cv.workHistory.items.map((item, i) => (
                                  <tr key={i}>
                                    <td style={{ textAlign: "center" }}>{i + 1}</td>
                                    <td>{item.period}</td>
                                    <td>{item.organization}</td>
                                    <td>{item.position || "—"}</td>
                                    <td>{item.workField || "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <p style={{ fontStyle: "italic", color: "#64748b" }}>— Chưa kê khai quá trình công tác —</p>
                          )}

                          <h4 className="cv-section-title">IV. KINH NGHIỆM VÀ THÀNH TÍCH NGHIÊN CỨU</h4>
                          <h5 style={{ fontWeight: 700, margin: "8px 0 4px 0" }}>1. Công bố khoa học (Bài báo, sách chuyên khảo, báo cáo hội nghị):</h5>
                          {form.publications?.length ? (
                            <table className="cv-table">
                              <thead>
                                <tr>
                                  <th style={{ width: 40 }}>TT</th>
                                  <th style={{ width: 130 }}>Tác giả</th>
                                  <th style={{ width: 70 }}>Năm CB</th>
                                  <th>Tên công trình / Bài báo</th>
                                  <th style={{ width: 160 }}>Tạp chí / NXB</th>
                                  <th style={{ width: 120 }}>ISSN / DOI</th>
                                </tr>
                              </thead>
                              <tbody>
                                {form.publications.map((item, i) => (
                                  <tr key={i}>
                                    <td style={{ textAlign: "center" }}>{i + 1}</td>
                                    <td>{item.authors || "—"}</td>
                                    <td style={{ textAlign: "center" }}>{item.publicationYear || "—"}</td>
                                    <td>
                                      <strong>{item.title}</strong>
                                      {item.notes ? <small><br />Minh chứng: {item.notes}</small> : null}
                                    </td>
                                    <td>{item.venue || "—"}</td>
                                    <td>{item.doi || "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <p style={{ fontStyle: "italic", color: "#64748b" }}>— Chưa có công bố khoa học —</p>
                          )}

                          {cv.researchExperience?.intellectualProperty?.length ? (
                            <>
                              <h5 style={{ fontWeight: 700, margin: "14px 0 4px 0" }}>2. Văn bằng bảo hộ quyền sở hữu trí tuệ:</h5>
                              <table className="cv-table">
                                <thead>
                                  <tr>
                                    <th style={{ width: 40 }}>TT</th>
                                    <th style={{ width: 130 }}>Tác giả</th>
                                    <th style={{ width: 75 }}>Năm cấp</th>
                                    <th>Tên văn bằng / Sáng chế</th>
                                    <th style={{ width: 130 }}>Số bằng / Số đơn</th>
                                    <th style={{ width: 160 }}>Cơ quan cấp</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {cv.researchExperience.intellectualProperty.map((item, i) => (
                                    <tr key={i}>
                                      <td style={{ textAlign: "center" }}>{i + 1}</td>
                                      <td>{item.authors || "—"}</td>
                                      <td style={{ textAlign: "center" }}>{item.issueYear || "—"}</td>
                                      <td>
                                        <strong>{item.title}</strong>
                                        {item.notes ? <small><br />Ghi chú: {item.notes}</small> : null}
                                      </td>
                                      <td>{item.patentNumber || "—"}</td>
                                      <td>{item.issueAgency || "Cục Sở hữu trí tuệ"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </>
                          ) : null}

                          {cv.researchExperience?.awards?.length ? (
                            <>
                              <h5 style={{ fontWeight: 700, margin: "14px 0 4px 0" }}>3. Giải thưởng KH&CN, danh hiệu chuyên môn:</h5>
                              <table className="cv-table">
                                <thead>
                                  <tr>
                                    <th style={{ width: 40 }}>TT</th>
                                    <th>Tên giải thưởng / Danh hiệu chuyên môn</th>
                                    <th style={{ width: 85 }}>Năm nhận</th>
                                    <th style={{ width: 200 }}>Cơ quan / Tổ chức trao tặng</th>
                                    <th style={{ width: 160 }}>Ghi chú / Minh chứng</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {cv.researchExperience.awards.map((item, i) => (
                                    <tr key={i}>
                                      <td style={{ textAlign: "center" }}>{i + 1}</td>
                                      <td><strong>{item.name}</strong></td>
                                      <td style={{ textAlign: "center" }}>{item.awardYear || "—"}</td>
                                      <td>{item.grantingAgency || "—"}</td>
                                      <td>{item.notes || "—"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </>
                          ) : null}

                          <h5 style={{ fontWeight: 700, margin: "14px 0 4px 0" }}>4. Kinh nghiệm chủ nhiệm/tham gia nhiệm vụ, chương trình KH&CN:</h5>
                          {form.participations?.length ? (
                            <table className="cv-table">
                              <thead>
                                <tr>
                                  <th style={{ width: 40 }}>TT</th>
                                  <th>Tên nhiệm vụ, Chương trình</th>
                                  <th style={{ width: 140 }}>Cơ quan quản lý (Cấp)</th>
                                  <th style={{ width: 120 }}>Vai trò</th>
                                  <th style={{ width: 140 }}>Thời gian</th>
                                  <th style={{ width: 110 }}>Tình trạng</th>
                                </tr>
                              </thead>
                              <tbody>
                                {form.participations.map((item, i) => (
                                  <tr key={i}>
                                    <td style={{ textAlign: "center" }}>{i + 1}</td>
                                    <td>
                                      <strong>{item.projectTitle}</strong>
                                      {item.notes ? <small><br />Ghi chú: {item.notes}</small> : null}
                                    </td>
                                    <td>{levels[item.level as keyof typeof levels] ?? item.level}</td>
                                    <td>{item.participationRole}</td>
                                    <td>{[item.startsOn?.slice(0, 7), item.endsOn?.slice(0, 7)].filter(Boolean).join(" – ") || "—"}</td>
                                    <td>{item.status === "ACTIVE" ? "Đang thực hiện" : "Đã nghiệm thu"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <p style={{ fontStyle: "italic", color: "#64748b" }}>— Chưa có nhiệm vụ KH&CN được kê khai —</p>
                          )}

                          {form.contactNote ? (
                            <>
                              <h4 className="cv-section-title">V. CÁC THÔNG TIN THAM KHẢO KHÁC</h4>
                              <p style={{ lineHeight: 1.5 }}>{form.contactNote}</p>
                            </>
                          ) : null}

                          <h4 className="cv-section-title">VI. CAM KẾT CỦA CÁ NHÂN</h4>
                          <p style={{ fontStyle: "italic", margin: "4px 0", lineHeight: 1.5 }}>
                            - Tôi xin cam đoan những thông tin được kê khai trong bản lý lịch này là hoàn toàn trung thực, chính xác và chịu hoàn toàn trách nhiệm trước pháp luật;
                          </p>
                          <p style={{ fontStyle: "italic", margin: "4px 0", lineHeight: 1.5 }}>
                            - Có đủ thời gian, năng lực và điều kiện để tham gia / chủ trì nhiệm vụ khoa học và công nghệ theo quy định hiện hành.
                          </p>

                          <div className="cv-signature-section">
                            <div className="cv-signature-block">
                              <p className="role">XÁC NHẬN CỦA ĐƠN VỊ CÔNG TÁC</p>
                              <p className="note">(Ký, ghi rõ họ tên và đóng dấu)</p>
                            </div>
                            <div className="cv-signature-block">
                              <p style={{ fontStyle: "italic", fontSize: 13, marginBottom: 8 }}>
                                Ngày …… tháng …… năm 20……
                              </p>
                              <p className="role">NGƯỜI KHAI LÝ LỊCH</p>
                              <p className="note">(Ký và ghi rõ họ tên)</p>
                              <p className="name">{form.fullName}</p>
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                            <div>
                              <div className="cv-badge-bm06">FORM BM-06</div>
                              <div style={{ fontSize: 11, fontStyle: "italic", color: "#475569" }}>Annex II - S&T Personnel Curriculum Vitae</div>
                            </div>
                            <div className="cv-national-header" style={{ marginBottom: 0 }}>
                              <h4>SOCIALIST REPUBLIC OF VIETNAM</h4>
                              <h5>Independence - Freedom - Happiness</h5>
                              <div className="divider" />
                            </div>
                            <div style={{ width: 140 }} />
                          </div>

                          <h3 className="cv-main-title">CURRICULUM VITAE</h3>
                          <p className="cv-sub-title">(Scientific and Technological Profile)</p>

                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24, marginTop: 16 }}>
                            <div style={{ flex: 1 }}>
                              <h4 className="cv-section-title" style={{ marginTop: 0 }}>I. PERSONAL INFORMATION</h4>
                              <div className="cv-field-row">
                                <span className="cv-field-label">1. Full Name:</span>
                                <span className="cv-field-value">
                                  <strong>{form.fullName.toUpperCase()}</strong>
                                </span>
                              </div>
                              <div className="cv-field-row">
                                <span className="cv-field-label">2. Academic Title:</span>
                                <span className="cv-field-value">{pInfo.englishAcademicTitle || [academicRankName, academicDegreeName].filter(Boolean).join(", ") || "—"}</span>
                              </div>
                              <div className="cv-field-row">
                                <span className="cv-field-label">3. Current Position:</span>
                                <span className="cv-field-value">{form.position || "—"}</span>
                              </div>
                              <div className="cv-field-row">
                                <span className="cv-field-label">4. Affiliation:</span>
                                <span className="cv-field-value">{form.externalAffiliation || editing?.managementOrganization.name || "Vietnam Military Medical University"}</span>
                              </div>
                              <div className="cv-field-row">
                                <span className="cv-field-label">5. Email & Phone:</span>
                                <span className="cv-field-value">
                                  {form.contactEmail || "—"} &nbsp;|&nbsp; {form.contactPhone || "—"}
                                </span>
                              </div>
                              <div className="cv-field-row">
                                <span className="cv-field-label">6. Research Fields:</span>
                                <span className="cv-field-value">{selectedResearchFields.map((f) => f.name).join("; ") || "—"}</span>
                              </div>
                              <div className="cv-field-row">
                                <span className="cv-field-label">7. Main Keywords:</span>
                                <span className="cv-field-value">{keywords || "—"}</span>
                              </div>
                              <div className="cv-field-row">
                                <span className="cv-field-label">8. Languages:</span>
                                <span className="cv-field-value">
                                  {pInfo.languages?.length
                                    ? pInfo.languages
                                        .map((l) => `${l.language} (${[l.proficiency, l.certificate].filter(Boolean).join(" - ") || "Fluent"})`)
                                        .join("; ")
                                    : "—"}
                                </span>
                              </div>
                            </div>

                            <div className="cv-photo-box-print" title="Photo 3x4">
                              {pInfo.avatarUrl ? (
                                <img src={pInfo.avatarUrl} alt={form.fullName} />
                              ) : (
                                <span>Photo 3x4 cm</span>
                              )}
                            </div>
                          </div>

                          <h4 className="cv-section-title">II. EDUCATION</h4>
                          {cv.educationHistory?.length ? (
                            <table className="cv-table">
                              <thead>
                                <tr>
                                  <th style={{ width: 40 }}>No.</th>
                                  <th style={{ width: 110 }}>Degree</th>
                                  <th>Major</th>
                                  <th>Institution</th>
                                  <th style={{ width: 80 }}>Year</th>
                                  <th>Thesis / Dissertation Title</th>
                                </tr>
                              </thead>
                              <tbody>
                                {cv.educationHistory.map((item, i) => (
                                  <tr key={i}>
                                    <td style={{ textAlign: "center" }}>{i + 1}</td>
                                    <td>{item.degreeLevel}</td>
                                    <td>{item.major}</td>
                                    <td>{item.institution}</td>
                                    <td style={{ textAlign: "center" }}>{item.graduationYear || "—"}</td>
                                    <td>{item.thesisTitle || "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <p style={{ fontStyle: "italic", color: "#64748b" }}>— No education history recorded —</p>
                          )}

                          <h4 className="cv-section-title">III. EMPLOYMENT & EXPERIENCE</h4>
                          {cv.workHistory?.summary ? (
                            <p style={{ fontStyle: "italic", marginBottom: 10, lineHeight: 1.5 }}>
                              <strong>Professional Summary:</strong> {cv.workHistory.summary}
                            </p>
                          ) : null}
                          {cv.workHistory?.items?.length ? (
                            <table className="cv-table">
                              <thead>
                                <tr>
                                  <th style={{ width: 40 }}>No.</th>
                                  <th style={{ width: 140 }}>Period</th>
                                  <th>Organization</th>
                                  <th style={{ width: 160 }}>Position</th>
                                  <th style={{ width: 160 }}>Field of Work</th>
                                </tr>
                              </thead>
                              <tbody>
                                {cv.workHistory.items.map((item, i) => (
                                  <tr key={i}>
                                    <td style={{ textAlign: "center" }}>{i + 1}</td>
                                    <td>{item.period}</td>
                                    <td>{item.organization}</td>
                                    <td>{item.position || "—"}</td>
                                    <td>{item.workField || "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <p style={{ fontStyle: "italic", color: "#64748b" }}>— No employment history recorded —</p>
                          )}

                          <h4 className="cv-section-title">IV. PUBLICATIONS & RESEARCH PROJECTS</h4>
                          <h5 style={{ fontWeight: 700, margin: "8px 0 4px 0" }}>1. Scientific Publications</h5>
                          {form.publications?.length ? (
                            <table className="cv-table">
                              <thead>
                                <tr>
                                  <th style={{ width: 40 }}>No.</th>
                                  <th style={{ width: 130 }}>Authors</th>
                                  <th style={{ width: 70 }}>Year</th>
                                  <th>Publication Title</th>
                                  <th style={{ width: 160 }}>Journal / Venue</th>
                                  <th style={{ width: 120 }}>DOI / ISSN</th>
                                </tr>
                              </thead>
                              <tbody>
                                {form.publications.map((item, i) => (
                                  <tr key={i}>
                                    <td style={{ textAlign: "center" }}>{i + 1}</td>
                                    <td>{item.authors || "—"}</td>
                                    <td style={{ textAlign: "center" }}>{item.publicationYear || "—"}</td>
                                    <td><strong>{item.title}</strong></td>
                                    <td>{item.venue || "—"}</td>
                                    <td>{item.doi || "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <p style={{ fontStyle: "italic", color: "#64748b" }}>— No publications recorded —</p>
                          )}

                          {form.participations?.length ? (
                            <>
                              <h5 style={{ fontWeight: 700, margin: "14px 0 4px 0" }}>2. Research Projects & Programs</h5>
                              <table className="cv-table">
                                <thead>
                                  <tr>
                                    <th style={{ width: 40 }}>No.</th>
                                    <th>Project Title</th>
                                    <th style={{ width: 140 }}>Management Level</th>
                                    <th style={{ width: 120 }}>Role</th>
                                    <th style={{ width: 140 }}>Period</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {form.participations.map((item, i) => (
                                    <tr key={i}>
                                      <td style={{ textAlign: "center" }}>{i + 1}</td>
                                      <td><strong>{item.projectTitle}</strong></td>
                                      <td>{levels[item.level as keyof typeof levels] ?? item.level}</td>
                                      <td>{item.participationRole}</td>
                                      <td>{[item.startsOn?.slice(0, 7), item.endsOn?.slice(0, 7)].filter(Boolean).join(" – ") || "—"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </>
                          ) : null}

                          <h4 className="cv-section-title">V. COMMITMENT</h4>
                          <p style={{ fontStyle: "italic", margin: "4px 0", lineHeight: 1.5 }}>
                            - I hereby certify that the information declared in this curriculum vitae is completely true and accurate;
                          </p>
                          <p style={{ fontStyle: "italic", margin: "4px 0", lineHeight: 1.5 }}>
                            - I have adequate time, capacity, and qualification to conduct and contribute to the scientific research projects as regulated.
                          </p>

                          <div className="cv-signature-section">
                            <div className="cv-signature-block">
                              <p className="role">HEAD OF INSTITUTION</p>
                              <p className="note">(Signature and Stamp)</p>
                            </div>
                            <div className="cv-signature-block">
                              <p style={{ fontStyle: "italic", fontSize: 13, marginBottom: 8 }}>
                                Date: ………………………
                              </p>
                              <p className="role">DECLARANT</p>
                              <p className="note">(Signature)</p>
                              <p className="name">{form.fullName}</p>
                            </div>
                          </div>
                        </>
                      )}
                    </article>
                  </div>
                </div>
              ) : null}

              {activeTab !== "print" ? (
                <div className="button-row" style={{ marginTop: 24 }}>
                  <button className="button primary" type="submit" disabled={busy}>
                    {busy ? "Đang lưu…" : "Lưu lý lịch khoa học"}
                  </button>
                </div>
              ) : null}
            </fieldset>
          </form>

          {duplicates.length ? (
            <div className="state-message warning">
              <p>Có hồ sơ có thể trùng:</p>
              <ul>
                {duplicates.map((item) => (
                  <li key={item.id}>{item.fullName}</li>
                ))}
              </ul>
              <button className="button" disabled={busy} onClick={() => void save(true)}>
                Xác nhận vẫn tạo hồ sơ
              </button>
            </div>
          ) : null}

          {editing && !self ? (
            <div className="button-row" style={{ marginTop: 16 }}>
              <button
                className="button"
                disabled={busy || !allowed(editing.status === "ACTIVE" ? "researcher-profile.deactivate" : "researcher-profile.activate")}
                onClick={() =>
                  void perform(async () => {
                    select((await setResearcherProfileStatus(editing.id, editing.status === "ACTIVE" ? "INACTIVE" : "ACTIVE", editing.viewerAuthorization.contextVersion)).profile);
                    await load();
                  })
                }
              >
                {editing.status === "ACTIVE" ? "Ngừng hoạt động hồ sơ" : "Kích hoạt hồ sơ"}
              </button>
            </div>
          ) : null}
        </section>
      )}

      {editing && !self ? (
        <section className="section-card">
          <h2>Tài khoản hệ thống / Quyền truy cập</h2>
          <p>
            {editing.account
              ? `${editing.account.email ?? "Chưa có email"} — ${accountStatusLabel(editing.account.status)}${editing.account.username ? ` · ${editing.account.username}` : ""}`
              : "Nhà khoa học này chưa có quyền truy cập DocManS."}
          </p>
          {editing.credentialDelivery ? (
            <p>
              Gửi email gần nhất: {editing.credentialDelivery.status === "ACCEPTED" ? "Máy chủ email đã nhận thư" : "Chưa xác nhận gửi"}
              {editing.credentialDelivery.expiresAt ? ` · Hết hạn ${new Date(editing.credentialDelivery.expiresAt).toLocaleString("vi-VN")}` : ""}
            </p>
          ) : null}
          <div className="form-grid two">
            <label className="field">
              <span>Email kích hoạt *</span>
              <input type="email" value={email} disabled={busy || !!editing.account} onChange={(event) => setEmail(event.target.value)} />
              <small>Xác nhận địa chỉ của nhà nghiên cứu trước khi tạo hoặc gửi lại kích hoạt.</small>
            </label>
            {editing.account ? (
              <label className="field">
                <span>Lý do hủy liên kết</span>
                <input value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} />
              </label>
            ) : null}
          </div>
          <div className="button-row">
            <button className="button primary" disabled={busy || !email || !allowed("researcher-profile.account.create")} onClick={() => void accountAction("")}>
              Tạo tài khoản và gửi email kích hoạt
            </button>
            <button className="button" disabled={busy || !email || !allowed("researcher-profile.account.reset")} onClick={() => void accountAction("/resend-activation")}>
              Gửi lại email kích hoạt
            </button>
            <button className="button" disabled={busy || !reason || !allowed("researcher-profile.account.unlink")} onClick={() => void accountAction("/unlink")}>
              Hủy liên kết
            </button>
          </div>
          {!editing.account && allowed("researcher-profile.account.link") ? (
            <div>
              <h3>Liên kết tài khoản đã có</h3>
              <label className="field">
                <span>Tìm tài khoản chưa liên kết</span>
                <input value={accountQuery} onChange={(event) => setAccountQuery(event.target.value)} />
              </label>
              <button
                className="button"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    setAccounts((await profileRequest<{ accounts: typeof accounts }>(`/${editing.id}/account-candidates?keyword=${encodeURIComponent(accountQuery)}`)).accounts);
                    setSelectedAccount("");
                  })
                }
              >
                Tìm tài khoản
              </button>
              <label className="field">
                <span>Tài khoản phù hợp</span>
                <select value={selectedAccount} onChange={(event) => setSelectedAccount(event.target.value)}>
                  <option value="">Chọn tài khoản</option>
                  {accounts.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.displayName} ({item.username})
                    </option>
                  ))}
                </select>
              </label>
              <button className="button" disabled={busy || !selectedAccount} onClick={() => void accountAction("/link")}>
                Liên kết tài khoản
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {editing ? (
        <section className="section-card">
          <h2>Lịch sử thay đổi hồ sơ</h2>
          <button
            className="button"
            disabled={busy || !allowed("researcher-profile.history.read")}
            onClick={() => void perform(async () => setHistory((await profileRequest<{ history: ProfileHistory[] }>(`/${editing.id}/history`)).history))}
          >
            Xem lịch sử thay đổi
          </button>
          {history?.map((item) => (
            <details key={item.id} style={{ marginTop: 8 }}>
              <summary>
                {new Date(item.createdAt).toLocaleString("vi-VN")} · {historyActions[item.action] ?? item.action}
              </summary>
              <p>{item.reason}</p>
              <HistoryFacts label="Trước" facts={item.beforeFacts} />
              <HistoryFacts label="Sau" facts={item.afterFacts} />
            </details>
          ))}
          {history?.length === 0 ? <p>Chưa có lịch sử thay đổi.</p> : null}
        </section>
      ) : null}
    </div>
  );
}

function accountLabel(account: ResearcherProfile["account"]) {
  return account ? account.username || account.email || "Đã liên kết tài khoản" : "Chưa có tài khoản";
}

function accountStatusLabel(status: string) {
  return status === "active" ? "Đang hoạt động" : status === "pending_activation" ? "Chờ kích hoạt" : "Đã khóa";
}

function HistoryFacts({ label, facts }: { label: string; facts?: Record<string, unknown> }) {
  if (!facts) return null;
  const names: Record<string, string> = {
    fullName: "Họ tên",
    title: "Chức danh",
    position: "Chức vụ",
    militaryRank: "Quân hàm",
    contactEmail: "Email",
    contactPhone: "Điện thoại",
    contactNote: "Ghi chú",
    externalAffiliation: "Đơn vị công tác",
    linkedUserId: "Tài khoản liên kết",
    status: "Trạng thái",
    profileType: "Loại hồ sơ"
  };
  return (
    <div>
      <strong>{label}</strong>
      <dl>
        {Object.entries(names)
          .filter(([key]) => facts[key] != null)
          .map(([key, name]) => (
            <div key={key}>
              <dt>{name}</dt>
              <dd>{String(facts[key])}</dd>
            </div>
          ))}
      </dl>
    </div>
  );
}
