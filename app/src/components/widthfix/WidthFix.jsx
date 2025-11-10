export const WidthFix = ({ children }) => {
  return (
    <div
      style={{
        maxWidth: 1000,
        margin: "0 auto",
        padding: "0 16px",
      }}
    >
      {children}
    </div>
  );
};
