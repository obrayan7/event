import { createHmac, timingSafeEqual } from "crypto";
import type { Cart } from "./cart";
import { siteUrl } from "./env";

const apiUrl = () => process.env.NOWPAYMENTS_API_URL ?? "https://api.nowpayments.io/v1"; // sandbox : https://api-sandbox.nowpayments.io/v1

/** Crée une facture en euros ; le client choisit sa crypto sur la page hébergée par NOWPayments. */
export async function createInvoice(cart: Cart) {
  const key = process.env.NOWPAYMENTS_API_KEY;
  if (!key) throw new Error("NOWPAYMENTS_API_KEY manquant");
  const res = await fetch(`${apiUrl()}/invoice`, {
    method: "POST",
    headers: { "x-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      price_amount: cart.totalCents / 100,
      price_currency: "eur",
      order_id: cart.id,
      order_description: `Commande ${cart.id.slice(-8).toUpperCase()}`,
      ipn_callback_url: `${siteUrl()}/api/webhooks/nowpayments`,
      success_url: `${siteUrl()}/commande/${cart.accessToken}`,
      cancel_url: `${siteUrl()}/paiement`,
      is_fixed_rate: true, // le montant en crypto est figé pendant le paiement
    }),
  });
  if (!res.ok) throw new Error(`NOWPayments a refusé la facture (${res.status}) : ${await res.text()}`);
  const data = (await res.json()) as { id: string | number; invoice_url: string };
  return { id: String(data.id), url: data.invoice_url };
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sortKeys(v)]));
  }
  return value;
}

/** Vérifie la signature IPN : HMAC-SHA512 du JSON (clés triées) avec le secret IPN. */
export function verifySignature(payload: unknown, signature: string | null) {
  const secret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha512", secret).update(JSON.stringify(sortKeys(payload))).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(signature.toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
}
