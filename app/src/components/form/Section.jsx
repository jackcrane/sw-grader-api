import styles from "./Form.module.css";
import classnames from "classnames";
import React from "react";
import { Row } from "../flex/Flex";
import { Lead } from "../typography/Typography";

export const Section = ({
  title,
  subtitle,
  children,
  className = "",
  last,
}) => {
  return (
    <div
      className={classnames(styles.container, className, last && styles.last)}
    >
      <div className={classnames(styles.section)}>
        <div className={classnames(styles.subsection, styles.title)}>
          <Lead className={styles.titletext}>{title}</Lead>
          {subtitle && <Lead>{subtitle}</Lead>}
        </div>
        <div className={styles.subsection}>{children}</div>
      </div>
    </div>
  );
};

export const MonoSection = ({ children }) => {
  return (
    <div className={styles.container}>
      <div className={styles.section}>{children}</div>
    </div>
  );
};
