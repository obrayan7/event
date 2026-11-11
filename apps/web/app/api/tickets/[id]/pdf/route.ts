import { getOrderByToken, prisma } from "@rideau/db";
import { getCustomer } from "@/lib/customer-auth";
import { buildTicketsPdf, ticketsFromOrder } from "@/lib/ticket-pdf";

export const dynamic = "force-dynamic";

/** Un billet : accessible avec le jeton de la commande (?t=) ou depuis le compte du propriétaire. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const ticket = await prisma.ticket.findUnique({ where: { id: params.id }, include: { orderItem: { include: { order: true } } } });
  const order = ticket?.orderItem.order;
  if (!ticket || !order || order.status !== "PAID") return new Response("Introuvable", { status: 404 });

  const token = new URL(req.url).searchParams.get("t");
  const customer = await getCustomer();
  const allowed = token === order.accessToken || (customer && order.userId === customer.id);
  if (!allowed) return new Response("Introuvable", { status: 404 });

  const full = await getOrderByToken(order.accessToken);
  const one = ticketsFromOrder(full!).filter((t) => t.code === ticket.code);
  const pdf = await buildTicketsPdf(one);
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="billet.pdf"', "Cache-Control": "private, no-store" },
  });
}
