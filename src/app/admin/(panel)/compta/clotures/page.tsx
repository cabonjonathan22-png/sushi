import Link from "next/link";
import { revalidatePath } from "next/cache";
import { ActionForm, SubmitButton } from "@/components/admin/forms";
import { adminRestaurant, authorize, logAction } from "@/lib/admin";
import { closeDay, verifyClosures } from "@/lib/accounting-db";
import { db } from "@/lib/db";
import { euros } from "@/lib/money";
import { can } from "@/lib/permissions";
import { addDays, formatDateTime, localDate } from "@/lib/time";

export const metadata = { title: "Clôtures journalières" };

type Result = { ok?: string; error?: string } | undefined;

async function closeAction(_: Result, form: FormData): Promise<Result> {
  "use server";
  const restaurantId = String(form.get("restaurantId"));
  const staff = await authorize("accounting.close", restaurantId);
  const date = String(form.get("date") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > localDate(new Date())) return { error: "Date invalide (pas de clôture dans le futur)." };
  try {
    const c = await closeDay(restaurantId, date, staff.user.id);
    await logAction(staff, "closure.daily", "DailyClosure", c.id, restaurantId, { date, total: c.totalCents, hash: c.hash });
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath("/admin/compta/clotures");
  return { ok: `Journée du ${date.split("-").reverse().join("/")} clôturée.` };
}

export default async function ClosuresPage({ searchParams }: { searchParams: Promise<{ verifier?: string }> }) {
  const { staff, current } = await adminRestaurant("accounting.view");
  const closures = await db.dailyClosure.findMany({ where: { restaurantId: current.id }, orderBy: { date: "desc" }, take: 120 });
  const broken = (await searchParams).verifier ? await verifyClosures(current.id) : undefined;
  const yesterday = addDays(localDate(new Date()), -1);
  const nextToClose = closures[0] ? addDays(closures[0].date, 1) : yesterday;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/admin/compta" className="text-sm font-semibold underline">← Comptabilité</Link>
      <h1 className="text-5xl">Clôtures — {current.name}</h1>
      <p className="text-neutral-700">
        En fin de service, clôturez la journée : les totaux sont figés et chaînés aux clôtures précédentes (toute modification ultérieure serait détectée).
        Imprimez le récapitulatif pour vos archives ou votre comptable.
      </p>

      {can(staff.actor, "accounting.close", current.id) && (
        <ActionForm action={closeAction} className="card flex flex-wrap items-end gap-3 p-5" confirm="Clôturer définitivement cette journée ?">
          <input type="hidden" name="restaurantId" value={current.id} />
          <div><label className="label" htmlFor="date">Journée à clôturer</label><input id="date" name="date" type="date" defaultValue={nextToClose > localDate(new Date()) ? localDate(new Date()) : nextToClose} className="input" /></div>
          <SubmitButton className="btn-dark text-lg">Clôturer la journée</SubmitButton>
        </ActionForm>
      )}

      <div className="flex gap-3"><Link href="?verifier=1" className="btn-ghost">Vérifier l'intégrité des clôtures</Link></div>
      {broken !== undefined && (
        <p className={`rounded-xl p-3 font-semibold ${broken === null ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
          {broken === null ? "✓ Toutes les clôtures sont intactes." : `⚠ Clôture du ${broken} altérée.`}
        </p>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-600"><tr><th className="p-3">Journée</th><th className="p-3 text-right">Commandes</th><th className="p-3 text-right">TTC</th><th className="p-3">Clôturée le</th><th className="p-3" /></tr></thead>
          <tbody className="divide-y">
            {closures.map((c) => (
              <tr key={c.id}>
                <td className="p-3 font-semibold">{c.date.split("-").reverse().join("/")}</td>
                <td className="p-3 text-right">{c.ordersCount}</td>
                <td className="p-3 text-right">{euros(c.totalCents)}</td>
                <td className="p-3">{formatDateTime(c.closedAt)}</td>
                <td className="p-3"><a href={`/admin/compta/clotures/${c.id}/imprimer`} target="_blank" className="underline">Imprimer</a></td>
              </tr>
            ))}
            {closures.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-neutral-500">Aucune clôture pour le moment.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
