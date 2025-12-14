import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

const DocsContext = React.createContext(null);

export const DocsProvider = ({ children }) => {
  const [docs, setDocs] = useState(null);
  const location = useLocation();

  useEffect(() => {
    setDocs(null);
  }, [location.pathname]);

  return (
    <DocsContext.Provider value={{ docs, setDocs }}>
      {children}
      {docs && "DOCS"}
    </DocsContext.Provider>
  );
};

/**
 *
 * @returns {{
 *   docs: any,
 *   setDocs: React.Dispatch<React.SetStateAction<any>>
 * }}
 */
export const useDocs = () => {
  const ctx = React.useContext(DocsContext);
  if (!ctx) throw new Error("useDocs must be used within DocsProvider");
  return ctx;
};
