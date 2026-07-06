import { sql } from "@vercel/postgres";

export type Chicken = { id: number; slot: number; name: string; photoUrl: string | null };
export type Race = { race: number; name: string; description: string };
export type EventRecord = {
  id: number;
  code: string;
  name: string;
  adminCode?: string;
  bettingCloseAt: string;
  officialRule: string;
};
export type Bet = {
  id: number;
  bettor: string;
  betType: BetType;
  stake: number;
  race: number | null;
  chicken1: number | null;
  chicken2: number | null;
  chicken3: number | null;
  picks: number[];
  createdAt: string;
};
export type Results = Record<number, number>;
export type EventPayload = {
  event: EventRecord;
  chickens: Chicken[];
  races: Race[];
  bets: Bet[];
  results: Results;
  settlement: Settlement | null;
};
export type BetType = "race_winner" | "sweep" | "exact_ticket" | "any_win" | "any_order_three";
export type Settlement = {
  tickets: Array<Bet & { won: boolean; weight: number; payoutWeight: number; payout: number; net: number; result: string; label: string }>;
  people: Array<{ bettor: string; staked: number; payout: number; net: number }>;
  payments: Array<{ from: string; to: string; amount: number }>;
};

export const BET_TYPES: Record<BetType, string> = {
  race_winner: "Single-race winner",
  sweep: "Same chicken wins every race",
  exact_ticket: "Exact winners for every race",
  any_win: "Chicken wins at least one race",
  any_order_three: "Picked chickens win in any order"
};

const DEFAULT_CHICKENS = [
  "Tilly", "Pepperoni", "Peanut", "Joan Rivers", "Jetcar Junior", "Maple Creamie",
  "Squish", "Booger", "Dirty Boi", "Guppy Troupe", "Sheryl Crow", "Jiminy Giant"
];
const DEFAULT_RACES: Race[] = [
  { race: 1, name: "Race 1 - Barnyard Dash", description: "A clean sprint to the snack line." },
  { race: 2, name: "Race 2 - The Hay Bale Hustle", description: "A longer scoot with a little barnyard nonsense." },
  { race: 3, name: "Race 3 - The Coop Gauntlet", description: "The big finale, with the most distractions." }
];
const DEFAULT_CLOSE = "2026-07-18T17:30:00-04:00";

export function normalizeCode(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);
}

export function probabilityContext(chickenCount: number, raceCount: number) {
  const birds = Math.max(chickenCount, 1);
  const races = Math.max(raceCount, 1);
  const single = 1 / birds;
  const anyWin = 1 - Math.pow((birds - 1) / birds, races);
  const exact = 1 / Math.pow(birds, races);
  const anyOrder = races <= birds ? factorial(races) / Math.pow(birds, races) : 0;
  return { race_winner: single, any_win: anyWin, exact_ticket: exact, sweep: exact, any_order_three: anyOrder } as Record<BetType, number>;
}

export function betWeights(chickenCount: number, raceCount: number) {
  const probs = probabilityContext(chickenCount, raceCount);
  const single = probs.race_winner;
  return Object.fromEntries(Object.entries(probs).map(([key, probability]) => [key, probability > 0 ? single / probability : 0])) as Record<BetType, number>;
}

function factorial(value: number): number {
  return value <= 1 ? 1 : value * factorial(value - 1);
}

export async function ensureSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      admin_code TEXT NOT NULL,
      betting_close_at TEXT NOT NULL,
      official_rule TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS chickens (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      slot INTEGER NOT NULL,
      name TEXT NOT NULL,
      photo_url TEXT,
      UNIQUE(event_id, slot)
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS races (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      race INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      UNIQUE(event_id, race)
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS bettors (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      name TEXT NOT NULL
    )`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS bettors_event_lower_name_idx ON bettors (event_id, lower(name))`;
  await sql`
    CREATE TABLE IF NOT EXISTS bets (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      bettor_id INTEGER NOT NULL REFERENCES bettors(id) ON DELETE CASCADE,
      bet_type TEXT NOT NULL,
      stake NUMERIC NOT NULL,
      race INTEGER,
      chicken_1 INTEGER,
      chicken_2 INTEGER,
      chicken_3 INTEGER,
      picks JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS results (
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      race INTEGER NOT NULL,
      chicken_id INTEGER NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(event_id, race)
    )`;
  await ensureDefaultEvent();
}

async function ensureDefaultEvent() {
  const existing = await sql`SELECT id FROM events WHERE code = 'corn hub' LIMIT 1`;
  if (existing.rowCount) return;
  const event = await sql`
    INSERT INTO events (code, name, admin_code, betting_close_at, official_rule)
    VALUES ('corn hub', 'The Great American Chicken Race', 'NekoFatty123!', ${DEFAULT_CLOSE}, 'First chicken to get the marshmallow wins.')
    RETURNING id`;
  const eventId = Number(event.rows[0].id);
  for (let i = 0; i < DEFAULT_CHICKENS.length; i += 1) {
    await sql`INSERT INTO chickens (event_id, slot, name) VALUES (${eventId}, ${i + 1}, ${DEFAULT_CHICKENS[i]})`;
  }
  for (const race of DEFAULT_RACES) {
    await sql`INSERT INTO races (event_id, race, name, description) VALUES (${eventId}, ${race.race}, ${race.name}, ${race.description})`;
  }
}

export async function getEventByCode(code: string) {
  await ensureSchema();
  const normalized = normalizeCode(code || "corn hub");
  const event = await sql`SELECT * FROM events WHERE code = ${normalized} LIMIT 1`;
  if (!event.rowCount) return null;
  return getEventPayload(Number(event.rows[0].id));
}

export async function getEventPayload(eventId: number): Promise<EventPayload> {
  const [eventResult, chickensResult, racesResult, betsResult, resultsResult] = await Promise.all([
    sql`SELECT * FROM events WHERE id = ${eventId}`,
    sql`SELECT id, slot, name, photo_url FROM chickens WHERE event_id = ${eventId} ORDER BY slot`,
    sql`SELECT race, name, description FROM races WHERE event_id = ${eventId} ORDER BY race`,
    sql`SELECT b.*, bo.name AS bettor FROM bets b JOIN bettors bo ON bo.id = b.bettor_id WHERE b.event_id = ${eventId} ORDER BY b.created_at DESC, b.id DESC`,
    sql`SELECT race, chicken_id FROM results WHERE event_id = ${eventId}`
  ]);
  const rawEvent = eventResult.rows[0];
  const event: EventRecord = {
    id: Number(rawEvent.id),
    code: rawEvent.code,
    name: rawEvent.name,
    bettingCloseAt: rawEvent.betting_close_at,
    officialRule: rawEvent.official_rule
  };
  const chickens = chickensResult.rows.map((row) => ({ id: Number(row.id), slot: Number(row.slot), name: row.name, photoUrl: row.photo_url })) as Chicken[];
  const races = racesResult.rows.map((row) => ({ race: Number(row.race), name: row.name, description: row.description })) as Race[];
  const bets = betsResult.rows.map(rowToBet);
  const results: Results = Object.fromEntries(resultsResult.rows.map((row) => [Number(row.race), Number(row.chicken_id)]));
  return { event, chickens, races, bets, results, settlement: makeSettlement(bets, results, chickens, races) };
}

export async function createEvent(input: { code: string; name: string; adminCode: string; copyCode?: string }) {
  await ensureSchema();
  const code = normalizeCode(input.code);
  if (!code || !input.name.trim()) throw new Error("Event name and event code are required.");
  const copied = input.copyCode ? await getEventByCode(input.copyCode) : null;
  const sourceChickens = copied?.chickens ?? DEFAULT_CHICKENS.map((name, idx) => ({ id: idx + 1, slot: idx + 1, name, photoUrl: null }));
  const sourceRaces = copied?.races ?? DEFAULT_RACES;
  const close = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const event = await sql`
    INSERT INTO events (code, name, admin_code, betting_close_at, official_rule)
    VALUES (${code}, ${input.name.trim()}, ${input.adminCode.trim()}, ${close}, ${copied?.event.officialRule ?? "First chicken to get the snack wins."})
    RETURNING id`;
  const eventId = Number(event.rows[0].id);
  for (const chicken of sourceChickens) await sql`INSERT INTO chickens (event_id, slot, name, photo_url) VALUES (${eventId}, ${chicken.slot}, ${chicken.name}, ${chicken.photoUrl})`;
  for (const race of sourceRaces) await sql`INSERT INTO races (event_id, race, name, description) VALUES (${eventId}, ${race.race}, ${race.name}, ${race.description})`;
  return getEventPayload(eventId);
}

export async function addBet(input: { eventId: number; bettor: string; betType: BetType; stake: number; race?: number | null; picks: number[] }) {
  await ensureSchema();
  if (!input.bettor.trim()) throw new Error("Gambler name is required.");
  if (input.stake <= 0) throw new Error("Stake must be more than zero.");
  const event = await sql`SELECT betting_close_at FROM events WHERE id = ${input.eventId}`;
  if (!event.rowCount) throw new Error("Event not found.");
  if (Date.now() > Date.parse(event.rows[0].betting_close_at)) throw new Error("Betting is closed.");
  const bettor = await sql`
    INSERT INTO bettors (event_id, name) VALUES (${input.eventId}, ${input.bettor.trim()})
    ON CONFLICT (event_id, lower(name)) DO UPDATE SET name = EXCLUDED.name
    RETURNING id`;
  const picks = input.picks.map(Number).filter(Boolean);
  await sql`
    INSERT INTO bets (event_id, bettor_id, bet_type, stake, race, chicken_1, chicken_2, chicken_3, picks)
    VALUES (${input.eventId}, ${Number(bettor.rows[0].id)}, ${input.betType}, ${input.stake}, ${input.race ?? null}, ${picks[0] ?? null}, ${picks[1] ?? null}, ${picks[2] ?? null}, ${JSON.stringify(picks)}::jsonb)`;
  return getEventPayload(input.eventId);
}

export async function saveResults(input: { eventId: number; adminCode: string; results: Results }) {
  await ensureSchema();
  await assertAdmin(input.eventId, input.adminCode);
  const races = await sql`SELECT race FROM races WHERE event_id = ${input.eventId}`;
  if (Object.keys(input.results).length !== races.rowCount) throw new Error("Pick a winner for every race.");
  for (const [race, chickenId] of Object.entries(input.results)) {
    await sql`
      INSERT INTO results (event_id, race, chicken_id, updated_at)
      VALUES (${input.eventId}, ${Number(race)}, ${Number(chickenId)}, NOW())
      ON CONFLICT (event_id, race) DO UPDATE SET chicken_id = EXCLUDED.chicken_id, updated_at = NOW()`;
  }
  return getEventPayload(input.eventId);
}

export async function deleteBet(input: { eventId: number; adminCode: string; betId: number }) {
  await ensureSchema();
  await assertAdmin(input.eventId, input.adminCode);
  await sql`DELETE FROM bets WHERE event_id = ${input.eventId} AND id = ${input.betId}`;
  return getEventPayload(input.eventId);
}

async function assertAdmin(eventId: number, adminCode: string) {
  const event = await sql`SELECT admin_code FROM events WHERE id = ${eventId}`;
  if (!event.rowCount || event.rows[0].admin_code !== adminCode) throw new Error("Wrong admin code.");
}

function rowToBet(row: Record<string, unknown>): Bet {
  const picks = Array.isArray(row.picks) ? row.picks.map(Number) : [];
  return {
    id: Number(row.id),
    bettor: String(row.bettor),
    betType: String(row.bet_type) as BetType,
    stake: Number(row.stake),
    race: row.race == null ? null : Number(row.race),
    chicken1: row.chicken_1 == null ? null : Number(row.chicken_1),
    chicken2: row.chicken_2 == null ? null : Number(row.chicken_2),
    chicken3: row.chicken_3 == null ? null : Number(row.chicken_3),
    picks,
    createdAt: String(row.created_at)
  };
}

export function makeSettlement(bets: Bet[], results: Results, chickens: Chicken[], races: Race[]): Settlement | null {
  if (Object.keys(results).length !== races.length || bets.length < 2) return null;
  const weights = betWeights(chickens.length, races.length);
  const winners = races.map((race) => results[race.race]);
  const tickets = bets.map((bet) => {
    const won = isWinningBet(bet, results, winners);
    const weight = weights[bet.betType] ?? 1;
    return { ...bet, won, weight, payoutWeight: won ? bet.stake * weight : 0, payout: 0, net: -bet.stake, result: won ? "Won" : "Lost", label: describeBet(bet, chickens, races) };
  });
  const totalPool = tickets.reduce((sum, bet) => sum + bet.stake, 0);
  const winningStake = tickets.filter((bet) => bet.won).reduce((sum, bet) => sum + bet.stake, 0);
  const totalWeight = tickets.reduce((sum, bet) => sum + bet.payoutWeight, 0);
  if (totalWeight <= 0) {
    for (const ticket of tickets) { ticket.payout = ticket.stake; ticket.net = 0; ticket.result = "Refunded"; }
  } else {
    const bonusPool = totalPool - winningStake;
    for (const ticket of tickets) {
      if (ticket.won) ticket.payout = ticket.stake + ticket.payoutWeight * (bonusPool / totalWeight);
      ticket.net = ticket.payout - ticket.stake;
    }
  }
  const people = Array.from(tickets.reduce((map, ticket) => {
    const current = map.get(ticket.bettor) ?? { bettor: ticket.bettor, staked: 0, payout: 0, net: 0 };
    current.staked += ticket.stake; current.payout += ticket.payout; current.net += ticket.net;
    map.set(ticket.bettor, current);
    return map;
  }, new Map<string, { bettor: string; staked: number; payout: number; net: number }>()).values()).sort((a, b) => b.net - a.net || a.bettor.localeCompare(b.bettor));
  return { tickets, people, payments: makePayments(people) };
}

function isWinningBet(bet: Bet, results: Results, winners: number[]) {
  if (bet.betType === "race_winner") return results[Number(bet.race)] === bet.chicken1;
  if (bet.betType === "sweep") return winners.every((winner) => winner === bet.chicken1);
  if (bet.betType === "exact_ticket") return winners.every((winner, idx) => winner === bet.picks[idx]);
  if (bet.betType === "any_win") return winners.includes(Number(bet.chicken1));
  if (bet.betType === "any_order_three") return [...winners].sort().join("|") === [...bet.picks].sort().join("|");
  return false;
}

function describeBet(bet: Bet, chickens: Chicken[], races: Race[]) {
  const name = (id: number | null | undefined) => chickens.find((chicken) => chicken.id === id)?.name ?? "Unknown bird";
  if (bet.betType === "race_winner") return `${races.find((race) => race.race === bet.race)?.name ?? `Race ${bet.race}`} winner: ${name(bet.chicken1)}`;
  if (bet.betType === "sweep") return `${name(bet.chicken1)} wins every race`;
  if (bet.betType === "exact_ticket") return races.map((race, idx) => `${race.name}: ${name(bet.picks[idx])}`).join(" | ");
  if (bet.betType === "any_win") return `${name(bet.chicken1)} wins at least one race`;
  return `${bet.picks.map((pick) => name(pick)).join(", ")} win in any order`;
}

function makePayments(people: Array<{ bettor: string; staked: number; payout: number; net: number }>) {
  const debtors = people.filter((person) => person.net < -0.004).map((person) => ({ name: person.bettor, amount: -person.net }));
  const creditors = people.filter((person) => person.net > 0.004).map((person) => ({ name: person.bettor, amount: person.net }));
  const payments: Array<{ from: string; to: string; amount: number }> = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount);
    if (amount > 0.004) payments.push({ from: debtors[i].name, to: creditors[j].name, amount: Math.round(amount * 100) / 100 });
    debtors[i].amount -= amount; creditors[j].amount -= amount;
    if (debtors[i].amount <= 0.004) i += 1;
    if (creditors[j].amount <= 0.004) j += 1;
  }
  return payments;
}

