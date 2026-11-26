export type LegalPage = { title: string; body: string };

const todo = "[À COMPLÉTER PAR LE CLIENT]";

/**
 * MODÈLES À FAIRE VALIDER PAR UN JURISTE avant la mise en ligne.
 * Les champs entre crochets doivent être remplis avec les informations réelles de la société.
 */
export const LEGAL: Record<string, LegalPage> = {
  "mentions-legales": {
    title: "Mentions légales",
    body: `## Éditeur du site
Raison sociale : ${todo}
Forme juridique et capital : ${todo}
Siège social : ${todo}
SIREN / RCS : ${todo}
N° de TVA intracommunautaire : ${todo}
Directeur de la publication : ${todo}
Contact : ${todo} (e-mail et téléphone)

## Hébergement
Hébergeur : ${todo} (nom, adresse, téléphone)

## Propriété intellectuelle
Les textes, logos, graphismes et visuels du site sont protégés. Les visuels des spectacles sont diffusés avec l'autorisation des organisateurs et des salles.`,
  },
  cgv: {
    title: "Conditions générales de vente",
    body: `## 1. Objet
Les présentes conditions régissent la vente de billets de spectacles par ${todo} (« le Vendeur ») via ce site. Toute commande implique leur acceptation.

## 2. Prix
Les prix sont indiqués en euros, toutes taxes comprises, par billet. Les frais éventuels sont affichés avant le paiement.

## 3. Commande et réservation
Les places ajoutées au panier sont réservées 15 minutes. Passé ce délai, la réservation est annulée automatiquement. La commande est définitive après confirmation du paiement.

## 4. Paiement
Le paiement s'effectue par carte bancaire Visa ou Mastercard (service sécurisé Stripe, authentification forte 3D Secure) ou en cryptomonnaie via un prestataire de paiement agréé. Dans les deux cas, le prix est fixé en euros. Les billets sont émis uniquement après confirmation du paiement. Une commande dont le paiement n'est pas confirmé dans le délai imparti est annulée.

## 5. Billets
Chaque billet comporte un code unique (QR code) valable pour une seule entrée. Il est envoyé par e-mail et téléchargeable depuis la page de commande. Le Vendeur n'est pas responsable de l'usage d'un billet copié ou transmis à un tiers : conservez-le confidentiel.

## 6. Droit de rétractation
Conformément à l'article L221-28 12° du Code de la consommation, les billets de spectacle à date ou période déterminée ne bénéficient pas du droit de rétractation de 14 jours. Toute vente est ferme et définitive.

## 7. Annulation, report ou modification d'un spectacle
En cas d'annulation ou de report, les modalités de remboursement ou d'échange sont communiquées par ${todo}, en lien avec l'organisateur. ${todo}

## 8. Responsabilité
Le Vendeur agit pour le compte des organisateurs ${todo}. La responsabilité du contenu et du déroulement du spectacle incombe à l'organisateur.

## 9. Données personnelles
Voir la politique de confidentialité.

## 10. Droit applicable et litiges
Droit français. Le consommateur peut recourir gratuitement à un médiateur de la consommation : ${todo} (nom et coordonnées du médiateur).`,
  },
  confidentialite: {
    title: "Politique de confidentialité",
    body: `## Responsable du traitement
${todo} (identité et contact, y compris le contact du délégué à la protection des données le cas échéant).

## Données collectées
Adresse e-mail, nom (facultatif), historique des commandes, données techniques de connexion. Les données de carte bancaire ne transitent jamais par nos serveurs : elles sont traitées par Stripe.

## Finalités et bases légales
Exécution de la commande et émission des billets (contrat) ; gestion du compte client (contrat) ; obligations comptables et légales (obligation légale) ; sécurité et prévention de la fraude (intérêt légitime).

## Durées de conservation
Compte client : jusqu'à sa suppression. Commandes et factures : 10 ans (obligation comptable). Jetons de réinitialisation de mot de passe : 1 heure.

## Destinataires
Prestataires strictement nécessaires : hébergeur, Stripe, prestataire de paiement crypto, service d'envoi d'e-mails. Données hébergées dans l'Union européenne ${todo}.

## Vos droits
Accès, rectification, effacement, limitation, opposition, portabilité. Vous pouvez supprimer votre compte depuis votre espace, ou écrire à ${todo}. En cas de désaccord, vous pouvez saisir la CNIL (www.cnil.fr).`,
  },
  cookies: {
    title: "Cookies",
    body: `## Cookies utilisés
Ce site utilise uniquement des cookies strictement nécessaires à son fonctionnement, qui ne requièrent pas de consentement :

- **session** : maintient votre connexion à votre compte (30 jours maximum) ;
- **cart** : mémorise votre panier et la réservation de vos places (1 heure).

Aucun cookie publicitaire ni de mesure d'audience n'est déposé. Si cela change, votre consentement vous sera demandé au préalable.

Le prestataire de paiement (Stripe ou prestataire crypto) peut déposer ses propres cookies sur sa page de paiement.`,
  },
};
