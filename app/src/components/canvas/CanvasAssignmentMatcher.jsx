import React, { useEffect, useMemo, useState } from "react";
import styles from "./CanvasPersonMatcher.module.css";

const normalizeNameValue = (value) =>
  value ? value.toLowerCase().replace(/[^a-z0-9]/g, "") : "";

const getAssignmentKey = (assignment, fallbackIndex = 0) =>
  assignment?.key ??
  `${normalizeNameValue(assignment?.displayName ?? "")}-${fallbackIndex}`;

const buildAssignmentRecord = (assignment) => ({
  id: String(assignment.id),
  name: assignment.name ?? "",
  normalizedName: normalizeNameValue(assignment.name ?? ""),
  pointsPossible: Number(assignment.pointsPossible ?? 0),
});

const buildInitialMatches = (canvasAssignments = [], assignments = []) => {
  if (!canvasAssignments.length || !assignments.length) return {};
  const assignmentRecords = assignments.map(buildAssignmentRecord);
  const available = new Set(assignmentRecords.map((record) => record.id));
  const matches = {};

  canvasAssignments.forEach((canvasAssignment, index) => {
    const key = getAssignmentKey(canvasAssignment, index);
    const candidates = assignmentRecords.filter((candidate) =>
      available.has(candidate.id)
    );
    const exactMatches = candidates.filter(
      (candidate) =>
        candidate.normalizedName &&
        candidate.normalizedName === canvasAssignment.normalizedName
    );
    if (exactMatches.length === 1) {
      matches[key] = exactMatches[0].id;
      available.delete(exactMatches[0].id);
    } else {
      matches[key] = null;
    }
  });

  return matches;
};

export const CanvasAssignmentMatcher = ({
  canvasAssignments = [],
  assignments = [],
}) => {
  const [matchMap, setMatchMap] = useState({});

  useEffect(() => {
    setMatchMap(buildInitialMatches(canvasAssignments, assignments));
  }, [canvasAssignments, assignments]);

  const assignedIds = useMemo(() => {
    const selected = Object.values(matchMap).filter(Boolean);
    return new Set(selected);
  }, [matchMap]);

  const assignmentOptions = useMemo(
    () =>
      assignments.map((assignment) => ({
        ...assignment,
        internalId: String(assignment.id),
        displayName: assignment.name ?? "Untitled assignment",
        normalizedName: normalizeNameValue(assignment.name ?? ""),
        pointsPossible: Number(assignment.pointsPossible ?? 0),
      })),
    [assignments]
  );

  const getSelectableAssignments = (canvasKey) => {
    const currentSelection = matchMap[canvasKey] ?? null;
    return assignmentOptions.filter(
      (assignment) =>
        !assignedIds.has(assignment.internalId) ||
        assignment.internalId === currentSelection
    );
  };

  const handleSelectChange = (canvasKey, event) => {
    const value = event.target.value || null;
    setMatchMap((prev) => ({
      ...prev,
      [canvasKey]: value,
    }));
  };

  const pointsMismatchAssignments = useMemo(() => {
    const mismatched = [];
    canvasAssignments.forEach((canvasAssignment, index) => {
      const key = getAssignmentKey(canvasAssignment, index);
      const selectedId = matchMap[key];
      if (!selectedId) return;
      const fbAssignment = assignmentOptions.find(
        (assignment) => assignment.internalId === selectedId
      );
      if (!fbAssignment) return;
      if (
        Number(fbAssignment.pointsPossible ?? 0) !==
        Number(canvasAssignment.pointsPossible ?? 0)
      ) {
        mismatched.push(canvasAssignment.displayName);
      }
    });
    return mismatched;
  }, [assignmentOptions, canvasAssignments, matchMap]);

  return (
    <div className={styles.matcher}>
      <p className={styles.helper}>
        Assign Canvas grade columns to FeatureBench assignments. We only auto
        match identical names.
      </p>
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Canvas assignment</th>
              <th>FeatureBench assignment</th>
            </tr>
          </thead>
          <tbody>
            {canvasAssignments.map((canvasAssignment, index) => {
              const key = getAssignmentKey(canvasAssignment, index);
              const options = getSelectableAssignments(key);
              return (
                <tr
                  key={key}
                  className={!matchMap[key] ? styles.rowUnmatched : undefined}
                >
                  <td>
                    <div className={styles.canvasDetails}>
                      <strong>{canvasAssignment.displayName}</strong>
                      <span className={styles.sectionLabel}>
                        {canvasAssignment.pointsPossible} pts
                      </span>
                    </div>
                  </td>
                  <td>
                    <select
                      className={styles.select}
                      value={matchMap[key] ?? ""}
                      onChange={(event) => handleSelectChange(key, event)}
                    >
                      <option value="">Select an assignment</option>
                      {options.map((option) => (
                        <option
                          key={option.internalId}
                          value={option.internalId}
                        >
                          {option.displayName} ({option.pointsPossible} pts)
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div>
        <p>
          Assignments left unmatched will be left unmodified in the export CSV.
        </p>
      </div>
      {pointsMismatchAssignments.length > 0 && (
        <div className={styles.mismatchNotice}>
          <p className={styles.helper}>
            These assignments do not have matching points possible:{" "}
            {pointsMismatchAssignments.join(", ")}
          </p>
          <p className={styles.helper}>
            Grades will be scaled on a percentage basis.
          </p>
        </div>
      )}
    </div>
  );
};
