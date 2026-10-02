'use strict';
/*
 * Contenu du MODE TEST (activable depuis /regie).
 * Sert à faire tester le site par des invités sans dévoiler les vraies
 * questions ni les vraies activités. Les poids sont recopiés des vraies
 * questions (même index) : l'équilibre entre voitures est donc identique.
 */
const REAL = require('./content');

const ACTIVITIES = {
  gt: {
    name: 'Grand Prix de caddies de supermarché',
    tagline: 'Rayon frais, virage serré',
    place: 'Parking d’un hypermarché (lieu tenu secret)',
    bio: 'Quatre roues qui ne vont jamais droit, mais quel charisme.',
    description: [
      'Une course de caddies sur le parking désert, un dimanche matin, avec un ami qui pousse et toi qui pilotes.',
      'Attention au virage du rayon surgelés : il ne pardonne pas.',
    ],
    facts: ['Activité TEST', '0 cheval', 'Casque conseillé'],
    photos: [],
  },
  rallye: {
    name: 'Rallye de tondeuses à gazon',
    tagline: 'Le gazon ne s’en remettra pas',
    place: 'Le jardin de mamie',
    bio: 'Bruyante, verte et têtue. J’adore les dérapages dans l’herbe mouillée.',
    description: [
      'Une spéciale chronométrée entre les massifs de fleurs. Les nains de jardin servent de chicanes.',
      'Le vainqueur gagne le droit de tondre la pelouse tout l’été.',
    ],
    facts: ['Activité TEST', 'Tout-terrain', 'Odeur d’herbe coupée'],
    photos: [],
  },
  meteo: {
    name: 'Stage de pilotage de trottinette sous la pluie',
    tagline: 'Flaques, feuilles mortes et sang-froid',
    place: 'Une piste cyclable bretonne',
    bio: 'Je garde l’équilibre quand tout glisse. Même sur les plaques d’égout.',
    description: [
      'Trois heures de trottinette électrique sous une averse continue. K-way fourni.',
      'Exercice final : freinage d’urgence devant un pigeon distrait.',
    ],
    facts: ['Activité TEST', 'Imperméable obligatoire', '25 km/h max'],
    photos: [],
  },
  spa: {
    name: 'Tour de circuit en voiture à pédales',
    tagline: 'Légendaire, mais à la force des mollets',
    place: 'Le salon, entre le canapé et la table basse',
    bio: 'Vintage, exigeante et un peu lente. Mais quel style !',
    description: [
      'Une voiture à pédales rouge des années 80, un circuit tracé au scotch sur le parquet.',
      'Télémétrie assurée par le chat, qui observe tout depuis le canapé.',
    ],
    facts: ['Activité TEST', 'Propulsion humaine', 'Taille enfant'],
    photos: [],
  },
  f4: {
    name: 'Course de voitures-tamponneuses',
    tagline: 'Monoplace, pare-chocs intégral',
    place: 'Fête foraine du village',
    bio: 'Je fonce, je percute, je m’excuse. Si tu aimes les contacts, c’est moi.',
    description: [
      'Trois tours de piste aux autos-tamponneuses, musique des années 2000 à fond.',
      'Le jeton est offert, les bleus aussi.',
    ],
    facts: ['Activité TEST', 'Contact autorisé', 'Barbe à papa incluse'],
    photos: [],
  },
};

const TEXTS = [
  ['Ton petit-déjeuner idéal ?', ['Croissant et café en terrasse', 'Restes de pizza de la veille', 'Pancakes maison, beaucoup trop de sirop', 'Rien, je dors jusqu’à midi']],
  ['Ton animal totem ?', ['Le guépard', 'Le sanglier', 'Le paresseux', 'Le pingouin sous la pluie']],
  ['Ta playlist en voiture ?', ['Rock à fond, fenêtres ouvertes', 'Podcast de faits divers', 'Les années 2000, sans honte', 'Le silence, pour se concentrer']],
  ['Tes vacances rêvées ?', ['Week-end à la mer du Nord', 'Camping sauvage en montagne', 'Road-trip en Allemagne', 'Palace à Monaco']],
  ['Au karaoké, tu chantes…', ['Un tube que tout le monde connaît', 'Une ballade qui fait pleurer', 'Du rap, sans jamais louper un mot', 'Rien : je filme les autres']],
  ['Ton super-pouvoir ?', ['Voler', 'Devenir invisible', 'Lire dans les pensées', 'Ne jamais avoir froid']],
  ['Ce qui te fait vraiment rire ?', ['Les vidéos de chats', 'Les chutes ratées', 'Les jeux de mots nuls', 'Les fous rires nerveux en réunion']],
  ['Au restaurant, tu choisis…', ['Le plat le plus cher', 'La même chose que d’habitude', 'Le plat que personne ne connaît', 'Ce que prend la personne d’à côté']],
  ['Face à une araignée, tu…', ['Fais une analyse scientifique', 'Cours très vite', 'Restes zen et la sors dehors', 'Déménages']],
  ['Dans 10 ans, tu seras…', ['Riche et célèbre', 'En train de faire le tour du monde', 'Entourée de chats', 'Toujours en retard']],
];

const QUESTIONS = TEXTS.map(([text, opts], i) => ({
  ...(REAL.QUESTIONS[i].lucky ? { lucky: true } : {}),
  text,
  options: opts.map((t, j) => ({ text: t, w: REAL.QUESTIONS[i].options[j].w })),
}));

const BIRTHDAY = {
  title: 'Mode test terminé !',
  text: 'Merci d’avoir testé 🙏 Ceci n’était qu’une répétition : les vraies questions et les vrais cadeaux restent secrets jusqu’au grand jour. Chut 🤫',
};

module.exports = { ACTIVITIES, ACTIVITY_IDS: REAL.ACTIVITY_IDS, QUESTIONS, BIRTHDAY };
