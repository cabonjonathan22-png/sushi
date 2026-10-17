import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/admin/forms";
import { getStaff } from "@/lib/auth/session";
import { logoutAction, verifyCodeAction } from "../../actions";

export default async function CodePage() {
  const ctx = await getStaff();
  if (!ctx) redirect("/admin/connexion");
  if (!ctx.sessionPending2fa) redirect("/admin");
  return (
    <div className="flex min-h-dvh items-center justify-center bg-ink px-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-7">
        <h1 className="text-3xl">Code de sécurité</h1>
        <p className="mt-1 text-neutral-700">Ouvrez votre application d'authentification et saisissez le code à 6 chiffres.</p>
        <ActionForm action={verifyCodeAction} className="mt-4 grid gap-4">
          <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus
            className="input text-center text-3xl tracking-[0.4em]" aria-label="Code à 6 chiffres" />
          <SubmitButton className="btn-dark w-full text-lg">Valider</SubmitButton>
        </ActionForm>
        <form action={logoutAction}><button className="mt-4 text-sm underline">Annuler</button></form>
      </div>
    </div>
  );
}
