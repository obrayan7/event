export const siteUrl = () => (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const cardEnabled = () => Boolean(process.env.STRIPE_SECRET_KEY);
export const cryptoEnabled = () => Boolean(process.env.NOWPAYMENTS_API_KEY);
/** Vrai si un moyen de paiement activé fonctionne en mode test / sandbox (aucun débit réel). */
export const stripeTestMode = () => /_test_/.test(process.env.STRIPE_SECRET_KEY ?? "");
export const cryptoSandbox = () => /sandbox/i.test(process.env.NOWPAYMENTS_API_URL ?? "");
