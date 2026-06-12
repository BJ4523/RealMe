/** Instant feedback while the design dashboard server-renders. */
export default function Loading() {
  return (
    <div
      aria-busy="true"
      style={{
        minHeight: "70vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-mono, monospace)",
        fontSize: 12,
        letterSpacing: "0.1em",
        color: "var(--ink-faint, #A8A498)",
      }}
    >
      LOADING…
    </div>
  );
}
