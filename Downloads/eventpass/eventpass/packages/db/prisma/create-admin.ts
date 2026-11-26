/**
 * Crée un administrateur, ou réinitialise le mot de passe d'un compte existant (récupération d'accès).
 *   npm run admin:create -- vous@exemple.com "un-mot-de-passe-long-et-unique"
 * ou, avec ADMIN_EMAIL / ADMIN_PASSWORD dans le fichier .env :   npm run admin:create
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [emailArg, passwordArg] = process.argv.slice(2);
  const email = (emailArg ?? process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = passwordArg ?? process.env.ADMIN_PASSWORD ?? "";
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("E-mail invalide.");
  if (password.length < 12) throw new Error("Mot de passe trop court : 12 caractères minimum.");

  const hash = await bcrypt.hash(password, 12);
  await prisma.user.upsert({
    where: { email },
    update: { password: hash, role: "ADMIN" },
    create: { email, name: "Administrateur", role: "ADMIN", password: hash },
  });
  console.log(`Administrateur prêt : ${email}`);
}

main()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
