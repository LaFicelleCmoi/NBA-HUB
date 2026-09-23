"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  // Aucun détail technique n'est affiché à l'utilisateur.
  return (
    <div className="flex flex-col items-center gap-4 py-24 text-center">
      <h1 className="font-display text-3xl font-bold uppercase">Temps mort technique</h1>
      <p className="text-muted">Les données sont momentanément indisponibles.</p>
      <button type="button" onClick={reset} className="rounded-xl bg-fg px-5 py-3 font-semibold text-bg">
        Réessayer
      </button>
    </div>
  );
}
