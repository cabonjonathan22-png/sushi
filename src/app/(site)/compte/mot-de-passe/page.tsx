import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/admin/forms";
import { getI18n } from "@/i18n/server";
import { setPasswordAction } from "../actions";

export const metadata: Metadata = { robots: { index: false } };

export default async function SetPasswordPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const token = (await searchParams).t ?? "";
  const { t } = await getI18n();
  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <h1 className="text-5xl">{t("account.passwordTitle")}</h1>
      <ActionForm action={setPasswordAction} className="card mt-6 grid gap-3 p-6">
        <input type="hidden" name="t" value={token} />
        <div><label className="label" htmlFor="pw">{t("account.newPassword")}</label><input id="pw" name="password" type="password" minLength={10} autoComplete="new-password" required className="input" /></div>
        <div><label className="label" htmlFor="pc">{t("account.confirm")}</label><input id="pc" name="confirm" type="password" minLength={10} autoComplete="new-password" required className="input" /></div>
        <SubmitButton className="btn-primary">{t("account.validate")}</SubmitButton>
      </ActionForm>
    </div>
  );
}
