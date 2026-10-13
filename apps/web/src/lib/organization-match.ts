type OrganizationOption = { id: string; code: string; name: string };

/**
 * Đơn vị khớp với ô "đơn vị công tác": trùng tên/mã, hoặc tên chứa nhau nhưng chỉ khi khớp đúng một
 * đơn vị. Ô trống hoặc khớp mơ hồ trả undefined để giữ đơn vị quản lý hiện tại (trước đây chuỗi rỗng
 * khớp mọi đơn vị nên hồ sơ bị chuyển sang đơn vị đầu danh sách).
 */
export function matchOrganizationUnit<T extends OrganizationOption>(organizations: T[], text: string): T | undefined {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return undefined;
  const exact = organizations.find((item) => item.name.trim().toLowerCase() === normalized || item.code.trim().toLowerCase() === normalized);
  if (exact) return exact;
  const partial = organizations.filter((item) => {
    const name = item.name.trim().toLowerCase();
    return name.length > 0 && (normalized.includes(name) || name.includes(normalized));
  });
  return partial.length === 1 ? partial[0] : undefined;
}
