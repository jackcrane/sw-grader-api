import React, { useEffect, useRef } from "react";
import { BellSimpleIcon } from "@phosphor-icons/react";
import styles from "./Header.module.css";
import { NotificationTray } from "./NotificationTray";

export const NotificationBell = ({
  isOpen,
  onToggle,
  onClose,
  hasPending,
  loading,
  error,
  notifications,
  onRefresh,
  onNotificationCta,
  actionState,
}) => {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (event) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
        onClose();
      }
    };
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  return (
    <div className={styles.notifications} ref={containerRef}>
      <button
        type="button"
        className={styles.notificationsButton}
        onClick={onToggle}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={
          hasPending ? "View unread notifications" : "View notifications"
        }
      >
        <BellSimpleIcon weight={isOpen ? "fill" : "regular"} />
        {hasPending && !loading && !error && (
          <span className={styles.notificationDot} />
        )}
      </button>
      {isOpen && (
        <NotificationTray
          notifications={notifications}
          loading={loading}
          error={error}
          hasPending={hasPending}
          onRefresh={onRefresh}
          onNotificationCta={onNotificationCta}
          actionState={actionState}
        />
      )}
    </div>
  );
};
