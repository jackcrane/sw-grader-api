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
  invalid = false,
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
        className={classnames(
          styles.input,
          {
            [styles.inputInvalid]: invalid,
          },
          className
        )}
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
  invalid = false,
  ...props
}) => {
  return (
    <div>
      {label ? <label className={styles.label}>{label}</label> : null}
      <select
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={classnames(
          styles.input,
          {
            [styles.inputInvalid]: invalid,
          },
          className
        )}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export const Textarea = ({
  value,
  onChange,
  placeholder,
  className = "",
  label,
  invalid = false,
  ...props
}) => {
  return (
    <>
      {label ? <label className={styles.label}>{label}</label> : null}
      <textarea
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={classnames(
          styles.input,
          {
            [styles.inputInvalid]: invalid,
          },
          className
        )}
        {...props}
      />
    </>
  );
};
