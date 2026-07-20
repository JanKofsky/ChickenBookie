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
  gameType: GameType;
  poolMode: PoolMode;
  hostVenmo: string;
  dropMaxNumber: number;
  dropGridColumns: number;
  dropGridRows: number;
  dropTicketPrice: number;
  dropWinningNumber: number | null;
};
export type Bet = {
  id: number;
  bettor: string;
  venmo: string;
  betType: BetType;
  stake: number;
  race: number | null;
  chicken1: number | null;
  chicken2: number | null;
  chicken3: number | null;
  dropNumber: number | null;
  picks: number[];
  createdAt: string;
  paymentVerified: boolean;
};
export type GameType = "race" | "chicken_drop";
export type PoolMode = "peer_to_peer" | "host_managed";
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
export type BetType = "race_winner" | "race_place" | "race_show" | "exacta" | "trifecta" | "sweep" | "exact_ticket" | "any_win" | "any_order_three" | "drop_number";
export type Settlement = {
  tickets: Array<Bet & { won: boolean; weight: number; payoutWeight: number; payout: number; net: number; result: string; label: string }>;
  people: Array<{ bettor: string; venmo: string; staked: number; payout: number; net: number }>;
  payments: Array<{ from: string; fromVenmo: string; to: string; toVenmo: string; amount: number }>;
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
  any_order_three: "Picked chickens win in any order",
  drop_number: "Chicken Drop number"
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
  return { race_winner: single, race_place: place, race_show: show, exacta, trifecta, any_win: anyWin, exact_ticket: exact, sweep: exact, any_order_three: anyOrder, drop_number: 1 } as Record<BetType, number>;
}

export function betWeights(chickenCount: number, raceCount: number) {
  const probs = probabilityContext(chickenCount, raceCount);
  const single = probs.race_winner;
  return Object.fromEntries(Object.entries(probs).map(([key, probability]) => [key, probability > 0 ? single / probability : 0])) as Record<BetType, number>;
}

function factorial(value: number): number {
  return value <= 1 ? 1 : value * factorial(value - 1);
}

function factorDropGrid(value: number) {
  const total = Number.isInteger(value) && value >= 2 ? value : 25;
  let rows = Math.floor(Math.sqrt(total));
  while (rows > 1 && total % rows !== 0) rows -= 1;
  return { columns: total / rows, rows, total };
}

function resolveDropGrid(maxNumber: unknown, columns: unknown, rows: unknown) {
  const total = Number(maxNumber);
  const storedColumns = Number(columns);
  const storedRows = Number(rows);
  if (Number.isInteger(storedColumns) && storedColumns > 0 && Number.isInteger(storedRows) && storedRows > 0 && storedColumns * storedRows === total) {
    return { columns: storedColumns, rows: storedRows, total };
  }
  return factorDropGrid(total);
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
      game_type TEXT NOT NULL DEFAULT 'race',
      pool_mode TEXT NOT NULL DEFAULT 'peer_to_peer',
      host_venmo TEXT NOT NULL DEFAULT '',
      drop_max_number INTEGER NOT NULL DEFAULT 25,
      drop_grid_columns INTEGER NOT NULL DEFAULT 5,
      drop_grid_rows INTEGER NOT NULL DEFAULT 5,
      drop_ticket_price NUMERIC(10, 2) NOT NULL DEFAULT 5,
      drop_winning_number INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS result_mode TEXT NOT NULL DEFAULT 'winner'`;
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS betting_timezone TEXT NOT NULL DEFAULT 'America/New_York'`;
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS game_type TEXT NOT NULL DEFAULT 'race'`;
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS pool_mode TEXT NOT NULL DEFAULT 'peer_to_peer'`;
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS host_venmo TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS drop_max_number INTEGER NOT NULL DEFAULT 25`;
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS drop_grid_columns INTEGER NOT NULL DEFAULT 5`;
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS drop_grid_rows INTEGER NOT NULL DEFAULT 5`;
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS drop_ticket_price NUMERIC(10, 2) NOT NULL DEFAULT 5`;
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS drop_winning_number INTEGER`;
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
      name TEXT NOT NULL,
      venmo TEXT NOT NULL DEFAULT ''
    )`;
  await sql`ALTER TABLE bettors ADD COLUMN IF NOT EXISTS venmo TEXT NOT NULL DEFAULT ''`;
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
      drop_number INTEGER,
      picks JSONB NOT NULL DEFAULT '[]'::jsonb,
      payment_verified BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await sql`ALTER TABLE bets ADD COLUMN IF NOT EXISTS drop_number INTEGER`;
  await sql`ALTER TABLE bets ADD COLUMN IF NOT EXISTS payment_verified BOOLEAN NOT NULL DEFAULT TRUE`;
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
  await ensureTestEventFixture();
  await ensureTestDropEventFixture();
  await ensureDropGridDimensionBackfill();
}

async function ensureTestEventFixture() {
  await sql`
    CREATE TABLE IF NOT EXISTS app_migrations (
      key TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  const migration = await sql`
    INSERT INTO app_migrations (key)
    SELECT 'seed-test-event-20260716-v2'
    WHERE EXISTS (SELECT 1 FROM events WHERE code = 'test')
    ON CONFLICT (key) DO NOTHING
    RETURNING key`;
  if (!migration.rowCount) return;

  const event = await sql`SELECT id FROM events WHERE code = 'test' LIMIT 1`;
  const eventId = Number(event.rows[0].id);
  await sql`
    UPDATE events
    SET name = 'Chicken Bookie Test Event',
        admin_code = '',
        betting_close_at = '2027-12-31T23:59:00-05:00',
        betting_timezone = 'America/New_York',
        official_rule = 'First beak across the snack line wins.',
        result_mode = 'winner'
    WHERE id = ${eventId}`;
  await sql`DELETE FROM result_places WHERE event_id = ${eventId}`;
  await sql`DELETE FROM results WHERE event_id = ${eventId}`;
  await sql`DELETE FROM bets WHERE event_id = ${eventId}`;
  await sql`DELETE FROM bettors WHERE event_id = ${eventId}`;
  await sql`DELETE FROM races WHERE event_id = ${eventId}`;
  await sql`DELETE FROM chickens WHERE event_id = ${eventId}`;

  const testFlockSprite = '/assets/test-flock-contenders.png';
  const testChickens = [
    ['Disco Biscuit', 'Dances through the warm-up and saves the best strut for the finish.'],
    ['Waffles McGraw', 'A golden-feathered outlaw with a syrup-smooth racing line.'],
    ['Turbo Nugget', 'Tiny goggles, enormous acceleration, absolutely no brakes.'],
    ['Pickle Boots', 'Speckled, stubborn, and famous for unusual green race-day footwear.'],
    ['Moon Pie', 'A round little dreamer who becomes surprisingly fast after sunset.'],
    ['Colonel Crumbs', 'Runs a disciplined race but cannot resist snacks on the course.'],
    ['Banjo Beans', 'Keeps a steady rhythm and pecks out a furious final sprint.'],
    ['Glitter Beak', 'Leaves a little sparkle and a lot of confused competitors behind.'],
    ['Toast Malone', 'Crispy confidence, buttery footwork, and a very mellow game face.'],
    ['Sir Pecksalot', 'A gallant contender sworn to defend the honor of the snack bucket.'],
    ['Noodle Legs', 'All knees at the starting line, pure lightning once the bell rings.'],
    ['Biscuit Bandit', 'Steals treats, hearts, and occasionally the inside lane.'],
    ['Dolly Carton', 'Big feathers, bigger personality, and a chorus-ready victory cluck.'],
    ['Eggward', 'A dramatic crest and a mysterious talent for photo finishes.'],
    ['Captain Flapjack', 'Commands the final stretch like a syrup-powered ship at sea.']
  ] as const;
  for (let index = 0; index < testChickens.length; index += 1) {
    await sql`INSERT INTO chickens (event_id, slot, name, bio, photo_url) VALUES (${eventId}, ${index + 1}, ${testChickens[index][0]}, ${testChickens[index][1]}, ${testFlockSprite})`;
  }

  const testRaces = [
    ['Race 1 - Barnyard Dash', 'A clean sprint across the coop.'],
    ['Race 2 - The Hay Bale Hustle', 'A longer scoot with a little barnyard nonsense.'],
    ['Race 3 - The Coop Gauntlet', 'Maximum distractions before the snack line.'],
    ['Race 4 - The Feathered Finale', 'One last dash for test-event glory.']
  ] as const;
  for (let index = 0; index < testRaces.length; index += 1) {
    await sql`INSERT INTO races (event_id, race, name, description) VALUES (${eventId}, ${index + 1}, ${testRaces[index][0]}, ${testRaces[index][1]})`;
  }

  const testBettors = [
    ['Avery', '@cb-test-avery'],
    ['Casey', '@cb-test-casey'],
    ['Jordan', '@cb-test-jordan'],
    ['Riley', '@cb-test-riley'],
    ['Morgan', '@cb-test-morgan']
  ] as const;
  for (const [name, venmo] of testBettors) {
    await sql`INSERT INTO bettors (event_id, name, venmo) VALUES (${eventId}, ${name}, ${venmo})`;
  }

  const chickenRows = await sql`SELECT id, slot FROM chickens WHERE event_id = ${eventId}`;
  const bettorRows = await sql`SELECT id, name FROM bettors WHERE event_id = ${eventId}`;
  const chickenId = (slot: number) => Number(chickenRows.rows.find((row) => Number(row.slot) === slot)?.id);
  const bettorId = (name: string) => Number(bettorRows.rows.find((row) => row.name === name)?.id);
  const addTestBet = async (name: string, betType: BetType, stake: number, race: number | null, slots: number[]) => {
    const picks = slots.map(chickenId);
    await sql`
      INSERT INTO bets (event_id, bettor_id, bet_type, stake, race, chicken_1, chicken_2, chicken_3, picks)
      VALUES (${eventId}, ${bettorId(name)}, ${betType}, ${stake}, ${race}, ${picks[0] ?? null}, ${picks[1] ?? null}, ${picks[2] ?? null}, ${JSON.stringify(picks)}::jsonb)`;
  };
  await addTestBet('Avery', 'race_winner', 20, 1, [1]);
  await addTestBet('Casey', 'any_win', 10, null, [2]);
  await addTestBet('Jordan', 'race_winner', 15, 2, [7]);
  await addTestBet('Riley', 'exact_ticket', 10, null, [4, 3, 2, 1]);
  await addTestBet('Morgan', 'sweep', 5, null, [5]);

  for (let race = 1; race <= 4; race += 1) {
    const winnerId = chickenId(race);
    await sql`INSERT INTO results (event_id, race, chicken_id) VALUES (${eventId}, ${race}, ${winnerId})`;
    await sql`INSERT INTO result_places (event_id, race, place, chicken_id) VALUES (${eventId}, ${race}, 1, ${winnerId})`;
  }
}

async function ensureTestDropEventFixture() {
  const defaultDropRule = "The first confirmed chicken dropping decides the winning square. If it touches a line, use the square containing most of the dropping; if that is unclear, reset for another drop. If nobody picked the winning square, every ticket is refunded.";
  const migration = await sql`
    INSERT INTO app_migrations (key)
    VALUES ('seed-test-drop-event-20260716-v2')
    ON CONFLICT (key) DO NOTHING
    RETURNING key`;
  if (!migration.rowCount) return;

  const existing = await sql`SELECT id FROM events WHERE code = 'test-drop' LIMIT 1`;
  let eventId: number;
  if (existing.rowCount) {
    eventId = Number(existing.rows[0].id);
    await sql`
      UPDATE events
      SET name = 'Chicken Drop Test Event',
          admin_code = '',
          betting_close_at = '2027-12-31T23:59:00-05:00',
          betting_timezone = 'America/New_York',
          official_rule = ${defaultDropRule},
          result_mode = 'winner',
          game_type = 'chicken_drop',
          drop_max_number = 30,
          drop_grid_columns = 6,
          drop_grid_rows = 5,
          drop_ticket_price = 5,
          drop_winning_number = NULL
      WHERE id = ${eventId}`;
    await sql`DELETE FROM result_places WHERE event_id = ${eventId}`;
    await sql`DELETE FROM results WHERE event_id = ${eventId}`;
    await sql`DELETE FROM bets WHERE event_id = ${eventId}`;
    await sql`DELETE FROM bettors WHERE event_id = ${eventId}`;
    await sql`DELETE FROM races WHERE event_id = ${eventId}`;
    await sql`DELETE FROM chickens WHERE event_id = ${eventId}`;
  } else {
    const created = await sql`
      INSERT INTO events (
        code, name, admin_code, betting_close_at, betting_timezone, official_rule, result_mode,
        game_type, drop_max_number, drop_grid_columns, drop_grid_rows, drop_ticket_price, drop_winning_number
      )
      VALUES (
        'test-drop', 'Chicken Drop Test Event', '', '2027-12-31T23:59:00-05:00',
        'America/New_York', ${defaultDropRule}, 'winner', 'chicken_drop', 30, 6, 5, 5, null
      )
      RETURNING id`;
    eventId = Number(created.rows[0].id);
  }
  const testBettors = [
    ['Avery', '@cb-drop-avery'],
    ['Casey', '@cb-drop-casey'],
    ['Jordan', '@cb-drop-jordan'],
    ['Riley', '@cb-drop-riley'],
    ['Morgan', '@cb-drop-morgan'],
    ['Sam', '@cb-drop-sam'],
    ['Taylor', '@cb-drop-taylor']
  ] as const;
  for (const [name, venmo] of testBettors) {
    await sql`INSERT INTO bettors (event_id, name, venmo) VALUES (${eventId}, ${name}, ${venmo})`;
  }

  const bettorRows = await sql`SELECT id, name FROM bettors WHERE event_id = ${eventId}`;
  const bettorId = (name: string) => Number(bettorRows.rows.find((row) => row.name === name)?.id);
  const testTickets = [
    ['Avery', 17], ['Avery', 17], ['Casey', 17],
    ['Jordan', 4], ['Jordan', 4], ['Jordan', 4], ['Riley', 4],
    ['Morgan', 8], ['Morgan', 8],
    ['Sam', 23], ['Taylor', 29]
  ] as const;
  for (const [name, dropNumber] of testTickets) {
    await sql`
      INSERT INTO bets (event_id, bettor_id, bet_type, stake, race, chicken_1, chicken_2, chicken_3, drop_number, picks)
      VALUES (${eventId}, ${bettorId(name)}, 'drop_number', 5, null, null, null, null, ${dropNumber}, '[]'::jsonb)`;
  }
}

async function ensureDropGridDimensionBackfill() {
  const migrationKey = 'backfill-drop-grid-dimensions-20260716-v1';
  const migration = await sql`SELECT key FROM app_migrations WHERE key = ${migrationKey} LIMIT 1`;
  if (migration.rowCount) return;
  const events = await sql`SELECT id, drop_max_number, drop_grid_columns, drop_grid_rows FROM events WHERE game_type = 'chicken_drop'`;
  for (const event of events.rows) {
    const grid = resolveDropGrid(event.drop_max_number, event.drop_grid_columns, event.drop_grid_rows);
    await sql`
      UPDATE events
      SET drop_grid_columns = ${grid.columns},
          drop_grid_rows = ${grid.rows},
          drop_max_number = ${grid.total}
      WHERE id = ${Number(event.id)}`;
  }
  await sql`INSERT INTO app_migrations (key) VALUES (${migrationKey}) ON CONFLICT (key) DO NOTHING`;
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
    sql`SELECT b.*, bo.name AS bettor, bo.venmo FROM bets b JOIN bettors bo ON bo.id = b.bettor_id WHERE b.event_id = ${eventId} ORDER BY b.created_at DESC, b.id DESC`,
    sql`SELECT race, chicken_id FROM results WHERE event_id = ${eventId}`
  ]);
  const rawEvent = eventResult.rows[0];
  const dropGrid = resolveDropGrid(rawEvent.drop_max_number, rawEvent.drop_grid_columns, rawEvent.drop_grid_rows);
  const event: EventRecord = {
    id: Number(rawEvent.id),
    code: rawEvent.code,
    name: rawEvent.name,
    bettingCloseAt: rawEvent.betting_close_at,
    bettingTimezone: String(rawEvent.betting_timezone ?? DEFAULT_TIMEZONE),
    officialRule: rawEvent.official_rule,
    resultMode: rawEvent.result_mode === "full_order" ? "full_order" : "winner",
    gameType: rawEvent.game_type === "chicken_drop" ? "chicken_drop" : "race",
    poolMode: rawEvent.pool_mode === "host_managed" ? "host_managed" : "peer_to_peer",
    hostVenmo: String(rawEvent.host_venmo ?? ""),
    dropMaxNumber: dropGrid.total,
    dropGridColumns: dropGrid.columns,
    dropGridRows: dropGrid.rows,
    dropTicketPrice: Number(rawEvent.drop_ticket_price ?? 5),
    dropWinningNumber: rawEvent.drop_winning_number == null ? null : Number(rawEvent.drop_winning_number)
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
  const countedBets = bets.filter((bet) => bet.paymentVerified);
  const settlement = event.gameType === "chicken_drop"
    ? makeDropSettlement(countedBets, event.dropWinningNumber, event.poolMode === "host_managed" ? event.hostVenmo : undefined)
    : makeSettlement(countedBets, results, chickens, races, event.poolMode === "host_managed" ? event.hostVenmo : undefined);
  return { event, chickens, races, bets, results, settlement };
}

export async function createEvent(input: {
  code: string;
  name: string;
  adminCode: string;
  copyCode?: string;
  resultMode?: ResultMode;
  gameType?: GameType;
  dropMaxNumber?: number;
  dropGridColumns?: number;
  dropGridRows?: number;
  dropTicketPrice?: number;
}) {
  await ensureSchema();
  const code = normalizeCode(input.code);
  if (!code || !input.name.trim()) throw new Error("Event name and event code are required.");
  if (!input.adminCode.trim()) throw new Error("An admin code is required so you can finish setup in Coop Boss.");
  const existing = await sql`SELECT id FROM events WHERE code = ${code} LIMIT 1`;
  if (existing.rowCount) throw new Error("That event code is already taken. Try another one.");
  const gameType: GameType = input.gameType === "chicken_drop" ? "chicken_drop" : "race";
  const poolMode: PoolMode = "peer_to_peer";
  const hostVenmo = "";
  const copied = input.copyCode ? await getEventByCode(input.copyCode) : null;
  if (copied && copied.event.gameType !== gameType) throw new Error("Copy an event with the same game format.");
  const sourceChickens = gameType === "race" ? copied?.chickens ?? DEFAULT_CHICKENS.map((name, idx) => ({ id: idx + 1, slot: idx + 1, name, photoUrl: null, bio: "" })) : [];
  const sourceRaces = gameType === "race" ? copied?.races ?? DEFAULT_RACES : [];
  const close = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const resultMode = gameType === "race" ? copied?.event.resultMode ?? (input.resultMode === "full_order" ? "full_order" : "winner") : "winner";
  const bettingTimezone = copied?.event.bettingTimezone ?? DEFAULT_TIMEZONE;
  if (gameType === "chicken_drop" && (input.dropGridColumns == null) !== (input.dropGridRows == null)) throw new Error("Set both Chicken Drop grid columns and rows.");
  const legacyGrid = factorDropGrid(Number(input.dropMaxNumber ?? 25));
  const dropGridColumns = gameType === "chicken_drop" ? Number(copied?.event.dropGridColumns ?? input.dropGridColumns ?? legacyGrid.columns) : 5;
  const dropGridRows = gameType === "chicken_drop" ? Number(copied?.event.dropGridRows ?? input.dropGridRows ?? legacyGrid.rows) : 5;
  const dropMaxNumber = dropGridColumns * dropGridRows;
  const dropTicketPrice = gameType === "chicken_drop" ? Number(copied?.event.dropTicketPrice ?? input.dropTicketPrice ?? 5) : 5;
  if (!Number.isInteger(dropGridColumns) || dropGridColumns < 1 || !Number.isInteger(dropGridRows) || dropGridRows < 1 || dropMaxNumber < 2 || dropMaxNumber > 500) throw new Error("Chicken Drop grids need whole-number columns and rows with 2 to 500 total sections.");
  if (!Number.isFinite(dropTicketPrice) || dropTicketPrice < 0.01 || dropTicketPrice > 10_000) throw new Error("Chicken Drop ticket price must be between $0.01 and $10,000.");
  const defaultRule = gameType === "chicken_drop"
    ? "The first confirmed chicken dropping decides the winning square. If it touches a line, use the square containing most of the dropping; if that is unclear, reset for another drop. If nobody picked the winning square, every ticket is refunded."
    : "first beak across the line wins";
  const event = await sql`
    INSERT INTO events (code, name, admin_code, betting_close_at, betting_timezone, official_rule, result_mode, game_type, pool_mode, host_venmo, drop_max_number, drop_grid_columns, drop_grid_rows, drop_ticket_price)
    VALUES (${code}, ${input.name.trim()}, ${input.adminCode.trim()}, ${close}, ${bettingTimezone}, ${copied?.event.officialRule ?? defaultRule}, ${resultMode}, ${gameType}, ${poolMode}, ${hostVenmo}, ${dropMaxNumber}, ${dropGridColumns}, ${dropGridRows}, ${dropTicketPrice})
    RETURNING id`;
  const eventId = Number(event.rows[0].id);
  for (const chicken of sourceChickens) await sql`INSERT INTO chickens (event_id, slot, name, photo_url, bio) VALUES (${eventId}, ${chicken.slot}, ${chicken.name}, ${chicken.photoUrl}, ${chicken.bio ?? ""})`;
  for (const race of sourceRaces) await sql`INSERT INTO races (event_id, race, name, description) VALUES (${eventId}, ${race.race}, ${race.name}, ${race.description})`;
  return getEventPayload(eventId);
}

export async function addBet(input: { eventId: number; bettor: string; venmo?: string; betType: BetType; stake: number; race?: number | null; picks: number[]; dropNumber?: number | null }) {
  await ensureSchema();
  const bettorName = input.bettor.trim().replace(/\s+/g, " ");
  const venmo = normalizeVenmo(input.venmo ?? "");
  if (!bettorName) throw new Error("Gambler name is required.");
  const event = await sql`
    SELECT betting_close_at, game_type, pool_mode, drop_max_number, drop_ticket_price, drop_winning_number
    FROM events WHERE id = ${input.eventId}`;
  if (!event.rowCount) throw new Error("Event not found.");
  if (Date.now() > Date.parse(event.rows[0].betting_close_at)) throw new Error("Betting is closed.");
  const hostManaged = event.rows[0].pool_mode === "host_managed";
  if (hostManaged && !venmo) throw new Error("Your Venmo is required for this host-maintained pool.");

  const isDrop = event.rows[0].game_type === "chicken_drop";
  let betType: BetType;
  let stake: number;
  let race: number | null = null;
  let picks: number[] = [];
  let dropNumber: number | null = null;
  if (isDrop) {
    if (event.rows[0].drop_winning_number != null) throw new Error("The drop result is already official. Betting is closed.");
    dropNumber = Number(input.dropNumber);
    const maxNumber = Number(event.rows[0].drop_max_number);
    if (!Number.isInteger(dropNumber) || dropNumber < 1 || dropNumber > maxNumber) throw new Error(`Pick a number from 1 to ${maxNumber}.`);
    betType = "drop_number";
    stake = Number(event.rows[0].drop_ticket_price);
  } else {
    stake = Number(input.stake);
    if (!Number.isFinite(stake) || stake <= 0) throw new Error("Stake must be more than zero.");
    if (!BET_TYPES[input.betType] || input.betType === "drop_number") throw new Error("Pick a real bet type for this race event.");
    const existingResults = await sql`SELECT 1 FROM results WHERE event_id = ${input.eventId} LIMIT 1`;
    if (existingResults.rowCount) throw new Error("Results are already official. Betting is closed.");
    const races = await sql`SELECT race FROM races WHERE event_id = ${input.eventId}`;
    const raceNumbers = new Set(races.rows.map((row) => Number(row.race)));
    race = input.race == null ? null : Number(input.race);
    if (race != null && !raceNumbers.has(race)) throw new Error("Pick a real race for this event.");
    const chickenRows = await sql`SELECT id FROM chickens WHERE event_id = ${input.eventId}`;
    const chickenIds = new Set(chickenRows.rows.map((row) => Number(row.id)));
    picks = input.picks.map(Number).filter(Boolean);
    if (!picks.length) throw new Error("Pick at least one chicken.");
    if (new Set(picks).size !== picks.length) throw new Error("Pick different chickens for each slot.");
    if (picks.some((pick) => !chickenIds.has(pick))) throw new Error("Pick chickens from this event.");
    betType = input.betType;
  }

  const bettor = await sql`
    INSERT INTO bettors (event_id, name, venmo) VALUES (${input.eventId}, ${bettorName}, ${venmo})
    ON CONFLICT (event_id, lower(name)) DO UPDATE SET venmo = CASE WHEN EXCLUDED.venmo = '' THEN bettors.venmo ELSE EXCLUDED.venmo END
    RETURNING id`;
  await sql`
    INSERT INTO bets (event_id, bettor_id, bet_type, stake, race, chicken_1, chicken_2, chicken_3, drop_number, picks, payment_verified)
    VALUES (${input.eventId}, ${Number(bettor.rows[0].id)}, ${betType}, ${stake}, ${race}, ${picks[0] ?? null}, ${picks[1] ?? null}, ${picks[2] ?? null}, ${dropNumber}, ${JSON.stringify(picks)}::jsonb, ${!hostManaged})`;
  return getEventPayload(input.eventId);
}

export async function saveResults(input: { eventId: number; adminCode: string; results: Results; winningNumber?: number | null }) {
  await ensureSchema();
  await assertAdmin(input.eventId, input.adminCode);
  const event = await sql`SELECT game_type, result_mode, drop_max_number FROM events WHERE id = ${input.eventId}`;
  if (!event.rowCount) throw new Error("Event not found.");
  if (event.rows[0].game_type === "chicken_drop") {
    const winningNumber = Number(input.winningNumber);
    const maxNumber = Number(event.rows[0].drop_max_number);
    if (!Number.isInteger(winningNumber) || winningNumber < 1 || winningNumber > maxNumber) throw new Error(`Pick a winning number from 1 to ${maxNumber}.`);
    await sql`UPDATE events SET drop_winning_number = ${winningNumber} WHERE id = ${input.eventId}`;
    return getEventPayload(input.eventId);
  }
  const races = await sql`SELECT race FROM races WHERE event_id = ${input.eventId}`;
  if (Object.keys(input.results).length !== races.rowCount) throw new Error("Pick a result for every race.");
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

export async function clearResults(input: { eventId: number; adminCode: string }) {
  await ensureSchema();
  await assertAdmin(input.eventId, input.adminCode);
  await sql`DELETE FROM result_places WHERE event_id = ${input.eventId}`;
  await sql`DELETE FROM results WHERE event_id = ${input.eventId}`;
  await sql`UPDATE events SET drop_winning_number = NULL WHERE id = ${input.eventId}`;
  return getEventPayload(input.eventId);
}

export async function deleteBet(input: { eventId: number; adminCode: string; betId: number }) {
  await ensureSchema();
  await assertAdmin(input.eventId, input.adminCode);
  await sql`DELETE FROM bets WHERE event_id = ${input.eventId} AND id = ${input.betId}`;
  return getEventPayload(input.eventId);
}

export async function verifyBetPayment(input: { eventId: number; adminCode: string; betId: number; verified: boolean }) {
  await ensureSchema();
  await assertAdmin(input.eventId, input.adminCode);
  const event = await sql`SELECT pool_mode FROM events WHERE id = ${input.eventId}`;
  if (!event.rowCount || event.rows[0].pool_mode !== "host_managed") throw new Error("Payment confirmation is only used for host-maintained pools.");
  const updated = await sql`UPDATE bets SET payment_verified = ${input.verified} WHERE event_id = ${input.eventId} AND id = ${input.betId} RETURNING id`;
  if (!updated.rowCount) throw new Error("Bet not found.");
  return getEventPayload(input.eventId);
}

export async function verifyBettorPayments(input: { eventId: number; adminCode: string; bettor: string }) {
  await ensureSchema();
  await assertAdmin(input.eventId, input.adminCode);
  const bettor = input.bettor.trim().replace(/\s+/g, " ");
  if (!bettor) throw new Error("Bettor name is required.");
  const event = await sql`SELECT pool_mode FROM events WHERE id = ${input.eventId}`;
  if (!event.rowCount || event.rows[0].pool_mode !== "host_managed") throw new Error("Payment confirmation is only used for host-maintained pools.");
  const updated = await sql`
    UPDATE bets b
    SET payment_verified = TRUE
    FROM bettors bo
    WHERE b.bettor_id = bo.id
      AND b.event_id = ${input.eventId}
      AND bo.event_id = ${input.eventId}
      AND lower(bo.name) = lower(${bettor})
      AND b.payment_verified = FALSE
    RETURNING b.id`;
  if (!updated.rowCount) throw new Error("No pending bets found for that bettor.");
  return getEventPayload(input.eventId);
}

export async function updateBettors(input: { eventId: number; adminCode: string; bettors: Array<{ name: string; venmo: string }> }) {
  await ensureSchema();
  await assertAdmin(input.eventId, input.adminCode);
  const event = await sql`SELECT pool_mode FROM events WHERE id = ${input.eventId}`;
  for (const bettor of input.bettors) {
    const venmo = normalizeVenmo(bettor.venmo);
    if (event.rows[0]?.pool_mode === "host_managed" && !venmo) throw new Error("Every bettor needs a Venmo in a host-maintained pool.");
    await sql`UPDATE bettors SET venmo = ${venmo} WHERE event_id = ${input.eventId} AND lower(name) = lower(${bettor.name})`;
  }
  return getEventPayload(input.eventId);
}

export function normalizeVenmo(value: string) {
  const handle = value.trim().replace(/^@+/, "").replace(/\s+/g, "");
  return handle ? `@${handle}` : "";
}

export async function updateEventConfig(input: {
  eventId: number;
  adminCode: string;
  name: string;
  bettingCloseAt: string;
  bettingTimezone: string;
  officialRule: string;
  resultMode: ResultMode;
  poolMode: PoolMode;
  hostVenmo?: string;
  dropMaxNumber?: number;
  dropGridColumns?: number;
  dropGridRows?: number;
  dropTicketPrice?: number;
  chickens: Array<{ id: number; name: string; photoUrl?: string | null; bio?: string }>;
  races: Array<{ race: number; name: string; description: string }>;
}) {
  await ensureSchema();
  await assertAdmin(input.eventId, input.adminCode);
  if (!input.name.trim()) throw new Error("Event name is required.");
  if (!input.officialRule.trim()) throw new Error("Rules are required.");
  const resultMode = input.resultMode === "full_order" ? "full_order" : "winner";
  const bettingTimezone = input.bettingTimezone.trim() || DEFAULT_TIMEZONE;
  if (!input.bettingCloseAt.trim() || Number.isNaN(Date.parse(input.bettingCloseAt))) throw new Error("Bets open until needs a real date and time.");
  const event = await sql`SELECT game_type, pool_mode, host_venmo, admin_code, drop_max_number, drop_grid_columns, drop_grid_rows, drop_ticket_price, drop_winning_number FROM events WHERE id = ${input.eventId}`;
  if (!event.rowCount) throw new Error("Event not found.");
  const poolMode: PoolMode = input.poolMode === "host_managed" ? "host_managed" : "peer_to_peer";
  const hostVenmo = normalizeVenmo(input.hostVenmo ?? "");
  const betCount = Number((await sql`SELECT COUNT(*) AS count FROM bets WHERE event_id = ${input.eventId}`).rows[0]?.count ?? 0);
  const poolSettingsChanged = poolMode !== event.rows[0].pool_mode || hostVenmo !== String(event.rows[0].host_venmo ?? "");
  if (betCount > 0 && poolSettingsChanged) throw new Error("Settlement type and host Venmo are locked after the first bet.");
  if (poolMode === "host_managed" && !hostVenmo) throw new Error("Host Venmo is required for a host-maintained pool.");
  if (poolMode === "host_managed" && !String(event.rows[0].admin_code ?? "")) throw new Error("Set an admin code when creating the event before switching to a host-maintained pool.");

  if (event.rows[0].game_type === "chicken_drop") {
    const currentGrid = resolveDropGrid(event.rows[0].drop_max_number, event.rows[0].drop_grid_columns, event.rows[0].drop_grid_rows);
    const hasColumns = input.dropGridColumns != null;
    const hasRows = input.dropGridRows != null;
    if (hasColumns !== hasRows) throw new Error("Set both Chicken Drop grid columns and rows.");
    const legacyGrid = input.dropMaxNumber == null ? currentGrid : factorDropGrid(Number(input.dropMaxNumber));
    const dropGridColumns = Number(hasColumns ? input.dropGridColumns : legacyGrid.columns);
    const dropGridRows = Number(hasRows ? input.dropGridRows : legacyGrid.rows);
    const dropMaxNumber = dropGridColumns * dropGridRows;
    const dropTicketPrice = Math.round(Number(input.dropTicketPrice ?? event.rows[0].drop_ticket_price) * 100) / 100;
    if (!Number.isInteger(dropGridColumns) || dropGridColumns < 1 || !Number.isInteger(dropGridRows) || dropGridRows < 1 || dropMaxNumber < 2 || dropMaxNumber > 500) throw new Error("Chicken Drop grids need whole-number columns and rows with 2 to 500 total sections.");
    if (!Number.isFinite(dropTicketPrice) || dropTicketPrice < 0.01 || dropTicketPrice > 10_000) throw new Error("Chicken Drop ticket price must be between $0.01 and $10,000.");
    const betStats = await sql`SELECT COUNT(*) AS count, MAX(drop_number) AS max_number FROM bets WHERE event_id = ${input.eventId}`;
    const betCount = Number(betStats.rows[0]?.count ?? 0);
    const highestPick = betStats.rows[0]?.max_number == null ? 0 : Number(betStats.rows[0].max_number);
    const winningNumber = event.rows[0].drop_winning_number == null ? 0 : Number(event.rows[0].drop_winning_number);
    if (dropMaxNumber < Math.max(highestPick, winningNumber)) throw new Error("The board cannot end below an existing pick or official winning number.");
    const gridChanged = dropGridColumns !== currentGrid.columns || dropGridRows !== currentGrid.rows;
    if ((betCount > 0 || winningNumber > 0) && gridChanged) throw new Error("Grid shape is locked after the first Chicken Drop bet or official result.");
    if (betCount > 0 && Math.abs(dropTicketPrice - Number(event.rows[0].drop_ticket_price)) > 0.004) throw new Error("Ticket price is locked after the first Chicken Drop bet.");
    await sql`
      UPDATE events
      SET name = ${input.name.trim()},
          betting_close_at = ${input.bettingCloseAt.trim()},
          betting_timezone = ${bettingTimezone},
          official_rule = ${input.officialRule.trim()},
          result_mode = 'winner',
          pool_mode = ${poolMode},
          host_venmo = ${hostVenmo},
          drop_max_number = ${dropMaxNumber},
          drop_grid_columns = ${dropGridColumns},
          drop_grid_rows = ${dropGridRows},
          drop_ticket_price = ${dropTicketPrice}
      WHERE id = ${input.eventId}`;
    return getEventPayload(input.eventId);
  }

  if (!input.chickens.length || input.chickens.some((chicken) => !chicken.name.trim())) throw new Error("Every chicken needs a name.");
  if (!input.races.length || input.races.some((race) => !race.name.trim() || !race.description.trim())) throw new Error("Every race needs a name and details.");

  await sql`
    UPDATE events
    SET name = ${input.name.trim()},
        betting_close_at = ${input.bettingCloseAt.trim()},
        betting_timezone = ${bettingTimezone},
        official_rule = ${input.officialRule.trim()},
        result_mode = ${resultMode},
        pool_mode = ${poolMode},
        host_venmo = ${hostVenmo}
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
    venmo: String(row.venmo ?? ""),
    betType: String(row.bet_type) as BetType,
    stake: Number(row.stake),
    race: row.race == null ? null : Number(row.race),
    chicken1: row.chicken_1 == null ? null : Number(row.chicken_1),
    chicken2: row.chicken_2 == null ? null : Number(row.chicken_2),
    chicken3: row.chicken_3 == null ? null : Number(row.chicken_3),
    dropNumber: row.drop_number == null ? null : Number(row.drop_number),
    picks,
    createdAt: String(row.created_at),
    paymentVerified: row.payment_verified !== false
  };
}

export function makeSettlement(bets: Bet[], results: Results, chickens: Chicken[], races: Race[], hostVenmo?: string): Settlement | null {
  if (Object.keys(results).length !== races.length || bets.length < 2) return null;
  const weights = betWeights(chickens.length, races.length);
  const winners = races.map((race) => results[race.race]?.[0]);
  const tickets = bets.map((bet) => {
    const won = isWinningBet(bet, results, winners);
    const weight = weights[bet.betType] ?? 1;
    return { ...bet, won, weight, payoutWeight: won ? bet.stake * weight : 0, payout: 0, net: -bet.stake, result: won ? "Won" : "Lost", label: describeBet(bet, chickens, races) };
  }) as Settlement["tickets"];
  return finalizeSettlement(tickets, hostVenmo);
}

export function makeDropSettlement(bets: Bet[], winningNumber: number | null, hostVenmo?: string): Settlement | null {
  if (winningNumber == null || bets.length < 2) return null;
  const tickets = bets.map((bet) => {
    const won = bet.dropNumber === winningNumber;
    return {
      ...bet,
      won,
      weight: 1,
      payoutWeight: won ? bet.stake : 0,
      payout: 0,
      net: -bet.stake,
      result: won ? "Won" : "Lost",
      label: `Number #${bet.dropNumber ?? "?"}`
    };
  }) as Settlement["tickets"];
  return finalizeSettlement(tickets, hostVenmo);
}

function finalizeSettlement(tickets: Settlement["tickets"], hostVenmo?: string): Settlement {
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
    const current = map.get(ticket.bettor) ?? { bettor: ticket.bettor, venmo: ticket.venmo, staked: 0, payout: 0, net: 0 };
    if (ticket.venmo) current.venmo = ticket.venmo;
    current.staked += ticket.stake; current.payout += ticket.payout; current.net += ticket.net;
    map.set(ticket.bettor, current);
    return map;
  }, new Map<string, { bettor: string; venmo: string; staked: number; payout: number; net: number }>()).values()).sort((a, b) => b.net - a.net || a.bettor.localeCompare(b.bettor));
  const payments = hostVenmo
    ? people.filter((person) => person.payout > 0.004).map((person) => ({ from: "Pool host", fromVenmo: hostVenmo, to: person.bettor, toVenmo: person.venmo, amount: Math.round(person.payout * 100) / 100 }))
    : makePayments(people);
  return { tickets, people, payments };
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
  if (bet.betType === "drop_number") return `Number #${bet.dropNumber ?? "?"}`;
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

function makePayments(people: Array<{ bettor: string; venmo: string; staked: number; payout: number; net: number }>) {
  const debtors = people.filter((person) => person.net < -0.004).map((person) => ({ name: person.bettor, venmo: person.venmo, amount: -person.net })).sort((a, b) => b.amount - a.amount);
  const creditors = people.filter((person) => person.net > 0.004).map((person) => ({ name: person.bettor, venmo: person.venmo, amount: person.net })).sort((a, b) => b.amount - a.amount);
  const payments: Array<{ from: string; fromVenmo: string; to: string; toVenmo: string; amount: number }> = [];
  const hub = creditors[0];
  const addPayment = (from: string, fromVenmo: string, to: string, toVenmo: string, amount: number) => {
    if (amount <= 0.004 || from === to) return;
    const existing = payments.find((payment) => payment.from === from && payment.to === to);
    if (existing) existing.amount += amount;
    else payments.push({ from, fromVenmo, to, toVenmo, amount });
  };
  const nextCreditor = () => creditors.find((creditor) => creditor.amount > 0.004 && creditor !== hub) ?? creditors.find((creditor) => creditor.amount > 0.004);

  for (const debtor of debtors) {
    const first = nextCreditor();
    if (first) {
      const amount = Math.min(debtor.amount, first.amount);
      addPayment(debtor.name, debtor.venmo, first.name, first.venmo, amount);
      debtor.amount -= amount;
      first.amount -= amount;
    }
    if (debtor.amount > 0.004 && hub) {
      addPayment(debtor.name, debtor.venmo, hub.name, hub.venmo, debtor.amount);
      hub.amount -= debtor.amount;
      debtor.amount = 0;
    }
  }

  if (hub) {
    for (const creditor of creditors) {
      if (creditor !== hub && creditor.amount > 0.004) {
        addPayment(hub.name, hub.venmo, creditor.name, creditor.venmo, creditor.amount);
        hub.amount -= creditor.amount;
        creditor.amount = 0;
      }
    }
  }

  return payments.map((payment) => ({ ...payment, amount: Math.round(payment.amount * 100) / 100 })).filter((payment) => payment.amount > 0);
}

