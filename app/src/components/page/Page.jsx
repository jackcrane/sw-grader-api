import { Header } from "../Header/Header";
import { WidthFix } from "../widthfix/WidthFix";

export const Page = ({ children }) => {
  return (
    <>
      <Header />
      <main
        style={{
          paddingTop: 48,
          paddinBottom: 64,
        }}
      >
        <WidthFix>{children}</WidthFix>
      </main>
    </>
  );
};
