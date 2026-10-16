"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Hộp thoại giữa màn hình dùng chung: Esc để đóng, giữ tiêu điểm trong hộp thoại, trả tiêu điểm về chỗ cũ khi đóng
 * (cùng cách với bảng chi tiết của Dashboard).
 */
export function ModalDialog({ title, icon, onClose, footer, children }: { title: string; icon?: ReactNode; onClose: () => void; footer?: ReactNode; children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  onCloseRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLElement>(`.modal-body ${FOCUSABLE}`)?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { onCloseRef.current(); return; }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement as HTMLElement | null;
      if (event.shiftKey && (current === first || !panelRef.current.contains(current))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (current === last || !panelRef.current.contains(current))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; previous?.focus?.(); };
  }, []);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={panelRef} className="modal-panel" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="modal-header">
          <h2 id={titleId}>{icon}{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Đóng">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
}
