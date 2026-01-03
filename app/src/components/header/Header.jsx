import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { WidthFix } from "../widthfix/WidthFix";
import logo from "../../../assets/featurebench-body.svg";
import styles from "./Header.module.css";
import { useAuthContext } from "../../context/AuthContext";
import { useEnrollments } from "../../hooks/useEnrollments";
import { useNotifications } from "../../hooks/useNotifications";
import { usePaymentAuthorization } from "../../hooks/usePaymentAuthorization";
import { NotificationBell } from "./NotificationBell";
import { ProfileMenu } from "./ProfileMenu";
import { PaymentAuthorizationModal } from "./PaymentAuthorizationModal";

const TREND_STORAGE_KEY = "featurebench:signatureTrendIntent";

export const Header = () => {
  const navigate = useNavigate();
  const { user, logout, viewAsStudent, setViewAsStudent } = useAuthContext();
  const { enrollments } = useEnrollments({ enabled: Boolean(user) });
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const {
    notifications,
    error: notificationsError,
    isLoading: notificationsLoading,
    refresh: refreshNotifications,
    dismiss: dismissNotification,
    hasPending: hasPendingNotifications,
  } = useNotifications({ enabled: Boolean(user) });

  const handleBillingAuthorizationSuccess = useCallback(async () => {
    await refreshNotifications();
    window.dispatchEvent(new Event("billing-history:refresh"));
  }, [refreshNotifications]);

  const {
    authorizationModal,
    authorizePaymentNotification,
    closeAuthorizationModal,
    handleModalSuccess,
    notificationActions,
    updateAuthorizationModalState,
  } = usePaymentAuthorization({
    onSuccess: handleBillingAuthorizationSuccess,
  });

  const canViewAsStudent = useMemo(() => {
    if (!user) return false;
    return (enrollments ?? []).some((enrollment) =>
      ["TEACHER", "TA"].includes(enrollment.type)
    );
  }, [enrollments, user]);

  const closeNotifications = useCallback(() => {
    setIsNotificationsOpen(false);
  }, []);

  const closeMenu = useCallback(() => {
    setIsMenuOpen(false);
  }, []);

  const toggleNotifications = useCallback(() => {
    setIsNotificationsOpen((value) => !value);
    closeMenu();
  }, [closeMenu]);

  const toggleMenu = useCallback(() => {
    setIsMenuOpen((value) => !value);
    closeNotifications();
  }, [closeNotifications]);

  useEffect(() => {
    if (!user) {
      closeMenu();
      closeNotifications();
    }
  }, [closeMenu, closeNotifications, user]);

  const handleNotificationCta = useCallback(
    async (notification) => {
      if (!notification?.data?.hasCta) {
        setIsNotificationsOpen(false);
        return;
      }

      if (notification?.type === "SIGNATURE_TREND") {
        const data = notification?.data || {};
        const intent = {
          assignmentId: data.assignmentId ?? null,
          courseId: data.courseId ?? null,
          trendKey: data.trendKey ?? null,
          occurrenceCount: data.occurrenceCount ?? null,
          signatureSeed: data.signatureSeed ?? {},
        };
        try {
          window.sessionStorage.setItem(
            TREND_STORAGE_KEY,
            JSON.stringify(intent)
          );
        } catch {
          // ignore session storage failures
        }

        if (notification?.id) {
          try {
            await dismissNotification(notification.id);
          } catch {
            // non-blocking
          }
        }

        if (intent.courseId && intent.assignmentId) {
          navigate(
            `/${intent.courseId}/assignments/${intent.assignmentId}`,
            {
              state: { signatureTrendIntent: intent },
            }
          );
          closeNotifications();
          return;
        }
        closeNotifications();
        return;
      }

      if (
        notification?.type === "PAYMENT_ISSUE" &&
        notification?.data?.paymentIntentId
      ) {
        const success = await authorizePaymentNotification(notification);
        if (success) {
          closeNotifications();
        }
        return;
      }

      const href = notification?.data?.ctaHref;
      if (href) {
        if (/^https?:\/\//i.test(href)) {
          window.open(href, "_blank", "noopener,noreferrer");
        } else {
          navigate(href);
        }
        closeNotifications();
      }
    },
    [authorizePaymentNotification, closeNotifications, navigate]
  );

  const handleNotificationDismiss = useCallback(
    async (notification) => {
      if (!notification?.id) return;
      try {
        await dismissNotification(notification.id);
      } catch {
        // ignore dismiss errors in UI
      }
    },
    [dismissNotification]
  );

  const handleAuthorizationSuccessInModal = useCallback(
    async (notificationId) => {
      await handleModalSuccess(notificationId);
      closeNotifications();
    },
    [closeNotifications, handleModalSuccess]
  );

  const handleToggleStudentView = useCallback(() => {
    setViewAsStudent((value) => !value);
  }, [setViewAsStudent]);

  return (
    <>
      <header className={styles.header}>
        <WidthFix>
          <div className={styles.content}>
            <a href="/" className={styles.logolink}>
              <img src={logo} className={styles.logo} alt="FeatureBench Logo" />
            </a>
            <div style={{ flex: 1 }} />
            {user ? (
              <div className={styles.userActions}>
                <NotificationBell
                  isOpen={isNotificationsOpen}
                  onToggle={toggleNotifications}
                  onClose={closeNotifications}
                  hasPending={hasPendingNotifications}
                  loading={notificationsLoading}
                  error={notificationsError}
                  notifications={notifications}
                  onRefresh={refreshNotifications}
                  onNotificationCta={handleNotificationCta}
                  actionState={notificationActions}
                  onNotificationDismiss={handleNotificationDismiss}
                />
                <ProfileMenu
                  user={user}
                  isOpen={isMenuOpen}
                  onToggle={toggleMenu}
                  onClose={closeMenu}
                  canViewAsStudent={canViewAsStudent}
                  viewAsStudent={viewAsStudent}
                  onToggleStudentView={handleToggleStudentView}
                  onLogout={logout}
                />
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
      <PaymentAuthorizationModal
        state={authorizationModal}
        onClose={closeAuthorizationModal}
        onAuthorizationSuccess={handleAuthorizationSuccessInModal}
        updateState={updateAuthorizationModalState}
      />
    </>
  );
};
