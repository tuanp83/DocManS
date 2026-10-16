-- Vai trò có phạm vi toàn Học viện (Ban giám đốc, Trưởng phòng KHQS, Trưởng ban QLKH):
-- cấp bù mọi đơn vị đang hoạt động cho các tài khoản đã có. Chỉ thêm, không gỡ phạm vi nào.
INSERT INTO user_organization_scopes (id, user_id, organization_unit_id, is_primary)
SELECT gen_random_uuid()::text, u.id, o.id, false
FROM users u
CROSS JOIN organization_units o
WHERE u.system_role IN ('LEADERSHIP_APPROVAL_AUTHORITY', 'SCIENCE_DEPUTY_DIRECTOR', 'RESEARCH_OVERSIGHT_AUTHORITY', 'RESEARCH_MANAGEMENT_HEAD', 'RESEARCH_BOARD_HEAD')
  AND o.status = 'active'
ON CONFLICT (user_id, organization_unit_id) DO NOTHING;
