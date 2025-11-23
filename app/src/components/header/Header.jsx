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
import { fetchJson } from "../../utils/fetchJson";

const appendEditAssignmentModalParam = (href) => {
  if (!href) return href;
  const normalizedHref = href.startsWith("/") ? href : `/${href}`;
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://featurebench.com";

  try {
    const url = new URL(normalizedHref, origin);
    url.searchParams.set("modal", "edit-assignment");
    return `${url.pathname}${url.search}${url.hash}`;
  } catch (error) {
    const separator = normalizedHref.includes("?") ? "&" : "?";
    return `${normalizedHref}${separator}modal=edit-assignment`;
  }
};

export const Header = () => {
  const navigate = useNavigate();
  const { user, logout, viewAsStudent, setViewAsStudent } = useAuthContext();
  const { enrollments } = useEnrollments({ enabled: Boolean(user) });
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [dismissActions, setDismissActions] = useState({});

  const {
    notifications,
    error: notificationsError,
    isLoading: notificationsLoading,
    refresh: refreshNotifications,
    hasPending: hasPendingNotifications,
  } = useNotifications({ enabled: Boolean(user) });

  const {
    authorizationModal,
    authorizePaymentNotification,
    closeAuthorizationModal,
    handleModalSuccess,
    notificationActions,
    updateAuthorizationModalState,
  } = usePaymentAuthorization({
    onSuccess: refreshNotifications,
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
          closeNotifications();
          return;
        }

        const shouldOpenAssignmentEditModal =
          notification?.type === "CANVAS_POINTS_MISMATCH";
        const normalizedHref = href.startsWith("/") ? href : `/${href}`;
        const destinationHref = shouldOpenAssignmentEditModal
          ? appendEditAssignmentModalParam(normalizedHref)
          : normalizedHref;
        if (typeof window !== "undefined") {
          const targetUrl = new URL(destinationHref, window.location.origin);
          const isAlreadyOnTarget =
            window.location.pathname === targetUrl.pathname &&
            window.location.search === targetUrl.search &&
            window.location.hash === targetUrl.hash;

          if (isAlreadyOnTarget) {
            closeNotifications();
            return;
          }

          navigate(destinationHref);
          window.setTimeout(() => {
            const stillNotOnTarget = shouldOpenAssignmentEditModal
              ? window.location.pathname !== targetUrl.pathname ||
                window.location.hash !== targetUrl.hash
              : window.location.pathname !== targetUrl.pathname ||
                window.location.search !== targetUrl.search ||
                window.location.hash !== targetUrl.hash;
            if (stillNotOnTarget) {
              window.location.assign(targetUrl.href);
            }
          }, 200);
        } else {
          navigate(destinationHref);
        }
        closeNotifications();
      }
    },
    [authorizePaymentNotification, closeNotifications, navigate]
  );

  const updateDismissState = useCallback((notificationId, updates) => {
    if (!notificationId) return;
    setDismissActions((prev) => ({
      ...prev,
      [notificationId]: {
        ...(prev[notificationId] ?? {}),
        ...updates,
      },
    }));
  }, []);

  const clearDismissState = useCallback((notificationId) => {
    if (!notificationId) return;
    setDismissActions((prev) => {
      if (!prev[notificationId]) return prev;
      const next = { ...prev };
      delete next[notificationId];
      return next;
    });
  }, []);

  const handleNotificationDismiss = useCallback(
    async (notification) => {
      const notificationId = notification?.id;
      if (!notificationId) return false;

      updateDismissState(notificationId, {
        dismissing: true,
        dismissError: null,
      });

      try {
        await fetchJson(`/api/notifications/${notificationId}`, {
          method: "DELETE",
        });
        clearDismissState(notificationId);
        await refreshNotifications();
        return true;
      } catch (error) {
        updateDismissState(notificationId, {
          dismissing: false,
          dismissError:
            error?.info?.error ||
            error?.info?.message ||
            error?.message ||
            "Unable to dismiss notification.",
        });
        return false;
      }
    },
    [clearDismissState, refreshNotifications, updateDismissState]
  );

  const combinedActionState = useMemo(() => {
    if (!dismissActions || !Object.keys(dismissActions).length) {
      return notificationActions;
    }
    const nextState = { ...notificationActions };
    Object.entries(dismissActions).forEach(([notificationId, state]) => {
      nextState[notificationId] = {
        ...(nextState[notificationId] ?? {}),
        ...state,
      };
    });
    return nextState;
  }, [dismissActions, notificationActions]);

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
                  onNotificationDismiss={handleNotificationDismiss}
                  actionState={combinedActionState}
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
