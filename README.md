# Eventpass — plateforme de billetterie

Site de vente de billets de spectacles pour la France et l'Europe : catalogue, panier avec réservation anti-survente, paiement par **carte Visa / Mastercard (Stripe)**, **crypto (NOWPayments)** et **virement bancaire** (avec preuve vérifiée par l'admin), billets PDF avec QR code, scanner d'entrée, espace admin séparé.

> Le nom (« Eventpass ») se change avec la variable `SITE_NAME` ; le logo avec `SITE_LOGO` (voir « Changer le nom et le logo »).

> **Héberger en réel (site, paiements et nom de domaine de l'entreprise) sur Vercel : voir [HEBERGEMENT-VERCEL.md](HEBERGEMENT-VERCEL.md).** Ce README sert aux **tests gratuits**.

**Sommaire**
1. [Vue d'ensemble](#1-vue-densemble)
2. [Tester gratuitement en ligne : le plan](#2-tester-gratuitement-en-ligne--le-plan)
3. [Étape 1 — Mettre le projet sur GitHub](#étape-1--mettre-le-projet-sur-github)
4. [Étape 2 — Base de données et images (Supabase)](#étape-2--base-de-données-et-images-supabase)
5. [Étape 3 — Les clés de paiement de test](#étape-3--les-clés-de-paiement-de-test)
6. [Étape 4 — Déployer sur Vercel (2 projets)](#étape-4--déployer-sur-vercel-2-projets)
7. [Étape 5 — Initialiser la base](#étape-5--initialiser-la-base)
8. [Étape 6 — Déclarer les webhooks](#étape-6--déclarer-les-webhooks)
9. [Étape 7 — Premiers réglages dans l'admin](#étape-7--premiers-réglages-dans-ladmin)
10. [Scénarios de test à dérouler](#3-scénarios-de-test-à-dérouler)
11. [Variante : tester depuis votre ordinateur avec un tunnel](#4-variante--tester-depuis-votre-ordinateur-avec-un-tunnel)
12. [Dépannage](#5-dépannage)
13. [Limites du gratuit](#6-limites-du-gratuit)
14. [Passer en production](#7-passer-en-production)
15. [Annexes](#annexes)

---

## 1. Vue d'ensemble

| Dossier | Rôle |
|---|---|
| `apps/web` | Site public : catalogue, recherche, panier, paiement, comptes clients, billets |
| `apps/admin` | Espace d'administration **séparé** : événements, images, commandes, virements, comptes bancaires, équipe, scanner |
| `packages/db` | Schéma de la base (Prisma), règles de réservation, numéros de billet, tests |

Les deux applications partagent **une seule base PostgreSQL**. Elles ne s'appellent entre elles que pour confirmer un virement (API interne protégée par un secret).

## 2. Tester gratuitement en ligne : le plan

Rien n'est facturé et aucun argent réel ne circule : tous les paiements utilisent des **clés de test**.

| Besoin | Service gratuit | Ce qu'il faut savoir |
|---|---|---|
| Hébergement du site et de l'admin | **Vercel** (formule Hobby) | Réservée aux usages **non commerciaux** : parfait pour des essais. Requêtes limitées à **4,5 Mo**, tâche planifiée **1 fois par jour** |
| Base de données PostgreSQL | **Supabase** (formule gratuite) | 500 Mo, **projet mis en pause après 7 jours sans activité** (réactivable en un clic) |
| Images des événements | **Supabase Storage** (même compte) | 1 Go ; compatible S3 |
| E-mails | **Resend** (facultatif) | Sans domaine vérifié, n'envoie qu'à l'adresse de votre compte. Sans clé, les e-mails s'affichent dans les journaux de Vercel |
| Carte Visa / Mastercard | **Stripe** en mode test | Cartes fictives |
| Crypto | **NOWPayments** sandbox | Facultatif |
| Virement | Aucun service | Vous jouez les deux rôles (client et admin) |

Deux façons de tester :

- **Méthode A — En ligne (recommandée)** : Vercel + Supabase. Le site a une vraie adresse `https://…vercel.app`, accessible depuis votre téléphone (indispensable pour tester le **scanner**, qui exige HTTPS). Durée : 1 h 30 environ.
- **Méthode B — Sur votre ordinateur avec un tunnel** : plus rapide si vous voulez seulement vérifier les paiements. Voir la [section 4](#4-variante--tester-depuis-votre-ordinateur-avec-un-tunnel).

**Pré-requis** : un compte GitHub, [Node.js 20](https://nodejs.org) et Git installés sur votre ordinateur (pour initialiser la base), un navigateur.

---

## Étape 1 — Mettre le projet sur GitHub

1. Décompressez `eventpass.zip`.
2. Créez un dépôt **privé** sur GitHub (ex. `eventpass`).
3. Dans le dossier du projet :

```bash
git init
git add .
git commit -m "Version de test"
git branch -M main
git remote add origin https://github.com/VOTRE-COMPTE/eventpass.git
git push -u origin main
```

Le fichier `.gitignore` empêche d'envoyer vos secrets (`.env`). **Ne jamais committer de clés.**

---

## Étape 2 — Base de données et images (Supabase)

### 2.1 Créer le projet
1. Créez un compte sur [supabase.com](https://supabase.com), puis **New project**.
2. Choisissez une **région en Europe**, notez le **mot de passe de la base** (évitez les caractères spéciaux comme `@ : / ?`, sinon ils devront être encodés dans l'URL).

### 2.2 Récupérer les adresses de connexion
Cliquez sur **Connect** (en haut du tableau de bord) et copiez deux chaînes dans la section « pooler » :

| Usage | Chaîne à copier | Ajouter à la fin |
|---|---|---|
| **Vercel (le site en ligne)** | *Transaction pooler* (port 6543) | `?pgbouncer=true&connection_limit=1` |
| **Votre ordinateur (initialiser la base)** | *Session pooler* (port 5432) | rien |

Remplacez `[YOUR-PASSWORD]` par votre mot de passe. Gardez ces deux lignes de côté.

> Pourquoi des « pooler » ? Vercel exécute le site en très nombreuses petites instances ; le pooler évite de saturer la base.

### 2.3 Créer le stockage des images
1. Menu **Storage** → **New bucket** → nom : `eventpass` → cochez **Public bucket**.
2. Menu **Storage → S3 Connection** (ou *Configuration → S3*) : activez la connexion S3, copiez l'**Endpoint** et la **Region**, puis cliquez **New access key** et copiez l'**Access key ID** et la **Secret access key** (affichée une seule fois).
3. Repérez l'adresse publique des images : elle a la forme
   `https://VOTRE-REF.supabase.co/storage/v1/object/public/eventpass`
   (VOTRE-REF est l'identifiant de votre projet, visible dans l'adresse du tableau de bord).

Vous aurez ainsi : `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET=eventpass`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL`, et `S3_FORCE_PATH_STYLE=1`.

---

## Étape 3 — Les clés de paiement de test

Ne configurez que ce que vous voulez tester : un moyen de paiement sans clé n'apparaît simplement pas au paiement.

### 3.1 Stripe (carte)
1. Créez un compte sur [stripe.com](https://stripe.com) et restez en **mode test** (bandeau « Test mode »).
2. **Développeurs → Clés API** : copiez la **clé secrète** `sk_test_…` → `STRIPE_SECRET_KEY`.
3. Le secret du webhook (`whsec_…`) se crée à l'[étape 6](#étape-6--déclarer-les-webhooks).

### 3.2 NOWPayments (crypto) — facultatif
Créez un compte **sandbox** NOWPayments (voir leur documentation « Sandbox »), puis renseignez `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET` et `NOWPAYMENTS_API_URL=https://api-sandbox.nowpayments.io/v1`.

### 3.3 Virement bancaire
Aucune clé : vous ajouterez un compte bancaire fictif dans l'admin ([étape 7](#étape-7--premiers-réglages-dans-ladmin)).

### 3.4 E-mails (Resend) — facultatif
Créez un compte sur [resend.com](https://resend.com), générez une clé API → `RESEND_API_KEY`. Sans domaine vérifié, mettez `MAIL_FROM="Eventpass <onboarding@resend.dev>"` et utilisez **votre propre adresse e-mail** pour les commandes de test.
Sans Resend : laissez vide ; le contenu des e-mails apparaît dans les journaux Vercel (*Logs*). Les billets restent téléchargeables depuis la page de commande.

---

## Étape 4 — Déployer sur Vercel (2 projets)

Il faut **deux projets Vercel** depuis le même dépôt GitHub : un pour le site (`apps/web`), un pour l'admin (`apps/admin`).

### 4.1 Générer vos secrets
Dans un terminal (macOS/Linux/Git Bash) ; lancez la commande autant de fois que nécessaire :

```bash
openssl rand -base64 32
```

Il vous faut 4 valeurs différentes : `CUSTOMER_SESSION_SECRET`, `ADMIN_SESSION_SECRET`, `CRON_SECRET`, `INTERNAL_API_SECRET`.
Sous Windows sans `openssl` : tapez simplement une longue suite de caractères aléatoires (32 minimum).

### 4.2 Projet « site »
1. Sur [vercel.com](https://vercel.com) : **Add New → Project** → importez votre dépôt.
2. **Root Directory** : `apps/web`. Laissez « Include source files outside of the Root Directory » activé. Framework : Next.js (détecté).
3. **Environment Variables** — ajoutez :

| Variable | Valeur |
|---|---|
| `DATABASE_URL` | chaîne *Transaction pooler* + `?pgbouncer=true&connection_limit=1` |
| `CUSTOMER_SESSION_SECRET` | secret généré |
| `CRON_SECRET` | secret généré |
| `INTERNAL_API_SECRET` | secret généré (**le même que pour l'admin**) |
| `SITE_URL` | `https://temporaire.vercel.app` (à corriger après le premier déploiement, voir 4.4) |
| `ADMIN_URL` | idem, à corriger plus tard |
| `SKIP_ENV_CHECK` | `1` |
| `MAX_UPLOAD_MB` | `4` |
| `SITE_NAME` | le nom à imprimer sur les billets (ex. `Eventpass`) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | si Stripe |
| `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`, `NOWPAYMENTS_API_URL` | si crypto |
| `RESEND_API_KEY`, `MAIL_FROM` | si e-mails |
| `BANK_NOTIFY_EMAIL` | votre e-mail (reçoit « virement à vérifier ») — facultatif |

4. **Si le déploiement refuse la tâche planifiée** (formule gratuite : une exécution par jour maximum), ouvrez `apps/web/vercel.json` et remplacez `*/5 * * * *` par `0 3 * * *`, puis recommencez.
5. **Deploy**. Le premier déploiement peut afficher des erreurs de configuration tant que l'étape 4.4 n'est pas faite : c'est normal.

> `SKIP_ENV_CHECK=1` : en production le site refuse de démarrer si la configuration est incomplète (c'est voulu). Pour un **site de test**, ce réglage transforme ces refus en simples avertissements.

### 4.3 Projet « admin »
Même démarche : **Add New → Project**, même dépôt, **Root Directory** : `apps/admin`.

| Variable | Valeur |
|---|---|
| `DATABASE_URL` | la même que le site |
| `ADMIN_SESSION_SECRET` | secret généré |
| `INTERNAL_API_SECRET` | **le même que le site** |
| `WEB_URL` | adresse du site (à corriger en 4.4) |
| `WEB_INTERNAL_URL` | idem `WEB_URL` |
| `SKIP_ENV_CHECK` | `1` |
| `MAX_UPLOAD_MB` | `4` |
| `SITE_NAME` | le même nom que pour le site |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL` | valeurs de l'étape 2.3 |
| `S3_FORCE_PATH_STYLE` | `1` |

### 4.4 Corriger les adresses (1 minute)
Une fois les deux projets créés, repérez leur **adresse de production** (onglet *Domains*, du type `eventpass-web.vercel.app` et `eventpass-admin.vercel.app`) et corrigez :

- Site : `SITE_URL=https://eventpass-web.vercel.app` et `ADMIN_URL=https://eventpass-admin.vercel.app`
- Admin : `WEB_URL=https://eventpass-web.vercel.app` et `WEB_INTERNAL_URL=https://eventpass-web.vercel.app`

Puis **Deployments → ⋯ → Redeploy** sur chacun des deux projets.

> ⚠️ Utilisez toujours l'**adresse de production** du projet pour les webhooks, pas l'adresse d'un déploiement de prévisualisation : cette dernière est protégée par Vercel et refuserait les appels des prestataires de paiement.

---

## Étape 5 — Initialiser la base

À faire **une seule fois**, depuis votre ordinateur (la base est vide au départ).

```bash
cd eventpass
cp .env.example .env
npm install
```

Ouvrez `.env` et renseignez uniquement :

```
DATABASE_URL="<chaîne Session pooler de l'étape 2.2>"
ADMIN_EMAIL="vous@exemple.com"
ADMIN_PASSWORD="un-mot-de-passe-solide-de-test"
```

Puis :

```bash
npm run db:push     # crée les tables
npm run db:seed     # catégories, lieux, 4 événements de démonstration, votre compte administrateur
```

Vérification : dans Supabase → **Table Editor**, les tables `Event`, `User`, `TicketType`… existent et `Event` contient 4 lignes.

> Si `db:push` échoue avec une erreur de connexion, vérifiez le mot de passe (caractères spéciaux à encoder) et utilisez bien la chaîne *Session pooler*.

---

## Étape 6 — Déclarer les webhooks

Les prestataires préviennent le site quand un paiement est réussi : **sans webhook, aucun billet n'est émis** (sauf virement bancaire). Utilisez l'adresse de production de votre site.

### Stripe (mode test)
1. **Développeurs → Webhooks → Ajouter un endpoint**.
2. URL : `https://eventpass-web.vercel.app/api/webhooks/stripe`
3. Événements : `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`.
4. Copiez le **secret de signature** `whsec_…` → variable `STRIPE_WEBHOOK_SECRET` du projet site → **Redeploy**.

### NOWPayments (sandbox)
L'adresse de notification est envoyée avec chaque facture ; renseignez seulement le **secret IPN** dans `NOWPAYMENTS_IPN_SECRET`.

### Virement
Aucun webhook : c'est l'administrateur qui confirme.

---

## Étape 7 — Premiers réglages dans l'admin

Ouvrez `https://eventpass-admin.vercel.app` et connectez-vous avec `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

1. **Équipe** : créez un compte *Contrôleur* (pour tester le scanner).
2. **Comptes bancaires** : ajoutez un compte fictif pour le virement. IBAN d'exemple valide (exemple public de la norme, pas un vrai compte) : `FR14 2004 1010 0505 0001 3M02 606`. Le mot de passe admin est demandé.
3. **Événements** : ouvrez « Nuit électro » → section images → **téléversez une photo** (une seule ou deux à la fois, 4 Mo maximum) → marquez-la comme couverture. Notez les champs **Organisateur** et, pour un type de billet, **Numérotation des sièges** (ex. `A` → A1, A2…).
4. **Lieux** : vérifiez que le pays est le bon code (`FR`, `BJ`…) : il s'imprime sur le billet.

Vous êtes prêt.

---

## 3. Scénarios de test à dérouler

Cochez au fur et à mesure.

### A. Achat par carte (Stripe)
- [ ] Sur le site, ouvrez un événement, choisissez 2 billets → **Ajouter au panier** → le compte à rebours de 15 min s'affiche.
- [ ] **Passer au paiement** : renseignez nom, e-mail, choisissez *Carte bancaire*, cochez les CGV. Un bandeau « Mode test » est visible.
- [ ] Paiement Stripe avec la carte `4242 4242 4242 4242`, date future, CVC quelconque.
- [ ] Retour sur le site : « Paiement confirmé », billets téléchargeables (PDF avec photo, date, lieu, siège, QR code).
- [ ] Cartes d'échec/3D Secure : `4000 0000 0000 9995` (refusée), `4000 0027 6000 3184` (authentification 3D Secure).

### B. Visa et Mastercard
- [ ] Refaites un achat avec une carte **Mastercard** de test : `5555 5555 5555 4444` (date future, CVC quelconque) : la commande aboutit comme avec la Visa.
- [ ] Sur la page de paiement, la carte est présentée comme « Carte Visa ou Mastercard » et le montant est en **euros**.

### C. Achat par virement bancaire
- [ ] Choisissez *Virement bancaire* : un e-mail (ou une ligne dans les journaux) contient les coordonnées, la référence et le lien.
- [ ] Sur la page de commande : coordonnées avec boutons « Copier », référence, délai de réservation.
- [ ] Envoyez une **capture d'écran quelconque** comme preuve → « Virement en cours de vérification ».
- [ ] Admin → **Virements** : un compteur rouge apparaît ; ouvrez la fiche, la capture s'affiche.
- [ ] **Refusez** d'abord avec un motif : le client revoit le motif et peut renvoyer une preuve.
- [ ] Renvoyez une preuve, puis **confirmez** (case « j'ai reçu le montant ») : les billets sont générés et envoyés automatiquement.

### D. Crypto (si configuré)
- [ ] Choisissez *Cryptomonnaie*, suivez la page sandbox NOWPayments, vérifiez l'émission des billets.

### E. Réservation et stock
- [ ] Ouvrez le même événement dans **deux navigateurs** (ou une fenêtre privée), prenez la **dernière place** dans les deux : un seul y parvient.
- [ ] Laissez un panier 15 minutes : les places sont libérées (un autre acheteur peut les prendre).

### F. Billets et scanner
- [ ] Ouvrez le PDF : titre, date, heure, lieu, ville, pays, organisateur, titulaire, catégorie, siège, N° de billet, QR code.
- [ ] Depuis votre **téléphone**, connectez-vous à l'admin avec le compte *Contrôleur* → **Scanner** → autorisez la caméra → scannez le QR code à l'écran : « Billet valide ». Rescannez : « déjà utilisé ». Saisissez le numéro `EV…` à la main : même résultat.

### F bis. Places numérotées
- [ ] Admin : ouvrez « Le Malade imaginaire » (plan de démonstration), vérifiez le plan et ses catégories ; changez le prix d'une catégorie, cochez quelques places et passez-les dans une autre catégorie.
- [ ] Site : ouvrez l'événement, choisissez 2 places sur le plan : le prix de chacune et le total s'affichent ; **Ajouter au panier**.
- [ ] Panier : les places apparaissent (A1, A2…), vous pouvez en retirer une ; la place retirée redevient libre sur le plan.
- [ ] Dans **deux navigateurs**, choisissez la **même place** : le second reçoit « Cette place vient d'être prise ».
- [ ] Payez : le billet PDF indique la place ; dans l'admin, cette place est maintenant « vendue » et n'est plus modifiable.

### G. Compte client et admin
- [ ] Créez un compte (`/compte/inscription`), passez une commande connecté, retrouvez-la dans *Mon compte*.
- [ ] « Mot de passe oublié » (e-mail ou journaux).
- [ ] Admin : tableau de bord (chiffre d'affaires, remplissage), **Commandes**, exports CSV.

### H. Tests automatiques (facultatif, pour développeurs)
Sans base de données (rapides) :
```bash
npm run test -w @rideau/db -- tests/iban.test.ts tests/format.test.ts
```
Avec une base de données **de test dédiée** (ils créent et suppriment des données) : survente (20 acheteurs pour 5 places), expiration, confirmation par virement, scan.
```bash
npm run test -w @rideau/db
```

---

## 4. Variante : tester depuis votre ordinateur avec un tunnel

Pour tester les paiements sans rien déployer. Les deux applications tournent chez vous ; un **tunnel gratuit** donne au site une adresse publique `https://…` que les prestataires peuvent appeler.

1. Base locale : `docker compose up -d` (nécessite Docker) **ou** la base Supabase de l'étape 2.
2. `cp .env.example .env`, complétez les clés de test, `npm install`, `npm run db:push`, `npm run db:seed`.
3. Lancez le site et l'admin dans deux terminaux : `npm run dev:web` (port 3000) et `npm run dev:admin` (port 3001).
4. Dans un troisième terminal, ouvrez le tunnel avec [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) (gratuit, sans compte) :
   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```
   Il affiche une adresse `https://xxxx.trycloudflare.com` (différente à chaque lancement).
5. Mettez cette adresse dans `SITE_URL` (fichier `.env`), relancez `npm run dev:web`, puis déclarez-la dans le webhook Stripe (étape 6).
6. **Stripe sans tunnel** : `stripe listen --forward-to localhost:3000/api/webhooks/stripe` (Stripe CLI) affiche le secret `whsec_…` à mettre dans `STRIPE_WEBHOOK_SECRET`.

> Le scanner de l'admin exige HTTPS pour la caméra : pour le tester sur téléphone, utilisez la méthode A (Vercel) ou un second tunnel vers le port 3001.

---

## 5. Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| Le site affiche une erreur 500 au démarrage | Variable manquante | Ouvrez **Vercel → Logs** : le message liste ce qui manque. Vérifiez `DATABASE_URL`, les secrets, `SKIP_ENV_CHECK=1` |
| « Aucun moyen de paiement n'est configuré » | Aucune clé de paiement, aucun compte bancaire actif | Ajoutez une clé (étape 3) ou un compte bancaire (étape 7), puis **Redeploy** |
| Paiement réussi mais **pas de billet** (Stripe/crypto) | Webhook non déclaré ou secret erroné | Reprenez l'étape 6 ; regardez les envois dans le tableau de bord du prestataire (code 400 = secret erroné, 401/404 = mauvaise adresse) |
| Erreur **413** ou envoi d'image impossible | Fichier > 4,5 Mo (limite Vercel) | `MAX_UPLOAD_MB=4`, une seule image à la fois, images plus légères |
| Les images ne s'affichent pas | Bucket non public ou `S3_PUBLIC_URL` incorrect | Bucket en **public** ; testez l'adresse d'une image dans le navigateur |
| `db:push` : connexion refusée / expirée | Mauvaise chaîne ou mot de passe | Utilisez le *Session pooler* ; encodez les caractères spéciaux du mot de passe |
| Le site met longtemps à répondre ou erreur de base | Projet Supabase en **pause** (7 jours sans activité) | Tableau de bord Supabase → **Restore project** |
| Les e-mails n'arrivent pas | Pas de clé Resend, ou domaine non vérifié | Regardez **Vercel → Logs** (contenu des e-mails) ; avec Resend sans domaine, n'écrivez qu'à votre adresse |
| Confirmer un virement échoue (« le site ne répond pas ») | `INTERNAL_API_SECRET` différent entre site et admin, ou `WEB_INTERNAL_URL` erroné | Mettez la **même** valeur partout, `WEB_INTERNAL_URL` = adresse de production du site, puis **Redeploy** |
| La caméra du scanner ne démarre pas | Page non sécurisée ou permission refusée | Utilisez l'adresse `https://` et autorisez la caméra dans le navigateur |
| Webhook rejeté (401) sur Vercel | Adresse de prévisualisation protégée | Utilisez l'adresse **de production** du projet |
| Les commandes expirées ne sont pas « rangées » | La tâche planifiée ne tourne qu'une fois par jour en gratuit | Sans conséquence : les places se libèrent quand même à l'expiration (le nettoyage ne sert qu'aux statuts) |

---

## 6. Limites du gratuit

- **Usage non commercial** sur Vercel Hobby : pour vendre de vrais billets, passez à une formule adaptée ou à un serveur (voir `DEPLOIEMENT.md`).
- **Pause Supabase après 7 jours d'inactivité** ; 500 Mo de base (les preuves de virement sont stockées dans la base) et 1 Go d'images.
- **Envois limités à 4 Mo** sur Vercel.
- **Tâche de nettoyage quotidienne** seulement (sans impact sur la disponibilité des places). Pour une exécution plus fréquente, un service gratuit comme [cron-job.org](https://cron-job.org) peut appeler `GET https://votre-site/api/cron/expire` avec l'en-tête `Authorization: Bearer <CRON_SECRET>`.
- **Données de test uniquement** : n'y saisissez pas de vraies données personnelles de clients.
- Prestataires de paiement : mode **test / sandbox** uniquement (aucune vérification d'entreprise requise).

## 7. Passer en production

Quand les tests sont concluants : suivez **[DEPLOIEMENT.md](DEPLOIEMENT.md)** (clés de production, webhooks réels, stockage S3 définitif, migrations, sauvegardes, HTTPS, check-list avant ouverture). Les textes légaux (`apps/web/lib/legal.ts`) sont des modèles à faire valider par un juriste.

---

## Annexes

### Ce que l'administrateur peut faire
- **Événements** : créer, modifier (titre, date, lieu, organisateur, description, images), publier / dépublier / archiver, **supprimer** (impossible si des billets ont été vendus : on archive alors l'événement).
- **Mode de placement**, choisi à la création ou plus tard (tant qu'aucune commande n'existe) : *placement libre* ou *places numérotées*.
- **Billets et catégories** : créer, **modifier le nom et le prix à tout moment**, ajuster les quantités, supprimer (si jamais commandés).
- **Plan de salle** : générer des rangées, changer la catégorie (donc le prix) de chaque place, bloquer, supprimer.
- **Commandes, virements, comptes bancaires, lieux, catégories, équipe, scanner** : voir les rubriques de l'admin.

### Places numérotées (plan de salle)
Chaque événement a un **mode de placement**, choisi par l'admin :
- **Placement libre** : des quantités par catégorie (fosse, balcon…), comme avant ;
- **Places numérotées** : le client **choisit ses places sur un plan** de la salle ; chaque place a sa catégorie, donc son prix.

Mise en place (Admin → Événements → Modifier) :
1. Dans *Informations*, mode de placement = **Places numérotées**, puis *Enregistrer*.
2. *Catégories de places et prix* : créez vos catégories (ex. VIP 80 €, Orchestre 45 €, Balcon 30 €). Le prix se modifie à tout moment.
3. *Plan de salle* → **Ajouter des rangées** : catégorie, lettre du premier rang, nombre de rangs, places par rang, allée éventuelle (ex. VIP, rang A, 2 rangs, 10 places → A1…A10 et B1…B10). Recommencez pour chaque zone.
4. **Ajuster place par place** : cochez des places (une à une, par rang, ou toute une catégorie) puis *Changer la catégorie* (donc le prix), *Bloquer* (retirer de la vente : régie, visibilité réduite) ou *Supprimer*.
5. Publiez l'événement.

Côté client : un plan avec une couleur par catégorie, le prix de chaque place, les places prises grisées, jusqu'à 8 places par commande, réservées 15 minutes dans le panier. Le billet PDF indique la place choisie (ex. `A12`).

Règles de sécurité : une place ne peut être réservée que par **un seul** acheteur à la fois (verrou en base) ; une place vendue ou réservée ne peut plus être modifiée ; le mode de placement ne peut plus changer dès qu'une commande existe. Après `npm run db:seed` sur une base vide, l'événement « Le Malade imaginaire » est fourni avec un plan de démonstration.

### Accéder à l'espace admin
| Où | Adresse |
|---|---|
| Vercel | l'adresse du **projet admin** (ex. `https://eventpass-admin.vercel.app`) ou votre domaine `admin.monsite.fr`, puis `/login` |
| Serveur (Docker) | `https://admin.<votre-domaine>` |
| Ordinateur | `http://localhost:3001` (`npm run dev:admin`) |

Connexion : l'e-mail et le mot de passe saisis dans `ADMIN_EMAIL` / `ADMIN_PASSWORD` au moment du `npm run db:seed`. Les autres membres se créent dans **Équipe** (rôle *Administrateur* = tout ; *Contrôleur* = scanner uniquement).

**Mot de passe perdu ou premier accès** (il n'y a pas de « mot de passe oublié » dans l'admin, par sécurité) :
```bash
npm run admin:create -- vous@exemple.com "un-mot-de-passe-long-et-unique"
```
(nécessite `DATABASE_URL` dans `.env`) : crée l'administrateur ou remplace son mot de passe.

**Confidentialité** : le site public ne contient aucun lien vers l'admin ; l'admin est une application à part, non indexée par les moteurs de recherche, dont toutes les pages (sauf la connexion) exigent d'être connecté ; les comptes clients ne peuvent pas s'y connecter. Gardez l'adresse de l'admin privée, utilisez un mot de passe long (14 caractères ou plus) et changez celui du `.env` d'exemple.


### Changer le nom et le logo du projet
1. **Une seule variable** : `SITE_NAME` (ex. `SITE_NAME="Mon Spectacle"`). À définir pour le **site et l'admin** (sur Vercel : dans les deux projets, puis *Redeploy* ; en local : fichier `.env`). Elle change l'en-tête, le pied de page, le titre de l'onglet, les e-mails, les billets PDF et l'admin.
2. **À modifier aussi à la main** :
   - `MAIL_FROM` (nom et adresse d'expédition des e-mails) ;
   - les pages légales dans `apps/web/lib/legal.ts` (raison sociale, adresse… : ce n'est pas la même chose que le nom commercial) ;
   - l'apparence (couleurs, polices) dans `apps/web/app/globals.css` ;
   - le nom de domaine, côté hébergeur.
3. **Logo** : le logo Eventpass est déjà intégré (en-tête du site et de l'admin, page de connexion de l'admin, icône d'onglet, e-mails, billets PDF). Pour le remplacer : mettez votre nouveau logo (sur fond noir uni) dans `brand/logo-source.png`, puis lancez `npm run brand:build -w @rideau/web` : toutes les déclinaisons sont régénérées (version horizontale, icônes, e-mails, billets). `SITE_LOGO=none` affiche le nom en texte à la place. Les en-têtes sont **sombres** car l'écriture du logo est de couleur crème.
4. Le nom technique `rideau` (dossiers `@rideau/…`, base Docker `rideau`) n'est jamais visible par les clients : inutile de le changer.

### Commandes utiles
| Commande | Rôle |
|---|---|
| `npm install` | Installe tout (génère aussi le client de base de données) |
| `npm run dev:web` / `npm run dev:admin` | Lance le site (3000) / l'admin (3001) |
| `npm run db:push` | Crée/met à jour les tables (développement et tests) |
| `npm run db:seed` | Données de démonstration + compte administrateur |
| `npm run db:migrate -- --name init` | Crée une migration versionnée (production) |
| `npm run typecheck` | Vérifie le code |
| `npm run ticket:sample -w @rideau/web` | Génère un billet PDF d'exemple (`exemple-billets.pdf`) |

### Ce que contient un billet
Image de l'événement, titre, date, heure, lieu, ville, pays, organisateur, titulaire, catégorie, siège (numérotation automatique par préfixe, ou « Libre »), numéro `EV<date><séquence>`, QR code et code-barres. Tout provient de ce que l'admin saisit pour l'événement et de la commande.

### Moyens de paiement
| Moyen | Confirmation | Remarques |
|---|---|---|
| Carte Visa / Mastercard (Stripe) | Webhook signé | Paiement en euros, 3D Secure |
| Crypto (NOWPayments) | Webhook signé | Facture en euros |
| Virement | Admin (après preuve) | Coordonnées gérées dans l'admin, IBAN vérifié, preuves privées stockées en base |

### Sécurité en bref
Montants calculés côté serveur ; billets émis uniquement après confirmation vérifiée ; webhooks signés et traités une seule fois ; réservation sans survente (verrou en base) ; jetons de commande aléatoires ; preuves de virement non publiques ; modification des coordonnées bancaires protégée par mot de passe ; admin non indexé ; secrets uniquement en variables d'environnement.

### Fichiers de configuration
`.env.example` (développement), `.env.production.example` (serveur), `docker-compose.yml` (base locale), `docker-compose.prod.yml` + `Caddyfile` + `Dockerfile` (serveur), `apps/web/vercel.json` (tâche planifiée).
