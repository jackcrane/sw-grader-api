import { WidthFix } from "../widthfix/WidthFix";
import styles from "./Header.module.css";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { fetchJson } from "../../utils/fetchJson";
import { getStripePromise } from "../../utils/stripeClient";
import { Modal } from "../modal/Modal";
import {
  Elements,
  CardElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";

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
  const [notificationActions, setNotificationActions] = useState({});
  const [authorizationModal, setAuthorizationModal] = useState(null);

  const updateNotificationActionState = useCallback((notificationId, updates) => {
    if (!notificationId) return;
    setNotificationActions((prev) => ({
      ...prev,
      [notificationId]: {
        ...(prev[notificationId] ?? {}),
        ...updates,
      },
    }));
  }, []);

  const clearNotificationActionState = useCallback((notificationId) => {
    if (!notificationId) return;
    setNotificationActions((prev) => {
      if (!prev[notificationId]) return prev;
      const next = { ...prev };
      delete next[notificationId];
      return next;
    });
  }, []);

  const closeAuthorizationModal = useCallback(() => {
    setAuthorizationModal(null);
  }, []);

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

  const sendAuthorizeRequest = useCallback(
    ({ notificationId, paymentIntentId, ...extra }) => {
      if (!notificationId || !paymentIntentId) {
        return Promise.reject(
          new Error("Missing details to authorize this payment.")
        );
      }
      return fetchJson("/api/billing/authorize-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notificationId,
          paymentIntentId,
          ...extra,
        }),
      });
    },
    []
  );

  const markAuthorizationSuccess = useCallback(
    async (notificationId) => {
      if (!notificationId) return;
      updateNotificationActionState(notificationId, {
        loading: false,
        success: true,
        error: null,
      });
      try {
        await refetchNotifications();
      } finally {
        clearNotificationActionState(notificationId);
      }
    },
    [clearNotificationActionState, refetchNotifications, updateNotificationActionState]
  );

  const handleAuthorizationModalComplete = useCallback(async () => {
    if (!authorizationModal) {
      return {
        success: false,
        message: "Authorization session has expired. Reopen the tray to try again.",
      };
    }

    try {
      const finalResponse = await authorizationModal.requestAuthorization({
        checkStatusOnly: true,
      });

      if (finalResponse.status === "succeeded") {
        await markAuthorizationSuccess(authorizationModal.notificationId);
        setIsNotificationsOpen(false);
        closeAuthorizationModal();
        return { success: true };
      }

      return {
        success: false,
        message:
          finalResponse.message ||
          "We couldn't confirm the payment. Please try again.",
      };
    } catch (err) {
      return {
        success: false,
        message: err?.message || "Unable to confirm the payment.",
      };
    }
  }, [
    authorizationModal,
    closeAuthorizationModal,
    markAuthorizationSuccess,
    setIsNotificationsOpen,
  ]);

  const handleAuthorizePayment = async (notification) => {
    const notificationId = notification?.id;
    const paymentIntentId = notification?.data?.paymentIntentId;
    if (!notificationId || !paymentIntentId) {
      return;
    }

    updateNotificationActionState(notificationId, {
      loading: true,
      error: null,
      success: false,
    });

    const requestAuthorization = (extraBody = {}) =>
      sendAuthorizeRequest({
        notificationId,
        paymentIntentId,
        ...extraBody,
      });

    try {
      const authorizationResponse = await requestAuthorization();
      if (authorizationResponse.status === "succeeded") {
        await markAuthorizationSuccess(notificationId);
        setIsNotificationsOpen(false);
        return;
      }

      if (authorizationResponse.status === "requires_action") {
        const stripePromise = getStripePromise(
          authorizationResponse.publishableKey
        );
        if (!stripePromise) {
          throw new Error("Unable to load Stripe to authorize the payment.");
        }
        const stripe = await stripePromise;
        if (!stripe) {
          throw new Error("Unable to load Stripe to authorize the payment.");
        }

        const confirmResult = await stripe.confirmCardPayment(
          authorizationResponse.clientSecret
        );

        if (confirmResult.error) {
          throw new Error(
            confirmResult.error.message || "Unable to authorize the payment."
          );
        }

        const resultStatus = confirmResult.paymentIntent?.status;
        if (resultStatus === "succeeded") {
          const finalResponse = await requestAuthorization({
            checkStatusOnly: true,
          });
          if (finalResponse.status === "succeeded") {
            await markAuthorizationSuccess(notificationId);
            setIsNotificationsOpen(false);
            return;
          }
          throw new Error(
            finalResponse.message || "Unable to confirm authorization."
          );
        }

        if (resultStatus === "requires_payment_method") {
          const nextClientSecret =
            confirmResult.paymentIntent?.client_secret ??
            authorizationResponse.clientSecret;
          // Fall through to card entry flow for new payment method.
          setAuthorizationModal({
            notification,
            clientSecret: nextClientSecret,
            publishableKey: authorizationResponse.publishableKey,
            notificationId,
            paymentIntentId,
            requestAuthorization,
          });
          updateNotificationActionState(notificationId, {
            loading: false,
            error: null,
            success: false,
          });
          return;
        }

        throw new Error(
          "Verification was not completed. Please try again to authorize the payment."
        );
      }

      if (authorizationResponse.status === "requires_payment_method") {
        updateNotificationActionState(notificationId, {
          loading: false,
          error: null,
          success: false,
        });
        setAuthorizationModal({
          notification,
          clientSecret: authorizationResponse.clientSecret,
          publishableKey: authorizationResponse.publishableKey,
          notificationId,
          paymentIntentId,
          requestAuthorization,
        });
        return;
      }

      throw new Error(
        authorizationResponse.message ||
          "Unable to authorize this payment right now. Try again shortly."
      );
    } catch (err) {
      updateNotificationActionState(notificationId, {
        loading: false,
        error: err?.message || "Unable to authorize the payment.",
        success: false,
      });
    }
  };

  const handleNotificationCta = async (notification) => {
    if (!notification?.data?.hasCta) {
      setIsNotificationsOpen(false);
      return;
    }

    if (
      notification?.type === "PAYMENT_ISSUE" &&
      notification?.data?.paymentIntentId
    ) {
      await handleAuthorizePayment(notification);
      return;
    }

    const href = notification?.data?.ctaHref;
    if (href) {
      if (/^https?:\/\//i.test(href)) {
        window.open(href, "_blank", "noopener,noreferrer");
      } else {
        navigate(href);
      }
      setIsNotificationsOpen(false);
      return;
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
          const notificationData =
            notification && typeof notification.data === "object"
              ? notification.data
              : {};
          const actionState = notificationActions[notification.id] ?? {};
          const isPaymentAuthorization =
            notification.type === "PAYMENT_ISSUE" &&
            notificationData?.paymentIntentId;
          const ctaLabel = (() => {
            const baseLabel =
              notificationData?.ctaLabel ??
              (isPaymentAuthorization ? "Authorize payment" : "View details");
            if (isPaymentAuthorization && actionState?.loading) {
              return "Authorizing…";
            }
            return baseLabel;
          })();
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
                {notificationData?.hasCta && (
                  <>
                    <button
                      type="button"
                      className={styles.notificationCta}
                      onClick={() => handleNotificationCta(notification)}
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
        })}
      </ul>
    );
  };

  return (
    <>
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
                    {hasPendingNotifications &&
                      !notificationsLoading &&
                      !notificationsError && (
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
      <PaymentAuthorizationModal
        state={authorizationModal}
        onClose={closeAuthorizationModal}
        onAuthorizationComplete={handleAuthorizationModalComplete}
      />
    </>
  );
};

const AuthorizationCardForm = ({ clientSecret, onAuthorized }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isComplete, setIsComplete] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!stripe || !elements || !clientSecret || submitting || !isComplete) {
      return;
    }
    setSubmitting(true);
    setError("");

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      setError("Unable to load the card input.");
      setSubmitting(false);
      return;
    }

    const result = await stripe.confirmCardPayment(clientSecret, {
      payment_method: {
        card: cardElement,
      },
    });

    if (result.error) {
      setError(result.error.message || "Unable to authorize the payment.");
      setSubmitting(false);
      return;
    }

    const followUp = await onAuthorized?.();
    if (!followUp?.success) {
      setError(
        followUp?.message || "Unable to confirm authorization. Please try again."
      );
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
  };

  return (
    <form className={styles.authorizationForm} onSubmit={handleSubmit}>
      <label className={styles.authorizationLabel}>Card details</label>
      <div
        className={[
          styles.authorizationCardInput,
          isFocused ? styles.authorizationCardInputFocused : "",
          error ? styles.authorizationCardInputError : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <CardElement
          onChange={(event) => setIsComplete(event?.complete ?? false)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          options={{
            hidePostalCode: true,
            style: {
              base: {
                fontSize: "14px",
                color: "var(--surface-contrast-primary)",
                fontFamily: '"Stack Sans Text", system-ui, sans-serif',
                "::placeholder": { color: "rgb(169,169,169)" },
              },
              invalid: {
                color: "var(--danger, #b00020)",
                iconColor: "var(--danger, #b00020)",
              },
            },
          }}
        />
      </div>
      {error && <p className={styles.authorizationError}>{error}</p>}
      <button
        type="submit"
        className={styles.authorizationSubmit}
        disabled={!stripe || !elements || !isComplete || submitting}
      >
        {submitting ? "Authorizing…" : "Authorize payment"}
      </button>
      <p className={styles.authorizationHelper}>
        We'll securely run this charge now and save the card for future
        enrollments.
      </p>
    </form>
  );
};

const PaymentAuthorizationModal = ({
  state,
  onClose,
  onAuthorizationComplete,
}) => {
  const hasSession =
    state &&
    state.clientSecret &&
    state.publishableKey &&
    state.notification;

  const stripePromise = useMemo(() => {
    if (!state?.publishableKey) return null;
    return getStripePromise(state.publishableKey);
  }, [state?.publishableKey]);

  if (!hasSession) {
    return null;
  }

  const notificationData =
    state.notification && typeof state.notification.data === "object"
      ? state.notification.data
      : {};
  const studentName = notificationData.studentName;
  const courseName = notificationData.courseName;

  return (
    <Modal
      open={Boolean(hasSession)}
      onClose={onClose}
      title="Authorize payment"
      closeOnBackdrop={false}
    >
      <div className={styles.authorizationModalContent}>
        <p className={styles.authorizationIntro}>
          {studentName && courseName
            ? `Authorize the enrollment fee for ${studentName} in ${courseName}.`
            : "Authorize this enrollment fee to keep your course in sync."}
        </p>
        {stripePromise ? (
          <Elements
            stripe={stripePromise}
            options={{ clientSecret: state.clientSecret }}
          >
            <AuthorizationCardForm
              clientSecret={state.clientSecret}
              onAuthorized={onAuthorizationComplete}
            />
          </Elements>
        ) : (
          <p>Loading secure payment form…</p>
        )}
      </div>
    </Modal>
  );
};
