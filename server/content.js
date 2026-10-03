'use strict';
/*
 * Contenu du jeu : activités (secrètes) + questionnaire.
 *
 * ⚠️ Ce fichier ne quitte JAMAIS le serveur. Le navigateur ne reçoit que
 *    le texte des questions/réponses, jamais les poids ni les activités
 *    (sauf l'activité gagnante, au moment du Match).
 * ⚠️ Aucun prix n'est stocké ici, volontairement.
 *
 * Identifiants d'activités :
 *   gt       → Voiture sportive sur circuit (Mettet)
 *   rallye   → Rallye sur terre (Issoire)
 *   meteo    → Conduite en conditions difficiles (RACB)
 *   spa      → Porsche sur le circuit de Spa-Francorchamps (RACB)
 *   f4       → Formule 4 au Nürburgring
 */

const ACTIVITIES = {
  gt: {
    name: 'Stage de pilotage en voiture de sport',
    tagline: 'Supercar & circuit Jules Tacheny',
    place: 'Circuit Jules Tacheny, Mettet (Namur, Belgique)',
    bio: 'Élégante, puissante, et je fais tourner les têtes. On se voit sur la ligne droite ?',
    description: [
      'Briefing avec un moniteur, casque sur la tête, puis tu prends le volant d’une vraie sportive : Porsche, Ferrari, Lamborghini, McLaren, Audi R8…',
      'Tu enchaînes les tours du circuit de Mettet avec ton moniteur à côté. Il te donne les trajectoires, les points de freinage et le bon moment pour remettre les gaz.',
    ],
    facts: ['Au volant', 'GT & supercars', 'Moniteur à tes côtés', '≈ 1h de Bruxelles'],
    photos: ['gt-1', 'gt-2', 'gt-3'],
  },
  rallye: {
    name: 'Stage de pilotage rallye sur terre',
    tagline: 'Dérapages en Golf, DS3-R ou Lancer Evo',
    place: 'Circuit terre d’Issoire (Puy-de-Dôme, Auvergne)',
    bio: 'Un peu sauvage, j’adore la terre et les dérapages. Avec moi, tu vas te salir… et adorer ça.',
    description: [
      'Tu prends le volant d’une vraie voiture de rallye (Golf Groupe N, DS3-R ou Mitsubishi Lancer Evo) sur la piste terre d’Issoire, au pied des volcans d’Auvergne.',
      'Au programme : mise en dérive, transferts de charge, demi-tour au frein à main… puis une mini spéciale chronométrée pour tout mettre en pratique.',
    ],
    facts: ['Au volant', 'Piste terre', 'Dérapage & frein à main', 'De mars à octobre'],
    photos: ['rallye-1', 'rallye-2', 'rallye-3'],
  },
  meteo: {
    name: 'Stage de conduite en conditions difficiles',
    tagline: 'Pluie, verglas & perte d’adhérence maîtrisée',
    place: 'Centre RACB : Nivelles ou Francorchamps (Belgique)',
    bio: 'Je garde mon calme quand tout glisse. Pluie, verglas, freinage d’urgence : avec moi, tu ne perds jamais le contrôle.',
    description: [
      'Une journée complète sur des pistes spéciales qui recréent les pires conditions : sol détrempé, plaques de verglas, virages glissants.',
      'Freinages d’urgence avec évitement d’obstacles, rattrapage de glisse, bonne utilisation de l’ABS et de l’ESP. Tu repars avec des réflexes pour la vie… et un sourire jusqu’aux oreilles.',
    ],
    facts: ['Au volant', 'Journée complète', 'Glisse & verglas', 'Encadré par le RACB'],
    photos: ['meteo-1', 'meteo-2', 'meteo-3'],
  },
  spa: {
    name: 'Stage de pilotage sur le circuit de Spa-Francorchamps',
    tagline: 'Porsche 718 Sport Cup sur un circuit de légende',
    place: 'Circuit de Spa-Francorchamps (Belgique)',
    bio: 'Légendaire, exigeante, un peu perfectionniste. Eau Rouge, Raidillon… tu connais déjà mon nom.',
    description: [
      'Une demi-journée au volant d’une Porsche 718 Sport Cup sur le circuit du Grand Prix de Belgique de F1, encadrée par un pilote-instructeur du Royal Automobile Club de Belgique.',
      'La voiture est équipée de télémétrie et de caméras. Après chaque session, tu compares tes données à celles de ton instructeur, comme une vraie pilote d’usine.',
    ],
    facts: ['Au volant', 'Circuit de F1', 'Télémétrie & vidéo', 'Demi-journée'],
    photos: ['spa-1', 'spa-2', 'spa-3'],
  },
  f4: {
    name: 'Stage de pilotage en Formule 4',
    tagline: 'Monoplace sur le Grand Prix du Nürburgring',
    place: 'Nürburgring, circuit Grand Prix (Allemagne)',
    bio: 'Légère, rapide, sans toit et sans compromis. Si tu rêves de F1, c’est moi qu’il te faut.',
    description: [
      'Tu t’installes dans le baquet d’une vraie monoplace de Formule 4 (à peine 500 kg), la catégorie par laquelle passent les futurs pilotes de F1.',
      'Encadrée par des instructeurs pros, tu apprends à dompter la bête sur le tracé Grand Prix du Nürburgring, un des circuits les plus célèbres du monde.',
    ],
    facts: ['Au volant', 'Monoplace F4', 'Circuit Grand Prix', 'Boîte manuelle 😉'],
    photos: ['f4-1', 'f4-2', 'f4-3'],
  },
};

const ACTIVITY_IDS = Object.keys(ACTIVITIES);

/*
 * Chaque réponse distribue exactement 5 points entre les activités.
 * Les poids ont été optimisés sur les 4^10 = 1 048 576 combinaisons de
 * réponses possibles. La neutralité est vérifiée par `npm test` :
 *   - chaque activité peut gagner nettement si on la vise ;
 *   - toutes réponses confondues, chaque activité gagne 20 % ± 1 du temps.
 * Si tu modifies une question, relance `npm test` pour vérifier l'équilibre.
 */
const QUESTIONS = [
  {
    text: 'Ton premier rendez-vous idéal ?',
    options: [
      { text: 'Rooftop chic, coupe de champagne, tenue de soirée exigée', w: { gt: 3, spa: 2 } },
      { text: 'Une rando qui finit trempés dans la boue… en riant', w: { rallye: 3, meteo: 2 } },
      { text: 'Canapé, pizza et un Grand Prix qu’on commente comme des experts', w: { spa: 2, f4: 3 } },
      { text: 'Un atelier où on apprend un vrai truc utile, ensemble', w: { rallye: 1, meteo: 3, f4: 1 } },
    ],
  },
  {
    text: 'Ta photo de profil principale, c’est…',
    options: [
      { text: 'Moi, lunettes de soleil, devant une voiture qui fait rêver', w: { gt: 4, spa: 1 } },
      { text: 'Moi couverte de boue, grand sourire', w: { rallye: 4, meteo: 1 } },
      { text: 'Moi, casque sous le bras, regard de championne', w: { spa: 2, f4: 3 } },
      { text: 'Moi sous la pluie, parapluie retourné, toujours debout', w: { rallye: 1, meteo: 4 } },
    ],
  },
  {
    text: 'Ce qui te fait craquer chez quelqu’un ?',
    options: [
      { text: 'Du caractère, de la puissance… et qu’il ose le montrer', w: { gt: 3, f4: 2 } },
      { text: 'Un côté imprévisible, un peu sauvage', w: { gt: 1, rallye: 3, meteo: 1 } },
      { text: 'La précision : il analyse tout, jusqu’au moindre détail', w: { meteo: 1, spa: 3, f4: 1 } },
      { text: 'Il garde son sang-froid quand tout part en vrille', w: { meteo: 3, spa: 2 } },
    ],
  },
  {
    text: 'Le week-end en amoureux parfait ?',
    options: [
      { text: 'Les Ardennes : forêts, virages et bières belges', w: { meteo: 2, spa: 3 } },
      { text: 'Road-trip au cœur des volcans d’Auvergne', w: { gt: 1, rallye: 4 } },
      { text: 'L’Allemagne et ses autoroutes… sans limite', w: { spa: 1, f4: 4 } },
      { text: 'Pas trop loin, pas compliqué, mais qui en jette', w: { gt: 4, meteo: 1 } },
    ],
  },
  {
    text: 'En amour, ton rapport à la vitesse ?',
    options: [
      { text: 'Coup de foudre, on emménage ensemble la première semaine', w: { gt: 2, f4: 3 } },
      { text: 'On accélère fort, mais on sait freiner au bon moment', w: { gt: 1, spa: 3, f4: 1 } },
      { text: 'Ça glisse, ça dérape… mais on retombe toujours sur nos pattes', w: { rallye: 3, meteo: 2 } },
      { text: 'Patience absolue… comme pour trouver une place au parking du Janson un samedi', w: { meteo: 4, spa: 1 } },
    ],
  },
  {
    text: 'Ton red flag absolu ?',
    options: [
      { text: 'Il met 10 minutes à faire un créneau à Ixelles (la reine, c’est moi 👑)', w: { gt: 3, f4: 2 } },
      { text: 'Il a peur de salir ses baskets', w: { rallye: 4, meteo: 1 } },
      { text: 'Il ne sait pas qui est champion du monde de F1', w: { spa: 2, f4: 3 } },
      { text: 'Il panique à la première goutte de pluie', w: { rallye: 1, meteo: 3, spa: 1 } },
    ],
  },
  {
    // 7 : le chiffre préféré d'Oana → points doublés pour les invités
    lucky: true,
    text: 'Qu’est-ce qui te donne vraiment des papillons dans le ventre ?',
    options: [
      { text: 'La poussée dans le dos quand ça accélère fort', w: { gt: 2, f4: 3 } },
      { text: 'Sentir l’arrière qui décroche… et le rattraper', w: { rallye: 3, meteo: 2 } },
      { text: 'Un lieu chargé d’histoire, où des légendes sont passées', w: { spa: 4, f4: 1 } },
      { text: 'Le rugissement d’un gros moteur au démarrage', w: { gt: 4, rallye: 1 } },
    ],
  },
  {
    text: 'En voiture, tu es plutôt…',
    options: [
      { text: 'Seule aux commandes, dans un cockpit taillé pour moi', w: { spa: 1, f4: 4 } },
      { text: 'Au volant d’un bolide qui fait tourner toutes les têtes', w: { gt: 4, spa: 1 } },
      { text: 'Au volant, avec un coach qui me débriefe comme une pro', w: { meteo: 2, spa: 3 } },
      { text: 'Au volant, jamais passagère (on connaît ton estomac 🤢)', w: { rallye: 3, meteo: 2 } },
    ],
  },
  {
    text: 'Dans une dispute de couple, tu es…',
    options: [
      { text: 'Celle qui sort les chiffres, les preuves et les captures d’écran', w: { meteo: 1, spa: 3, f4: 1 } },
      { text: 'Rapide et directe : droit au but, sans détour', w: { gt: 2, f4: 3 } },
      { text: 'Zen : je m’adapte, je garde le contrôle', w: { meteo: 4, spa: 1 } },
      { text: 'Je pars en dérapage… mais toujours contrôlé', w: { gt: 1, rallye: 4 } },
    ],
  },
  {
    text: 'Dans 10 ans, on racontera de toi…',
    options: [
      { text: '« Elle a piloté comme en F1, la vraie »', w: { spa: 1, f4: 4 } },
      { text: '« Elle a dompté un des circuits les plus mythiques du monde »', w: { gt: 1, spa: 4 } },
      { text: '« Elle a fait hurler les plus belles voitures du monde »', w: { gt: 3, rallye: 1, spa: 1 } },
      { text: '« Rien ne l’arrête : ni la boue, ni le verglas, ni un déménagement Bruxelles–Lux avec Thor en copilote 🐶 »', w: { rallye: 3, meteo: 2 } },
    ],
  },
];

/* Message affiché avec le Match (modifiable librement). */
const BIRTHDAY = {
  title: 'La mulți ani, Oana !',
  text: 'Joyeux anniversaire ❤️ Ton match est trouvé, il ne reste plus qu’à attacher ta ceinture. Bonne route, pilote ! (Thor te souhaite aussi un joyeux anniversaire 🐶)',
};

module.exports = { ACTIVITIES, ACTIVITY_IDS, QUESTIONS, BIRTHDAY };
