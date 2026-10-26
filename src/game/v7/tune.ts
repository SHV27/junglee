/** Every number of the cursed game in one place. The sim gate (scripts/sim7.ts) tunes these against GDD-v7 §2. */
export const TUNE = {
  hearts: 3,
  /** The first `protect` turns of the match: a lost duel costs the card, never a heart (owner #53 "protected start"). */
  protect: 8,
  startDeck: 5,
  maxItems: 3,
  /**
   * THE JUNGLE METER (Jumanji's doom track): one notch per turn, whoever plays it, so 2 and 4 players reach the storm at the same
   * minute. Every notch makes every creature this much stronger on every stat (owner #67 "the jungle grows angrier").
   */
  angerStep: 1.5,
  /** The anger never passes this (Chief v7 storm gate: a storm duel stays winnable, ≥ 25% with no item). */
  angerCap: 18,
  /** A standoff leaves the creature on its space, this much stronger on every stat (owner #49). */
  grow: 8,
  /** Meter notches that trigger a huge table flip (owner #14 "rare but huge"); the omen shows `omenAhead` notches before. */
  flipAt: [7, 14] as readonly number[],
  omenAhead: 3,
  /** The meter is full: the final storm (every landing without a creature wakes one, owner #67). */
  stormAt: 20,
  /** Fewer players need fewer knockouts, so their meter is longer (every table size lands in 10–15 minutes). */
  stormBySeats: { 2: 26, 3: 22, 4: 20 } as Readonly<Record<number, number>>,
  /** A safety net: the game always ends. */
  maxTurns: 70,
  /** The creature picks its own best stat this often, else one of the others (so its pick is guessable but not certain). */
  creatureBest: 0.5,
  /** Map content: of the non-start spaces. */
  lairs: 13,
  items: 4,
  /** Underdog luck: the lone last-place player draws a chaos card this often instead of the fate deck. */
  underdog: 0.4,
  /** How far a creature sent by the jungle walks. */
  hunt: 3,
};
