import { WidthFix } from "../widthfix/WidthFix";
import styles from "./Header.module.css";
import React from "react";
import logo from "../../../assets/featurebench-body.svg";
import { ArrowRightIcon } from "@phosphor-icons/react";

export const Header = () => {
  return (
    <header className={styles.header}>
      <WidthFix>
        <div className={styles.content}>
          <a href="/" className={styles.logolink}>
            <img src={logo} className={styles.logo} alt="FeatureBench Logo" />
          </a>
          <a href="/app" className={styles.link}>
            <ArrowRightIcon />
            Enter App
          </a>
        </div>
      </WidthFix>
    </header>
  );
};
