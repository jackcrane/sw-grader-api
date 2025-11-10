// Button.jsx
import styles from "./Button.module.css";
import classnames from "classnames";
import React from "react";

export const Button = ({
  children,
  className = "",
  onClick,
  href,
  disabled,
  variant = null,
  ...props
}) => {
  const classes = classnames(
    styles.button,
    variant === "primary" && styles.primary,
    className
  );

  if (href) {
    return (
      <a className={classes} href={href} onClick={onClick} {...props}>
        {children}
      </a>
    );
  }

  return (
    <button
      className={classes}
      onClick={onClick}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
};
