"use client";

import { useActionState, useEffect, useState } from "react";
import { installAction, type InstallState } from "./actions";

export function InstallForm({ initialCode }: { initialCode: string }) {
  const [state, action, pending] = useActionState<InstallState, FormData>(installAction, undefined);
  const [windows, setWindows] = useState(true);
  useEffect(() => setWindows(/Windows/i.test(navigator.userAgent)), []);
  useEffect(() => { if (state?.download) window.location.href = state.download; }, [state]);

  if (state?.download) {
    return (
      <div className="mt-6 space-y-4 text-lg">
        {!windows && <p className="rounded-xl bg-amber-50 p-4 font-semibold text-amber-900">Ce code installe le poste d'impression : il faut le saisir sur un ordinateur Windows du restaurant.</p>}
        <p className="font-semibold">Le fichier « Installer-impression-Yaoma » se télécharge.</p>
        <ol className="list-decimal space-y-2 ps-6">
          <li>Ouvrez-le (en bas ou en haut à droite du navigateur, ou dans « Téléchargements »).</li>
          <li>Si Windows affiche « Windows a protégé votre ordinateur » : cliquez sur <strong>Informations complémentaires</strong>, puis <strong>Exécuter quand même</strong>.</li>
          <li>Attendez le message « Le poste d'impression est installé ». C'est tout : la suite se règle à distance.</li>
        </ol>
        <a href={state.download} className="btn-primary">Télécharger à nouveau</a>
      </div>
    );
  }

  return (
    <form action={action} className="mt-6 grid gap-4">
      <label htmlFor="code" className="text-lg font-semibold">Code à 6 chiffres</label>
      <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" autoFocus required defaultValue={initialCode}
        pattern="[0-9 ]{6,7}" maxLength={7} placeholder="123 456"
        className="input text-center font-mono text-4xl tracking-[0.3em]" />
      {state?.error && <p role="alert" className="rounded-xl bg-red-50 p-3 font-semibold text-red-800">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-dark w-full text-xl">{pending ? "Vérification…" : "Installer"}</button>
    </form>
  );
}
