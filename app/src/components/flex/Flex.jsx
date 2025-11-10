import React from "react";

export const Row = ({ children, align = "center", justify, gap = 1 }) => {
  return (
    <div
      style={{
        display: "flex",
        alignItems: align,
        justifyContent: justify,
        gap: gap * 4,
      }}
    >
      {children}
    </div>
  );
};

export const Col = ({ children, align = "center", justify }) => {
  return (
    <div
      style={{
        display: "flex",
        alignItems: align,
        justifyContent: justify,
      }}
    >
      {children}
    </div>
  );
};
