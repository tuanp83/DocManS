import { ApprovalRoutingService } from '../../dist/apps/api/approvals/approval-routing.service.js';

/**
 * Đưa tờ trình đang mở của một đối tượng qua Phòng KHQS (Trưởng ban QLKH trình → Trưởng phòng duyệt) để Ban giám
 * đốc ký được, như trong thực tế. Tạo tài khoản Trưởng ban và Trưởng phòng có phạm vi đơn vị chủ trì nếu chưa có.
 */
export async function routeToLeadership(db, { kind, subjectId }) {
  const submission = await db.approvalSubmission.findFirst({ where: { kind, subjectId, status: 'PENDING' } });
  if (!submission) throw new Error(`Không có tờ trình ${kind} đang mở cho ${subjectId}`);
  const unit = await db.organizationUnit.findUnique({ where: { id: submission.hostOrganizationUnitId } });
  const actorFor = async (systemRole, prefix) => {
    const username = `${prefix}-${unit.id}`.slice(0, 60);
    const user = (await db.user.findFirst({ where: { username } })) ?? (await db.user.create({ data: { username, usernameKey: username.toLowerCase(), displayName: prefix, passwordHash: 'test-only-disabled', status: 'active', systemRole, unit: unit.name, organizationScopes: { create: [{ organizationUnitId: unit.id, isPrimary: true }] } } }));
    return { id: user.id, username: user.username, displayName: user.displayName, systemRole, unit: unit.name, organizationScopes: [{ id: unit.id, code: unit.code, name: unit.name }] };
  };
  const routing = new ApprovalRoutingService(db);
  await routing.advance(await actorFor('RESEARCH_BOARD_HEAD', 'truongban'), submission.id, { note: 'Đã rà soát' });
  await routing.advance(await actorFor('RESEARCH_MANAGEMENT_HEAD', 'truongphong'), submission.id, { note: 'Đồng ý trình' });
  return submission;
}
