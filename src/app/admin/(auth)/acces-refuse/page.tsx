import Link from "next/link";

export default function Forbidden() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-neutral-100 px-4">
      <div className="card max-w-md p-8 text-center">
        <h1 className="text-4xl">Accès refusé</h1>
        <p className="mt-2 text-neutral-700">Votre compte n'a pas accès à cette page ou à ce restaurant.</p>
        <Link href="/admin" className="btn-dark mt-6">Retour à l'accueil</Link>
      </div>
    </div>
  );
}
