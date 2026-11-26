import Link from "next/link";
import { notFound } from "next/navigation";
import { categoryColors, formatPrice, getSeatMap, imageVariant, prisma } from "@rideau/db";
import { EventForm } from "@/components/EventForm";
import { SeatEditor } from "@/components/SeatEditor";
import {
  addTicketType, deleteEvent, deleteImage, deleteTicketType, moveImage, setCover, updateEvent, updateImageAlt, updateTicketType, uploadImages,
} from "../../actions";
import { bulkSeats, generateSeats } from "../../seat-actions";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // traitement des images

export default async function EditEventPage({
  params, searchParams,
}: { params: { id: string }; searchParams: { error?: string; saved?: string } }) {
  const [event, categories, venues] = await Promise.all([
    prisma.event.findUnique({
      where: { id: params.id },
      include: { images: { orderBy: { position: "asc" } }, ticketTypes: { orderBy: { priceCents: "asc" }, include: { _count: { select: { seats: true } } } } },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.venue.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!event) notFound();
  const seated = event.seatingMode === "ASSIGNED";
  const seatMap = seated ? await getSeatMap(event.id) : [];
  const colors = categoryColors(event.ticketTypes);
  const seatCategories = event.ticketTypes.map((t) => ({ id: t.id, name: t.name, priceCents: t.priceCents, color: colors[t.id] }));
  const seatStats = {
    total: seatMap.length,
    free: seatMap.filter((s) => s.status === "available").length,
    taken: seatMap.filter((s) => s.status === "taken").length,
    blocked: seatMap.filter((s) => s.status === "blocked").length,
  };

  const webUrl = process.env.WEB_URL ?? "http://localhost:3000";
  // Images S3 : URL absolue ; images locales (dev) : relative au site public
  const assetUrl = (u: string) => (u.startsWith("http") ? u : `${webUrl}${u}`);

  return (
    <>
      <div className="row">
        <h1>{event.title}</h1>
        <div style={{ display: "flex", gap: 8 }}>
          {event.status === "PUBLISHED" && <a className="btn btn-ghost" href={`${webUrl}/evenements/${event.slug}`} target="_blank" rel="noreferrer">Voir sur le site</a>}
          <Link href="/" className="btn btn-ghost">Retour</Link>
        </div>
      </div>

      {searchParams.error && <p className="alert" role="alert">{searchParams.error}</p>}
      {searchParams.saved && <p role="status" className="hint">Modifications enregistrées.</p>}

      <section className="card" aria-labelledby="infos">
        <h2 id="infos">Informations</h2>
        <EventForm
          action={updateEvent.bind(null, event.id)}
          categories={categories}
          venues={venues}
          showStatus
          submitLabel="Enregistrer"
          defaults={{
            title: event.title, organizer: event.organizer ?? "", description: event.description, categoryId: event.categoryId,
            venueId: event.venueId, startsAt: event.startsAt, status: event.status, seatingMode: event.seatingMode,
          }}
        />
      </section>

      <section className="card" aria-labelledby="billets">
        <h2 id="billets">{seated ? "Catégories de places et prix" : "Types de billets"}</h2>
        {seated && <p className="hint">Chaque catégorie a un nom et un prix (VIP, Orchestre, Balcon…). Créez-les ici, puis attribuez-les aux places dans le plan de salle ci-dessous : le client voit le prix de chaque place.</p>}
        {event.ticketTypes.map((t) => (
          <details className="item" key={t.id}>
            <summary>
              <span>{t.name} — {formatPrice(t.priceCents)}</span>
              <span className="hint">{seated ? `${t._count.seats} place${t._count.seats > 1 ? "s" : ""}` : `${t.quantity} billet${t.quantity > 1 ? "s" : ""}${t.seatPrefix ? ` · sièges ${t.seatPrefix}1, ${t.seatPrefix}2…` : ""}`}</span>
            </summary>
            <div>
              <form action={updateTicketType.bind(null, event.id, t.id)} className="stack" style={{ maxWidth: "none" }}>
                <div className="grid2">
                  <label>Nom <input name="name" defaultValue={t.name} required /></label>
                  <label>Prix TTC (€) <input name="price" inputMode="decimal" defaultValue={(t.priceCents / 100).toFixed(2).replace(".", ",")} required /></label>
                  {!seated && (
                    <>
                      <label>Quantité disponible <input type="number" name="quantity" min={1} defaultValue={t.quantity} required /></label>
                      <label>Maximum par commande <input type="number" name="maxPerOrder" min={1} max={20} defaultValue={t.maxPerOrder} required /></label>
                      <label>Numérotation des sièges <span className="hint">(facultatif)</span><input name="seatPrefix" maxLength={3} defaultValue={t.seatPrefix ?? ""} placeholder="A" /></label>
                    </>
                  )}
                </div>
                <div><button type="submit">Enregistrer</button></div>
              </form>
              <form action={deleteTicketType.bind(null, event.id, t.id)} style={{ marginTop: 10 }}>
                <button type="submit" className="btn-danger btn-sm">Supprimer {seated ? "cette catégorie" : "ce billet"}</button>
              </form>
            </div>
          </details>
        ))}
        <h3 style={{ margin: "20px 0 10px", fontSize: "1rem" }}>{seated ? "Ajouter une catégorie" : "Ajouter un type de billet"}</h3>
        <form action={addTicketType.bind(null, event.id)} className="stack">
          <div className="grid2">
            <label>Nom <input name="name" placeholder={seated ? "VIP, Orchestre, Balcon…" : "Fosse, Balcon, Plein tarif…"} required /></label>
            <label>Prix TTC (€) <input name="price" inputMode="decimal" placeholder="35,00" required /></label>
            {!seated && (
              <>
                <label>Quantité disponible <input type="number" name="quantity" min={1} defaultValue={100} required /></label>
                <label>Maximum par commande <input type="number" name="maxPerOrder" min={1} max={20} defaultValue={8} required /></label>
                <label>Numérotation des sièges <span className="hint">(facultatif : lettre « A » → A1, A2… ; vide = placement libre)</span><input name="seatPrefix" maxLength={3} placeholder="A" /></label>
              </>
            )}
          </div>
          <div><button type="submit">{seated ? "Ajouter la catégorie" : "Ajouter le billet"}</button></div>
        </form>
      </section>

      {seated && (
        <section className="card" id="plan" aria-labelledby="plan-title">
          <h2 id="plan-title">Plan de salle</h2>
          <div className="stats" style={{ marginBottom: 16 }}>
            <div className="stat"><b>{seatStats.total}</b><span>places au total</span></div>
            <div className="stat"><b>{seatStats.free}</b><span>libres</span></div>
            <div className="stat"><b>{seatStats.taken}</b><span>vendues / réservées</span></div>
            <div className="stat"><b>{seatStats.blocked}</b><span>bloquées</span></div>
          </div>
          {event.ticketTypes.length === 0 ? (
            <p>Créez d&apos;abord au moins une catégorie de places (nom et prix) ci-dessus.</p>
          ) : (
            <>
              <h3 style={{ margin: "0 0 8px", fontSize: "1rem" }}>Ajouter des rangées de places</h3>
              <p className="hint">Exemple : catégorie VIP, premier rang « A », 2 rangs, 10 places par rang → A1…A10 et B1…B10. L&apos;allée laisse un espace après la place indiquée.</p>
              <form action={generateSeats.bind(null, event.id)} className="stack" style={{ maxWidth: "none" }}>
                <div className="grid2">
                  <label>Catégorie (prix)
                    <select name="ticketTypeId" required defaultValue="">
                      <option value="" disabled>Choisir…</option>
                      {event.ticketTypes.map((t) => <option key={t.id} value={t.id}>{t.name} — {formatPrice(t.priceCents)}</option>)}
                    </select>
                  </label>
                  <label>Premier rang (lettre) <input name="rowStart" maxLength={2} placeholder="A" required style={{ textTransform: "uppercase" }} /></label>
                  <label>Nombre de rangs <input type="number" name="rows" min={1} max={26} defaultValue={3} required /></label>
                  <label>Places par rang <input type="number" name="perRow" min={1} max={60} defaultValue={10} required /></label>
                  <label>Allée après la place n° <span className="hint">(facultatif)</span><input type="number" name="gapAfter" min={0} max={60} placeholder="5" /></label>
                </div>
                <div><button type="submit">Ajouter ces places</button></div>
              </form>

              {seatMap.length > 0 && (
                <>
                  <h3 style={{ margin: "24px 0 8px", fontSize: "1rem" }}>Modifier le plan, les catégories et les prix des places</h3>
                  <p className="hint">Cliquez sur des places (ou sur la lettre d&apos;un rang, ou sur une catégorie de la légende) pour les cocher, puis choisissez l&apos;action. Le prix d&apos;une place est celui de sa catégorie.</p>
                  <SeatEditor
                    seats={seatMap.map((s) => ({ id: s.id, label: s.label, row: s.row, number: s.number, col: s.col, categoryId: s.categoryId, categoryName: s.categoryName, priceCents: s.priceCents, status: s.status }))}
                    categories={seatCategories}
                    action={bulkSeats.bind(null, event.id)}
                  />
                </>
              )}
            </>
          )}
        </section>
      )}

      <section className="card" aria-labelledby="images">
        <h2 id="images">Images ({event.images.length})</h2>
        <p className="hint">JPG, PNG ou WebP, {Number(process.env.MAX_UPLOAD_MB) || 5} Mo maximum par image (et par envoi). La première image marquée « couverture » apparaît sur les cartes et en tête de la page.</p>
        {event.images.length > 0 && (
          <div className="images">
            {event.images.map((img, i) => (
              <div className="img-card" key={img.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={assetUrl(imageVariant(img.url, 400))} alt={img.alt ?? ""} />
                <div className="meta">
                  {img.isCover ? <span className="badge PUBLISHED">Couverture</span> : (
                    <form action={setCover.bind(null, event.id, img.id)}><button type="submit" className="btn-ghost btn-sm">Définir comme couverture</button></form>
                  )}
                  <form action={updateImageAlt.bind(null, event.id, img.id)} style={{ display: "flex", gap: 4 }}>
                    <input name="alt" defaultValue={img.alt ?? ""} placeholder="Texte alternatif" aria-label="Texte alternatif" style={{ minHeight: 32, flex: 1, minWidth: 0 }} />
                    <button type="submit" className="btn-ghost btn-sm">OK</button>
                  </form>
                  <div className="actions">
                    {i > 0 && <form action={moveImage.bind(null, event.id, img.id, "up")}><button type="submit" className="btn-ghost btn-sm" aria-label="Monter l'image">↑</button></form>}
                    {i < event.images.length - 1 && <form action={moveImage.bind(null, event.id, img.id, "down")}><button type="submit" className="btn-ghost btn-sm" aria-label="Descendre l'image">↓</button></form>}
                    <form action={deleteImage.bind(null, event.id, img.id)}><button type="submit" className="btn-danger btn-sm">Supprimer</button></form>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <form action={uploadImages.bind(null, event.id)} className="stack" encType="multipart/form-data">
          <label>Ajouter des images
            <input type="file" name="files" accept="image/jpeg,image/png,image/webp" multiple required />
          </label>
          <label>Texte alternatif <span className="hint">(décrit l'image pour les lecteurs d'écran, facultatif)</span>
            <input name="alt" maxLength={160} />
          </label>
          <div><button type="submit">Téléverser</button></div>
        </form>
      </section>

      <section className="card" aria-labelledby="danger" style={{ borderColor: "var(--danger)" }}>
        <h2 id="danger">Supprimer l&apos;événement</h2>
        <p className="hint">Supprime définitivement l&apos;événement, ses images, ses catégories et son plan de salle. Impossible si des billets ont été vendus : passez alors l&apos;événement en « Archivé » (section Informations) pour le retirer du site en gardant l&apos;historique.</p>
        <form action={deleteEvent.bind(null, event.id)} className="stack">
          <label>Pour confirmer, tapez <strong>SUPPRIMER</strong>
            <input name="confirm" autoComplete="off" placeholder="SUPPRIMER" required />
          </label>
          <div><button type="submit" className="btn-danger">Supprimer définitivement cet événement</button></div>
        </form>
      </section>
    </>
  );
}
