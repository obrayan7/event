# Héberger Eventpass en réel sur Vercel, avec le nom de domaine de l'entreprise

Ce guide met le site **en production** : vrais clients, **vrais paiements**, adresse `https://monentreprise.fr` et espace admin sur `https://admin.monentreprise.fr`.
Il remplace le guide de test gratuit (`README.md`), qui utilise des clés de test.

> Remplacez partout `monentreprise.fr` par le nom de domaine réel de l'entreprise.
> Pour répartir le serveur (webhooks, billets) et la base de données sur **Render** tout en gardant le site et l'admin sur Vercel : voir `HEBERGEMENT-RENDER-VERCEL.md`.

**Sommaire**
1. [Ce qu'il faut avant de commencer](#1-ce-quil-faut-avant-de-commencer)
2. [Architecture finale](#2-architecture-finale)
3. [Étape 1 — Le nom de domaine](#étape-1--le-nom-de-domaine)
4. [Étape 2 — La base de données de production](#étape-2--la-base-de-données-de-production)
5. [Étape 3 — Le stockage des images](#étape-3--le-stockage-des-images)
6. [Étape 4 — Paiements et e-mails en mode réel](#étape-4--paiements-et-e-mails-en-mode-réel)
7. [Étape 5 — Préparer le code et la base](#étape-5--préparer-le-code-et-la-base)
8. [Étape 6 — Créer les deux projets Vercel](#étape-6--créer-les-deux-projets-vercel)
9. [Étape 7 — Brancher le nom de domaine](#étape-7--brancher-le-nom-de-domaine)
10. [Étape 8 — Webhooks, e-mails et dernière configuration](#étape-8--webhooks-e-mails-et-dernière-configuration)
11. [Étape 9 — Régler l'admin et les textes légaux](#étape-9--régler-ladmin-et-les-textes-légaux)
12. [Étape 10 — Tests réels avant l'ouverture](#étape-10--tests-réels-avant-louverture)
13. [Sécurité et exploitation](#sécurité-et-exploitation)
14. [Mettre à jour le site plus tard](#mettre-à-jour-le-site-plus-tard)
15. [Dépannage](#dépannage)
16. [Coûts récurrents](#coûts-récurrents)

---

## 1. Ce qu'il faut avant de commencer

**Comptes à créer** (tous au nom de l'entreprise) :

| Service | Rôle | À prévoir |
|---|---|---|
| **GitHub** | Stocke le code (dépôt privé) | Compte gratuit |
| **Vercel — formule Pro** | Héberge le site et l'admin | La formule gratuite (Hobby) est réservée à un usage **non commercial** : pour vendre de vrais billets, il faut le **Pro** (facturé par utilisateur et par mois) |
| **Registrar de nom de domaine** | Vend et gère `monentreprise.fr` | OVH, Gandi, Namecheap, GoDaddy… ou directement Vercel |
| **Base PostgreSQL en Europe** | Données du site | Formule **payante ou jamais mise en pause** (sauvegardes incluses) : Supabase Pro, Neon, Scaleway… |
| **Stockage d'images S3 en Europe** | Photos des événements | Supabase Storage, Scaleway, Cloudflare R2, OVH… |
| **Stripe** | Cartes Visa / Mastercard | Compte **activé** (informations de l'entreprise, IBAN, pièce d'identité du dirigeant) |
| **NOWPayments** | Paiements crypto (facultatif) | Compte de production + adresse de portefeuille |
| **Resend** | E-mails (billets, mot de passe oublié) | Domaine d'envoi vérifié |

**Sur votre ordinateur** : [Node.js 20](https://nodejs.org), Git et [Docker](https://www.docker.com) (pour créer les migrations de base de données).

**Sécurisez vos comptes dès maintenant** : activez la **double authentification** sur GitHub, Vercel, Stripe, la base de données et le registrar. Quelqu'un qui prend la main sur l'un d'eux peut détourner les paiements.

**Durée** : prévoir une demi-journée à une journée, en plus des délais de validation (Stripe, domaine).

---

## 2. Architecture finale

| Adresse | Application | Projet Vercel | Dossier du dépôt |
|---|---|---|---|
| `https://monentreprise.fr` (et `www.`) | Site public | `eventpass-web` | `apps/web` |
| `https://admin.monentreprise.fr` | Espace administration | `eventpass-admin` | `apps/admin` |

Les deux projets partagent **la même base de données** et **le même secret interne** (utilisé pour confirmer les virements). Ils sont dans la **même équipe Vercel** (Pro).

Les fonctions (le code serveur) sont configurées pour tourner à **Paris** (`cdg1`) via les fichiers `vercel.json` fournis, au plus près de la base européenne et de vos clients. Par défaut, Vercel utiliserait Washington, D.C. : ne retirez pas ce réglage.

---

## Étape 1 — Le nom de domaine

1. **Achetez** le nom de domaine chez le registrar de votre choix (ou depuis Vercel). Notez où se trouve sa **zone DNS** (l'écran où l'on ajoute des enregistrements).
2. Si l'entreprise utilise déjà ce domaine pour son **site actuel ou ses e-mails** (Google Workspace, Microsoft 365, OVH Mail…), **ne changez pas les serveurs de noms** (nameservers) : vous ajouterez seulement quelques enregistrements à l'étape 7, sans toucher aux enregistrements `MX` (e-mails).
3. Gardez cet onglet ouvert : vous y reviendrez à l'étape 7.

---

## Étape 2 — La base de données de production

Utilisez une base **hébergée dans l'Union européenne**, **non mise en pause** et **sauvegardée**.

> La formule gratuite de Supabase met le projet en pause après 7 jours d'inactivité : **à éviter en production**. Choisissez une formule payante.

1. Créez le projet (région **Europe**, ex. Paris ou Francfort) et notez le mot de passe de la base (évitez les caractères spéciaux comme `@ : / ?`).
2. Récupérez **deux adresses de connexion** :

| Usage | Type | À ajouter à la fin |
|---|---|---|
| **Vercel** (le site en ligne) | connexion « poolée » (*transaction pooler*, souvent le port 6543) | `?pgbouncer=true&connection_limit=1` |
| **Votre ordinateur** (migrations) | connexion directe ou « session pooler » (port 5432) | rien |

3. **Activez les sauvegardes automatiques** chez le fournisseur, vérifiez la durée de conservation, et **testez une restauration** au moins une fois avant l'ouverture.

---

## Étape 3 — Le stockage des images

1. Créez un **bucket public en lecture** (ex. `eventpass`) dans une région européenne.
2. Récupérez : l'adresse du service (`S3_ENDPOINT`), la région (`S3_REGION`), le nom du bucket (`S3_BUCKET`), une **clé d'accès** et son **secret** (`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`), et l'**adresse publique** de lecture des images (`S3_PUBLIC_URL`, sans « / » final).
3. Avec Supabase Storage, ajoutez `S3_FORCE_PATH_STYLE=1`.

Vérifiez dans le navigateur qu'une image téléversée à la main dans le bucket s'ouvre bien depuis `S3_PUBLIC_URL`.

---

## Étape 4 — Paiements et e-mails en mode réel

### 4.1 Stripe (cartes Visa et Mastercard)
1. Terminez l'**activation du compte** Stripe (informations de l'entreprise, IBAN de versement, représentant légal).
2. Dans le tableau de bord en **mode production** (et non « test »), ouvrez **Développeurs → Clés API** et copiez la **clé secrète** `sk_live_…` → `STRIPE_SECRET_KEY`.
3. Le secret du webhook (`whsec_…`) sera créé à l'[étape 8](#étape-8--webhooks-e-mails-et-dernière-configuration), une fois le domaine actif.
4. Dans les réglages des moyens de paiement, ne laissez activée que la **carte**.

> Stripe accepte aussi d'autres cartes que Visa et Mastercard si elles sont activées sur votre compte ; le site, lui, ne propose que « Carte Visa ou Mastercard ». Pour refuser les autres marques, il faut une règle dans les outils anti-fraude de Stripe (à vérifier selon votre formule).

### 4.2 NOWPayments (crypto) — facultatif
1. Créez le compte de **production**, puis dans les paramètres de la boutique ajoutez l'**adresse de portefeuille** qui recevra l'argent (même réseau que la crypto choisie : une erreur de réseau peut faire perdre les fonds). Pour recevoir en euros sur un compte bancaire, la vérification d'entreprise est nécessaire chez eux.
2. Récupérez la **clé API** → `NOWPAYMENTS_API_KEY` et le **secret IPN** → `NOWPAYMENTS_IPN_SECRET`. L'adresse d'API de production est `https://api.nowpayments.io/v1`.
3. Faites valider la chaîne **comptable et fiscale** des cryptos reçues avec l'expert-comptable.

### 4.3 Virement bancaire
Rien à configurer maintenant : l'administrateur enregistre ses comptes bancaires à l'[étape 9](#étape-9--régler-ladmin-et-les-textes-légaux).

### 4.4 E-mails (Resend)
1. Dans Resend, **ajoutez votre domaine** (`monentreprise.fr`) : Resend affiche des enregistrements DNS à créer (SPF, DKIM).
2. Créez-les dans la zone DNS du registrar, puis cliquez sur **Verify**. Ajoutez aussi un enregistrement **DMARC** (type `TXT`, nom `_dmarc`), par exemple `v=DMARC1; p=none; rua=mailto:contact@monentreprise.fr` pour commencer.
3. Créez une **clé API** → `RESEND_API_KEY`, et choisissez l'expéditeur : `MAIL_FROM="Eventpass <billets@monentreprise.fr>"`.

---

## Étape 5 — Préparer le code et la base

### 5.1 Mettre le code sur GitHub
```bash
cd eventpass
git init && git add . && git commit -m "Eventpass"
git branch -M main
git remote add origin https://github.com/VOTRE-COMPTE/eventpass.git
git push -u origin main
```
Dépôt **privé**. Le fichier `.gitignore` empêche d'envoyer les secrets (`.env`).

### 5.2 Créer les migrations de la base (une seule fois)
Les migrations décrivent les tables de façon versionnée : c'est la méthode à utiliser en production (jamais `db:push`).

```bash
cp .env.example .env          # DATABASE_URL pointe vers la base locale du docker-compose
docker compose up -d          # démarre une base PostgreSQL locale
npm install
npm run db:migrate -- --name init
git add packages/db/prisma/migrations
git commit -m "Migration initiale" && git push
```

### 5.3 Appliquer les migrations sur la base de production
1. Dans votre fichier `.env` **local** (jamais commité), remplacez temporairement `DATABASE_URL` par l'adresse **directe / session pooler** de la base de production (étape 2).
2. Lancez :
```bash
npm run db:deploy              # crée les tables
npm run db:seed:prod           # catégories de base uniquement (aucune donnée de démonstration)
npm run admin:create -- vous@monentreprise.fr "un-mot-de-passe-long-et-unique-14-caracteres-ou-plus"
```
3. **Remettez** `DATABASE_URL` à la valeur locale.

> N'exécutez **jamais** `npm run db:seed` en production : il crée des événements de démonstration.

---

## Étape 6 — Créer les deux projets Vercel

### 6.1 Générer vos secrets
Dans un terminal, lancez 4 fois `openssl rand -base64 32` (sous Windows : Git Bash). Gardez 4 valeurs **différentes** : `CUSTOMER_SESSION_SECRET`, `ADMIN_SESSION_SECRET`, `CRON_SECRET`, `INTERNAL_API_SECRET`. Conservez-les dans un gestionnaire de mots de passe.

### 6.2 Projet « site »
1. Sur vercel.com, dans votre équipe **Pro** : **Add New → Project** → importez le dépôt.
2. **Root Directory** : `apps/web`. Laissez activée l'option qui inclut les fichiers situés hors du dossier racine (nécessaire pour le code partagé). Framework : Next.js.
3. **Environment Variables**, pour l'environnement **Production** :

| Variable | Valeur |
|---|---|
| `DATABASE_URL` | adresse **poolée** + `?pgbouncer=true&connection_limit=1` |
| `SITE_URL` | `https://monentreprise.fr` |
| `ADMIN_URL` | `https://admin.monentreprise.fr` |
| `SITE_NAME` | `Eventpass` |
| `CUSTOMER_SESSION_SECRET` | secret généré |
| `CRON_SECRET` | secret généré |
| `INTERNAL_API_SECRET` | secret généré (**identique** pour l'admin) |
| `STRIPE_SECRET_KEY` | `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` (étape 8 ; mettez une valeur provisoire et corrigez-la) |
| `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET` | si crypto |
| `NOWPAYMENTS_API_URL` | `https://api.nowpayments.io/v1` |
| `RESEND_API_KEY` | `re_…` |
| `MAIL_FROM` | `Eventpass <billets@monentreprise.fr>` |
| `MAX_UPLOAD_MB` | `4` (Vercel limite les requêtes à 4,5 Mo) |
| `BANK_HOLD_HOURS` | `48` |
| `BANK_NOTIFY_EMAIL` | e-mail qui reçoit « virement à vérifier » (facultatif) |

4. ⚠️ **Ne définissez PAS `SKIP_ENV_CHECK`.** En production, le site **refuse volontairement de démarrer** si la configuration est incomplète ou contient des clés de démonstration. Le message exact s'affiche dans **Deployments → (le déploiement) → Logs**.
5. Cliquez **Deploy**. Un premier échec lié à la configuration est possible : corrigez la variable indiquée, puis **Redeploy**.

### 6.3 Projet « admin »
Même démarche, même dépôt, **Root Directory** : `apps/admin`, Production :

| Variable | Valeur |
|---|---|
| `DATABASE_URL` | la même que le site |
| `ADMIN_SESSION_SECRET` | secret généré |
| `INTERNAL_API_SECRET` | **le même** que le site |
| `WEB_URL` | `https://monentreprise.fr` |
| `WEB_INTERNAL_URL` | `https://monentreprise.fr` |
| `SITE_NAME` | `Eventpass` |
| `MAX_UPLOAD_MB` | `4` |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL` | valeurs de l'étape 3 |
| `S3_FORCE_PATH_STYLE` | `1` si votre fournisseur l'exige |

### 6.4 Tâche planifiée
Le site libère automatiquement les places des commandes expirées toutes les 5 minutes (`apps/web/vercel.json`). Vercel envoie le secret `CRON_SECRET` de lui-même ; vérifiez dans **Settings → Cron Jobs** que la tâche apparaît bien.

---

## Étape 7 — Brancher le nom de domaine

À faire **dans chaque projet**, onglet **Settings → Domains**.

### 7.1 Projet site
1. **Add** `monentreprise.fr`. Vercel propose d'ajouter aussi `www.monentreprise.fr` : acceptez, puis choisissez **le domaine principal** (par exemple `monentreprise.fr`) et faites **rediriger** `www` vers lui.
2. Vercel affiche, pour chaque domaine, les enregistrements DNS **exacts** à créer. Chez le registrar :

| Type | Nom | Valeur |
|---|---|---|
| `A` | `@` (ou vide) | **`76.76.21.21`** (ou la valeur affichée sur la carte du domaine) |
| `CNAME` | `www` | la valeur **affichée par Vercel pour ce projet** |

### 7.2 Projet admin
**Add** `admin.monentreprise.fr`, puis créez chez le registrar :

| Type | Nom | Valeur |
|---|---|---|
| `CNAME` | `admin` | la valeur **affichée par Vercel pour le projet admin** |

### 7.3 Précautions
- **Utilisez les valeurs affichées par Vercel** : chaque projet peut avoir sa propre valeur de `CNAME`.
- **Supprimez** d'abord les anciens enregistrements `A` / `AAAA` du domaine (ancien hébergeur) : ils bloquent la vérification. Ne touchez pas aux `MX`.
- Si vous utilisez **Cloudflare**, passez les enregistrements en « DNS only » (nuage gris) le temps que le certificat soit émis.
- La propagation prend de quelques minutes à quelques heures. Le **certificat HTTPS est créé automatiquement** une fois les enregistrements détectés. Si l'état reste bloqué alors que tout est correct, supprimez le domaine du projet et ajoutez-le de nouveau.

Vérifiez : `https://monentreprise.fr` et `https://admin.monentreprise.fr/login` s'ouvrent avec le cadenas HTTPS.

---

## Étape 8 — Webhooks, e-mails et dernière configuration

Une fois le domaine actif :

### 8.1 Webhook Stripe
1. **Développeurs → Webhooks → Ajouter un endpoint** (mode **production**).
2. URL : `https://monentreprise.fr/api/webhooks/stripe`
3. Événements : `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`.
4. Copiez le **secret de signature** `whsec_…` → `STRIPE_WEBHOOK_SECRET` du projet **site** → **Redeploy**.

> Sans ce webhook, un client paie mais **ne reçoit aucun billet**.

### 8.2 NOWPayments
L'adresse de notification est envoyée avec chaque facture : vérifiez seulement que `NOWPAYMENTS_IPN_SECRET` est bien celui du compte de production.

### 8.3 E-mails
Dans Resend, vérifiez que le domaine est « Verified ». Faites un test : sur le site, « Mot de passe oublié » avec votre adresse → l'e-mail doit arriver **dans la boîte de réception** (pas dans les courriers indésirables).

### 8.4 Redéployer
Après toute modification de variable : **Deployments → ⋯ → Redeploy**, sur chaque projet concerné.

---

## Étape 9 — Régler l'admin et les textes légaux

### 9.1 Première connexion
Ouvrez `https://admin.monentreprise.fr/login` avec l'e-mail et le mot de passe créés à l'étape 5.3. Puis :
1. **Équipe** : créez les autres comptes (administrateurs, contrôleurs d'accueil pour le scanner).
2. **Comptes bancaires** : ajoutez le compte de l'entreprise pour le virement (IBAN vérifié ; votre mot de passe est demandé). **Relisez l'IBAN affiché au client : une erreur ferait partir l'argent vers un mauvais compte.**
3. **Lieux** : créez les salles (le pays se saisit en code à 2 lettres : `FR`, `BJ`…).
4. **Événements** : créez le premier événement, ses catégories de billets (ou son plan de salle), téléversez les images, **publiez**.

### 9.2 Textes légaux (obligatoire avant l'ouverture)
Éditez `apps/web/lib/legal.ts` : remplacez tous les champs `[À COMPLÉTER PAR LE CLIENT]` :
- **Mentions légales** : raison sociale, forme juridique et capital, siège, SIREN/RCS, TVA, directeur de la publication, contact, et les **hébergeurs** (Vercel Inc. : reprenez l'adresse indiquée sur le site de Vercel ; et le fournisseur de la base de données).
- **CGV** : nom du vendeur, politique en cas d'annulation ou de report d'un spectacle, **médiateur de la consommation** (coordonnées).
- **Confidentialité** : responsable du traitement, contact, destinataires (Vercel, Stripe, Resend, fournisseur de base de données, NOWPayments), durées de conservation.

Faites **relire ces textes par un juriste**, puis `git commit`, `git push` : Vercel redéploie tout seul.

### 9.3 Questions à régler avec l'expert-comptable
Facturation et TVA des billets, traitement des cryptomonnaies reçues, conservation des commandes (10 ans), gestion des remboursements.

---

## Étape 10 — Tests réels avant l'ouverture

Faites ces tests **avec de vrais petits montants** (puis remboursez-les depuis Stripe) :

- [ ] Achat par carte réelle (le plus petit billet possible) → billet reçu par e-mail, PDF correct (logo, date, lieu, place, QR code).
- [ ] **Remboursement** de cet achat depuis le tableau de bord Stripe.
- [ ] Le **webhook** apparaît « réussi » dans Stripe (Développeurs → Webhooks → l'endpoint).
- [ ] Scanner depuis un **téléphone** (compte contrôleur) : « valide » puis « déjà utilisé ».
- [ ] Virement : commande, e-mail avec coordonnées, envoi d'une preuve, confirmation dans l'admin, billets reçus.
- [ ] Crypto (si activée) : petit paiement réel, billets émis.
- [ ] Mot de passe oublié, création de compte client, achat sans compte.
- [ ] **Anti-survente** : deux navigateurs, même dernière place.
- [ ] Une **image** téléversée s'affiche sur le site (adresse publique du bucket).
- [ ] Les e-mails arrivent en **boîte de réception**, avec le logo.
- [ ] Les pages légales sont complètes ; le site s'affiche correctement sur mobile.
- [ ] **Restauration** d'une sauvegarde de la base testée.
- [ ] Les comptes (Vercel, GitHub, Stripe, base, registrar) ont la **double authentification**.

---

## Sécurité et exploitation

- **Variables d'environnement** : réservez-les à l'environnement **Production**. Pour les déploiements de prévisualisation, n'ajoutez **aucune clé de production**.
- **Accès à Vercel** : ne donnez l'accès qu'aux personnes nécessaires ; chaque membre est facturé.
- **Admin** : mot de passe long (14 caractères ou plus) et unique, adresse de l'admin gardée privée. La limitation des tentatives de connexion est gérée en mémoire : sur Vercel, plusieurs instances ne la partagent pas, elle est donc **moins efficace** qu'un serveur unique. Pour renforcer l'accès (double authentification par code, restriction par adresse IP), faites-en la demande : ce n'est pas encore en place.
- **Surveillance** : consultez régulièrement **Logs** dans Vercel et les « Webhooks » de Stripe. Un paiement réussi sans billet doit déclencher une vérification immédiate.
- **Cas à traiter à la main** : une commande **payée mais non validable** (places reprises après expiration) est signalée dans les journaux par « traitement manuel requis » : **remboursez le client**. Même chose pour un virement confirmé trop tard.
- **Sauvegardes** : gardez-les actives et testez-les.
- **Rotation des secrets** : changez un secret dès qu'il a été partagé par erreur, puis mettez-le à jour dans **les deux projets** (`INTERNAL_API_SECRET`) et redéployez.

---

## Mettre à jour le site plus tard

1. Modifiez le code, `git push` : Vercel construit et déploie automatiquement.
2. **Si le schéma de base change** (nouvelle table ou colonne) : **avant** de pousser, créez et appliquez la migration :
```bash
npm run db:migrate -- --name description_du_changement   # base locale
git add packages/db/prisma/migrations && git commit && git push
# puis, avec DATABASE_URL de production dans .env :
npm run db:deploy
```
3. En cas de problème après un déploiement, l'onglet **Deployments** de Vercel permet de revenir à une version précédente.

---

## Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| Le déploiement échoue avec « Configuration de production invalide » | Variable manquante ou valeur de démonstration | Lisez la liste dans **Logs** ; corrigez les variables du bon projet ; **Redeploy** |
| `https://monentreprise.fr` n'ouvre pas | DNS non propagé ou enregistrements incorrects | Comparez avec les valeurs affichées dans **Settings → Domains** ; supprimez les anciens `A`/`AAAA` ; patientez |
| Le domaine reste « Invalid Configuration » | Ancien enregistrement ou proxy Cloudflare | Supprimez les anciens enregistrements, passez en « DNS only », sinon retirez puis rajoutez le domaine |
| Paiement réussi, **pas de billet** | Webhook Stripe absent, mauvaise URL ou mauvais secret | Étape 8.1 ; regardez l'envoi dans Stripe (400 = secret, 404 = adresse) |
| Confirmer un virement échoue | `INTERNAL_API_SECRET` différent ou `WEB_INTERNAL_URL` erroné | Même secret dans les deux projets ; `WEB_INTERNAL_URL=https://monentreprise.fr` ; Redeploy |
| Les images ne s'affichent pas | Bucket non public ou `S3_PUBLIC_URL` erroné | Testez l'adresse d'une image dans le navigateur |
| Erreur 413 à l'envoi d'une image ou d'une preuve | Fichier trop lourd pour Vercel | `MAX_UPLOAD_MB=4`, une image à la fois |
| Les e-mails n'arrivent pas | Domaine Resend non vérifié, SPF/DKIM absents | Étape 4.4 ; vérifiez le statut « Verified » |
| Erreur de connexion à la base | Mauvaise adresse ou projet en pause | Utilisez l'adresse poolée avec `?pgbouncer=true&connection_limit=1` ; vérifiez que la base est active |
| La caméra du scanner ne démarre pas | Permission refusée | Utilisez `https://admin…` et autorisez la caméra |

---

## Coûts récurrents

À vérifier sur les sites des fournisseurs (tarifs susceptibles de changer) :

| Poste | Ordre de grandeur |
|---|---|
| Vercel Pro | par utilisateur et par mois (20 $ au moment de la rédaction) |
| Nom de domaine | quelques à une vingtaine d'euros par an |
| Base de données payante | une vingtaine d'euros par mois selon le fournisseur |
| Stockage d'images | gratuit à quelques euros selon le volume |
| Resend | gratuit jusqu'à un certain volume, puis payant |
| Stripe | commission par transaction (voir leur grille) |
| NOWPayments | commission par transaction (voir leur grille) |
