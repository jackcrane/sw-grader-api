import React, { useMemo } from "react";
import styles from "./CanvasPersonMatcher.module.css";

const normalizeNameValue = (value) =>
  value ? value.toLowerCase().replace(/[^a-z0-9]/g, "") : "";

const getStudentName = (student) => {
  if (student?.name) return student.name;
  if (student?.displayName) return student.displayName;
  const first = student?.user?.firstName ?? "";
  const last = student?.user?.lastName ?? "";
  const combined = `${first} ${last}`.trim();
  if (combined) return combined;
  return student?.user?.email ?? "Unnamed student";
};

const parseStudentNameParts = (student) => {
  const userFirst = student?.user?.firstName?.trim() ?? "";
  const userLast = student?.user?.lastName?.trim() ?? "";
  if (userFirst || userLast) {
    return { first: userFirst, last: userLast };
  }
  const rawName = student?.name?.trim() ?? "";
  if (!rawName) {
    const email = student?.user?.email ?? "";
    if (!email) return { first: "", last: "" };
    const [localPart] = email.split("@");
    const tokens = localPart?.split(/[._]/).filter(Boolean) ?? [];
    return {
      first: tokens[0] ?? "",
      last: tokens[1] ?? "",
    };
  }
  if (rawName.includes(",")) {
    const [last, first] = rawName.split(",").map((part) => part.trim());
    return { first: first ?? "", last: last ?? "" };
  }
  const parts = rawName.split(/\s+/).filter(Boolean);
  if (!parts.length) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return {
    first: parts[0],
    last: parts[parts.length - 1],
  };
};

const buildStudentRecord = (student) => {
  const id = String(student.id);
  const { first, last } = parseStudentNameParts(student);
  const normalizedFirst = normalizeNameValue(first);
  const normalizedLast = normalizeNameValue(last);
  const displayName = getStudentName(student);
  return {
    id,
    displayName,
    normalizedFirst,
    normalizedLast,
  };
};

const filterCanvasPeople = (canvasPeople = []) =>
  canvasPeople.filter((person) => person.displayName !== "Student, Test");

export const buildCanvasPersonMatches = (canvasPeople = [], students = []) => {
  const filteredCanvasPeople = filterCanvasPeople(canvasPeople);
  if (!filteredCanvasPeople.length || !students.length) return {};

  const studentRecords = students.map(buildStudentRecord);
  const available = new Set(studentRecords.map((record) => record.id));
  const matches = {};

  filteredCanvasPeople.forEach((person) => {
    const candidates = studentRecords.filter((candidate) =>
      available.has(candidate.id)
    );
    const exactMatches = candidates.filter(
      (candidate) =>
        candidate.normalizedFirst &&
        candidate.normalizedLast &&
        candidate.normalizedFirst === person.normalizedFirst &&
        candidate.normalizedLast === person.normalizedLast
    );
    if (exactMatches.length === 1) {
      matches[person.key] = exactMatches[0].id;
      available.delete(exactMatches[0].id);
    } else {
      matches[person.key] = null;
    }
  });

  return matches;
};

export const CanvasPersonMatcher = ({
  canvasPeople = [],
  students = [],
  matchMap = {},
  onMatchesChange,
}) => {
  const filteredCanvasPeople = useMemo(
    () => filterCanvasPeople(canvasPeople),
    [canvasPeople]
  );

  const assignedStudentIds = useMemo(() => {
    const selected = Object.values(matchMap).filter(Boolean);
    return new Set(selected);
  }, [matchMap]);

  const tableEntries = useMemo(
    () =>
      filteredCanvasPeople
        .map((person) => ({
          person,
          key: person.key,
          isMatched: Boolean(matchMap?.[person.key]),
        }))
        .sort((a, b) => Number(a.isMatched) - Number(b.isMatched)),
    [filteredCanvasPeople, matchMap]
  );

  const unmatchedCanvasNames = useMemo(
    () =>
      tableEntries
        .filter((entry) => !entry.isMatched)
        .map((entry) => entry.person.displayName),
    [tableEntries]
  );

  const unmatchedStudentNames = useMemo(() => {
    const matchedIds = new Set(Object.values(matchMap).filter(Boolean));
    return students
      .filter((student) => !matchedIds.has(String(student.id)))
      .map((student) => getStudentName(student));
  }, [matchMap, students]);

  const getSelectableStudents = (personKey) => {
    const currentSelection = matchMap?.[personKey] ?? null;
    return students
      .map((student) => ({
        ...student,
        internalId: String(student.id),
        displayName: getStudentName(student),
      }))
      .filter(
        (student) =>
          !assignedStudentIds.has(student.internalId) ||
          student.internalId === currentSelection
      );
  };

  const handleSelectChange = (personKey, event) => {
    const value = event.target.value || null;
    onMatchesChange?.({
      ...matchMap,
      [personKey]: value,
    });
  };

  if (!filteredCanvasPeople.length) {
    return (
      <p className={styles.helper}>
        Upload a Canvas CSV to start matching students.
      </p>
    );
  }

  if (!students.length) {
    return (
      <p className={styles.helper}>
        No students found in this course roster yet.
      </p>
    );
  }

  return (
    <div className={styles.matcher}>
      <p className={styles.helper}>
        {unmatchedCanvasNames.length === 0
          ? "All Canvas students are matched. You're good to go!"
          : `Need matches for ${unmatchedCanvasNames.length} of ${filteredCanvasPeople.length} Canvas students.`}
      </p>
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Canvas student</th>
              <th>FeatureBench student</th>
            </tr>
          </thead>
          <tbody>
            {tableEntries.map(({ person, key, isMatched }) => {
              const availableStudents = getSelectableStudents(key);
              return (
                <tr
                  key={key}
                  className={!isMatched ? styles.rowUnmatched : undefined}
                >
                  <td>
                    <div className={styles.canvasDetails}>
                      <strong>{person.displayName}</strong>
                      {person.section ? (
                        <span className={styles.sectionLabel}>
                          Section {person.section}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td>
                    <select
                      className={styles.select}
                      value={matchMap?.[key] ?? ""}
                      onChange={(event) => handleSelectChange(key, event)}
                    >
                      <option value="">Select a student</option>
                      {availableStudents.map((student) => (
                        <option
                          key={student.internalId}
                          value={student.internalId}
                        >
                          {student.displayName}
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
        <p className={styles.helper}>
          These students from Canvas are not matched and thus will not transfer:{" "}
          {unmatchedCanvasNames.length
            ? unmatchedCanvasNames.join(", ")
            : "None"}
        </p>
        <p className={styles.helper}>
          These students from FeatureBench are not matched and thus will not
          transfer:{" "}
          {unmatchedStudentNames.length
            ? unmatchedStudentNames.join(", ")
            : "None"}
        </p>
      </div>
    </div>
  );
};
