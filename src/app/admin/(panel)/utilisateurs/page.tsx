import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { ActionForm, SubmitButton } from "@/components/admin/forms";
import { adminContext, authorize, logAction } from "@/lib/admin";
import { hashPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { canManageRole, ROLE_LABELS, type Role } from "@/lib/permissions";
import { formatDateTime } from "@/lib/time";

export const metadata = { title: "Utilisateurs" };

type Result = { ok?: string; error?: string } | undefined;
const ROLES: Role[] = ["OWNER", "MANAGER", "EMPLOYEE", "SUPER_ADMIN"];
const tempPassword = () => randomBytes(9).toString("base64url");

async function saveUser(_: Result, form: FormData): Promise<Result> {
  "use server";
  const staff = await authorize("users.manage");
  const id = String(form.get("id") ?? "");
  const role = String(form.get("role")) as Role;
  if (!ROLES.includes(role) || !canManageRole(staff.actor, role)) return { error: "Vous ne pouvez pas attribuer ce rôle." };
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name) return { error: "Nom et e-mail valides requis." };
  const restaurantIds = form.getAll("restaurantIds").map(String);
  if ((role === "MANAGER" || role === "EMPLOYEE") && !restaurantIds.length) return { error: "Assignez au moins un restaurant." };
  const active = form.get("active") === "on";

  if (id) {
    const target = await db.user.findUniqueOrThrow({ where: { id } });
    if (!canManageRole(staff.actor, target.role)) return { error: "Vous ne pouvez pas modifier ce compte." };
    if (target.id === staff.user.id && (!active || role !== target.role)) return { error: "Vous ne pouvez pas modifier votre propre rôle ni vous désactiver." };
    await db.$transaction([
      db.user.update({ where: { id }, data: { email, name, role, active } }),
      db.userRestaurant.deleteMany({ where: { userId: id } }),
      db.userRestaurant.createMany({ data: restaurantIds.map((restaurantId) => ({ userId: id, restaurantId })) }),
      ...(active ? [] : [db.session.deleteMany({ where: { userId: id } })]),
    ]);
    await logAction(staff, "user.update", "User", id, null, { email, role, active, restaurantIds });
    revalidatePath("/admin/utilisateurs");
    return { ok: "Compte enregistré." };
  }
  if (await db.user.findUnique({ where: { email } })) return { error: "Un compte existe déjà avec cet e-mail." };
  const password = tempPassword();
  const u = await db.user.create({
    data: { email, name, role, passwordHash: await hashPassword(password), restaurants: { create: restaurantIds.map((restaurantId) => ({ restaurantId })) } },
  });
  await logAction(staff, "user.create", "User", u.id, null, { email, role, restaurantIds });
  revalidatePath("/admin/utilisateurs");
  return { ok: `Compte créé. Mot de passe provisoire (à transmettre, affiché une seule fois) : ${password}` };
}

async function resetPassword(_: Result, form: FormData): Promise<Result> {
  "use server";
  const staff = await authorize("users.manage");
  const target = await db.user.findUniqueOrThrow({ where: { id: String(form.get("id")) } });
  if (!canManageRole(staff.actor, target.role) || target.id === staff.user.id) return { error: "Action impossible sur ce compte." };
  const password = tempPassword();
  await db.$transaction([
    db.user.update({ where: { id: target.id }, data: { passwordHash: await hashPassword(password), failedLogins: 0, lockedUntil: null, ...(form.get("reset2fa") === "on" ? { totpEnabled: false, totpSecretEnc: "" } : {}) } }),
    db.session.deleteMany({ where: { userId: target.id } }),
  ]);
  await logAction(staff, "user.password_reset", "User", target.id, null, { reset2fa: form.get("reset2fa") === "on" });
  return { ok: `Nouveau mot de passe provisoire : ${password}` };
}

export default async function UsersPage() {
  const { staff, restaurants } = await adminContext("users.manage");
  const users = await db.user.findMany({ orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }], include: { restaurants: true } });
  const roles = ROLES.filter((r) => canManageRole(staff.actor, r));

  const form = (u?: (typeof users)[number]) => (
    <ActionForm action={saveUser} className="grid gap-3 sm:grid-cols-3" resetOnSuccess={!u}>
      <input type="hidden" name="id" value={u?.id ?? ""} />
      <div><label className="label">Nom</label><input name="name" defaultValue={u?.name} required className="input" /></div>
      <div><label className="label">E-mail (identifiant)</label><input name="email" type="email" defaultValue={u?.email} required className="input" /></div>
      <div><label className="label">Rôle</label>
        <select name="role" defaultValue={u?.role ?? "EMPLOYEE"} className="input">{roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></div>
      <fieldset className="sm:col-span-2">
        <legend className="label">Restaurants (gérant / employé)</legend>
        <div className="flex flex-wrap gap-3">{restaurants.map((r) => <label key={r.id} className="flex items-center gap-2"><input type="checkbox" name="restaurantIds" value={r.id} defaultChecked={u ? u.restaurants.some((x) => x.restaurantId === r.id) : restaurants.length === 1} className="h-5 w-5" />{r.name}</label>)}</div>
      </fieldset>
      <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={u?.active ?? true} className="h-5 w-5" />Compte actif</label>
      <div className="sm:col-span-3"><SubmitButton>{u ? "Enregistrer" : "Créer le compte"}</SubmitButton></div>
    </ActionForm>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-5xl">Utilisateurs</h1>
      <div className="card p-5 text-sm text-neutral-700">
        <p><strong>Propriétaire</strong> : tout (restaurants, menu, compta, utilisateurs). <strong>Gérant</strong> : ses restaurants (menu, horaires, commandes, compta). <strong>Employé</strong> : commandes et ruptures de son restaurant.</p>
        <p className="mt-1">La double authentification est obligatoire pour le propriétaire.</p>
      </div>
      <section className="card p-5"><h2 className="mb-3 text-3xl">Nouveau compte</h2>{form()}</section>
      {users.map((u) => (
        <details key={u.id} className="card p-5">
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3">
            <span className="text-lg font-semibold">{u.name}</span>
            <span className="chip bg-neutral-200">{ROLE_LABELS[u.role]}</span>
            {!u.active && <span className="chip bg-red-100 text-red-800">désactivé</span>}
            {u.totpEnabled && <span className="chip bg-green-100 text-green-800">2FA</span>}
            <span className="text-sm text-neutral-600">{u.email}{u.lastLoginAt && ` · dernière connexion ${formatDateTime(u.lastLoginAt)}`}</span>
          </summary>
          {canManageRole(staff.actor, u.role) ? (
            <div className="mt-4 space-y-4">
              {form(u)}
              {u.id !== staff.user.id && (
                <ActionForm action={resetPassword} className="flex flex-wrap items-center gap-3 border-t pt-4" confirm="Générer un nouveau mot de passe provisoire ?">
                  <input type="hidden" name="id" value={u.id} />
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="reset2fa" className="h-4 w-4" />Réinitialiser aussi la 2FA (téléphone perdu)</label>
                  <SubmitButton className="btn-ghost">Réinitialiser le mot de passe</SubmitButton>
                </ActionForm>
              )}
            </div>
          ) : <p className="mt-3 text-sm text-neutral-600">Compte de rang supérieur : non modifiable.</p>}
        </details>
      ))}
    </div>
  );
}
