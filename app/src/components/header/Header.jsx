import { WidthFix } from "../widthfix/WidthFix";
import styles from "./Header.module.css";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { SetupElement } from "../stripe/SetupElement";
import { Spacer } from "../spacer/Spacer";
import { Section } from "../form/Section";

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

  const updateNotificationActionState = useCallback(
    (notificationId, updates) => {
      if (!notificationId) return;
      setNotificationActions((prev) => ({
        ...prev,
        [notificationId]: {
          ...(prev[notificationId] ?? {}),
          ...updates,
        },
      }));
    },
    []
  );

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
        profileMenuRef.current && profileMenuRef.current.contains(event.target);
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
    [
      clearNotificationActionState,
      refetchNotifications,
      updateNotificationActionState,
    ]
  );

  const handleAuthorizationSuccessInModal = useCallback(
    async (notificationId) => {
      if (!notificationId) return;
      await markAuthorizationSuccess(notificationId);
      setAuthorizationModal((prev) =>
        prev ? { ...prev, status: "success" } : prev
      );
      setIsNotificationsOpen(false);
    },
    [markAuthorizationSuccess, setIsNotificationsOpen]
  );

  const updateAuthorizationModalState = useCallback((updates) => {
    setAuthorizationModal((prev) => (prev ? { ...prev, ...updates } : prev));
  }, []);

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
            status: "form",
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
          status: "form",
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
                          {viewAsStudent
                            ? "Exit student view"
                            : "View as student"}
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
        onAuthorizationSuccess={handleAuthorizationSuccessInModal}
        updateState={updateAuthorizationModalState}
      />
    </>
  );
};

const PaymentAuthorizationModal = ({
  state,
  onClose,
  onAuthorizationSuccess,
  updateState,
}) => {
  const hasSession =
    state &&
    state.notification &&
    state.notificationId &&
    state.requestAuthorization;

  const [paymentMethod, setPaymentMethod] = useState(null);
  const [loadingPaymentMethod, setLoadingPaymentMethod] = useState(false);
  const [paymentMethodError, setPaymentMethodError] = useState("");
  const [showSetupForm, setShowSetupForm] = useState(false);
  const [charging, setCharging] = useState(false);
  const [chargeError, setChargeError] = useState("");
  const [setupKey, setSetupKey] = useState(0);
  const successState = state?.status === "success";
  const stripePromise = useMemo(() => {
    if (!state?.publishableKey) return null;
    return getStripePromise(state.publishableKey);
  }, [state?.publishableKey]);

  const loadPaymentMethod = useCallback(async () => {
    setLoadingPaymentMethod(true);
    setPaymentMethodError("");
    try {
      const payload = await fetchJson("/api/billing/payment-method");
      setPaymentMethod(payload?.paymentMethod ?? null);
    } catch (err) {
      setPaymentMethod(null);
      setPaymentMethodError(
        err?.message || "Unable to load your saved payment method."
      );
    } finally {
      setLoadingPaymentMethod(false);
    }
  }, []);

  useEffect(() => {
    if (!hasSession) return;
    setShowSetupForm(false);
    setChargeError("");
    setPaymentMethod(null);
    setPaymentMethodError("");
    setSetupKey((value) => value + 1);
    loadPaymentMethod();
  }, [hasSession, loadPaymentMethod, state?.notificationId]);

  useEffect(() => {
    if (!successState && !loadingPaymentMethod && !paymentMethod) {
      setShowSetupForm(true);
    }
  }, [loadingPaymentMethod, paymentMethod, successState]);

  const processAuthorizationResponse = useCallback(
    async (response) => {
      if (!response) {
        throw new Error("Unable to authorize this payment.");
      }

      if (response.clientSecret) {
        updateState?.({ clientSecret: response.clientSecret });
      }
      if (response.publishableKey) {
        updateState?.({ publishableKey: response.publishableKey });
      }

      if (response.status === "succeeded") {
        await onAuthorizationSuccess?.(state.notificationId);
        return { done: true };
      }

      if (response.status === "requires_action") {
        const publishableKey =
          response.publishableKey ?? state.publishableKey ?? null;
        const clientSecret =
          response.clientSecret ?? state.clientSecret ?? null;
        if (!publishableKey || !clientSecret) {
          throw new Error("Unable to continue authorization.");
        }
        const stripePromise = getStripePromise(publishableKey);
        if (!stripePromise) {
          throw new Error("Unable to load Stripe to continue authorization.");
        }
        const stripe = await stripePromise;
        if (!stripe) {
          throw new Error("Unable to load Stripe to continue authorization.");
        }
        const confirmResult = await stripe.confirmCardPayment(clientSecret);
        if (confirmResult.error) {
          throw new Error(
            confirmResult.error.message || "Unable to authorize the payment."
          );
        }
        const finalResponse = await state.requestAuthorization({
          checkStatusOnly: true,
        });
        return processAuthorizationResponse(finalResponse);
      }

      if (response.status === "requires_payment_method") {
        setShowSetupForm(true);
        throw new Error(
          response.message ||
            "The saved payment method was declined. Add a new card to continue."
        );
      }

      throw new Error(
        response.message ||
          "Unable to authorize this payment right now. Try again soon."
      );
    },
    [onAuthorizationSuccess, state, updateState]
  );

  const handleChargeSavedPaymentMethod = useCallback(async () => {
    if (!state?.clientSecret || !stripePromise || !paymentMethod?.id) {
      setChargeError(
        "Unable to load your saved payment method for confirmation."
      );
      return;
    }
    setCharging(true);
    setChargeError("");
    try {
      const stripe = await stripePromise;
      if (!stripe) {
        throw new Error("Unable to load Stripe to authorize the payment.");
      }
      const result = await stripe.confirmCardPayment(state.clientSecret, {
        payment_method: paymentMethod.id,
      });
      if (result.error) {
        throw new Error(
          result.error.message || "Unable to authorize the payment."
        );
      }
      const finalResponse = await state.requestAuthorization({
        checkStatusOnly: true,
      });
      await processAuthorizationResponse(finalResponse);
    } catch (err) {
      setChargeError(err?.message || "Unable to authorize the payment.");
    } finally {
      setCharging(false);
    }
  }, [paymentMethod?.id, processAuthorizationResponse, state, stripePromise]);

  const handlePaymentMethodSaved = useCallback(async () => {
    await loadPaymentMethod();
    setShowSetupForm(false);
    await handleChargeSavedPaymentMethod();
  }, [handleChargeSavedPaymentMethod, loadPaymentMethod]);

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
      <Section title="Authorize payment">
        <div className={styles.authorizationModalContent}>
          {successState ? (
            <div className={styles.authorizationSuccess}>
              <p className={styles.authorizationSuccessTitle}>
                Payment complete
              </p>
              <p className={styles.authorizationSuccessMessage}>
                The payment was successful and the student is now fully enrolled
                in your course.
              </p>
              <button
                type="button"
                className={styles.authorizationSubmit}
                onClick={onClose}
              >
                Close
              </button>
            </div>
          ) : (
            <>
              <p className={styles.authorizationIntro}>
                {studentName && courseName
                  ? `Charge the saved card for ${studentName}'s enrollment in ${courseName}.`
                  : "Charge your saved card to complete this enrollment."}
              </p>
              <div className={styles.authorizationSummary}>
                {loadingPaymentMethod ? (
                  <p>Loading your saved payment method…</p>
                ) : paymentMethod ? (
                  <p>
                    Using {paymentMethod.brand?.toUpperCase() || "card"} ending
                    in {paymentMethod.last4}.
                  </p>
                ) : (
                  <p>No saved payment method found.</p>
                )}
                {paymentMethodError && (
                  <p className={styles.authorizationError}>
                    {paymentMethodError}
                  </p>
                )}
              </div>
              <button
                type="button"
                className={styles.authorizationSubmit}
                onClick={handleChargeSavedPaymentMethod}
                disabled={
                  charging ||
                  loadingPaymentMethod ||
                  !paymentMethod ||
                  !stripePromise
                }
              >
                {charging ? "Authorizing…" : "Charge saved payment method"}
              </button>
              {chargeError && (
                <p className={styles.authorizationError}>{chargeError}</p>
              )}
              <Spacer size={1} />
              <button
                type="button"
                className={styles.authorizationSecondary}
                onClick={() => setShowSetupForm((value) => !value)}
              >
                {showSetupForm ? "Hide card form" : "Use a different card"}
              </button>
              {showSetupForm && (
                <div className={styles.authorizationSetupWrapper}>
                  <SetupElement
                    key={setupKey}
                    loadSavedPaymentMethod={false}
                    allowUpdatingPaymentMethod={false}
                    onReady={handlePaymentMethodSaved}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </Section>
    </Modal>
  );
};
