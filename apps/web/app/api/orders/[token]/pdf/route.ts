import { getOrderByToken } from "@rideau/db";
import { buildTicketsPdf, ticketsFromOrder } from "@/lib/ticket-pdf";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const order = await getOrderByToken(params.token);
  if (!order || order.status !== "PAID") return new Response("Introuvable", { status: 404 });
  const pdf = await buildTicketsPdf(ticketsFromOrder(order));
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="billets.pdf"', "Cache-Control": "private, no-store" },
  });
}
