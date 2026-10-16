"use client";

import { useEffect, useMemo, useState } from "react";
import { SectionCard } from "@/components/ui/section-card";
import { loadSystemAuditLogs, type SystemAuditLog } from "@/lib/admin-api";

type LoadState = "loading" | "ready" | "error";

/** Nhật ký kiểm toán cho Quản trị hệ thống: 100 bản ghi mới nhất, lọc tại chỗ theo kết quả và từ khoá. */
export function SystemLogsPanel() {
  const [records, setRecords] = useState<SystemAuditLog[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState("");
  const [result, setResult] = useState<"" | "success" | "failure">("");

  useEffect(() => {
    let active = true;
    loadSystemAuditLogs()
      .then((items) => {
        if (!active) return;
        setRecords(items);
        setState("ready");
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : "Không tải được nhật ký hệ thống.");
        setState("error");
      });
    return () => {
      active = false;
    };
  }, []);

  const visible = useMemo(() => {
    const needle = keyword.trim().toLocaleLowerCase("vi");
    return records.filter((record) => {
      if (result && record.result !== result) return false;
      if (!needle) return true;
      return [record.action, record.username, record.targetEntity, record.targetEntityId, record.context.ip, record.context.reason]
        .some((value) => value?.toLocaleLowerCase("vi").includes(needle));
    });
  }, [records, keyword, result]);

  const failures = records.filter((record) => record.result === "failure").length;

  return (
    <SectionCard title="Thao tác gần đây" subtitle={state === "ready" ? `${visible.length}/${records.length} bản ghi mới nhất, ${failures} thất bại` : undefined}>
      {state === "loading" ? <p className="state-message">Đang tải nhật ký hệ thống...</p> : null}
      {state === "error" ? <p className="state-message error">{error}</p> : null}
      {state === "ready" ? (
        <>
          <div className="filter-bar">
            <label className="filter-field">
              <span>Tìm kiếm</span>
              <input id="system-logs-keyword" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Hành động, tài khoản, đối tượng, IP" />
            </label>
            <label className="filter-field">
              <span>Kết quả</span>
              <select id="system-logs-result" value={result} onChange={(event) => setResult(event.target.value as typeof result)}>
                <option value="">Tất cả</option>
                <option value="success">Thành công</option>
                <option value="failure">Thất bại</option>
              </select>
            </label>
          </div>
          {visible.length === 0 ? (
            <p className="state-message">Không có bản ghi phù hợp.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Thời điểm</th>
                    <th scope="col">Hành động</th>
                    <th scope="col">Tài khoản</th>
                    <th scope="col">Đối tượng</th>
                    <th scope="col">Kết quả</th>
                    <th scope="col">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((record) => (
                    <tr key={record.id}>
                      <td>{new Date(record.timestamp).toLocaleString("vi-VN")}</td>
                      <td>
                        <code>{record.action}</code>
                        {record.context.reason ? <div className="record-meta">{record.context.reason}</div> : null}
                      </td>
                      <td>{record.username ?? "—"}</td>
                      <td>{record.targetEntity ? `${record.targetEntity}${record.targetEntityId ? ` · ${record.targetEntityId}` : ""}` : "—"}</td>
                      <td>
                        <span className={`status-badge ${record.result === "success" ? "success" : "danger"}`}>{record.result === "success" ? "Thành công" : "Thất bại"}</span>
                      </td>
                      <td>{record.context.ip ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </SectionCard>
  );
}
