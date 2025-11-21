import React from "react";
import classnames from "classnames";
import styles from "./SegmentedControl.module.css";

export const SegmentedControl = ({
  options = [],
  value,
  onChange,
  className = "",
}) => {
  return (
    <div className={classnames(styles.wrapper, className)}>
      {options.map((o) => {
        const active = o.value === value;

        return (
          <button
            key={o.value}
            className={classnames(styles.segment, active && styles.active)}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
};
