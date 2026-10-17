import type { PipeTransform } from "@nestjs/common";
import { readBodyObject } from "../proposals-shared/proposal-validation.js";
import { readNote } from "./approval-routing.service.js";

/** Trình / duyệt tờ trình: ghi chú tuỳ chọn. Trả lại: bắt buộc lý do. Cùng quy tắc với service. */
function approvalActionPipe(noteRequired: boolean): PipeTransform<unknown, { note: string | null }> {
  return { transform: (value: unknown) => ({ note: readNote(readBodyObject(value).note, noteRequired) }) };
}

export const advanceSubmissionPipe = approvalActionPipe(false);
export const returnSubmissionPipe = approvalActionPipe(true);
