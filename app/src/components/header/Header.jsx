import { WidthFix } from "../widthfix/WidthFix";
import styles from "./Header.module.css";
import React, { useEffect, useMemo, useRef, useState } from "react";
import logo from "../../../assets/featurebench-body.svg";
import {
  ArrowRightIcon,
  UserIcon,
  BellSimpleIcon,
  BellSimpleSlashIcon,
  CheckCircleIcon,
  ClipboardTextIcon,
  CreditCardIcon,
  ChatsCircleIcon,
} from "@phosphor-icons/react";
import { useAuthContext } from "../../context/AuthContext";
import { useEnrollments } from "../../hooks/useEnrollments";
import { Link, useNavigate } from "react-router-dom";
import useSWR from "swr";

const NOTIFICATION_TYPE_ICON = {
  ASSIGNMENT_GRADED: CheckCircleIcon,
  ASSIGNMENT_POSTED: ClipboardTextIcon,
  PAYMENT_ISSUE: CreditCardIcon,
  OTHER: ChatsCircleIcon,
};

const NOTIFICATION_TYPE_LABEL = {
  ASSIGNMENT_GRADED: "Assignment graded",
  ASSIGNMENT_POSTED: "Assignment posted",
  PAYMENT_ISSUE: "Payment issue",
  OTHER: "Notification",
};

const getNotificationTypeLabel = (type) =>
  NOTIFICATION_TYPE_LABEL[type] ?? "Update";

export const Header = () => {
  const { user, logout, viewAsStudent, setViewAsStudent } = useAuthContext();
  const navigate = useNavigate();
  const { enrollments } = useEnrollments({ enabled: Boolean(user) });
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const profileMenuRef = useRef(null);
  const notificationsRef = useRef(null);
  const {
    data: notificationsPayload,
    error: notificationsError,
    isLoading: notificationsLoading,
    mutate: refetchNotifications,
  } = useSWR(user ? "/api/notifications" : null);
  const notifications = notificationsPayload?.notifications ?? [];
  const hasPendingNotifications = notifications.length > 0;

  useEffect(() => {
    const handleClickOutside = (event) => {
      const clickedProfile =
        profileMenuRef.current &&
        profileMenuRef.current.contains(event.target);
      const clickedNotifications =
        notificationsRef.current &&
        notificationsRef.current.contains(event.target);
      if (!clickedProfile) setIsMenuOpen(false);
      if (!clickedNotifications) setIsNotificationsOpen(false);
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
        setIsNotificationsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setIsMenuOpen(false);
      setIsNotificationsOpen(false);
    }
  }, [user]);

  const canViewAsStudent = useMemo(() => {
    if (!user) return false;
    return (enrollments ?? []).some((enrollment) =>
      ["TEACHER", "TA"].includes(enrollment.type)
    );
  }, [enrollments, user]);

  const handleToggleStudentView = () => {
    setViewAsStudent((value) => !value);
    setIsMenuOpen(false);
  };

  const handleNotificationCta = (notification) => {
    if (!notification?.data?.hasCta) {
      setIsNotificationsOpen(false);
      return;
    }

    const { ctaHref } = notification.data;
    if (ctaHref) {
      if (/^https?:\/\//i.test(ctaHref)) {
        if (typeof window !== "undefined") {
          window.open(ctaHref, "_blank", "noopener,noreferrer");
        }
      } else {
        navigate(ctaHref);
      }
    }
    setIsNotificationsOpen(false);
  };

  const renderNotificationBody = () => {
    if (notificationsLoading) {
      return (
        <div className={styles.notificationEmpty}>
          <p>Loading notifications…</p>
        </div>
      );
    }

    if (notificationsError) {
      return (
        <div className={styles.notificationEmpty}>
          <p>We couldn't load your notifications.</p>
          <button
            type="button"
            className={styles.notificationRetry}
            onClick={() => refetchNotifications()}
          >
            Try again
          </button>
        </div>
      );
    }

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
        {notifications.map((notification) => {
          const Icon =
            NOTIFICATION_TYPE_ICON[notification.type] ?? BellSimpleIcon;
          return (
            <li className={styles.notificationItem} key={notification.id}>
              <div className={styles.notificationIcon}>
                <Icon weight="duotone" size={24} />
              </div>
              <div className={styles.notificationContent}>
                <span className={styles.notificationType}>
                  {getNotificationTypeLabel(notification.type)}
                </span>
                <p className={styles.notificationTitle}>{notification.title}</p>
                <p className={styles.notificationText}>
                  {notification.content}
                </p>
                {notification?.data?.hasCta && (
                  <button
                    type="button"
                    className={styles.notificationCta}
                    onClick={() => handleNotificationCta(notification)}
                  >
                    {notification?.data?.ctaLabel ?? "View details"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <header className={styles.header}>
      <WidthFix>
        <div className={styles.content}>
          <a href="/" className={styles.logolink}>
            <img src={logo} className={styles.logo} alt="FeatureBench Logo" />
          </a>
          <div style={{ flex: 1 }}></div>
          {user ? (
            <div className={styles.userActions}>
              <div className={styles.notifications} ref={notificationsRef}>
                <button
                  type="button"
                  className={styles.notificationsButton}
                  onClick={() => {
                    setIsNotificationsOpen((value) => !value);
                    setIsMenuOpen(false);
                  }}
                  aria-haspopup="dialog"
                  aria-expanded={isNotificationsOpen}
                  aria-label={
                    hasPendingNotifications
                      ? "View unread notifications"
                      : "View notifications"
                  }
                >
                  <BellSimpleIcon
                    weight={isNotificationsOpen ? "fill" : "regular"}
                  />
                  {hasPendingNotifications && !notificationsLoading && !notificationsError && (
                    <span className={styles.notificationDot} />
                  )}
                </button>
                {isNotificationsOpen && (
                  <div
                    className={styles.notificationTray}
                    role="dialog"
                    aria-label="Notifications"
                  >
                    <div className={styles.notificationHeader}>
                      <div>
                        <p className={styles.notificationHeading}>
                          Notifications
                        </p>
                        <p className={styles.notificationSubheading}>
                          {hasPendingNotifications
                            ? `${notifications.length} pending`
                            : "No pending notifications"}
                        </p>
                      </div>
                      <button
                        type="button"
                        className={styles.notificationRefresh}
                        onClick={() => refetchNotifications()}
                        aria-label="Refresh notifications"
                      >
                        Refresh
                      </button>
                    </div>
                    {renderNotificationBody()}
                  </div>
                )}
              </div>
              <div className={styles.profile} ref={profileMenuRef}>
                <button
                  type="button"
                  className={styles.profileButton}
                  onClick={() => {
                    setIsMenuOpen((value) => !value);
                    setIsNotificationsOpen(false);
                  }}
                  aria-haspopup="true"
                  aria-expanded={isMenuOpen}
                >
                  <UserIcon />
                  {user.firstName} {user.lastName}
                </button>
                {isMenuOpen && (
                  <div className={styles.dropdown} role="menu">
                    {canViewAsStudent && (
                      <button
                        type="button"
                        className={styles.dropdownItem}
                        onClick={handleToggleStudentView}
                        role="menuitem"
                      >
                        {viewAsStudent ? "Exit student view" : "View as student"}
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.dropdownItem}
                      onClick={logout}
                      role="menuitem"
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <Link to="/login" className={styles.link}>
              <ArrowRightIcon />
              Login
            </Link>
          )}
        </div>
      </WidthFix>
    </header>
  );
};
