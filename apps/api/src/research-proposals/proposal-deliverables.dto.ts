import { BadRequestException, type PipeTransform } from "@nestjs/common";

/** Loại sản phẩm dự kiến chủ nhiệm cam kết khi đề xuất. */
export const VALID_DELIVERABLE_TYPES = ["Bài báo khoa học", "Bằng sáng chế", "Sản phẩm công nghệ", "Sách chuyên khảo"] as const;

export type DeliverableInput = { type?: string; title?: string; description?: string | null };

// Ngày công bố và minh chứng là của sản phẩm đã hoàn thành: chúng thuộc đề tài (nghiệm thu từng sản phẩm),
// không thuộc giai đoạn đề xuất.
const COMPLETED_PRODUCT_FIELDS = ["publishedAt", "proofFileName", "proofStorageKey"];

function deliverablePipe(required: boolean): PipeTransform<unknown, DeliverableInput> {
  return {
    transform(value) {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new BadRequestException({ message: "Dữ liệu sản phẩm dự kiến không hợp lệ." });
      const input = value as Record<string, unknown>;
      if (Object.keys(input).some((key) => COMPLETED_PRODUCT_FIELDS.includes(key))) {
        throw new BadRequestException({ message: "Ngày công bố và minh chứng được khai báo cho sản phẩm hoàn thành trong đề tài, không thuộc hồ sơ đề xuất." });
      }
      if (Object.keys(input).some((key) => !["type", "title", "description"].includes(key))) throw new BadRequestException({ message: "Có trường không được hỗ trợ." });
      const output: DeliverableInput = {};
      if (input.type !== undefined || required) {
        if (typeof input.type !== "string" || !(VALID_DELIVERABLE_TYPES as readonly string[]).includes(input.type.trim())) {
          throw new BadRequestException({ message: `Loại sản phẩm phải là một trong: ${VALID_DELIVERABLE_TYPES.join(", ")}.` });
        }
        output.type = input.type.trim();
      }
      if (input.title !== undefined || required) {
        const title = typeof input.title === "string" ? input.title.trim() : "";
        if (!title || title.length > 300) throw new BadRequestException({ message: "Tên sản phẩm bắt buộc, tối đa 300 ký tự." });
        output.title = title;
      }
      if (input.description !== undefined) {
        if (input.description !== null && typeof input.description !== "string") throw new BadRequestException({ message: "Mô tả không hợp lệ." });
        const description = (input.description ?? "").trim();
        if (description.length > 2000) throw new BadRequestException({ message: "Mô tả tối đa 2000 ký tự." });
        output.description = description || null;
      }
      if (!required && !Object.keys(output).length) throw new BadRequestException({ message: "Không có thay đổi nào." });
      return output;
    }
  };
}

export const createDeliverablePipe = deliverablePipe(true);
export const updateDeliverablePipe = deliverablePipe(false);
