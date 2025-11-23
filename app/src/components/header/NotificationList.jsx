import React from "react";
import {
  BellSimpleIcon,
  BellSimpleSlashIcon,
  CheckCircleIcon,
  ClipboardTextIcon,
  CreditCardIcon,
  ChatsCircleIcon,
  WarningDiamondIcon,
} from "@phosphor-icons/react";
import styles from "./Header.module.css";

const NOTIFICATION_TYPE_ICON = {
  ASSIGNMENT_GRADED: CheckCircleIcon,
  ASSIGNMENT_POSTED: ClipboardTextIcon,
  PAYMENT_ISSUE: CreditCardIcon,
  CANVAS_POINTS_MISMATCH: WarningDiamondIcon,
  OTHER: ChatsCircleIcon,
};

const NOTIFICATION_TYPE_LABEL = {
  ASSIGNMENT_GRADED: "Assignment graded",
  ASSIGNMENT_POSTED: "Assignment posted",
  PAYMENT_ISSUE: "Payment issue",
  CANVAS_POINTS_MISMATCH: "Canvas mismatch",
  OTHER: "Notification",
};

const getNotificationTypeLabel = (type) =>
  NOTIFICATION_TYPE_LABEL[type] ?? "Update";

const getIconComponent = (type) =>
  NOTIFICATION_TYPE_ICON[type] ?? BellSimpleIcon;

export const NotificationList = ({
  notifications,
  actionState,
  onNotificationCta,
}) => {
  if (!notifications.length) {
    return (
      <div className={styles.notificationEmpty}>
        <BellSimpleSlashIcon size={32} weight="duotone" />
        <p className={styles.notificationEmptyTitle}>You're all caught up</p>
        <p className={styles.notificationEmptySubtitle}>
          Check back later for new updates.
        </p>
      </div>
    );
  }

  return (
    <ul className={styles.notificationList}>
      {notifications.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          actionState={actionState[notification.id] ?? {}}
          onNotificationCta={onNotificationCta}
        />
      ))}
    </ul>
  );
};

const NotificationItem = ({ notification, actionState, onNotificationCta }) => {
  const Icon = getIconComponent(notification.type);
  const notificationData =
    notification && typeof notification.data === "object"
      ? notification.data
      : {};
  const isPaymentAuthorization =
    notification.type === "PAYMENT_ISSUE" &&
    notificationData?.paymentIntentId;
  const baseLabel =
    notificationData?.ctaLabel ??
    (isPaymentAuthorization ? "Authorize payment" : "View details");
  const ctaLabel =
    isPaymentAuthorization && actionState?.loading
      ? "Authorizing…"
      : baseLabel;

  return (
    <li className={styles.notificationItem}>
      <div className={styles.notificationIcon}>
        <Icon weight="duotone" size={24} />
      </div>
      <div className={styles.notificationContent}>
        <span className={styles.notificationType}>
          {getNotificationTypeLabel(notification.type)}
        </span>
        <p className={styles.notificationTitle}>{notification.title}</p>
        <p className={styles.notificationText}>{notification.content}</p>
        {notificationData?.hasCta && (
          <>
            <button
              type="button"
              className={styles.notificationCta}
              onClick={() => onNotificationCta(notification)}
              disabled={Boolean(actionState?.loading)}
            >
              {ctaLabel}
            </button>
            {isPaymentAuthorization && actionState?.error && (
              <p className={styles.notificationActionError}>
                {actionState.error}
              </p>
            )}
            {isPaymentAuthorization && actionState?.success && (
              <p className={styles.notificationActionSuccess}>
                Payment authorized. Thanks for taking care of that!
              </p>
            )}
          </>
        )}
      </div>
    </li>
  );
};
