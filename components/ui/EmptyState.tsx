export function EmptyState({
  title,
  children,
  icon = "🏀",
}: {
  title: string;
  children?: React.ReactNode;
  icon?: string;
}) {
  return (
    <div className="glass flex flex-col items-center gap-2 rounded-2xl px-6 py-10 text-center">
      <span aria-hidden className="text-3xl">
        {icon}
      </span>
      <p className="font-display text-xl font-bold uppercase tracking-wide">{title}</p>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <EmptyState title="Données indisponibles" icon="⚠️">
      <p>{message}. Réessayez dans quelques instants.</p>
    </EmptyState>
  );
}
