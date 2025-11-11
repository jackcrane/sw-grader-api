import styles from "./Card.module.css";
import React from "react";

export const Card = ({ children, ...props }) => {
  return (
    <div className={styles.card} {...props}>
      {children}
    </div>
  );
};
