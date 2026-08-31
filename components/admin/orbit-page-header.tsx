export function OrbitPageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-8 border-b border-base-300 pb-5">
      {eyebrow && (
        <p className="mb-2 font-semibold text-xs text-success tracking-wide">
          {eyebrow}
        </p>
      )}
      <h1 className="font-black text-2xl tracking-normal">{title}</h1>
      {description && (
        <p className="mt-1.5 text-base-content/70 text-sm">{description}</p>
      )}
    </div>
  );
}
