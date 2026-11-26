# Eventpass : serveur « backend » et base de données sur Render, site et admin sur Vercel

Ce guide explique comment répartir Eventpass entre **Render** et **Vercel**, avec le **nom de domaine de l'entreprise**, en mode **réel** (vrais clients, vrais paiements).

> Remplacez partout `monentreprise.fr` par le nom de domaine réel.
> Pour une mise en ligne **plus simple** (tout sur Vercel, base de données ailleurs), suivez `HEBERGEMENT-VERCEL.md` à la place de ce guide.

**Sommaire**
1. [Où est le « backend » ?](#1-où-est-le--backend--)
2. [Architecture proposée](#2-architecture-proposée)
3. [Ce qu'il faut et ce que ça coûte](#3-ce-quil-faut-et-ce-que-ça-coûte)
4. [Étape 1 — Plan des noms de domaine](#étape-1--plan-des-noms-de-domaine)
5. [Étape 2 — La base de données sur Render](#étape-2--la-base-de-données-sur-render)
6. [Étape 3 — Préparer le code et la base](#étape-3--préparer-le-code-et-la-base)
7. [Étape 4 — Le serveur API sur Render](#étape-4--le-serveur-api-sur-render)
8. [Étape 5 — Le site et l'admin sur Vercel](#étape-5--le-site-et-ladmin-sur-vercel)
9. [Étape 6 — Brancher les noms de domaine](#étape-6--brancher-les-noms-de-domaine)
10. [Étape 7 — Webhooks et services de paiement](#étape-7--webhooks-et-services-de-paiement)
11. [Étape 8 — Tester le montage](#étape-8--tester-le-montage)
12. [La tâche planifiée](#la-tâche-planifiée-expiration-des-réservations)
13. [Tableau récapitulatif des variables](#tableau-récapitulatif-des-variables)
14. [Mises à jour, sécurité, dépannage](#mises-à-jour-sécurité-dépannage)

---

## 1. Où est le « backend » ?

Eventpass n'a **pas** de serveur « backend » séparé, comme on le ferait avec Express ou Laravel. Il est fait de **deux applications Next.js**, et chacune contient sa propre partie serveur (accès à la base de données, paiements, génération des billets). C'est pourquoi on ne peut pas simplement « mettre le frontend sur Vercel et le backend sur Render » en deux morceaux.

Voici ce qui joue le rôle de backend, et où nous le plaçons :

| Rôle « backend » | Ce que c'est dans le projet | Hébergé sur |
|---|---|---|
| **Base de données** | PostgreSQL | **Render** |
| **Serveur d'événements** | Réception des **webhooks de paiement** (Stripe, NOWPayments), confirmation des **virements**, génération des **billets PDF** et envoi des e-mails, tâche d'expiration | **Render** (service « API ») |
| **Site public** | Pages, panier, paiement, comptes clients | **Vercel** |
| **Espace admin** | Back-office | **Vercel** |

Le service « API » sur Render est **la même application que le site** (`apps/web`), qui n'y répond qu'aux routes `/api/*`. Toute autre adresse reçue sur `api.monentreprise.fr` est renvoyée automatiquement vers le site public.

**Pourquoi ce découpage ?** Les opérations sensibles (un client vient de payer : valider la commande, créer les billets, générer les PDF, envoyer l'e-mail) tournent sur un **serveur toujours allumé**, sans limite de durée ni de taille de requête, au lieu d'une fonction qui peut expirer. Le site et l'admin restent sur Vercel, simples à mettre à jour.

## 2. Architecture proposée

```
                     ┌──────────────────────────┐
   Clients  ───────► │ monentreprise.fr (Vercel)│──┐
                     │ site public              │  │
                     └──────────────────────────┘  │
                     ┌──────────────────────────┐  │      ┌─────────────────────────┐
   Équipe   ───────► │ admin.monentreprise.fr   │──┼────► │ PostgreSQL (Render)     │
                     │ (Vercel)                 │  │      │ Francfort               │
                     └───────────┬──────────────┘  │      └───────────▲─────────────┘
                                 │ confirme un     │                  │
                                 │ virement        │                  │
   Stripe / NOWPayments          ▼                 │      ┌───────────┴─────────────┐
   (webhooks) ─────────► api.monentreprise.fr ─────┴────► │ Serveur API (Render)    │
                         (Render, toujours allumé)        └─────────────────────────┘
```

| Adresse | Hébergeur | Rôle |
|---|---|---|
| `monentreprise.fr` (et `www.`) | Vercel (projet `eventpass-web`) | Site public |
| `admin.monentreprise.fr` | Vercel (projet `eventpass-admin`) | Administration |
| `api.monentreprise.fr` | Render (service `eventpass-api`) | Webhooks, confirmation des virements, billets |
| (interne) | Render (base `eventpass-db`) | PostgreSQL |

> Le nom du sous-domaine doit être **exactement `api`** : le site détecte ce préfixe pour renvoyer les visiteurs vers la vitrine.

**Quand éviter ce montage ?** Si vous voulez le moins de maintenance possible : deux hébergeurs à gérer, plus de variables à synchroniser, deux factures. Dans ce cas, utilisez `HEBERGEMENT-VERCEL.md`.

## 3. Ce qu'il faut et ce que ça coûte

**Comptes** : GitHub, **Render**, **Vercel Pro** (usage commercial), registrar de nom de domaine, Stripe (compte activé), Resend (domaine vérifié), stockage d'images S3 en Europe, et NOWPayments si crypto.

**À ne pas faire** :
- **Ne pas utiliser les formules gratuites de Render en production.** Un service web gratuit **s'endort après 15 minutes d'inactivité** et met 30 à 60 secondes à se réveiller : un webhook de paiement arriverait trop tard ou échouerait. Une base gratuite **expire au bout de 30 jours** et n'a pas de sauvegardes.
- Avec Vercel, la formule gratuite (Hobby) est réservée à un usage non commercial : prenez le **Pro**.

| Poste | Ordre de grandeur (à vérifier chez chaque fournisseur) |
|---|---|
| Render — service web « Starter » (toujours allumé) | environ 7 $ par mois |
| Render — base PostgreSQL payante | à partir d'environ 6 $ par mois selon la taille |
| Vercel Pro | par utilisateur et par mois (20 $ au moment de la rédaction) |
| Nom de domaine | quelques à une vingtaine d'euros par an |
| Stockage d'images, e-mails | selon le volume (souvent gratuit au départ) |

**Sur votre ordinateur** : Node.js 20, Git, et Docker (pour créer les migrations).

**Sécurité des comptes** : activez la double authentification sur GitHub, Render, Vercel, Stripe et le registrar.

---

## Étape 1 — Plan des noms de domaine

Achetez le nom de domaine, puis gardez la zone DNS ouverte. Vous créerez à l'étape 6 :

| Nom | Pointe vers |
|---|---|
| `monentreprise.fr` (A) et `www` (CNAME) | Vercel, projet site |
| `admin` (CNAME) | Vercel, projet admin |
| `api` (CNAME) | Render, service API |

Si le domaine sert déjà pour des e-mails (Google Workspace, Microsoft 365…), **ne changez pas ses serveurs de noms** et ne touchez pas aux enregistrements `MX`.

---

## Étape 2 — La base de données sur Render

1. Sur Render : **New → PostgreSQL**.
2. **Région : Frankfurt** (Union européenne). La région ne peut pas être changée après la création : choisissez-la avec soin, et **la même pour le service API** (étape 4), sans quoi l'adresse interne ne fonctionnera pas.
3. **Offre payante** (pas la gratuite), avec sauvegardes. Vérifiez la durée de conservation des sauvegardes et testez une restauration avant l'ouverture.
4. Notez deux adresses de connexion affichées sur la page de la base :

| Adresse | Pour qui | Détails |
|---|---|---|
| **Internal Database URL** | le serveur API sur Render | Réseau privé de Render, rapide, **ne fonctionne que dans la même région** |
| **External Database URL** | Vercel (site et admin) et votre ordinateur | Passe par Internet : ajoutez `?sslmode=require` à la fin |

5. **Accès depuis Vercel** : Vercel n'a pas d'adresse IP fixe. Vérifiez dans les paramètres réseau de la base (liste d'adresses autorisées) que les **connexions externes sont acceptées** ; si vous aviez restreint la liste, ouvrez-la.
6. **Connexions simultanées** : sur Vercel, chaque exécution du site peut ouvrir une connexion. Ajoutez `&connection_limit=1` à l'adresse externe utilisée par Vercel. Si, en production, vous voyez des erreurs « too many connections », passez à une offre de base plus grande ou utilisez le **pool de connexions** proposé par Render sur les offres payantes (si disponible pour votre offre), avec `&pgbouncer=true`.

Adresse externe pour Vercel, par exemple :
`postgresql://utilisateur:motdepasse@dpg-xxxx.frankfurt-postgres.render.com/nom_base?sslmode=require&connection_limit=1`

---

## Étape 3 — Préparer le code et la base

### 3.1 Mettre le code sur GitHub
```bash
cd eventpass
git init && git add . && git commit -m "Eventpass"
git branch -M main
git remote add origin https://github.com/VOTRE-COMPTE/eventpass.git
git push -u origin main
```
Dépôt **privé**. Les secrets (`.env`) ne sont jamais envoyés.

### 3.2 Créer les migrations (une seule fois)
```bash
cp .env.example .env              # DATABASE_URL = base locale du docker-compose
docker compose up -d
npm install
npm run db:migrate -- --name init
git add packages/db/prisma/migrations && git commit -m "Migration initiale" && git push
```

### 3.3 Appliquer sur la base de production
1. Dans votre fichier `.env` **local**, remplacez temporairement `DATABASE_URL` par l'**External Database URL** de Render (avec `?sslmode=require`).
2. Lancez :
```bash
npm run db:deploy                 # crée les tables
npm run db:seed:prod              # catégories de base (aucune donnée de démonstration)
npm run admin:create -- vous@monentreprise.fr "un-mot-de-passe-long-et-unique-14-caracteres-ou-plus"
```
3. **Remettez** `DATABASE_URL` à la valeur locale. Ne lancez **jamais** `npm run db:seed` ni `db:push` en production.

---

## Étape 4 — Le serveur API sur Render

### 4.1 Générer vos secrets
Quatre valeurs différentes (`openssl rand -base64 32`, ou Git Bash sous Windows) : `CUSTOMER_SESSION_SECRET`, `ADMIN_SESSION_SECRET`, `CRON_SECRET`, `INTERNAL_API_SECRET`. Gardez-les dans un gestionnaire de mots de passe : vous les saisirez aussi sur Vercel.

### 4.2 Créer le service
Sur Render : **New → Web Service** → connectez le dépôt GitHub, puis (les intitulés peuvent varier légèrement) :

| Réglage | Valeur |
|---|---|
| Name | `eventpass-api` |
| Language / Runtime | **Docker** |
| Branch | `main` |
| Region | **Frankfurt** (comme la base) |
| Instance Type | **Starter** (ou plus) — **pas Free** |
| Dockerfile Path | `./Dockerfile` |
| Docker Build Context | `.` (racine du dépôt) |
| Docker Command | laisser vide |
| Health Check Path | `/api/health` |
| Auto-Deploy | activé |

Le `Dockerfile` fourni construit par défaut l'application **web**, la lance sur le port attribué par Render et n'a besoin d'aucun réglage supplémentaire.

### 4.3 Variables d'environnement du service API
Voir le [tableau récapitulatif](#tableau-récapitulatif-des-variables) (colonne « API Render »). L'essentiel :

| Variable | Valeur |
|---|---|
| `DATABASE_URL` | **Internal Database URL** de la base Render |
| `SITE_URL` | `https://monentreprise.fr` |
| `ADMIN_URL` | `https://admin.monentreprise.fr` |
| `API_URL` | `https://api.monentreprise.fr` |
| `SITE_NAME` | `Eventpass` |
| `CUSTOMER_SESSION_SECRET`, `CRON_SECRET`, `INTERNAL_API_SECRET` | secrets générés |
| `STRIPE_SECRET_KEY` | `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` (valeur provisoire pour l'instant, corrigée à l'étape 7) |
| `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`, `NOWPAYMENTS_API_URL` | si crypto (`https://api.nowpayments.io/v1`) |
| `RESEND_API_KEY`, `MAIL_FROM` | e-mails, ex. `Eventpass <billets@monentreprise.fr>` |
| `BANK_HOLD_HOURS`, `BANK_NOTIFY_EMAIL` | virement (facultatif) |

> En production, le serveur **refuse volontairement de démarrer** si la configuration est incomplète. Le message exact apparaît dans l'onglet **Logs** du service. **Ne définissez pas `SKIP_ENV_CHECK`.**

### 4.4 Premier déploiement
Cliquez **Create Web Service**. La construction prend plusieurs minutes. Quand le service est « Live », ouvrez `https://eventpass-api.onrender.com/api/health` (l'adresse `.onrender.com` est affichée en haut de la page du service) : vous devez voir `{"ok":true}`.

---

## Étape 5 — Le site et l'admin sur Vercel

Même démarche que `HEBERGEMENT-VERCEL.md` (étape 6) : **deux projets** depuis le même dépôt, dans votre équipe **Pro**.

| Projet | Root Directory |
|---|---|
| `eventpass-web` | `apps/web` |
| `eventpass-admin` | `apps/admin` |

Variables, pour l'environnement **Production** (détail dans le [tableau](#tableau-récapitulatif-des-variables)) :

**Projet site** : `DATABASE_URL` (adresse **externe** Render avec `?sslmode=require&connection_limit=1`), `SITE_URL`, `ADMIN_URL`, **`API_URL=https://api.monentreprise.fr`**, `SITE_NAME`, les trois secrets, les clés Stripe / NOWPayments, `RESEND_API_KEY`, `MAIL_FROM`, `MAX_UPLOAD_MB=4`, `BANK_*`.

**Projet admin** : `DATABASE_URL` (idem), `ADMIN_SESSION_SECRET`, `INTERNAL_API_SECRET` (**le même** partout), `WEB_URL=https://monentreprise.fr`, **`WEB_INTERNAL_URL=https://api.monentreprise.fr`**, `SITE_NAME`, `MAX_UPLOAD_MB=4`, et les variables `S3_*` du stockage d'images.

> Le point important : `WEB_INTERNAL_URL` pointe vers le **serveur API sur Render**. Ainsi, quand l'admin confirme un virement, la génération des billets et l'envoi de l'e-mail se font sur Render, sans limite de durée.

Cliquez **Deploy** sur chaque projet. Ne définissez pas `SKIP_ENV_CHECK`.

---

## Étape 6 — Brancher les noms de domaine

### 6.1 Vercel (site et admin)
Dans chaque projet Vercel : **Settings → Domains → Add**.
- Projet site : `monentreprise.fr`, et acceptez `www.monentreprise.fr` avec redirection vers le domaine principal.
- Projet admin : `admin.monentreprise.fr`.

Chez le registrar, créez **exactement les valeurs affichées par Vercel** pour chaque domaine. En général : un enregistrement `A` pour `@` vers `76.76.21.21`, et un `CNAME` vers la valeur indiquée pour `www` et `admin`.

### 6.2 Render (API)
1. Sur le service `eventpass-api` : **Settings → Custom Domains → Add Custom Domain** : `api.monentreprise.fr`.
2. Render affiche la valeur à utiliser. Chez le registrar, créez :

| Type | Nom | Valeur |
|---|---|---|
| `CNAME` | `api` | `eventpass-api.onrender.com` (la valeur exacte affichée par Render) |

3. Cliquez **Verify**. Le certificat HTTPS est créé automatiquement.

### 6.3 Précautions
- **Supprimez** les anciens enregistrements `A` / `AAAA` (ancien hébergeur) qui entrent en conflit avec les nouveaux. Ne touchez pas aux `MX`.
- Avec **Cloudflare**, passez les enregistrements en « DNS only » (nuage gris) tant que les certificats ne sont pas émis.
- La propagation prend de quelques minutes à quelques heures.

---

## Étape 7 — Webhooks et services de paiement

### 7.1 Stripe (mode production)
1. **Développeurs → Webhooks → Ajouter un endpoint**.
2. URL : **`https://api.monentreprise.fr/api/webhooks/stripe`** (l'adresse du serveur API, pas celle du site).
3. Événements : `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`.
4. Copiez le secret `whsec_…` et mettez-le dans `STRIPE_WEBHOOK_SECRET` du **service Render** *et* du **projet site Vercel** (même valeur). Redéployez les deux.

> Sans ce webhook, un client paie mais **ne reçoit aucun billet**.

### 7.2 NOWPayments
L'adresse de notification est envoyée avec chaque facture et vise automatiquement le serveur API grâce à `API_URL`. Vérifiez seulement que `NOWPAYMENTS_IPN_SECRET` est bien celui du compte de production, et le portefeuille de réception dans les paramètres de la boutique.

### 7.3 Resend (e-mails)
Dans Resend, ajoutez votre domaine, créez les enregistrements DNS demandés (SPF, DKIM, et DMARC en `TXT` sur `_dmarc`), puis vérifiez-le. L'expéditeur est `MAIL_FROM`.

### 7.4 Virement
Dans l'admin (`https://admin.monentreprise.fr`), menu **Comptes bancaires** : ajoutez le compte de l'entreprise (IBAN vérifié, mot de passe demandé).

---

## Étape 8 — Tester le montage

1. `https://api.monentreprise.fr/api/health` → `{"ok":true}`.
2. `https://api.monentreprise.fr/` (la page d'accueil de l'API) → doit **renvoyer automatiquement** vers `https://monentreprise.fr/`.
3. `https://monentreprise.fr` et `https://admin.monentreprise.fr/login` s'ouvrent avec le cadenas HTTPS ; connectez-vous à l'admin.
4. **Paiement réel** d'un petit montant par carte : billet reçu par e-mail. Dans Stripe (Webhooks), l'envoi vers `api.monentreprise.fr` doit apparaître « réussi » ; dans Render (**Logs**), la requête apparaît. Remboursez ensuite le paiement depuis Stripe.
5. **Virement** : commande, envoi d'une preuve, puis dans l'admin **Confirmer** : les billets arrivent par e-mail (l'opération s'exécute sur Render : regardez ses journaux).
6. **Scanner** depuis un téléphone (compte contrôleur) : valide, puis déjà utilisé.
7. **Anti-survente** : deux navigateurs sur la même dernière place.
8. Les e-mails arrivent en boîte de réception (pas en courrier indésirable).

Reprenez ensuite la check-list complète de `HEBERGEMENT-VERCEL.md` (étapes 9 et 10 : textes légaux, tests réels, restauration d'une sauvegarde).

---

## La tâche planifiée (expiration des réservations)

Le site libère les places des commandes expirées toutes les 5 minutes. Deux options, une seule suffit :

**Option A — Cron de Vercel (déjà en place).** `apps/web/vercel.json` contient la tâche, active avec Vercel Pro. Rien à faire.

**Option B — Cron Job de Render.** Sur Render : **New → Cron Job**, région Frankfurt, planification `*/5 * * * *`, commande :
```
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://api.monentreprise.fr/api/cron/expire
```
avec la variable `CRON_SECRET` identique à celle du service API. Dans ce cas, **supprimez le bloc `crons`** de `apps/web/vercel.json` pour ne pas l'exécuter deux fois (sans gravité, mais inutile).

Dans tous les cas, les places d'une commande expirée redeviennent disponibles **sans** cette tâche : elle ne sert qu'à ranger les statuts.

---

## Tableau récapitulatif des variables

✓ = à définir. Les secrets marqués « identique » doivent avoir **la même valeur** partout.

| Variable | Site (Vercel) | Admin (Vercel) | API (Render) |
|---|:--:|:--:|:--:|
| `DATABASE_URL` | ✓ adresse **externe** | ✓ adresse **externe** | ✓ adresse **interne** |
| `SITE_URL` (`https://monentreprise.fr`) | ✓ | – | ✓ |
| `ADMIN_URL` (`https://admin.monentreprise.fr`) | ✓ | – | ✓ |
| `API_URL` (`https://api.monentreprise.fr`) | ✓ | – | ✓ |
| `WEB_URL` (`https://monentreprise.fr`) | – | ✓ | – |
| `WEB_INTERNAL_URL` (`https://api.monentreprise.fr`) | – | ✓ | – |
| `SITE_NAME` | ✓ | ✓ | ✓ |
| `CUSTOMER_SESSION_SECRET` (identique) | ✓ | – | ✓ |
| `ADMIN_SESSION_SECRET` | – | ✓ | – |
| `CRON_SECRET` (identique) | ✓ | – | ✓ |
| `INTERNAL_API_SECRET` (identique, 32 caractères min.) | ✓ | ✓ | ✓ |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | ✓ | – | ✓ |
| `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`, `NOWPAYMENTS_API_URL` | ✓ | – | ✓ |
| `RESEND_API_KEY`, `MAIL_FROM` | ✓ | – | ✓ |
| `BANK_HOLD_HOURS`, `BANK_NOTIFY_EMAIL` | ✓ | – | ✓ |
| `MAX_UPLOAD_MB` (`4`) | ✓ | ✓ | – |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL`, `S3_FORCE_PATH_STYLE` | – | ✓ | – |
| `SKIP_ENV_CHECK` | **ne pas définir** | **ne pas définir** | **ne pas définir** |

---

## Mises à jour, sécurité, dépannage

### Mettre à jour
- `git push` : Vercel (site et admin) **et** Render (API) redéploient automatiquement.
- **Si le schéma de base change** : créez la migration en local (`npm run db:migrate -- --name …`), commitez-la, **appliquez-la à la base de production** (`npm run db:deploy` avec l'adresse externe dans `.env`) **avant** de pousser le code. Gardez les migrations compatibles avec l'ancienne version du code, car Vercel et Render ne se mettent pas à jour exactement au même instant.

### Sécurité
- **Secrets** : jamais dans le dépôt ; variables Production uniquement ; pas de clés de production dans les déploiements de prévisualisation Vercel.
- **API publique** : `https://api.monentreprise.fr/api/internal/bank` est protégée par `INTERNAL_API_SECRET` (32 caractères au minimum). Changez ce secret s'il a été partagé par erreur, **dans les trois endroits**, puis redéployez.
- **Admin** : mot de passe long et unique, adresse gardée privée. La double authentification n'est pas encore en place (à demander si besoin).
- **Sauvegardes** : gardez-les actives sur la base Render et testez une restauration.
- **Surveillance** : consultez les **Logs** de Render et de Vercel, et la page Webhooks de Stripe. Un paiement réussi sans billet doit déclencher une vérification immédiate. Une commande « payée mais non validable » est signalée dans les journaux par « traitement manuel requis » : remboursez le client.

### Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| Le service Render ne démarre pas | Configuration incomplète (blocage volontaire) | Onglet **Logs** : la liste des variables manquantes y figure ; corrigez, puis **Manual Deploy** |
| `/api/health` renvoie une erreur 503 | Base de données injoignable | Vérifiez `DATABASE_URL` (adresse **interne** sur Render, même région) |
| Le site (Vercel) ne se connecte pas à la base | Adresse externe sans SSL, ou accès externe refusé | Ajoutez `?sslmode=require` ; vérifiez la liste d'adresses autorisées de la base |
| Erreurs « too many connections » | Trop d'exécutions simultanées sur Vercel | `connection_limit=1`, base plus grande ou pool de connexions |
| Paiement réussi, pas de billet | Webhook Stripe mal placé | L'URL doit être `https://api.monentreprise.fr/api/webhooks/stripe`, avec le bon `whsec_…` sur **Render et Vercel** |
| Confirmer un virement échoue | `INTERNAL_API_SECRET` différent ou `WEB_INTERNAL_URL` erroné | Même secret partout ; `WEB_INTERNAL_URL=https://api.monentreprise.fr` ; Redeploy |
| `api.monentreprise.fr` n'ouvre pas | DNS ou domaine non vérifié sur Render | Vérifiez le `CNAME` `api`, cliquez **Verify**, patientez |
| `https://api…/` affiche une page du site au lieu de rediriger | Le nom du sous-domaine n'est pas `api` | Utilisez exactement `api.` comme préfixe |
| Premier appel très lent sur Render | Service en offre gratuite (il s'endort) | Passez en **Starter** ou supérieur |

### Variante : tout sur Render
Il est possible d'héberger aussi le site et l'admin sur Render (deux services web, même `Dockerfile`, une valeur différente pour l'application construite). Ce guide ne détaille pas cette variante ; `DEPLOIEMENT.md` décrit l'équivalent sur un serveur privé avec Docker.
