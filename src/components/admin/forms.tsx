"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

export type ActionResult = { error?: string; ok?: string } | undefined;

/** Bouton d'envoi qui se désactive pendant l'enregistrement. */
export function SubmitButton({ children, className = "btn-primary", pendingLabel = "Enregistrement…", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || rest.disabled} className={className} {...rest}>
      {pending ? pendingLabel : children}
    </button>
  );
}

/**
 * Formulaire relié à une action serveur, avec message de succès / d'erreur.
 * `confirm` : demande une confirmation avant l'envoi (actions sensibles).
 */
export function ActionForm({
  action,
  children,
  className,
  confirm,
  resetOnSuccess,
}: {
  action: (state: ActionResult, form: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
  className?: string;
  confirm?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      {state?.error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-800">{state.error}</p>}
      {state?.ok && <p role="status" className="mt-3 rounded-lg bg-green-50 p-3 text-sm font-semibold text-green-800">{state.ok}</p>}
    </form>
  );
}

/** Interrupteur on/off qui envoie immédiatement le formulaire (rupture, actif…). */
export function AutoToggle({ name, defaultChecked, label, disabled }: { name: string; defaultChecked: boolean; label: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <label className="inline-flex cursor-pointer items-center gap-2">
      <input type="hidden" name={name} value={defaultChecked ? "0" : "1"} />
      <button
        type="submit"
        role="switch"
        aria-checked={defaultChecked}
        aria-label={label}
        disabled={pending || disabled}
        className={`relative h-7 w-12 rounded-full transition ${defaultChecked ? "bg-green-600" : "bg-neutral-300"} disabled:opacity-60`}
      >
        <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${defaultChecked ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </label>
  );
}
