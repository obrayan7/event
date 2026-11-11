import Link from "next/link";
import { notFound } from "next/navigation";
import { formatAccountNumber, formatDate, formatPrice, getOrderByToken } from "@rideau/db";
import { submitPaymentProof } from "@/app/actions/proof";
import { AutoRefresh } from "@/components/AutoRefresh";
import { CopyButton } from "@/components/CopyButton";
import { bankReference, listBankAccounts } from "@/lib/bank";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ma commande", robots: { index: false } };

export default async function OrderPage({ params, searchParams }: { params: { token: string }; searchParams: { error?: string; proof?: string } }) {
  const order = await getOrderByToken(params.token);
  if (!order) notFound();
  const now = new Date();
  const ref = order.id.slice(-8).toUpperCase();

  // Virement bancaire en cours (coordonnées + preuve à envoyer)
  const bank = order.payments.find((p) => p.provider === "BANK_TRANSFER" && ["PENDING", "PROOF_SUBMITTED", "REJECTED", "EXPIRED"].includes(p.status));
  const showBank = (order.status === "PENDING" || order.status === "EXPIRED") && Boolean(bank);
  const accounts = showBank ? await listBankAccounts() : [];

  const waiting = order.status === "PENDING" && order.expiresAt > now && order.payments.some((p) => p.provider !== "BANK_TRANSFER" && p.status === "PENDING");

  return (
    <div className="wrap page">
      <h1>Commande {ref}</h1>
      {searchParams.error && <p className="alert" role="alert">{searchParams.error}</p>}
      {searchParams.proof && <p role="status"><strong>Preuve envoyée.</strong> Merci, nous la vérifions.</p>}

      {order.status === "PAID" && (
        <>
          <p role="status"><strong>Paiement confirmé.</strong> Vos billets ont été envoyés à {order.email}. Vous pouvez aussi les télécharger ici.</p>
          <p><a className="btn" href={`/api/orders/${order.accessToken}/pdf`}>Télécharger tous les billets (PDF)</a></p>
          {order.items.map((i) => (
            <section key={i.id} className="panel" style={{ position: "static", marginBottom: 16 }}>
              <h2>{i.ticketType.event.title}</h2>
              <p className="hint">{formatDate(i.ticketType.event.startsAt, true)} — {i.ticketType.event.venue.name}, {i.ticketType.event.venue.city}</p>
              {i.tickets.map((t, n) => (
                <div className="tt" key={t.id}>
                  <div><strong>{i.ticketType.name} — billet {n + 1}{t.seat ? ` (siège ${t.seat})` : ""}</strong><small>{t.status === "USED" ? "Déjà utilisé" : "Valable"}</small></div>
                  <a href={`/api/tickets/${t.id}/pdf?t=${order.accessToken}`}>PDF</a>
                </div>
              ))}
            </section>
          ))}
          <p className="hint">Total payé : {formatPrice(order.totalCents)}. Conservez cette page : son adresse donne accès à vos billets.</p>
        </>
      )}

      {showBank && bank && (
        <section className="bank" aria-labelledby="bank-title">
          {bank.status === "PROOF_SUBMITTED" ? (
            <>
              <AutoRefresh everyMs={30000} />
              <h2 id="bank-title">Virement en cours de vérification</h2>
              <p role="status">Nous avons bien reçu votre preuve ({bank.proofs.length} document{bank.proofs.length > 1 ? "s" : ""}). Dès que nous aurons vérifié le virement, vos billets vous seront envoyés par e-mail à <strong>{order.email}</strong> et apparaîtront sur cette page.</p>
            </>
          ) : (
            <>
              <h2 id="bank-title">Payez par virement bancaire</h2>
              {bank.status === "REJECTED" && <p className="alert" role="alert"><strong>Preuve non validée.</strong> {bank.rejectionReason}</p>}
              {bank.status === "EXPIRED" || order.status === "EXPIRED" ? (
                <p className="alert">La réservation de vos places a expiré. Si vous avez déjà effectué le virement, envoyez-nous votre preuve : nous vérifierons s&apos;il reste des places et nous vous répondrons.</p>
              ) : (
                <p>Effectuez un virement de <strong>{formatPrice(order.totalCents)}</strong> en indiquant la référence ci-dessous. Vos places sont réservées jusqu&apos;au <strong>{formatDate(order.expiresAt, true)}</strong>.</p>
              )}
            </>
          )}

          <details className="bank-details" open={bank.status !== "PROOF_SUBMITTED"}>
            <summary>Coordonnées bancaires</summary>
            <div className="kv">
              <span>Montant</span><strong>{formatPrice(order.totalCents)}</strong>
              <span>Référence (libellé)</span><span className="val"><strong>{bankReference(order.id)}</strong><CopyButton value={bankReference(order.id)} label="la référence" /></span>
            </div>
            {accounts.length === 0 && <p className="alert">Les coordonnées bancaires ne sont pas disponibles pour le moment. Contactez-nous.</p>}
            {accounts.map((a) => (
              <div className="acct" key={a.id}>
                <h3>{a.label}</h3>
                <div className="kv">
                  <span>Banque</span><span>{a.bankName}</span>
                  <span>Titulaire</span><span>{a.accountHolder}</span>
                  <span>IBAN / compte</span><span className="val"><strong>{formatAccountNumber(a.accountNumber)}</strong><CopyButton value={a.accountNumber.replace(/\s/g, "")} label="l'IBAN" /></span>
                  {a.bic && (<><span>BIC</span><span className="val">{a.bic}<CopyButton value={a.bic} label="le BIC" /></span></>)}
                </div>
                {a.instructions && <p className="hint">{a.instructions}</p>}
              </div>
            ))}
          </details>

          {bank.status !== "PROOF_SUBMITTED" ? (
            <form action={submitPaymentProof.bind(null, order.accessToken)} encType="multipart/form-data" className="form proof-form">
              <h3>Envoyer ma preuve de virement</h3>
              <label>Capture d&apos;écran ou justificatif <span className="hint">(JPG, PNG, WebP ou PDF — {Number(process.env.MAX_UPLOAD_MB) || 5} Mo maximum)</span>
                <input type="file" name="proof" accept="image/jpeg,image/png,image/webp,application/pdf" required />
              </label>
              <button type="submit">Envoyer la preuve</button>
              <p className="hint">Vous pouvez aussi envoyer votre preuve plus tard depuis le lien reçu par e-mail.</p>
            </form>
          ) : (
            <details className="proof-more">
              <summary>Envoyer un autre document</summary>
              <form action={submitPaymentProof.bind(null, order.accessToken)} encType="multipart/form-data" className="form proof-form">
                <label>Capture d&apos;écran ou justificatif<input type="file" name="proof" accept="image/jpeg,image/png,image/webp,application/pdf" required /></label>
                <button type="submit">Envoyer</button>
              </form>
            </details>
          )}
        </section>
      )}

      {waiting && (
        <>
          <AutoRefresh />
          <p role="status"><strong>Paiement en cours de confirmation…</strong> Cette page se met à jour automatiquement. Vous recevrez vos billets par e-mail dès la confirmation (quelques minutes pour une cryptomonnaie).</p>
        </>
      )}

      {!showBank && order.status === "PENDING" && !waiting && order.expiresAt > now && (
        <p>Cette commande n&apos;est pas encore payée. <Link href="/paiement">Reprendre le paiement</Link></p>
      )}
      {!showBank && (order.status === "EXPIRED" || order.status === "CANCELLED" || (order.status === "PENDING" && order.expiresAt <= now)) && (
        <p>Cette commande n&apos;a pas été finalisée et les places ont été libérées. <Link href="/">Voir les spectacles</Link></p>
      )}
    </div>
  );
}
