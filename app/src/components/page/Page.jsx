import { Header } from "../header/Header";
import { WidthFix } from "../widthfix/WidthFix";

export const Page = ({ children }) => {
  return (
    <>
      <Header />
      <main
        style={{
          paddingTop: 48,
        }}
      >
        <WidthFix>{children}</WidthFix>
        <div style={{ height: 64 }} />
      </main>
    </>
  );
};
