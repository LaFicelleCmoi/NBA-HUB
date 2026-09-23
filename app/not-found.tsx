import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-4 py-24 text-center">
      <p className="font-display text-8xl font-extrabold text-wnba">404</p>
      <h1 className="font-display text-3xl font-bold uppercase">Air ball !</h1>
      <p className="text-muted">Cette page n’existe pas (ou plus).</p>
      <Link href="/" className="rounded-xl bg-fg px-5 py-3 font-semibold text-bg">
        Retour à l’accueil
      </Link>
    </div>
  );
}
