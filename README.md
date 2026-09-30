# 🏎️💘 Pit Crush — l'anniversaire d'Oana

Une fausse appli de rencontre où Oana répond à 10 questions pour trouver son **activité de pilotage parfaite**. Cinq voitures anonymes font un tour de circuit en direct, et la première à passer la ligne devient son **Match**.
Pendant ce temps, ses amis scannent un QR code, **parient sur une voiture** et **devinent ses réponses** façon Kahoot. Le podium est annoncé à la fin.

URL : **https://anniv.midjix-lab.com** · invités : **/jouer** · régie : **/regie**

---

## 🚀 Déploiement sur le NAS (mise à jour automatique)

```
git push ──► GitHub Actions (tests + build + photos) ──► ghcr.io/midjix/anniv-26-owa:latest
                                                             │
                                  NAS : Watchtower vérifie toutes les 60 s ◄┘ → redémarre le site
```

### 1. Tunnel Cloudflare
Zero Trust → **Networks → Tunnels → Create a tunnel** (Cloudflared) → choisis **Docker** et copie le **jeton**.
Onglet **Public Hostname** : `anniv` . `midjix-lab.com` → Service **HTTP** → `pit-crush:8080`.

### 2. Token GitHub pour le NAS (si le dépôt est privé)
GitHub → Settings → Developer settings → **Personal access tokens (classic)** → scope **`read:packages` uniquement**.

### 3. Coller le compose
Copie [`deploy/docker-compose.nas.yml`](deploy/docker-compose.nas.yml) dans l'appli Docker du NAS (Projet → Créer), remplis les 3 valeurs `<<< A REMPLIR >>>` et lance.

C'est tout : chaque `git push` sur `main` met le site à jour en ~5 minutes (le temps du build GitHub + 60 s max).
Suivi : onglet **Actions** du dépôt, et `docker logs anniv-oana-watchtower` sur le NAS.

> Alternative sans GHCR : `git clone` + `.env` + `docker compose up -d --build` avec le `docker-compose.yml` à la racine (build local, pas de mise à jour auto).

---

## 🎮 Le jour J : check-list

1. **La veille** : ouvre `/regie`, fais une partie de test avec 2 téléphones, puis **« Remise à zéro complète »**.
2. Donne le téléphone à Oana sur `https://anniv.midjix-lab.com`. Elle se connecte avec **son prénom + son âge (26)**.
3. Elle voit le QR code : les amis le scannent, choisissent un pseudo et parient.
4. Elle lance la course : départ aux feux F1, 10 questions, révélations, le Match 💘, puis le podium 🏆.

**En cas de pépin :**
| Problème | Solution |
|---|---|
| Oana est bloquée (« déjà connectée sur un autre téléphone ») | `/regie` → **Libérer le profil d'Oana** |
| Un pseudo gênant | `/regie` → **retirer** |
| Le NAS redémarre | Rien à faire : la partie reprend où elle en était |
| Elle veut refaire le test | Bouton **« Refaire le test »** après le Match (le résultat précédent est archivé dans `/regie`) |

---

## 🧠 Comment le cadeau est choisi

- Chaque réponse d'Oana donne **5 points** en secret aux activités qui lui correspondent (`server/content.js`).
- Les poids ont été **optimisés sur les 1 048 576 combinaisons de réponses possibles** : chaque activité a **20 % ± 1** de chances de gagner si on répond au hasard, et chacune gagne nettement si Oana répond dans son sens. C'est vérifié par `npm test`.
- L'association voiture ↔ activité est **tirée au sort à chaque partie** et ne quitte jamais le serveur. Même en fouillant le code source, impossible de savoir quelle voiture cache quoi.
- **Aucun prix** n'existe nulle part dans le projet (un test le vérifie).
- En cas d'**égalité** : photo-finish, le public vote à titre indicatif et **c'est Oana qui choisit**.

### Points des invités
- Bonne réponse : **500 à 1 000 pts** selon la rapidité (fenêtre de 20 s).
- Question n°7 🍀 (son chiffre préféré) : **points doublés**.
- Pari sur la voiture gagnante : **+2 777 pts**.

---

## 🔒 Sécurité

- **Aucun port ouvert** sur le NAS : l'app est sur un réseau Docker `internal` sans internet. Seul le conteneur `cloudflared` sort.
- Conteneurs **non-root**, système de fichiers **en lecture seule**, `cap_drop: ALL`, `no-new-privileges`, limites mémoire et processus.
- **Une seule dépendance** npm (`qrcode-generator`, sans sous-dépendance, version figée + lockfile). Aucun framework.
- Sessions en cookie `HttpOnly` + `SameSite=Strict` + `Secure`. Les jetons sont stockés hachés (SHA-256).
- Contrôle d'**Origin** (anti-CSRF), **limitation de débit** (connexion, régie, actions), corps JSON limité à 4 Ko.
- **CSP stricte** (`script-src 'self'`, aucun script externe, polices auto-hébergées), `X-Frame-Options: DENY`, `nosniff`, `no-referrer`.
- Aucune injection possible : le front n'utilise jamais `innerHTML`.
- Le profil d'Oana se **verrouille sur le premier téléphone** connecté (ses amis connaissent son âge 😉).
- Photos servies **uniquement après le Match**, et seulement celles de l'activité gagnante.

---

## ✏️ Personnaliser

| Quoi | Où |
|---|---|
| Questions, réponses, poids | `server/content.js` → `QUESTIONS` (relance `npm test` pour vérifier l'équilibre) |
| Textes des activités | `server/content.js` → `ACTIVITIES` |
| Message d'anniversaire | `server/content.js` → `BIRTHDAY` |
| Tes propres photos | dépose `f4-1.jpg`, `spa-2.jpg`… dans `photos/`, puis commit + push |

## 🛠️ Développement local
```bash
npm install
npm run dev      # http://localhost:8080 (âge de test : 27, régie : dev-password-123)
npm test
```

Architecture : `server/` (Node 22, HTTP natif + Server-Sent Events), `public/` (HTML/CSS/JS vanilla, sans build).
