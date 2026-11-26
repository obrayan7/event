"use server";

import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@rideau/db";
import { createCustomerSession, destroyCustomerSession, requireCustomer } from "@/lib/customer-auth";
import { passwordResetEmail } from "@/lib/emails";
import { siteUrl } from "@/lib/env";
import { sendMail } from "@/lib/mail";
import { allow } from "@/lib/rate-limit";

const email = z.string().trim().toLowerCase().email().max(200);
const password = z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères.").max(200);
const go = (path: string, key: string, msg: string): never => redirect(`${path}?${key}=${encodeURIComponent(msg)}`);
const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export async function register(formData: FormData) {
  const parsed = z.object({ email, password, name: z.string().trim().max(100).optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) go("/compte/inscription", "error", parsed.error.issues[0]?.message ?? "Formulaire invalide.");
  const d = parsed.data!;
  if (!allow(`register:${d.email}`, 5, 15 * 60_000)) go("/compte/inscription", "error", "Trop de tentatives. Réessayez plus tard.");
  if (await prisma.user.findUnique({ where: { email: d.email } })) go("/compte/inscription", "error", "Un compte existe déjà avec cette adresse. Connectez-vous.");
  const user = await prisma.user.create({
    data: { email: d.email, name: d.name || null, password: await bcrypt.hash(d.password, 12), role: "CUSTOMER" },
  });
  await createCustomerSession(user.id);
  redirect("/compte");
}

export async function login(formData: FormData) {
  const parsed = z.object({ email, password: z.string().min(1) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) go("/compte/connexion", "error", "E-mail ou mot de passe incorrect.");
  const d = parsed.data!;
  if (!allow(`login:${d.email}`, 5, 15 * 60_000)) go("/compte/connexion", "error", "Trop de tentatives. Réessayez dans 15 minutes.");
  const user = await prisma.user.findUnique({ where: { email: d.email } });
  const hash = user?.password ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi";
  if (!(await bcrypt.compare(d.password, hash)) || !user) go("/compte/connexion", "error", "E-mail ou mot de passe incorrect.");
  await createCustomerSession(user!.id);
  redirect("/compte");
}

export async function logout() {
  destroyCustomerSession();
  redirect("/");
}

export async function requestPasswordReset(formData: FormData) {
  const parsed = email.safeParse(formData.get("email"));
  // Réponse identique que le compte existe ou non (pas d'énumération d'adresses)
  if (parsed.success && allow(`reset:${parsed.data}`, 3, 60 * 60_000)) {
    const user = await prisma.user.findUnique({ where: { email: parsed.data } });
    if (user) {
      const token = randomBytes(32).toString("hex");
      await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 3600_000) } });
      const mail = passwordResetEmail(`${siteUrl()}/compte/reinitialiser?token=${token}`);
      await sendMail({ to: user.email, subject: mail.subject, html: mail.html }).catch((e) => console.error("[e-mail] reset :", e));
    }
  }
  redirect("/compte/mot-de-passe-oublie?sent=1");
}

export async function resetPassword(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const parsed = password.safeParse(formData.get("password"));
  if (!parsed.success) go(`/compte/reinitialiser?token=${token}`, "error", parsed.error.issues[0]?.message ?? "Mot de passe invalide.");
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) go("/compte/mot-de-passe-oublie", "error", "Ce lien a expiré. Refaites une demande.");
  await prisma.$transaction([
    prisma.user.update({ where: { id: record!.userId }, data: { password: await bcrypt.hash(parsed.data!, 12) } }),
    prisma.passwordResetToken.deleteMany({ where: { userId: record!.userId } }),
  ]);
  redirect("/compte/connexion?reset=1");
}

export async function updateProfile(formData: FormData) {
  const user = await requireCustomer();
  const name = String(formData.get("name") ?? "").trim().slice(0, 100) || null;
  const newPassword = String(formData.get("newPassword") ?? "");
  const data: { name: string | null; password?: string } = { name };

  if (newPassword) {
    const ok = password.safeParse(newPassword);
    if (!ok.success) go("/compte", "error", ok.error.issues[0]?.message ?? "Mot de passe invalide.");
    const full = await prisma.user.findUnique({ where: { id: user.id } });
    const current = String(formData.get("currentPassword") ?? "");
    if (!full?.password || !(await bcrypt.compare(current, full.password))) go("/compte", "error", "Mot de passe actuel incorrect.");
    data.password = await bcrypt.hash(newPassword, 12);
  }
  await prisma.user.update({ where: { id: user.id }, data });
  go("/compte", "saved", "Profil mis à jour.");
}

/**
 * Droit à l'effacement (RGPD) : le compte et ses jetons sont supprimés.
 * Les commandes payées sont conservées sans lien avec le compte (obligation comptable de 10 ans).
 */
export async function deleteAccount(formData: FormData) {
  const user = await requireCustomer();
  const full = await prisma.user.findUnique({ where: { id: user.id } });
  if (!full?.password || !(await bcrypt.compare(String(formData.get("password") ?? ""), full.password))) {
    go("/compte", "error", "Mot de passe incorrect : le compte n'a pas été supprimé.");
  }
  await prisma.user.delete({ where: { id: user.id } });
  destroyCustomerSession();
  redirect("/?compte-supprime=1");
}
