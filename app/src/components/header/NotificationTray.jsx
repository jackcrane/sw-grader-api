import React from "react";
import styles from "./Header.module.css";
import { NotificationList } from "./NotificationList";

export const NotificationTray = ({
  notifications,
  loading,
  error,
  hasPending,
  onRefresh,
  onNotificationCta,
  actionState,
}) => {
  const renderBody = () => {
    if (loading) {
      return (
        <div className={styles.notificationEmpty}>
          <p>Loading notifications…</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className={styles.notificationEmpty}>
          <p>We couldn't load your notifications.</p>
          <button
            type="button"
            className={styles.notificationRetry}
            onClick={onRefresh}
          >
            Try again
          </button>
        </div>
      );
    }

    return (
      <NotificationList
        notifications={notifications}
        actionState={actionState}
        onNotificationCta={onNotificationCta}
      />
    );
  };

  return (
    <div className={styles.notificationTray} role="dialog" aria-label="Notifications">
      <div className={styles.notificationHeader}>
        <div>
          <p className={styles.notificationHeading}>Notifications</p>
          <p className={styles.notificationSubheading}>
            {hasPending
              ? `${notifications.length} pending`
              : "No pending notifications"}
          </p>
        </div>
        <button
          type="button"
          className={styles.notificationRefresh}
          onClick={onRefresh}
          aria-label="Refresh notifications"
        >
          Refresh
        </button>
      </div>
      {renderBody()}
    </div>
  );
};
