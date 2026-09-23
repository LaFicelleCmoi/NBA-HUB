import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="space-y-6 pt-6">
      <span className="sr-only">Chargement…</span>
      <Skeleton className="h-16 w-2/3" />
      <Skeleton className="h-6 w-1/2" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
