export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-heading text-3xl font-extrabold tracking-tight">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
