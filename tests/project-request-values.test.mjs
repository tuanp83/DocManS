import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertAdjustmentValues, assertExtensionValues } from "../dist/apps/api/approved-projects/project-request-values.js";

// Hành vi kiểm tra nội dung đề nghị điều chỉnh / gia hạn đề tài (cột JSON proposedValues).
// Viết trước khi đặt kiểu cho JSON để bảo đảm việc đổi kiểu không làm đổi luật kiểm tra.

/** Kết quả: "ok", ngày trả về (YYYY-MM-DD), mã lỗi, hoặc thông điệp lỗi khi không có mã. */
function outcome(run) {
  try {
    const result = run();
    return result instanceof Date ? result.toISOString().slice(0, 10) : "ok";
  } catch (error) {
    const response = error.getResponse?.();
    return response?.code ?? response?.message ?? String(error);
  }
}

const adjustment = (values) => outcome(() => assertAdjustmentValues(values));

describe("kiểm tra đề nghị điều chỉnh (proposedValues)", () => {
  const cases = [
    ["không phải object", null, "ADJUSTMENT_SCOPE_DENIED"],
    ["mảng", [], "ADJUSTMENT_SCOPE_DENIED"],
    ["đổi ngày kết thúc phải dùng gia hạn", { endDate: "2027-01-01" }, "EXTENSION_REQUIRED"],
    ["đổi thời lượng phải dùng gia hạn", { durationDays: 30 }, "EXTENSION_REQUIRED"],
    ["khoá lạ", { budget: 1 }, "ADJUSTMENT_SCOPE_DENIED"],
    ["rỗng", {}, "ADJUSTMENT_SCOPE_DENIED"],
    ["scope null", { scope: null }, "ADJUSTMENT_SCOPE_DENIED"],
    ["scope là mảng", { scope: [] }, "ADJUSTMENT_SCOPE_DENIED"],
    ["scope rỗng", { scope: {} }, "ADJUSTMENT_EMPTY"],
    ["plan rỗng", { plan: {} }, "ADJUSTMENT_EMPTY"],
    ["plan khoá lạ", { plan: { budget: 1 } }, "ADJUSTMENT_SCOPE_DENIED"],
    ["methodology không phải chuỗi", { plan: { methodology: 5 } }, "ADJUSTMENT_SCOPE_DENIED"],
    ["methodology quá dài", { plan: { methodology: "a".repeat(10001) } }, "ADJUSTMENT_SCOPE_DENIED"],
    ["activities không phải mảng", { plan: { activities: "x" } }, "ADJUSTMENT_SCOPE_DENIED"],
    ["activity rỗng", { plan: { activities: [" "] } }, "ADJUSTMENT_SCOPE_DENIED"],
    ["quá 100 activity", { plan: { activities: Array(101).fill("a") } }, "ADJUSTMENT_SCOPE_DENIED"],
    ["plan hợp lệ", { plan: { methodology: "Phương pháp", activities: ["Hoạt động 1"] } }, "ok"],
    ["scope khoá lạ", { scope: { title: "Tên", budget: 1 } }, "ADJUSTMENT_SCOPE_DENIED"],
    ["scope hợp lệ", { scope: { title: "Tên mới", objectives: "Mục tiêu" } }, "ok"],
    ["milestoneChanges rỗng", { milestoneChanges: [] }, "ADJUSTMENT_SCOPE_DENIED"],
    ["milestoneChanges không phải mảng", { milestoneChanges: "x" }, "ADJUSTMENT_SCOPE_DENIED"],
    ["mốc thiếu id", { milestoneChanges: [{ title: "Mốc" }] }, "ADJUSTMENT_SCOPE_DENIED"],
    ["mốc khoá lạ", { milestoneChanges: [{ id: "m1", budget: 1 }] }, "ADJUSTMENT_SCOPE_DENIED"],
    ["mốc ngày sai", { milestoneChanges: [{ id: "m1", dueDate: "2026-02-30" }] }, "Ngày không hợp lệ."],
    ["trọng số > 100", { milestoneChanges: [{ id: "m1", weightPercent: 101 }] }, "ADJUSTMENT_SCOPE_DENIED"],
    ["trọng số lẻ", { milestoneChanges: [{ id: "m1", weightPercent: 1.5 }] }, "ADJUSTMENT_SCOPE_DENIED"],
    ["trọng số null (bỏ trọng số)", { milestoneChanges: [{ id: "m1", weightPercent: null }] }, "ok"],
    ["tên mốc rỗng", { milestoneChanges: [{ id: "m1", title: " " }] }, "title không hợp lệ."],
    ["mốc hợp lệ", { milestoneChanges: [{ id: "m1", dueDate: "2026-12-31", weightPercent: 40, title: "Mốc", description: "Mô tả", responsibleMemberId: "mem1" }] }, "ok"],
    ["membershipChanges rỗng", { membershipChanges: [] }, "ADJUSTMENT_SCOPE_DENIED"],
    ["thêm chủ nhiệm", { membershipChanges: [{ action: "add", userId: "u1", participationRole: "TOPIC_PI" }] }, "ADJUSTMENT_SCOPE_DENIED"],
    ["thêm thành viên userId sai kiểu", { membershipChanges: [{ action: "add", userId: 5, participationRole: "TOPIC_MEMBER" }] }, "ADJUSTMENT_SCOPE_DENIED"],
    ["thêm thành viên khoá lạ", { membershipChanges: [{ action: "add", userId: "u1", participationRole: "TOPIC_MEMBER", role: "x" }] }, "ADJUSTMENT_SCOPE_DENIED"],
    ["thêm thành viên hợp lệ", { membershipChanges: [{ action: "add", userId: "u1", name: "Nguyễn A", participationRole: "TOPIC_SECRETARY" }] }, "ok"],
    ["kết thúc thành viên hợp lệ", { membershipChanges: [{ action: "end", memberId: "mem1" }] }, "ok"],
    ["kết thúc thành viên khoá lạ", { membershipChanges: [{ action: "end", memberId: "mem1", reason: "x" }] }, "ADJUSTMENT_SCOPE_DENIED"],
    ["hành động lạ", { membershipChanges: [{ action: "remove", memberId: "mem1" }] }, "ADJUSTMENT_SCOPE_DENIED"],
    ["thay đổi null", { membershipChanges: [null] }, "ADJUSTMENT_SCOPE_DENIED"],
    ["kết hợp hợp lệ", { scope: { summary: "Tóm tắt" }, milestoneChanges: [{ id: "m1", weightPercent: 50 }], membershipChanges: [{ action: "end", memberId: "mem1" }] }, "ok"]
  ];
  for (const [name, values, expected] of cases) {
    it(name, () => assert.equal(adjustment(values), expected));
  }
});

describe("kiểm tra đề nghị gia hạn (requestedEndDate)", () => {
  const project = { endDate: new Date("2026-12-31T00:00:00.000Z") };
  const extension = (values, target = project) => outcome(() => assertExtensionValues(target, values));
  const cases = [
    ["ngày sau ngày kết thúc", { requestedEndDate: "2027-03-31" }, "2027-03-31"],
    ["trùng ngày kết thúc", { requestedEndDate: "2026-12-31" }, "EXTENSION_DATE_INVALID"],
    ["trước ngày kết thúc", { requestedEndDate: "2026-06-30" }, "EXTENSION_DATE_INVALID"],
    ["khoá lạ", { requestedEndDate: "2027-03-31", reason: "x" }, "EXTENSION_DATE_INVALID"],
    ["không phải object", null, "EXTENSION_DATE_INVALID"],
    ["mảng", [], "EXTENSION_DATE_INVALID"],
    ["thiếu ngày", {}, "Ngày không hợp lệ."],
    ["ngày sai định dạng", { requestedEndDate: "2027-13-01" }, "Ngày không hợp lệ."]
  ];
  for (const [name, values, expected] of cases) {
    it(name, () => assert.equal(extension(values), expected));
  }
  it("đề tài chưa có ngày kết thúc", () => assert.equal(extension({ requestedEndDate: "2027-03-31" }, { endDate: null }), "EXTENSION_DATE_INVALID"));
});
