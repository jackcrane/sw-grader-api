import { useEffect } from "react";
import { Header } from "../header/Header";
import { WidthFix } from "../widthfix/WidthFix";

const DEFAULT_TITLE = "FeatureBench";

export const Page = ({
  children,
  title = DEFAULT_TITLE,
  showHeader = true,
}) => {
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    document.title = title;
  }, [title]);

  return (
    <>
      {showHeader && <Header />}
      <main
        style={{
          paddingTop: showHeader ? 48 : 0,
        }}
      >
        <WidthFix>{children}</WidthFix>
        <div style={{ height: 64 }} />
      </main>
    </>
  );
};
