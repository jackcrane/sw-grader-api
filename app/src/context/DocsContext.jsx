import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

const DocsContext = React.createContext(null);

export const DocsProvider = ({ children }) => {
  const [docs, _setDocs] = useState([]);
  const location = useLocation();

  const setDocs = (url) => {
    _setDocs((docs) => [url, ...docs]);
  };
  const unstackDoc = (url) => {
    _setDocs((docs) => docs.filter((doc) => doc !== url));
    setOpen(false);
  };

  useEffect(() => {
    _setDocs([]);
    setOpen(false);
  }, [location.pathname]);

  const [open, setOpen] = useState(false);

  return (
    <DocsContext.Provider value={{ docs, setDocs, unstackDoc }}>
      <div style={{ flex: 1 }} onClick={() => setOpen(false)}>
        {children}
      </div>
      {docs.length > 0 && (
        <div
          style={{
            position: "fixed",
            bottom: 8,
            right: 8,
            padding: 8,
            background: "var(--surface)",
            borderRadius: 8,
            border: "1px solid var(--border)",
            zIndex: 10000000000,
            cursor: "pointer",
          }}
          onClick={() => setOpen((open) => !open)}
        >
          {open ? "Close" : "Help"}
        </div>
      )}
      {open && docs.length > 0 && (
        <div
          style={{
            height: "calc(100dvh - 64px)",
            width: "calc(100vw - 16px)",
            maxWidth: 400,
            background: "white",
            color: "black",
            zIndex: 10000000000,
            position: "fixed",
            right: 0,
            top: 0,
            borderRadius: 8,
            margin: 8,
            border: "1px solid var(--border)",
            boxShadow: "0 0 8px rgba(0, 0, 0, 0.12)",
          }}
        >
          <iframe
            src={docs[0]}
            style={{ height: "100%", width: "100%", border: "none" }}
          />
        </div>
      )}
    </DocsContext.Provider>
  );
};

/**
 *
 * @returns {{
 *   docs: any,
 *   setDocs: React.Dispatch<React.SetStateAction<any>>
 *   unstackDoc: React.Dispatch<React.SetStateAction<any>>
 * }}
 */
export const useDocs = () => {
  const ctx = React.useContext(DocsContext);
  // if (!ctx) throw new Error("useDocs must be used within DocsProvider");
  return ctx || {};
};
