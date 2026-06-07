export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The design landing brings its own nav + footer; pass through.
  return children;
}
