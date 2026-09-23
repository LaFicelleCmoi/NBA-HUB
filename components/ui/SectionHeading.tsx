export function SectionHeading({
  id,
  kicker,
  title,
  children,
}: {
  id: string;
  kicker?: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        {kicker && <p className="text-xs font-semibold uppercase tracking-[0.2em] text-faint">{kicker}</p>}
        <h2 id={id} className="font-display text-3xl font-extrabold uppercase leading-none tracking-tight sm:text-4xl">
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}
