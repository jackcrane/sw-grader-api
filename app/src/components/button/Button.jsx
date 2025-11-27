// Button.jsx
import styles from "./Button.module.css";
import classnames from "classnames";
import React from "react";
import { Spinner } from "../spinner/Spinner";

export const Button = ({
  children,
  className = "",
  onClick,
  href,
  disabled,
  variant = null,
  isLoading = false,
  ...props
}) => {
  const { ["aria-busy"]: ariaBusy, ...restProps } = props;
  const classes = classnames(
    styles.button,
    variant === "primary" && styles.primary,
    variant === "danger" && styles.danger,
    isLoading && styles.loading,
    className
  );
  const isDisabled = disabled || isLoading;

  const spinnerClassNames = classnames(
    styles.spinner,
    variant === "primary" && styles.spinnerPrimary,
    variant === "danger" && styles.spinnerDanger
  );

  const content = (
    <span className={styles.content}>
      {isLoading && (
        <span className={spinnerClassNames}>
          <Spinner />
        </span>
      )}
      <span>{children}</span>
    </span>
  );

  if (href) {
    return (
      <a
        className={classes}
        href={href}
        onClick={isLoading ? undefined : onClick}
        aria-busy={ariaBusy ?? (isLoading ? true : undefined)}
        aria-disabled={isDisabled || undefined}
        {...restProps}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      className={classes}
      onClick={onClick}
      disabled={isDisabled}
      aria-busy={ariaBusy ?? (isLoading ? true : undefined)}
      {...restProps}
    >
      {content}
    </button>
  );
};
