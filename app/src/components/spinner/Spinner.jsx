import flower from "../../../assets/featurebench-flower-contrast.svg";
import styles from "./Spinner.module.css";
import React from "react";

export const Spinner = () => {
  return (
    <div className={styles.spinner}>
      <img src={flower} alt="Loading..." />
    </div>
  );
};
