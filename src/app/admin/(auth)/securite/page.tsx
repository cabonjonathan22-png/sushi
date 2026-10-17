import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/admin/forms";
import { requireStaffNo2faCheck } from "@/lib/auth/session";
import { totpQrDataUrl } from "@/lib/auth/totp";
import { decryptSecret } from "@/lib/crypto";
import { db } from "@/lib/db";
import { REQUIRES_2FA } from "@/lib/permissions";
import { changePasswordAction, confirm2faAction, start2faAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ etape?: string }> }) {
  const ctx = await requireStaffNo2faCheck();
  const step = (await searchParams).etape;
  const user = await db.user.findUniqueOrThrow({ where: { id: ctx.user.id } });
  const required = REQUIRES_2FA.includes(user.role);
  const secret = step === "scan" && user.totpSecretEnc && !user.totpEnabled ? decryptSecret(user.totpSecretEnc) : null;

  return (
    <div className="min-h-dvh bg-neutral-100 px-4 py-10">
      <div className="mx-auto max-w-xl space-y-6">
        {user.totpEnabled && <Link href="/admin" className="text-sm font-semibold underline">← Retour au back-office</Link>}
        <h1 className="text-5xl">Sécurité du compte</h1>

        <section className="card p-6">
          <h2 className="text-3xl">Double authentification</h2>
          {user.totpEnabled ? (
            <p className="mt-2 font-semibold text-green-800">Activée ✓ — un code vous est demandé à chaque connexion.</p>
          ) : secret ? (
            <>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-neutral-800">
                <li>Installez <strong>Google Authenticator</strong> ou <strong>Microsoft Authenticator</strong> sur votre téléphone.</li>
                <li>Scannez ce QR code avec l'application.</li>
                <li>Saisissez le code à 6 chiffres affiché.</li>
              </ol>
              <img src={await totpQrDataUrl(secret, user.email)} alt="QR code à scanner" width={220} height={220} className="mx-auto my-4 rounded-xl border" />
              <p className="text-center text-xs text-neutral-600">Clé manuelle : <code className="break-all">{secret}</code></p>
              <ActionForm action={confirm2faAction} className="mt-4 grid gap-3">
                <input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required className="input text-center text-3xl tracking-[0.4em]" aria-label="Code à 6 chiffres" />
                <SubmitButton className="btn-dark text-lg">Activer</SubmitButton>
              </ActionForm>
            </>
          ) : (
            <>
              <p className="mt-2 text-neutral-800">
                {required
                  ? "Obligatoire pour votre rôle : protège l'accès même si votre mot de passe est volé."
                  : "Recommandée : protège l'accès même si votre mot de passe est volé."}
              </p>
              <form action={start2faAction} className="mt-4"><SubmitButton className="btn-dark text-lg">Activer la double authentification</SubmitButton></form>
            </>
          )}
        </section>

        <section className="card p-6">
          <h2 className="text-3xl">Changer de mot de passe</h2>
          <ActionForm action={changePasswordAction} className="mt-3 grid gap-3" resetOnSuccess>
            <div><label className="label" htmlFor="cur">Mot de passe actuel</label><input id="cur" name="current" type="password" autoComplete="current-password" required className="input" /></div>
            <div><label className="label" htmlFor="new">Nouveau (10 caractères minimum)</label><input id="new" name="next" type="password" autoComplete="new-password" minLength={10} required className="input" /></div>
            <div><label className="label" htmlFor="conf">Confirmer</label><input id="conf" name="confirm" type="password" autoComplete="new-password" minLength={10} required className="input" /></div>
            <SubmitButton className="btn-dark">Modifier</SubmitButton>
          </ActionForm>
        </section>
      </div>
    </div>
  );
}
