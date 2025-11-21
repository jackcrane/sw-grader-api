import React, { useEffect, useRef } from "react";
import { UserIcon } from "@phosphor-icons/react";
import styles from "./Header.module.css";

export const ProfileMenu = ({
  user,
  isOpen,
  onToggle,
  onClose,
  canViewAsStudent,
  viewAsStudent,
  onToggleStudentView,
  onLogout,
}) => {
  const profileRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
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

  if (!user) {
    return null;
  }

  return (
    <div className={styles.profile} ref={profileRef}>
      <button
        type="button"
        className={styles.profileButton}
        onClick={onToggle}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <UserIcon />
        {user.firstName} {user.lastName}
      </button>
      {isOpen && (
        <div className={styles.dropdown} role="menu">
          {canViewAsStudent && (
            <button
              type="button"
              className={styles.dropdownItem}
              onClick={() => {
                onToggleStudentView();
                onClose();
              }}
              role="menuitem"
            >
              {viewAsStudent ? "Exit student view" : "View as student"}
            </button>
          )}
          <button
            type="button"
            className={styles.dropdownItem}
            onClick={() => {
              onLogout();
              onClose();
            }}
            role="menuitem"
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
};
