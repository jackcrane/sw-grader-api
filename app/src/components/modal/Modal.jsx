// Modal.jsx
import React, { useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import styles from "./Modal.module.css";

const getFocusable = (el) =>
  el
    ? Array.from(
        el.querySelectorAll(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        )
      )
    : [];

export const Modal = ({
  open,
  title,
  children,
  footer,
  onClose,
  initialFocusRef,
  closeOnBackdrop = true,
  headerActions = null,
}) => {
  const modalRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // focus management
    const node = initialFocusRef?.current || getFocusable(modalRef.current)[0];
    node?.focus?.();

    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
      if (e.key === "Tab") {
        const focusables = getFocusable(modalRef.current);
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose, initialFocusRef]);

  if (!open) return null;

  return ReactDOM.createPortal(
    <div
      className={styles.backdrop}
      role="presentation"
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        ref={modalRef}
      >
        <div className={styles.header}>
          <div id="modal-title" className={styles.title}>
            {title}
          </div>
          <div className={styles.headerControls}>
            {headerActions ? (
              <div className={styles.headerActions}>{headerActions}</div>
            ) : null}
            <button
              type="button"
              aria-label="Close"
              className={styles.close}
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </div>

        <div className={styles.body}>{children}</div>

        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
};
