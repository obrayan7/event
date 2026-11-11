import Link from "next/link";
import { formatPrice, imageVariant } from "@rideau/db";
import { Cover } from "./Cover";

type Props = {
  slug: string;
  title: string;
  startsAt: Date;
  venueName: string;
  city: string;
  categoryName: string;
  categorySlug?: string;
  coverUrl?: string | null;
  coverAlt?: string | null;
  fromPriceCents: number | null;
};

const badge = (d: Date) => {
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("fr-FR", { ...o, timeZone: "Europe/Paris" }).format(d);
  return { day: f({ day: "numeric" }), month: f({ month: "short" }).replace(".", "") };
};

const shortDate = (d: Date) =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(d);

export function TicketCard(p: Props) {
  const b = badge(p.startsAt);
  return (
    <Link href={`/evenements/${p.slug}`} className="ticket">
      <div className="ticket-media">
        {p.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageVariant(p.coverUrl, 800)} alt={p.coverAlt ?? p.title} loading="lazy" />
        ) : (
          <Cover category={p.categorySlug} />
        )}
        <span className="date-badge" aria-hidden="true"><b>{b.day}</b>{b.month}</span>
      </div>
      <div className="ticket-body">
        <span className="tag">{p.categoryName}</span>
        <h3>{p.title}</h3>
        <span className="ticket-meta">{p.venueName}, {p.city}</span>
      </div>
      <div className="ticket-perf" />
      <div className="ticket-foot">
        <span>{shortDate(p.startsAt)}</span>
        {p.fromPriceCents !== null ? <span>dès <strong>{formatPrice(p.fromPriceCents)}</strong></span> : <span>Bientôt</span>}
      </div>
    </Link>
  );
}
