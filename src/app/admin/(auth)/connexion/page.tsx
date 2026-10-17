import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/admin/forms";
import { Logo } from "@/components/site/SiteChrome";
import { getSiteSettings } from "@/lib/restaurants";
import { loginAction } from "../actions";

export const metadata: Metadata = { title: "Connexion — Back-office", robots: { index: false } };

export default async function LoginPage() {
  const brand = (await getSiteSettings()).brandName;
  return (
    <div className="flex min-h-dvh items-center justify-center bg-ink px-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-7">
        <Logo name={brand} className="text-ink" />
        <h1 className="mt-4 text-3xl">Espace restaurant</h1>
        <ActionForm action={loginAction} className="mt-4 grid gap-4">
          <div>
            <label className="label" htmlFor="email">E-mail</label>
            <input id="email" name="email" type="email" autoComplete="username" required className="input" />
          </div>
          <div>
            <label className="label" htmlFor="password">Mot de passe</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
          </div>
          <SubmitButton className="btn-dark w-full text-lg" pendingLabel="Connexion…">Se connecter</SubmitButton>
        </ActionForm>
        <p className="mt-4 text-sm text-neutral-600">Mot de passe oublié ? Demandez au propriétaire de le réinitialiser depuis « Utilisateurs ».</p>
      </div>
    </div>
  );
}
