import styles from "./Input.module.css";
import classnames from "classnames";
import React from "react";

export const Input = ({
  type = "text",
  value,
  onChange,
  placeholder,
  className = "",
  label,
  ...props
}) => {
  return (
    <>
      {label ? <label className={styles.label}>{label}</label> : null}
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={classnames(styles.input, className)}
        {...props}
      />
    </>
  );
};
