import React, { useMemo } from "react";
import styles from "./CanvasPersonMatcher.module.css";

const normalizeNameValue = (value) =>
  value ? value.toLowerCase().replace(/[^a-z0-9]/g, "") : "";

const buildAssignmentRecord = (assignment) => ({
  id: String(assignment.id),
  name: assignment.name ?? "",
  normalizedName: normalizeNameValue(assignment.name ?? ""),
  pointsPossible: Number(assignment.pointsPossible ?? 0),
});

export const buildCanvasAssignmentMatches = (
  canvasAssignments = [],
  assignments = []
) => {
  if (!canvasAssignments.length || !assignments.length) return {};
  const assignmentRecords = assignments.map(buildAssignmentRecord);
  const available = new Set(assignmentRecords.map((record) => record.id));
  const matches = {};

  canvasAssignments.forEach((canvasAssignment) => {
    const candidates = assignmentRecords.filter((candidate) =>
      available.has(candidate.id)
    );
    const exactMatches = candidates.filter(
      (candidate) =>
        candidate.normalizedName &&
        candidate.normalizedName === canvasAssignment.normalizedName
    );
    if (exactMatches.length === 1) {
      matches[canvasAssignment.key] = exactMatches[0].id;
      available.delete(exactMatches[0].id);
    } else {
      matches[canvasAssignment.key] = null;
    }
  });

  return matches;
};

export const CanvasAssignmentMatcher = ({
  canvasAssignments = [],
  assignments = [],
  matchMap = {},
  onMatchesChange,
}) => {
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

  const assignedIds = useMemo(() => {
    const selected = Object.values(matchMap).filter(Boolean);
    return new Set(selected);
  }, [matchMap]);

  const getSelectableAssignments = (canvasKey) => {
    const currentSelection = matchMap?.[canvasKey] ?? null;
    return assignmentOptions.filter(
      (assignment) =>
        !assignedIds.has(assignment.internalId) ||
        assignment.internalId === currentSelection
    );
  };

  const handleSelectChange = (canvasKey, event) => {
    const value = event.target.value || null;
    onMatchesChange?.({
      ...matchMap,
      [canvasKey]: value,
    });
  };

  const pointsMismatchAssignments = useMemo(() => {
    const mismatched = [];
    canvasAssignments.forEach((canvasAssignment) => {
      const selectedId = matchMap?.[canvasAssignment.key];
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

  if (!canvasAssignments.length) {
    return (
      <p className={styles.helper}>
        Upload a Canvas CSV to start matching assignments.
      </p>
    );
  }

  if (!assignments.length) {
    return (
      <p className={styles.helper}>No assignments found in this course yet.</p>
    );
  }

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
            {canvasAssignments.map((canvasAssignment) => {
              const options = getSelectableAssignments(canvasAssignment.key);
              const isMatched = Boolean(matchMap?.[canvasAssignment.key]);
              return (
                <tr
                  key={canvasAssignment.key}
                  className={!isMatched ? styles.rowUnmatched : undefined}
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
                      value={matchMap?.[canvasAssignment.key] ?? ""}
                      onChange={(event) =>
                        handleSelectChange(canvasAssignment.key, event)
                      }
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
