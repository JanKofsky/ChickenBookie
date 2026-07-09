import { sql } from "./db";

export type Chicken = { id: number; slot: number; name: string; photoUrl: string | null; bio: string };
export type Race = { race: number; name: string; description: string };
export type EventRecord = {
  id: number;
  code: string;
  name: string;
  adminCode?: string;
  bettingCloseAt: string;
  bettingTimezone: string;
  officialRule: string;
  resultMode: ResultMode;
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
export type ResultMode = "winner" | "full_order";
export type Results = Record<number, number[]>;
export type EventPayload = {
  event: EventRecord;
  chickens: Chicken[];
  races: Race[];
  bets: Bet[];
  results: Results;
  settlement: Settlement | null;
};
export type BetType = "race_winner" | "race_place" | "race_show" | "exacta" | "trifecta" | "sweep" | "exact_ticket" | "any_win" | "any_order_three";
export type Settlement = {
  tickets: Array<Bet & { won: boolean; weight: number; payoutWeight: number; payout: number; net: number; result: string; label: string }>;
  people: Array<{ bettor: string; staked: number; payout: number; net: number }>;
  payments: Array<{ from: string; to: string; amount: number }>;
};

export const BET_TYPES: Record<BetType, string> = {
  race_winner: "Pick 1st place in one race",
  race_place: "Pick a top-2 finisher",
  race_show: "Pick a top-3 finisher",
  exacta: "Pick exact 1st and 2nd",
  trifecta: "Pick exact 1st, 2nd, and 3rd",
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
  { race: 1, name: "Race 1 - Barnyard Dash", description: "A clean sprint across the coop." },
  { race: 2, name: "Race 2 - The Hay Bale Hustle", description: "A longer scoot with a little barnyard nonsense." },
  { race: 3, name: "Race 3 - The Coop Gauntlet", description: "The big finale, with the most distractions." }
];
const DEFAULT_CLOSE = "2026-07-18T17:30:00-04:00";
const DEFAULT_TIMEZONE = "America/New_York";

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
  const place = Math.min(2, birds) / birds;
  const show = Math.min(3, birds) / birds;
  const exacta = birds > 1 ? 1 / (birds * (birds - 1)) : 0;
  const trifecta = birds > 2 ? 1 / (birds * (birds - 1) * (birds - 2)) : 0;
  return { race_winner: single, race_place: place, race_show: show, exacta, trifecta, any_win: anyWin, exact_ticket: exact, sweep: exact, any_order_three: anyOrder } as Record<BetType, number>;
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
      betting_timezone TEXT NOT NULL DEFAULT 'America/New_York',
      official_rule TEXT NOT NULL,
      result_mode TEXT NOT NULL DEFAULT 'winner',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS result_mode TEXT NOT NULL DEFAULT 'winner'`;
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS betting_timezone TEXT NOT NULL DEFAULT 'America/New_York'`;
  await sql`
    CREATE TABLE IF NOT EXISTS chickens (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      slot INTEGER NOT NULL,
      name TEXT NOT NULL,
      photo_url TEXT,
      bio TEXT NOT NULL DEFAULT '',
      UNIQUE(event_id, slot)
    )`;
  await sql`ALTER TABLE chickens ADD COLUMN IF NOT EXISTS bio TEXT NOT NULL DEFAULT ''`;
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
  await sql`
    CREATE TABLE IF NOT EXISTS result_places (
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      race INTEGER NOT NULL,
      place INTEGER NOT NULL,
      chicken_id INTEGER NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(event_id, race, place)
    )`;
  await ensureDefaultEvent();
}

async function ensureDefaultEvent() {
  const existing = await sql`SELECT id FROM events WHERE code = 'corn hub' LIMIT 1`;
  if (existing.rowCount) return;
  const event = await sql`
    INSERT INTO events (code, name, admin_code, betting_close_at, betting_timezone, official_rule, result_mode)
    VALUES ('corn hub', 'The Great American Chicken Race', 'NekoFatty123!', ${DEFAULT_CLOSE}, ${DEFAULT_TIMEZONE}, 'first to the marshmallow wins', 'winner')
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
  const normalized = normalizeCode(code);
  if (!normalized) return null;
  const event = await sql`SELECT * FROM events WHERE code = ${normalized} LIMIT 1`;
  if (!event.rowCount) return null;
  return getEventPayload(Number(event.rows[0].id));
}

export async function getEventPayload(eventId: number): Promise<EventPayload> {
  const [eventResult, chickensResult, racesResult, betsResult, resultsResult] = await Promise.all([
    sql`SELECT * FROM events WHERE id = ${eventId}`,
    sql`SELECT id, slot, name, photo_url, bio FROM chickens WHERE event_id = ${eventId} ORDER BY slot`,
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
    bettingTimezone: String(rawEvent.betting_timezone ?? DEFAULT_TIMEZONE),
    officialRule: rawEvent.official_rule,
    resultMode: rawEvent.result_mode === "full_order" ? "full_order" : "winner"
  };
  const chickens = chickensResult.rows.map((row) => ({ id: Number(row.id), slot: Number(row.slot), name: row.name, photoUrl: row.photo_url, bio: row.bio ?? "" })) as Chicken[];
  const races = racesResult.rows.map((row) => ({ race: Number(row.race), name: row.name, description: row.description })) as Race[];
  const bets = betsResult.rows.map(rowToBet);
  const results: Results = Object.fromEntries(resultsResult.rows.map((row) => [Number(row.race), [Number(row.chicken_id)]]));
  const placeRows = await sql`SELECT race, place, chicken_id FROM result_places WHERE event_id = ${eventId}`;
  for (const row of placeRows.rows) {
    const race = Number(row.race);
    const place = Number(row.place);
    results[race] = results[race] ?? [];
    results[race][place - 1] = Number(row.chicken_id);
  }
  return { event, chickens, races, bets, results, settlement: makeSettlement(bets, results, chickens, races) };
}

export async function createEvent(input: { code: string; name: string; adminCode: string; copyCode?: string; resultMode?: ResultMode }) {
  await ensureSchema();
  const code = normalizeCode(input.code);
  if (!code || !input.name.trim()) throw new Error("Event name and event code are required.");
  const existing = await sql`SELECT id FROM events WHERE code = ${code} LIMIT 1`;
  if (existing.rowCount) throw new Error("That event code is already taken. Try another one.");
  const copied = input.copyCode ? await getEventByCode(input.copyCode) : null;
  const sourceChickens = copied?.chickens ?? DEFAULT_CHICKENS.map((name, idx) => ({ id: idx + 1, slot: idx + 1, name, photoUrl: null, bio: "" }));
  const sourceRaces = copied?.races ?? DEFAULT_RACES;
  const close = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const resultMode = copied?.event.resultMode ?? (input.resultMode === "full_order" ? "full_order" : "winner");
  const bettingTimezone = copied?.event.bettingTimezone ?? DEFAULT_TIMEZONE;
  const event = await sql`
    INSERT INTO events (code, name, admin_code, betting_close_at, betting_timezone, official_rule, result_mode)
    VALUES (${code}, ${input.name.trim()}, ${input.adminCode.trim()}, ${close}, ${bettingTimezone}, ${copied?.event.officialRule ?? "first beak across the line wins"}, ${resultMode})
    RETURNING id`;
  const eventId = Number(event.rows[0].id);
  for (const chicken of sourceChickens) await sql`INSERT INTO chickens (event_id, slot, name, photo_url, bio) VALUES (${eventId}, ${chicken.slot}, ${chicken.name}, ${chicken.photoUrl}, ${chicken.bio ?? ""})`;
  for (const race of sourceRaces) await sql`INSERT INTO races (event_id, race, name, description) VALUES (${eventId}, ${race.race}, ${race.name}, ${race.description})`;
  return getEventPayload(eventId);
}

export async function addBet(input: { eventId: number; bettor: string; betType: BetType; stake: number; race?: number | null; picks: number[] }) {
  await ensureSchema();
  const bettorName = input.bettor.trim().replace(/\s+/g, " ");
  if (!bettorName) throw new Error("Gambler name is required.");
  if (input.stake <= 0) throw new Error("Stake must be more than zero.");
  const event = await sql`SELECT betting_close_at FROM events WHERE id = ${input.eventId}`;
  if (!event.rowCount) throw new Error("Event not found.");
  if (Date.now() > Date.parse(event.rows[0].betting_close_at)) throw new Error("Betting is closed.");
  const races = await sql`SELECT race FROM races WHERE event_id = ${input.eventId}`;
  const raceNumbers = new Set(races.rows.map((row) => Number(row.race)));
  if (input.race != null && !raceNumbers.has(Number(input.race))) throw new Error("Pick a real race for this event.");
  const chickenRows = await sql`SELECT id FROM chickens WHERE event_id = ${input.eventId}`;
  const chickenIds = new Set(chickenRows.rows.map((row) => Number(row.id)));
  const bettor = await sql`
    INSERT INTO bettors (event_id, name) VALUES (${input.eventId}, ${bettorName})
    ON CONFLICT (event_id, lower(name)) DO UPDATE SET name = bettors.name
    RETURNING id`;
  const picks = input.picks.map(Number).filter(Boolean);
  if (!picks.length) throw new Error("Pick at least one chicken.");
  if (new Set(picks).size !== picks.length) throw new Error("Pick different chickens for each slot.");
  if (picks.some((pick) => !chickenIds.has(pick))) throw new Error("Pick chickens from this event.");
  await sql`
    INSERT INTO bets (event_id, bettor_id, bet_type, stake, race, chicken_1, chicken_2, chicken_3, picks)
    VALUES (${input.eventId}, ${Number(bettor.rows[0].id)}, ${input.betType}, ${input.stake}, ${input.race ?? null}, ${picks[0] ?? null}, ${picks[1] ?? null}, ${picks[2] ?? null}, ${JSON.stringify(picks)}::jsonb)`;
  return getEventPayload(input.eventId);
}

export async function saveResults(input: { eventId: number; adminCode: string; results: Results }) {
  await ensureSchema();
  await assertAdmin(input.eventId, input.adminCode);
  const races = await sql`SELECT race FROM races WHERE event_id = ${input.eventId}`;
  if (Object.keys(input.results).length !== races.rowCount) throw new Error("Pick a result for every race.");
  const event = await sql`SELECT result_mode FROM events WHERE id = ${input.eventId}`;
  const fullOrderMode = event.rows[0]?.result_mode === "full_order";
  const chickenCount = (await sql`SELECT COUNT(*) AS count FROM chickens WHERE event_id = ${input.eventId}`).rows[0]?.count;
  const chickenRows = await sql`SELECT id FROM chickens WHERE event_id = ${input.eventId}`;
  const chickenIds = new Set(chickenRows.rows.map((row) => Number(row.id)));
  for (const [race, result] of Object.entries(input.results)) {
    const places = Array.isArray(result) ? result.map(Number).filter(Boolean) : [];
    if (!places[0]) throw new Error("Pick a first-place chicken for every race.");
    if (fullOrderMode && places.length !== Number(chickenCount)) throw new Error("Rank every chicken for every race.");
    if (new Set(places).size !== places.length) throw new Error("Do not rank the same chicken twice in one race.");
    if (places.some((place) => !chickenIds.has(place))) throw new Error("Pick chickens from this event.");
    await sql`
      INSERT INTO results (event_id, race, chicken_id, updated_at)
      VALUES (${input.eventId}, ${Number(race)}, ${Number(places[0])}, NOW())
      ON CONFLICT (event_id, race) DO UPDATE SET chicken_id = EXCLUDED.chicken_id, updated_at = NOW()`;
    await sql`DELETE FROM result_places WHERE event_id = ${input.eventId} AND race = ${Number(race)}`;
    for (let index = 0; index < places.length; index += 1) {
      await sql`
        INSERT INTO result_places (event_id, race, place, chicken_id, updated_at)
        VALUES (${input.eventId}, ${Number(race)}, ${index + 1}, ${places[index]}, NOW())
        ON CONFLICT (event_id, race, place) DO UPDATE SET chicken_id = EXCLUDED.chicken_id, updated_at = NOW()`;
    }
  }
  return getEventPayload(input.eventId);
}

export async function deleteBet(input: { eventId: number; adminCode: string; betId: number }) {
  await ensureSchema();
  await assertAdmin(input.eventId, input.adminCode);
  await sql`DELETE FROM bets WHERE event_id = ${input.eventId} AND id = ${input.betId}`;
  return getEventPayload(input.eventId);
}

export async function updateEventConfig(input: {
  eventId: number;
  adminCode: string;
  name: string;
  bettingCloseAt: string;
  bettingTimezone: string;
  officialRule: string;
  resultMode: ResultMode;
  chickens: Array<{ id: number; name: string; photoUrl?: string | null; bio?: string }>;
  races: Array<{ race: number; name: string; description: string }>;
}) {
  await ensureSchema();
  await assertAdmin(input.eventId, input.adminCode);
  if (!input.name.trim()) throw new Error("Event name is required.");
  if (!input.officialRule.trim()) throw new Error("Race rules are required.");
  const resultMode = input.resultMode === "full_order" ? "full_order" : "winner";
  const bettingTimezone = input.bettingTimezone.trim() || DEFAULT_TIMEZONE;
  if (!input.bettingCloseAt.trim() || Number.isNaN(Date.parse(input.bettingCloseAt))) throw new Error("Bets open until needs a real date and time.");
  if (!input.chickens.length || input.chickens.some((chicken) => !chicken.name.trim())) throw new Error("Every chicken needs a name.");
  if (!input.races.length || input.races.some((race) => !race.name.trim() || !race.description.trim())) throw new Error("Every race needs a name and details.");

  await sql`
    UPDATE events
    SET name = ${input.name.trim()},
        betting_close_at = ${input.bettingCloseAt.trim()},
        betting_timezone = ${bettingTimezone},
        official_rule = ${input.officialRule.trim()},
        result_mode = ${resultMode}
    WHERE id = ${input.eventId}`;

  for (const chicken of input.chickens) {
    await sql`
      UPDATE chickens
      SET name = ${chicken.name.trim()},
          photo_url = ${chicken.photoUrl?.trim() || null},
          bio = ${chicken.bio?.trim() ?? ""}
      WHERE event_id = ${input.eventId} AND id = ${chicken.id}`;
  }

  for (const race of input.races) {
    await sql`
      UPDATE races
      SET name = ${race.name.trim()},
          description = ${race.description.trim()}
      WHERE event_id = ${input.eventId} AND race = ${race.race}`;
  }

  return getEventPayload(input.eventId);
}

async function assertAdmin(eventId: number, adminCode: string) {
  const event = await sql`SELECT admin_code FROM events WHERE id = ${eventId}`;
  if (!event.rowCount || event.rows[0].admin_code !== adminCode) throw new Error("Wrong admin code.");
}

export async function checkAdmin(input: { eventId: number; adminCode: string }) {
  await assertAdmin(input.eventId, input.adminCode);
  return { ok: true };
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
  const winners = races.map((race) => results[race.race]?.[0]);
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

function isWinningBet(bet: Bet, results: Results, winners: Array<number | undefined>) {
  const raceResult = results[Number(bet.race)] ?? [];
  if (bet.betType === "race_winner") return raceResult[0] === bet.chicken1;
  if (bet.betType === "race_place") return raceResult.slice(0, 2).includes(Number(bet.chicken1));
  if (bet.betType === "race_show") return raceResult.slice(0, 3).includes(Number(bet.chicken1));
  if (bet.betType === "exacta") return raceResult[0] === bet.picks[0] && raceResult[1] === bet.picks[1];
  if (bet.betType === "trifecta") return raceResult[0] === bet.picks[0] && raceResult[1] === bet.picks[1] && raceResult[2] === bet.picks[2];
  if (bet.betType === "sweep") return winners.every((winner) => winner === bet.chicken1);
  if (bet.betType === "exact_ticket") return winners.every((winner, idx) => winner === bet.picks[idx]);
  if (bet.betType === "any_win") return winners.includes(Number(bet.chicken1));
  if (bet.betType === "any_order_three") return [...winners].sort().join("|") === [...bet.picks].sort().join("|");
  return false;
}

function describeBet(bet: Bet, chickens: Chicken[], races: Race[]) {
  const name = (id: number | null | undefined) => chickens.find((chicken) => chicken.id === id)?.name ?? "Unknown bird";
  if (bet.betType === "race_winner") return `${races.find((race) => race.race === bet.race)?.name ?? `Race ${bet.race}`} winner: ${name(bet.chicken1)}`;
  if (bet.betType === "race_place") return `${races.find((race) => race.race === bet.race)?.name ?? `Race ${bet.race}`} top-2 finisher: ${name(bet.chicken1)}`;
  if (bet.betType === "race_show") return `${races.find((race) => race.race === bet.race)?.name ?? `Race ${bet.race}`} top-3 finisher: ${name(bet.chicken1)}`;
  if (bet.betType === "exacta") return `${races.find((race) => race.race === bet.race)?.name ?? `Race ${bet.race}`} exact 1st/2nd: ${bet.picks.map((pick) => name(pick)).join(" then ")}`;
  if (bet.betType === "trifecta") return `${races.find((race) => race.race === bet.race)?.name ?? `Race ${bet.race}`} exact 1st/2nd/3rd: ${bet.picks.map((pick) => name(pick)).join(" then ")}`;
  if (bet.betType === "sweep") return `${name(bet.chicken1)} wins every race`;
  if (bet.betType === "exact_ticket") return races.map((race, idx) => `${race.name}: ${name(bet.picks[idx])}`).join(" | ");
  if (bet.betType === "any_win") return `${name(bet.chicken1)} wins at least one race`;
  return `${bet.picks.map((pick) => name(pick)).join(", ")} win in any order`;
}

function makePayments(people: Array<{ bettor: string; staked: number; payout: number; net: number }>) {
  const debtors = people.filter((person) => person.net < -0.004).map((person) => ({ name: person.bettor, amount: -person.net })).sort((a, b) => b.amount - a.amount);
  const creditors = people.filter((person) => person.net > 0.004).map((person) => ({ name: person.bettor, amount: person.net })).sort((a, b) => b.amount - a.amount);
  const payments: Array<{ from: string; to: string; amount: number }> = [];
  const hub = creditors[0];
  const addPayment = (from: string, to: string, amount: number) => {
    if (amount <= 0.004 || from === to) return;
    const existing = payments.find((payment) => payment.from === from && payment.to === to);
    if (existing) existing.amount += amount;
    else payments.push({ from, to, amount });
  };
  const nextCreditor = () => creditors.find((creditor) => creditor.amount > 0.004 && creditor !== hub) ?? creditors.find((creditor) => creditor.amount > 0.004);

  for (const debtor of debtors) {
    const first = nextCreditor();
    if (first) {
      const amount = Math.min(debtor.amount, first.amount);
      addPayment(debtor.name, first.name, amount);
      debtor.amount -= amount;
      first.amount -= amount;
    }
    if (debtor.amount > 0.004 && hub) {
      addPayment(debtor.name, hub.name, debtor.amount);
      hub.amount -= debtor.amount;
      debtor.amount = 0;
    }
  }

  if (hub) {
    for (const creditor of creditors) {
      if (creditor !== hub && creditor.amount > 0.004) {
        addPayment(hub.name, creditor.name, creditor.amount);
        hub.amount -= creditor.amount;
        creditor.amount = 0;
      }
    }
  }

  return payments.map((payment) => ({ ...payment, amount: Math.round(payment.amount * 100) / 100 })).filter((payment) => payment.amount > 0);
}

