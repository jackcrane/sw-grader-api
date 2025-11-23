import React from "react";
import canvasLogo from "../../../assets/canvas.svg";
import styles from "./CanvasSyncBadge.module.css";

const formatSyncedAt = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString();
};

export const CanvasSyncBadge = ({ status, syncedAt, size = "sm" }) => {
  if (status !== "SUCCESS") return null;
  const formatted = formatSyncedAt(syncedAt);
  const title = formatted
    ? `Synced to Canvas - ${formatted}`
    : "Synced to Canvas";
  const sizeClass = styles[size] ?? "";
  return (
    <img
      src={canvasLogo}
      alt="Synced to Canvas"
      title={title}
      className={`${styles.badge} ${sizeClass}`}
    />
  );
};
