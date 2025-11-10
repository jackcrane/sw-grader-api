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

export const Select = ({
  value,
  onChange,
  placeholder,
  className = "",
  label,
  options,
  ...props
}) => {
  return (
    <>
      {label ? <label className={styles.label}>{label}</label> : null}
      <select
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={classnames(styles.input, className)}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </>
  );
};

export const Textarea = ({
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
      <textarea
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={classnames(styles.input, className)}
        {...props}
      />
    </>
  );
};
