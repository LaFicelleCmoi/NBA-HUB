export function Footer() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-8 text-sm text-faint sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          <span className="font-display text-base font-bold uppercase text-muted">HoopsHub</span> — NBA, WNBA et
          EuroLeague au même endroit. Horaires en heure de Paris.
        </p>
        <p>Données : ESPN (NBA, WNBA) et API officielle EuroLeague. Site non officiel.</p>
      </div>
    </footer>
  );
}
