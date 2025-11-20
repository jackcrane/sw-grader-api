import { useEffect } from "react";
import { Header } from "../header/Header";
import { WidthFix } from "../widthfix/WidthFix";
import featureBenchLogo from "../../../assets/featurebench-contrast.svg";
import styles from "./Page.module.css";

const DEFAULT_TITLE = "FeatureBench";

export const Page = ({
  children,
  title = DEFAULT_TITLE,
  showHeader = true,
  subheaderItems,
}) => {
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    document.title = title;
  }, [title]);

  const footerYear = new Date().getFullYear();

  return (
    <>
      {showHeader && <Header />}
      {subheaderItems && (
        <div className={styles.subheader}>
          <WidthFix>
            <div className={styles.subheaderContent}>
              {subheaderItems.map((item) => (
                <a href={item.href} key={item.label}>
                  {item.label}
                </a>
              ))}
            </div>
          </WidthFix>
        </div>
      )}
      <main
        style={{
          paddingTop: showHeader ? 48 : 0,
        }}
      >
        <WidthFix>{children}</WidthFix>
        <div style={{ height: 64 }} />
      </main>
      <footer className={styles.footer}>
        <WidthFix>
          <div className={styles.footerContent}>
            <div className={styles.logoRow}>
              <img
                src={featureBenchLogo}
                alt="FeatureBench logo"
                className={styles.footerLogo}
              />
            </div>
            <div className={styles.footerDetails}>
              <a
                className={styles.footerLink}
                href="mailto:support@featurebench.com"
              >
                support@featurebench.com
              </a>
              <p>© {footerYear} FeatureBench. All rights reserved.</p>
            </div>
            <p className={styles.footerTagline}>
              SolidWorks auto-grading for thoughtful instructors and students
              who iterate faster.
            </p>
          </div>
        </WidthFix>
      </footer>
    </>
  );
};
