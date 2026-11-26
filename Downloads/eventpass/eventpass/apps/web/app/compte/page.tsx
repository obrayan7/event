import Link from "next/link";
import { formatDate, formatPrice, prisma } from "@rideau/db";
import { requireCustomer } from "@/lib/customer-auth";
import { deleteAccount, logout, updateProfile } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mon compte" };

const STATUS: Record<string, string> = { PENDING: "En attente", PAID: "Payée", CANCELLED: "Annulée", EXPIRED: "Expirée" };

export default async function AccountPage({ searchParams }: { searchParams: { error?: string; saved?: string } }) {
  const customer = await requireCustomer();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: customer.id } });
  const orders = await prisma.order.findMany({
    where: { userId: user.id, status: { in: ["PAID", "PENDING"] } },
    orderBy: { createdAt: "desc" },
    include: { items: { include: { ticketType: { include: { event: true } } } } },
  });
  const visible = orders.filter((o) => o.status === "PAID" || o.expiresAt > new Date());

  return (
    <div className="wrap page">
      <div className="actions-row" style={{ justifyContent: "space-between" }}>
        <h1>Mon compte</h1>
        <form action={logout}><button type="submit" className="btn-ghost btn">Se déconnecter</button></form>
      </div>
      {searchParams.error && <p className="alert" role="alert">{searchParams.error}</p>}
      {searchParams.saved && <p role="status">{searchParams.saved}</p>}

      <section aria-labelledby="orders">
        <h2 id="orders">Mes commandes</h2>
        {visible.length === 0 ? <p>Aucune commande pour le moment.</p> : (
          <div className="lines">
            {visible.map((o) => (
              <div className="line" key={o.id} style={{ gridTemplateColumns: "1fr auto auto" }}>
                <div>
                  <strong>{o.items.map((i) => i.ticketType.event.title).filter((t, n, a) => a.indexOf(t) === n).join(", ")}</strong>
                  <div className="hint">Commande {o.id.slice(-8).toUpperCase()} — {formatDate(o.createdAt)} — {STATUS[o.status]}</div>
                </div>
                <strong>{formatPrice(o.totalCents)}</strong>
                <Link className="btn btn-ghost" href={`/commande/${o.accessToken}`}>{o.status === "PAID" ? "Mes billets" : "Voir"}</Link>
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="profil" style={{ marginTop: 40 }}>
        <h2 id="profil">Mon profil</h2>
        <form action={updateProfile} className="form">
          <label>E-mail <input value={user.email} disabled /></label>
          <label>Nom <input name="name" defaultValue={user.name ?? ""} /></label>
          <fieldset>
            <legend>Changer de mot de passe <span className="hint">(laisser vide pour conserver l&apos;actuel)</span></legend>
            <label>Mot de passe actuel <input type="password" name="currentPassword" autoComplete="current-password" /></label>
            <label>Nouveau mot de passe <input type="password" name="newPassword" autoComplete="new-password" minLength={8} /></label>
          </fieldset>
          <button type="submit">Enregistrer</button>
        </form>
      </section>

      <section aria-labelledby="suppression" style={{ marginTop: 40 }}>
        <h2 id="suppression">Supprimer mon compte</h2>
        <p className="hint">Votre compte et vos données de profil seront effacés. Les commandes payées sont conservées sans lien avec votre compte pour respecter nos obligations comptables ; vos billets restent accessibles par le lien reçu par e-mail.</p>
        <form action={deleteAccount} className="form">
          <label>Confirmez avec votre mot de passe <input type="password" name="password" autoComplete="current-password" required /></label>
          <button type="submit" className="btn-danger">Supprimer définitivement mon compte</button>
        </form>
      </section>
    </div>
  );
}
