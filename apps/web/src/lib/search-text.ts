/** Chuẩn hoá chuỗi để tìm kiếm không phân biệt dấu và hoa thường: "Nội khoa" và "noi khoa" như nhau. */
export function foldSearchText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}
