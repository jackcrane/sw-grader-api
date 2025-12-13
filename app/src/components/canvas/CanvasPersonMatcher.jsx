import React, { useEffect, useMemo, useState } from "react";
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
    normalizedFull: normalizeNameValue(`${first} ${last}`.trim()),
    normalizedReverse: normalizeNameValue(`${last} ${first}`.trim()),
    normalizedDisplay: normalizeNameValue(displayName),
  };
};

const buildCanvasRecord = (person, index) => ({
  key: `${normalizeNameValue(person.displayName)}-${index}`,
  displayName: person.displayName,
  section: person.section,
  normalizedFirst: person.normalizedFirst ?? "",
  normalizedLast: person.normalizedLast ?? "",
});

const buildInitialMatches = (canvasPeople = [], students = []) => {
  console.log({ canvasPeople, students });
  if (!canvasPeople.length || !students.length) {
    return {};
  }

  const studentRecords = students.map(buildStudentRecord);
  const available = new Set(studentRecords.map((record) => record.id));
  const matches = {};

  canvasPeople.forEach((person, index) => {
    const canvasRecord = buildCanvasRecord(person, index);
    const candidates = studentRecords.filter((candidate) =>
      available.has(candidate.id)
    );

    const exactMatches = candidates.filter(
      (candidate) =>
        candidate.normalizedFirst &&
        candidate.normalizedLast &&
        candidate.normalizedFirst === canvasRecord.normalizedFirst &&
        candidate.normalizedLast === canvasRecord.normalizedLast
    );

    if (exactMatches.length === 1) {
      matches[canvasRecord.key] = exactMatches[0].id;
      available.delete(exactMatches[0].id);
    } else {
      matches[canvasRecord.key] = null;
    }
  });

  return matches;
};

export const CanvasPersonMatcher = ({ canvasPeople = [], students = [] }) => {
  const [matchMap, setMatchMap] = useState({});

  useEffect(() => {
    setMatchMap(buildInitialMatches(canvasPeople, students));
  }, [canvasPeople, students]);

  const assignedStudentIds = useMemo(() => {
    const selected = Object.values(matchMap).filter(Boolean);
    return new Set(selected);
  }, [matchMap]);

  const unmatchedCount = useMemo(() => {
    if (!canvasPeople.length) return 0;
    let count = 0;
    canvasPeople.forEach((person, index) => {
      const key = `${normalizeNameValue(person.displayName)}-${index}`;
      if (!matchMap[key]) count += 1;
    });
    return count;
  }, [canvasPeople, matchMap]);

  const getSelectableStudents = (personKey) => {
    const currentSelection = matchMap[personKey] ?? null;
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
    setMatchMap((prev) => ({
      ...prev,
      [personKey]: value,
    }));
  };

  if (!canvasPeople.length) {
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
        {unmatchedCount === 0
          ? "All Canvas students are matched. You're good to go!"
          : `Need matches for ${unmatchedCount} of ${canvasPeople.length} Canvas students.`}
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
            {canvasPeople.map((person, index) => {
              const personKey = `${normalizeNameValue(
                person.displayName
              )}-${index}`;
              const availableStudents = getSelectableStudents(personKey);
              return (
                <tr key={personKey}>
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
                      value={matchMap[personKey] ?? ""}
                      onChange={(event) => handleSelectChange(personKey, event)}
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
    </div>
  );
};
