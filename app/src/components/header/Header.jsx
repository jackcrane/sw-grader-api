import { WidthFix } from "../widthfix/WidthFix";
import styles from "./Header.module.css";
import React from "react";
import logo from "../../../assets/featurebench-body.svg";
import { ArrowRightIcon, UserIcon } from "@phosphor-icons/react";
import { useAuthContext } from "../../context/AuthContext";

export const Header = () => {
  const { user, logout, login } = useAuthContext();

  return (
    <header className={styles.header}>
      <WidthFix>
        <div className={styles.content}>
          <a href="/" className={styles.logolink}>
            <img src={logo} className={styles.logo} alt="FeatureBench Logo" />
          </a>
          <div style={{ flex: 1 }}></div>
          {user ? (
            <a href="/app" className={styles.link}>
              <UserIcon />
              {user.firstName} {user.lastName}
            </a>
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
