import { redirect } from "next/navigation";

// "Giao việc" chờ Đợt 2 (docs/design/quan-ly-tien-do-nhiem-vu.md). Trước đó chuyển sang "Việc của tôi"
// (dữ liệu thật) thay vì hiển thị dữ liệu mẫu khi ai đó mở thẳng /tasks.
export default function TasksPage() {
  redirect("/my-tasks");
}
