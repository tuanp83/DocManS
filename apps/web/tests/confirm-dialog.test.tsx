import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { ConfirmProvider, useAskReason, useConfirm } from "@/components/ui/confirm-dialog";
import { ModalDialog } from "@/components/ui/modal-dialog";

// Hộp xác nhận / nhập lý do dùng chung thay window.confirm / prompt của trình duyệt.

function ConfirmProbe() {
  const confirm = useConfirm();
  const [result, setResult] = useState("chưa hỏi");
  return (
    <>
      <button type="button" onClick={async () => setResult(String(await confirm("Xóa danh mục?", { confirmLabel: "Xóa", tone: "danger" })))}>
        Hỏi
      </button>
      <output>{result}</output>
    </>
  );
}

function ReasonProbe() {
  const askReason = useAskReason();
  const [result, setResult] = useState("chưa hỏi");
  return (
    <>
      <button type="button" onClick={async () => setResult(JSON.stringify(await askReason("Trả lại hồ sơ.", { confirmLabel: "Trả lại" })))}>
        Hỏi lý do
      </button>
      <output>{result}</output>
    </>
  );
}

function NestedProbe() {
  const confirm = useConfirm();
  const [open, setOpen] = useState(true);
  return open ? (
    <ModalDialog title="Hộp ngoài" onClose={() => setOpen(false)}>
      <button type="button" onClick={() => void confirm("Hộp trong?")}>
        Mở hộp trong
      </button>
    </ModalDialog>
  ) : (
    <p>Hộp ngoài đã đóng</p>
  );
}

const renderWithDialogs = (ui: React.ReactElement) => render(ui, { wrapper: ConfirmProvider });

describe("hộp xác nhận", () => {
  it("trả về true khi đồng ý, false khi Hủy hoặc Esc", async () => {
    const user = userEvent.setup();
    renderWithDialogs(<ConfirmProbe />);

    await user.click(screen.getByRole("button", { name: "Hỏi" }));
    const dialog = screen.getByRole("dialog", { name: "Xác nhận thao tác" });
    expect(dialog).toHaveTextContent("Xóa danh mục?");
    expect(within(dialog).getByRole("button", { name: "Hủy" })).toHaveFocus();
    await user.click(within(dialog).getByRole("button", { name: "Xóa" }));
    expect(screen.getByRole("status")).toHaveTextContent("true");

    await user.click(screen.getByRole("button", { name: "Hỏi" }));
    await user.click(screen.getByRole("button", { name: "Hủy" }));
    expect(screen.getByRole("status")).toHaveTextContent("false");

    await user.click(screen.getByRole("button", { name: "Hỏi" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("false");
  });

  it("hỏi lý do: bắt buộc nhập, trả về nội dung đã bỏ khoảng trắng, null khi hủy", async () => {
    const user = userEvent.setup();
    renderWithDialogs(<ReasonProbe />);

    await user.click(screen.getByRole("button", { name: "Hỏi lý do" }));
    const accept = screen.getByRole("button", { name: "Trả lại" });
    expect(accept).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: "Lý do" }), "  Thiếu biên bản  ");
    await user.click(accept);
    expect(screen.getByRole("status")).toHaveTextContent('"Thiếu biên bản"');

    await user.click(screen.getByRole("button", { name: "Hỏi lý do" }));
    expect(screen.getByRole("textbox", { name: "Lý do" })).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Hủy" }));
    expect(screen.getByRole("status")).toHaveTextContent("null");
  });

  it("Esc chỉ đóng hộp trên cùng khi hộp xác nhận mở chồng lên hộp thoại khác", async () => {
    const user = userEvent.setup();
    renderWithDialogs(<NestedProbe />);

    await user.click(screen.getByRole("button", { name: "Mở hộp trong" }));
    expect(screen.getAllByRole("dialog")).toHaveLength(2);
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Hộp ngoài" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Xác nhận thao tác" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.getByText("Hộp ngoài đã đóng")).toBeInTheDocument();
  });
});
