"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { loadWorkQueue, WORK_ITEM_GROUPS, type WorkQueue } from "@/lib/work-queue-api";

function date(value?: string | null) { return value ? new Intl.DateTimeFormat("vi-VN", { timeZone: "UTC" }).format(new Date(value)) : "—"; }

function dueText(daysLeft: number | null) {
  if (daysLeft === null) return "Không có hạn";
  if (daysLeft < 0) return `Quá hạn ${-daysLeft} ngày`;
  if (daysLeft === 0) return "Đến hạn hôm nay";
  return `Còn ${daysLeft} ngày`;
}

/** "Việc của tôi": việc đang chờ người dùng, lấy từ máy chủ theo quyền trên từng đề tài và phiếu phản biện. */
export function WorkQueueList() {
  const [queue, setQueue] = useState<WorkQueue | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");

  async function refresh() {
    setState("loading");
    try { setQueue(await loadWorkQueue()); setState("ready"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Không tải được danh sách việc."); setState("error"); }
  }
  useEffect(() => { void refresh(); }, []);

  return <div className="form-section-inline">
    {queue ? <div className="grid kpi-grid">
      <article className="kpi-card"><p className="kpi-label">Đang chờ bạn</p><p className="kpi-value">{queue.summary.total}</p><p className="kpi-meta">Cập nhật lúc {date(queue.asOf)}</p></article>
      <article className={`kpi-card ${queue.summary.overdue ? "danger" : ""}`}><p className="kpi-label">Quá hạn</p><p className="kpi-value">{queue.summary.overdue}</p><p className="kpi-meta">Cần xử lý trước</p></article>
      <article className={`kpi-card ${queue.summary.dueWithin7Days ? "warning" : ""}`}><p className="kpi-label">Đến hạn trong 7 ngày</p><p className="kpi-value">{queue.summary.dueWithin7Days}</p><p className="kpi-meta">Chưa quá hạn</p></article>
    </div> : null}
    <SectionCard title="Việc của tôi" subtitle="Báo cáo, tiến độ, xét duyệt và phản biện đang chờ bạn; việc quá hạn xếp trước">
      <div className="button-row"><button className="button" type="button" onClick={() => void refresh()} disabled={state === "loading"}>Tải lại</button></div>
      {state === "loading" ? <p>Đang tải…</p> : state === "error" ? <p role="alert">{message}</p> : !queue?.items.length ? <EmptyState title="Không có việc đang chờ" message="Khi có báo cáo đến hạn, mốc cần cập nhật hoặc hồ sơ cần xét, việc sẽ hiện ở đây." /> : <div className="table-wrap"><table className="data-table">
        <thead><tr><th>Việc</th><th>Loại</th><th>Đề tài / hồ sơ</th><th>Hạn</th><th /></tr></thead>
        <tbody>{queue.items.map((item) => <tr key={item.id}>
          <td>{item.title}</td>
          <td>{WORK_ITEM_GROUPS[item.kind]}</td>
          <td>{item.context.title}</td>
          <td><span className={`status-badge ${item.overdue ? "danger" : item.daysLeft !== null && item.daysLeft <= 7 ? "warning" : "neutral"}`}>{dueText(item.daysLeft)}</span>{item.dueDate ? ` ${date(item.dueDate)}` : ""}</td>
          <td><Link className="button" href={item.href}>Mở</Link></td>
        </tr>)}</tbody>
      </table></div>}
    </SectionCard>
  </div>;
}
