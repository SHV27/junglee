/**
 * Every card in the cursed game: the creatures (they are both the beasts on the board and the cards in your deck), the heroes,
 * their powers, the fate cards and the table flips. The owner's answers 2026-10-26 (BIBLE #44 onward) decide everything here:
 * absurd but guessable stats MIGHT · SPEED · BRAINS · WEIRD; a mix of myths, real animals and absurd things; scary, dramatic lines.
 */
export const STATS = ['MIGHT', 'SPEED', 'BRAINS', 'WEIRD'] as const;
export type Stat = 0 | 1 | 2 | 3;
export type Tier = 1 | 2 | 3;
export type Grunt =
  'roar' | 'hiss' | 'chomp' | 'stomp' | 'bark' | 'coo' | 'rumble' | 'bones' | 'wave' | 'dragon' | 'suck';

export interface Card {
  id: string;
  name: string;
  /** MIGHT, SPEED, BRAINS, WEIRD (1–100). They must be guessable from the name and the picture: a sloth is slow. */
  stats: readonly [number, number, number, number];
  tier: Tier;
  /** What it says when it bursts out (subtitle under its grunt): scary and dramatic, ≤ 6 words. */
  line: string;
  /** What it says when you lose a heart to it (dread in, laugh out): 6 words or fewer. */
  gloat: string;
  grunt: Grunt;
}

const c = (
  id: string,
  name: string,
  stats: [number, number, number, number],
  tier: Tier,
  grunt: Grunt,
  line: string,
  gloat = '',
): Card => ({ id, name, stats, tier, grunt, line, gloat });

/** The id is also the 3D/2D body id. */
export const CARDS: readonly Card[] = [
  // Tier 1: small and strange. Starter decks are dealt from here.
  c('dodo', 'Dodo', [12, 18, 8, 88], 1, 'coo', 'Extinct. Yet here I stand.', 'Extinct? You first.'),
  c('pigeon', 'City Pigeon', [10, 58, 30, 72], 1, 'coo', 'I have watched you. Always.', 'I will tell the others.'),
  c('cat', 'Black Cat', [22, 74, 62, 77], 1, 'hiss', 'Cross my path. I dare you.', 'Nine lives. You have three.'),
  c('shiba', 'Wild Dog', [38, 72, 40, 28], 1, 'bark', 'We heard you. Miles ago.', 'Run. We enjoy chasing.'),
  c('redpanda', 'Red Panda', [16, 42, 48, 64], 1, 'hiss', 'Do not call me cute.', 'Still think I am cute?'),
  c('tourist', 'Lost Tourist', [22, 26, 34, 90], 1, 'coo', 'Is this the way out?', 'Mind if I take a photo?'),
  c('grandmother', 'Grandmother', [30, 14, 93, 68], 1, 'bones', 'Sit. Eat. Never leave.', 'You did not finish your plate.'),
  c('cowboy', 'Lost Cowboy', [52, 46, 38, 46], 1, 'stomp', 'This jungle is far too small.', 'Told you. Not big enough.'),
  c('kappa', 'Kappa', [46, 40, 56, 82], 1, 'wave', 'The river keeps what falls.', 'Next time, bow.'),
  c('tanuki', 'Tanuki', [34, 46, 60, 91], 1, 'hiss', 'Nothing here is what it seems.', 'You lost to a raccoon dog.'),
  c('falcon', 'Falcon', [26, 99, 46, 18], 1, 'coo', 'From the sky, I choose.', 'I saw that from up here.'),
  c('cheetah', 'Cheetah', [56, 98, 34, 14], 1, 'roar', 'You will never outrun me.', 'I was not even trying.'),
  c('croc', 'Gharial', [72, 34, 24, 56], 1, 'chomp', 'The water is not empty.', 'The water thanks you.'),
  c('crew', 'Skeleton Crew', [42, 36, 14, 72], 1, 'bones', 'Join the crew. Forever.', 'Welcome aboard. Forever.'),
  c('raptor', 'Raptor Pack', [56, 86, 72, 24], 1, 'hiss', 'You saw one. We are six.', 'We counted. You were one.'),
  // Tier 2: the jungle's middle.
  c('lion', 'Lion', [82, 76, 44, 22], 2, 'roar', 'This land answers to me.', 'Bow to the king.'),
  c('mummy', 'Mummy', [62, 9, 52, 86], 2, 'bones', 'Three thousand years. Still hungry.', 'Wrapped. Like a gift.'),
  c('medusa', 'Medusa', [40, 32, 82, 92], 2, 'hiss', 'Look at me. Just once.', 'Hold that pose. Forever.'),
  c('minotaur', 'Minotaur', [90, 52, 28, 52], 2, 'stomp', 'No one leaves the maze.', 'Left, left, then never.'),
  c('chupacabra', 'Chupacabra', [52, 82, 40, 84], 2, 'hiss', 'The goats were only practice.', 'Better than goats.'),
  c('harpies', 'Harpies', [44, 87, 34, 72], 2, 'coo', 'We take. We always take.', 'Mine now. All of it.'),
  c('cerberus', 'Cerberus', [84, 70, 30, 76], 2, 'bark', 'Three heads. Zero mercy.', 'Good boy. Good boy. Good boy.'),
  c('sphinx', 'Sphinx', [52, 38, 99, 72], 2, 'rumble', 'Answer wrong. Become dinner.', 'Wrong answer. Delicious.'),
  c('yeti', 'Yeti', [86, 40, 36, 66], 2, 'roar', 'The cold brought me here.', 'Chill. It is only one heart.'),
  c('bigfoot', 'Bigfoot', [80, 56, 42, 82], 2, 'stomp', 'No photo will survive this.', 'Blurry. Like your chances.'),
  c('troll', 'Bridge Troll', [93, 18, 12, 56], 2, 'stomp', 'Pay the toll. In bones.', 'Toll paid. In full.'),
  c('griffin', 'Griffin', [76, 90, 50, 56], 2, 'roar', 'Half eagle. All fury.', 'The sky sends regards.'),
  c('badger', 'Honey Badger', [62, 58, 44, 88], 2, 'hiss', 'I fear nothing. Especially you.', 'Did not care. Still do not.'),
  c('dutchman', 'Ghost Captain', [60, 50, 66, 93], 2, 'wave', 'My ship sails without wind.', 'The tide keeps its debts.'),
  c('ambush', 'Pirate Ambush', [66, 56, 50, 44], 2, 'stomp', 'Your gold. Your boots. Now.', 'Thank you for the boots.'),
  c('gorilla', 'Silverback', [90, 52, 64, 30], 2, 'roar', 'This is my mountain.', 'Sit down. Stay down.'),
  c('yali', 'Yali', [84, 66, 58, 70], 2, 'roar', 'I guard the temple door.', 'The temple keeps its door.'),
  // Tier 3: the cursed game's monsters.
  c('trex', 'T-Rex', [99, 62, 20, 40], 3, 'roar', 'The ground shakes. Then you.', 'Small. Crunchy. Next.'),
  c('mammoth', 'Woolly Mammoth', [97, 36, 52, 30], 3, 'stomp', 'The ice age never ended.', 'Flattened. Like the ice age.'),
  c('dragon', 'Dragon', [95, 80, 76, 70], 3, 'dragon', 'Kneel. Or become ash.', 'Medium rare.'),
  c('kraken', 'Kraken', [98, 44, 70, 86], 3, 'wave', 'I am why sailors pray.', 'The deep thanks you.'),
  c('hydra', 'Hydra', [90, 40, 46, 88], 3, 'hiss', 'Cut one. Two will come.', 'That was one head.'),
  c('rhino', 'Rhino Stampede', [96, 64, 18, 38], 3, 'stomp', 'The ground starts to shake.', 'Trampled. Nothing personal.'),
  c('fenrir', 'Fenrir', [92, 88, 56, 60], 3, 'roar', 'I will swallow the sun.', 'The sun is next.'),
  c('megalodon', 'Megalodon', [98, 82, 18, 52], 3, 'chomp', 'Your boat looks like a snack.', 'Your boat looked like lunch.'),
  c('nessie', 'Loch Ness Monster', [72, 30, 84, 99], 3, 'wave', 'Nobody believes you anyway.', 'No photo. No proof.'),
  c('phoenix', 'Phoenix', [60, 92, 72, 96], 3, 'dragon', 'I die. I return. Again.', 'I will remember this. Twice.'),
  c('serpent', 'World Serpent', [99, 28, 42, 92], 3, 'hiss', 'I am where maps end.', 'Around the world. Around you.'),
  c('giant', 'Stone Giant', [100, 18, 8, 52], 3, 'rumble', 'That mountain was my pillow.', 'A pebble. Barely noticed.'),
  c('roc', 'The Roc', [93, 86, 40, 62], 3, 'dragon', 'My shadow swallows whole villages.', 'You looked like a worm.'),
  c('blackhole', 'Black Hole', [100, 1, 1, 100], 3, 'suck', 'Everything ends inside me.', 'Nothing personal. Just gravity.'),
];

export const CARD: Readonly<Record<string, Card>> = Object.fromEntries(CARDS.map((x) => [x.id, x]));

/** The card you fight with when your deck is empty. */
export const BARE_HANDS: Card = c('hands', 'Bare Hands', [10, 10, 10, 10], 1, 'stomp', 'Just you now.', '');

/** Heroes: classic adventurers (owner #72), dealt by luck (owner #38). */
export const HEROES = ['Explorer', 'Hunter', 'Pilot', 'Scientist'] as const;
export type Hero = (typeof HEROES)[number];

/** Hero powers: dealt by luck, re-dealt at every table flip (owner #51). */
export type Power = 'might' | 'speed' | 'brains' | 'weird' | 'lucky';
export const POWERS: readonly Power[] = ['might', 'speed', 'brains', 'weird', 'lucky'];
export const POWER_TEXT: Readonly<Record<Power, { name: string; text: string }>> = {
  might: { name: 'Iron Grip', text: '+15 MIGHT in every duel' },
  speed: { name: 'Quick Feet', text: '+15 SPEED in every duel' },
  brains: { name: 'Sharp Mind', text: '+15 BRAINS in every duel' },
  weird: { name: 'Strange Aura', text: '+15 WEIRD in every duel' },
  lucky: { name: 'Lucky Charm', text: 'A standoff counts as a win' },
};
export const POWER_BONUS = 15;

/** Items won from creatures and chests (owner #50). */
export type Item = 'peek' | 'redraw' | 'double';
export const ITEMS: readonly Item[] = ['peek', 'redraw', 'double'];
export const ITEM_TEXT: Readonly<Record<Item, { name: string; text: string }>> = {
  peek: { name: 'Peek', text: "See the creature's card" },
  redraw: { name: 'Redraw', text: 'Swap your card for the next' },
  double: { name: 'Double', text: 'Double your stat this duel' },
};

/** Fate cards: draw one each turn and obey (owner #63–64). */
export type Fate =
  | { k: 'move'; n: number; i: number }
  | { k: 'portal' }
  | { k: 'steal' }
  | { k: 'unleash' }
  | { k: 'trap' }
  | { k: 'swap' }
  | { k: 'find' };

/** The move cards, "wild mix" (owner #40): a big numeral for the glance, a little story for the laugh (Chief v7). */
const MOVES: readonly [number, string, string][] = [
  [1, 'The vines grab your ankle.', 'One step. Barely.'],
  [1, 'A Dodo blocks the path.', 'Step around it politely.'],
  [2, 'Monkeys stole your map.', 'Guess. Two steps.'],
  [2, 'Quicksand, only knee-deep.', 'Wade two steps.'],
  [2, 'The rope bridge sways.', 'Two steps. Do not look down.'],
  [2, 'The drums say hurry.', 'Two steps. Now.'],
  [3, 'A tortoise offers a ride.', 'Three steps. Eventually.'],
  [3, 'Your shadow walks ahead.', 'Follow it three steps.'],
  [3, 'A crocodile yawns.', 'Three steps. Do not wait.'],
  [3, 'Fireflies light the way.', 'Three steps into the dark.'],
  [3, 'Something is following you.', 'Three steps. Faster.'],
  [4, 'An ostrich adopts you.', 'Four steps, flapping.'],
  [4, 'The river carries you.', 'Four steps downstream.'],
  [4, 'A ghost points the way.', 'Four steps. Trust it?'],
  [4, 'A cowboy lends his horse.', 'Four steps. Return it.'],
  [5, 'A rhino needs a passenger.', 'Five steps. Hold on.'],
  [5, 'Lightning strikes behind you.', 'Run five steps.'],
  [5, 'A lost tour bus.', 'Push it five steps.'],
  [6, 'The jungle holds its breath.', 'Six glorious steps.'],
  [6, 'The board itself shoves you.', 'Six steps. It has plans.'],
];

export const FATE_DECK: readonly Fate[] = [
  ...MOVES.map(([n], i) => ({ k: 'move', n, i }) as Fate),
  { k: 'portal' },
  { k: 'portal' },
  { k: 'steal' },
  { k: 'steal' },
  { k: 'unleash' },
  { k: 'unleash' },
  { k: 'trap' },
  { k: 'trap' },
  { k: 'swap' },
  { k: 'find' },
];

export function fateText(f: Fate): { title: string; text: string } {
  switch (f.k) {
    case 'move': {
      const m = MOVES[f.i];
      return m ? { title: m[1], text: m[2] } : { title: `Move ${f.n}`, text: `${f.n} steps.` };
    }
    case 'portal':
      return { title: 'The ground opens', text: 'Fall somewhere in the fog.' };
    case 'steal':
      return { title: 'Steal a card', text: 'Take their top card. Walk two.' };
    case 'unleash':
      return { title: 'Unleash a beast', text: 'Choose a friend. It hunts them.' };
    case 'trap':
      return { title: 'Hide a trap', text: 'Leave it here. Walk three.' };
    case 'swap':
      return { title: 'Swap places', text: 'Choose a friend. Trade spots.' };
    case 'find':
      return { title: 'Lucky find', text: 'Take an item. Move 1.' };
  }
}

/** The rare, huge table flips (owner #35 "go wild with this one"; #55 drums + a Jumanji verse). Each also re-deals powers. */
export type FlipKind = 'shift' | 'decks' | 'wake';
export const FLIPS: Readonly<Record<FlipKind, { name: string; verse: [string, string]; text: string }>> = {
  shift: {
    name: 'The Board Shifts',
    verse: ['The ground will tremble, paths will bend,', 'and nobody stands where they stood, my friend.'],
    text: 'Everyone thrown. The fog returns.',
  },
  decks: {
    name: 'The Decks Swap',
    verse: ['What you held is no longer yours,', 'pass your fortune through the jungle doors.'],
    text: 'Every deck passes left.',
  },
  wake: {
    name: 'The Jungle Wakes',
    verse: ['Each sleeping beast now lifts its head,', 'and sniffs the air for you instead.'],
    text: 'Every beast wakes and hunts.',
  },
};

/** The opening (a big moment, owner #58): an original verse, read before the first fate card. */
export const OPEN_VERSE: [string, string] = ['All who open this cursed game', 'will not leave it quite the same.'];

export const STORM_VERSE: [string, string] = ['The sky goes black, the drums beat fast,', 'and every landing may be your last.'];
