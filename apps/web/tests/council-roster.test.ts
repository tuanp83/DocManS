import { describe, expect, it } from "vitest";
import { buildCouncilInvitationRows } from "@/components/research-proposals/evaluation/council-invitations";
import { councilRosterReducer, createInitialRoster, newCouncilMember } from "@/components/research-proposals/evaluation/council-roster";

const candidate = (id: string, fullName: string, systemRole: string, isConflicted = false) =>
  ({ id, userId: `u-${id}`, fullName, username: id, systemRole, academicTitle: "TS", unit: "HVQY", profileType: "INTERNAL", isConflicted }) as never;

describe("councilRosterReducer", () => {
  it("điền sẵn chỉ vào vị trí còn trống và bỏ qua người xung đột", () => {
    const candidates = [
      candidate("a", "Lãnh đạo bị xung đột", "LEADERSHIP_APPROVAL_AUTHORITY", true),
      candidate("b", "Lãnh đạo", "LEADERSHIP_APPROVAL_AUTHORITY"),
      candidate("c", "Chuyên viên", "RESEARCH_MANAGEMENT_STAFF"),
      candidate("d", "Nhà khoa học 1", "RESEARCHER_INTERNAL_USER"),
      candidate("e", "Nhà khoa học 2", "RESEARCHER_INTERNAL_USER")
    ];
    const seeded = councilRosterReducer(createInitialRoster(), { type: "seed", candidates });
    expect(seeded.chair.name).toBe("Lãnh đạo");
    expect(seeded.secretary.name).toBe("Chuyên viên");
    expect(seeded.reviewers.map((r) => r.name)).toEqual(["Nhà khoa học 1", "Nhà khoa học 2"]);

    const manual = councilRosterReducer(seeded, { type: "chair/set", value: (prev) => ({ ...prev, name: "Chọn tay", candidateId: "z" }) });
    expect(councilRosterReducer(manual, { type: "seed", candidates }).chair.name).toBe("Chọn tay");
  });

  it("khôi phục tờ trình đã lưu: chủ tịch, thư ký, phản biện, ủy viên và thông tin phiên họp", () => {
    const council = {
      status: "draft",
      meetingDate: "2026-11-02T00:00:00.000Z",
      meetingLocation: "Phòng A",
      members: [
        { role: "chair", roleLabel: "Chủ tịch", userId: "u1", displayName: "CT" },
        { role: "secretary", roleLabel: "Thư ký", displayName: "TK" },
        { role: "reviewer_1", roleLabel: "Phản biện 1", userId: "u3", displayName: "PB1", unit: "K1" },
        { role: "member", roleLabel: "Ủy viên", userId: "u4", displayName: "UV", organization: "Viện B" }
      ]
    } as never;
    const roster = councilRosterReducer(createInitialRoster(), { type: "hydrate", council });
    expect(roster.meetingDate).toBe("2026-11-02");
    expect(roster.meetingLocation).toBe("Phòng A");
    expect(roster.chair).toMatchObject({ candidateId: "u1", isCustom: false, name: "CT" });
    expect(roster.secretary).toMatchObject({ candidateId: "", isCustom: true, name: "TK" });
    expect(roster.reviewers).toHaveLength(1);
    expect(roster.members[0]).toMatchObject({ name: "UV", unit: "Viện B" });
  });

  it("thêm, sửa, xoá phản biện và ủy viên", () => {
    let roster = createInitialRoster();
    const added = newCouncilMember("rev");
    roster = councilRosterReducer(roster, { type: "reviewers/add", member: added });
    roster = councilRosterReducer(roster, { type: "reviewers/patch", id: added.id, patch: { name: "Mới" } });
    expect(roster.reviewers.at(-1)?.name).toBe("Mới");
    roster = councilRosterReducer(roster, { type: "reviewers/remove", id: added.id });
    expect(roster.reviewers).toHaveLength(2);
    roster = councilRosterReducer(roster, { type: "members/remove", id: "mem-1" });
    expect(roster.members.map((m) => m.id)).toEqual(["mem-2"]);
  });
});

describe("buildCouncilInvitationRows", () => {
  it("phân loại tình trạng lời mời", () => {
    const council = {
      status: "draft",
      members: [
        { role: "chair", roleLabel: "Chủ tịch", displayName: "A" },
        { role: "secretary", roleLabel: "Thư ký", userId: "u2", displayName: "B" },
        { role: "member", roleLabel: "Ủy viên", userId: "u3", displayName: "C" }
      ]
    } as never;
    const progress = { assignments: [], councilInvitations: [{ reviewerUserId: "u2", acceptedAt: "2026-10-01T00:00:00Z", assignedAt: "" }], declinedAssignments: [] } as never;
    const rows = buildCouncilInvitationRows(council, progress);
    expect(rows.map((r) => r.statusLabel)).toEqual(["Chưa gắn tài khoản", "Đã nhận lời", "Chưa gửi lời mời"]);
    expect(rows.map((r) => r.accepted)).toEqual([false, true, false]);
  });
});
