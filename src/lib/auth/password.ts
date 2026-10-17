import { hash, verify } from "@node-rs/argon2";

/** Hachage Argon2id (paramètres OWASP 2024 : 19 Mio, 2 itérations). */
export function hashPassword(plain: string): Promise<string> {
  return hash(plain, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

export async function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  if (!hashed) return false;
  try {
    return await verify(hashed, plain);
  } catch {
    return false;
  }
}

/** Règle simple et lisible pour le patron : 10 caractères minimum. */
export function passwordProblem(plain: string): string | null {
  if (plain.length < 10) return "Le mot de passe doit contenir au moins 10 caractères.";
  if (plain.length > 200) return "Mot de passe trop long.";
  if (/^(.)\1+$/.test(plain)) return "Mot de passe trop simple.";
  return null;
}

/** Verrouillage progressif : 5 échecs → 15 min, puis double à chaque nouvel échec (max 24 h). */
export function lockoutAfterFailure(failedLogins: number, now = new Date()): Date | null {
  if (failedLogins < 5) return null;
  const minutes = Math.min(15 * 2 ** (failedLogins - 5), 24 * 60);
  return new Date(now.getTime() + minutes * 60_000);
}
