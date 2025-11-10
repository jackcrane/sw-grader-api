import { WidthFix } from "../widthfix/WidthFix";
import styles from "./Header.module.css";
import React, { useEffect, useMemo, useRef, useState } from "react";
import logo from "../../../assets/featurebench-body.svg";
import { ArrowRightIcon, UserIcon } from "@phosphor-icons/react";
import { useAuthContext } from "../../context/AuthContext";
import { useEnrollments } from "../../hooks/useEnrollments";

export const Header = () => {
  const { user, logout, login, viewAsStudent, setViewAsStudent } =
    useAuthContext();
  const { enrollments } = useEnrollments({ enabled: Boolean(user) });
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

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

  return (
    <header className={styles.header}>
      <WidthFix>
        <div className={styles.content}>
          <a href="/" className={styles.logolink}>
            <img src={logo} className={styles.logo} alt="FeatureBench Logo" />
          </a>
          <div style={{ flex: 1 }}></div>
          {user ? (
            <div className={styles.profile} ref={menuRef}>
              <button
                type="button"
                className={styles.profileButton}
                onClick={() => setIsMenuOpen((value) => !value)}
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
          ) : (
            <a
              onClick={login}
              href="javascript: void()"
              className={styles.link}
            >
              <ArrowRightIcon />
              Login
            </a>
          )}
        </div>
      </WidthFix>
    </header>
  );
};
