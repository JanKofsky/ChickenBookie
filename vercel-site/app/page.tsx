"use client";

import { FormEvent, useEffect, useId, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { Bet, BetType, Chicken, EventPayload, GameType, PoolMode, Race, Results } from "../lib/chickenBookie";

const BET_TYPES: Record<BetType, string> = {
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
const simpleBetTypes: BetType[] = ["race_winner", "any_win", "any_order_three", "exact_ticket", "sweep"];
const fullOrderBetTypes: BetType[] = ["race_winner", "race_place", "race_show", "exacta", "trifecta", "any_win", "any_order_three", "exact_ticket", "sweep"];
const raceBetTypes: BetType[] = ["race_winner", "race_place", "race_show", "exacta", "trifecta"];
const showMerchTab = false;
const FALLBACK_TIME_ZONES = [
  { value: "America/New_York", label: "Eastern time" },
  { value: "America/Chicago", label: "Central time" },
  { value: "America/Denver", label: "Mountain time" },
  { value: "America/Los_Angeles", label: "Pacific time" },
  { value: "Europe/London", label: "Europe/London" },
  { value: "Europe/Paris", label: "Europe/Paris" },
  { value: "Europe/Berlin", label: "Europe/Berlin" },
  { value: "Europe/Madrid", label: "Europe/Madrid" },
  { value: "Europe/Rome", label: "Europe/Rome" },
  { value: "Asia/Dubai", label: "Asia/Dubai" },
  { value: "Asia/Kolkata", label: "Asia/Kolkata" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo" },
  { value: "Asia/Shanghai", label: "Asia/Shanghai" },
  { value: "Australia/Sydney", label: "Australia/Sydney" },
  { value: "Pacific/Auckland", label: "Pacific/Auckland" }
];
const supportedTimeZones = (Intl as unknown as { supportedValuesOf?: (key: "timeZone") => string[] }).supportedValuesOf;
const TIME_ZONES = typeof supportedTimeZones === "function"
  ? supportedTimeZones("timeZone").map((zone) => ({ value: zone, label: zone.replaceAll("_", " ") }))
  : FALLBACK_TIME_ZONES;
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);
const dateTimeInputValue = (value: string, timeZone = "America/New_York") => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
};
const zonedDateTimeToIso = (value: string, timeZone: string) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return value;
  const [, year, month, day, hour, minute] = match.map(Number);
  let utc = Date.UTC(year, month - 1, day, hour, minute);
  for (let index = 0; index < 3; index += 1) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).formatToParts(new Date(utc));
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
    const asZoneUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
    const targetUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
    utc += targetUtc - asZoneUtc;
  }
  return new Date(utc).toISOString();
};
const countdownParts = (target: string, now: number) => {
  const remaining = Math.max(0, Date.parse(target) - now);
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1_000);
  return { days, hours, minutes, seconds, closed: remaining === 0 };
};
const pickedChickenIds = (bet: Bet) => {
  const ids = bet.picks.length ? bet.picks : [bet.chicken1, bet.chicken2, bet.chicken3];
  return ids.map(Number).filter(Boolean);
};
const normalizeName = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
const countedBets = (payload: EventPayload) => payload.bets.filter((bet) => bet.paymentVerified);
const isResultsOfficial = (payload: EventPayload) => payload.event.gameType === "chicken_drop"
  ? payload.event.dropWinningNumber != null
  : Object.keys(payload.results).length > 0;

function friendlyError(message: string) {
  if (message.includes("missing_connection_string") || message.includes("POSTGRES_URL")) {
    return "The coop database is not connected yet. Add the Supabase Postgres env vars in Vercel, then redeploy.";
  }
  if (message.includes("duplicate key") || message.includes("events_code_key")) {
    return "That event code is already taken. Try another one.";
  }
  return message;
}

export default function Home() {
  const [eventCode, setEventCode] = useState("");
  const [payload, setPayload] = useState<EventPayload | null>(null);
  const [createdAdminCode, setCreatedAdminCode] = useState("");
  const [tab, setTab] = useState("bet");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(Date.now());

  async function loadEvent(code = eventCode) {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/event?code=${encodeURIComponent(code)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(friendlyError(data.error ?? "Could not load event."));
      setPayload(data); setEventCode(data.event.code);
      setCreatedAdminCode("");
      setTab("bet");
      window.history.replaceState(null, "", `?event=${encodeURIComponent(data.event.code)}`);
    } catch (err) {
      setError(err instanceof Error ? friendlyError(err.message) : "Could not load event.");
    } finally { setLoading(false); }
  }

  function leaveEvent() {
    setPayload(null);
    setCreatedAdminCode("");
    setEventCode("");
    setTab("bet");
    setError("");
    window.history.replaceState(null, "", "/");
  }

  function openCreated(data: EventPayload, adminCode: string) {
    setPayload(data);
    setCreatedAdminCode(adminCode);
    setEventCode(data.event.code);
    setTab("boss");
    window.history.replaceState(null, "", `?event=${encodeURIComponent(data.event.code)}`);
  }

  const totalPool = useMemo(() => payload ? countedBets(payload).reduce((sum, bet) => sum + Number(bet.stake), 0) : 0, [payload]);
  const countdown = payload ? countdownParts(payload.event.bettingCloseAt, now) : null;
  const resultsOfficial = payload ? isResultsOfficial(payload) : false;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("event");
    if (code) loadEvent(code);
  }, []);

  return (
    <main className="shell">
      {payload && (
        <div className="app-topbar">
          <a className="brand" href="/" onClick={(event) => { event.preventDefault(); leaveEvent(); }}>
            <span>Chicken Bookie</span>
            <img src="/assets/chicken_bookie_logo.png" alt="Chicken Bookie logo" />
          </a>
          <button type="button" className="ghost-button" onClick={leaveEvent}>Back to main page</button>
        </div>
      )}
      <header className="hero">
        <section className="hero-grid">
          <div>
            <div className="hero-title">
              <h1>{payload?.event.name ?? "Chicken Bookie"}</h1>
              {!payload && <img className="hero-logo" src="/assets/chicken_bookie_logo.png" alt="Chicken Bookie logo" />}
            </div>
            <p className="hero-subtitle">{payload ? payload.event.gameType === "chicken_drop" ? `Chicken Drop | ${payload.event.dropGridColumns} × ${payload.event.dropGridRows} grid | ${payload.event.dropMaxNumber} sections | ${money(payload.event.dropTicketPrice)} per ticket` : `${payload.chickens.length} chickens | ${payload.races.length} races` : "a private barnyard betting tool"}</p>
            {payload ? <p className="lede">{payload.event.officialRule}</p> : (
              <form className="event-switch hero-switch" onSubmit={(event) => { event.preventDefault(); loadEvent(); }}>
                <input value={eventCode} onChange={(event) => setEventCode(event.target.value)} aria-label="Event code" placeholder="Event code here" />
                <button type="submit">Open event</button>
              </form>
            )}
            {payload && countdown && <Countdown parts={countdown} closeAt={payload.event.bettingCloseAt} resultsOfficial={resultsOfficial} />}
          </div>
          {payload && (
            <div className="scoreboard">
              <Stat label="Event code" value={payload.event.code} highlight />
              <Stat label="Counted bets" value={String(countedBets(payload).length)} />
              {payload.event.poolMode === "host_managed" && <Stat label="Payment pending" value={String(payload.bets.length - countedBets(payload).length)} />}
              <Stat label="Cluck bucket" value={money(totalPool)} />
            </div>
          )}
        </section>
      </header>

      {error && <div className="notice error">{error}</div>}
      {loading && <div className="notice">Loading the coop...</div>}
      {!payload ? <div className="setup-panel"><CreateEvent onCreated={openCreated} /></div> : (
        <>
          <div className="tabs" role="tablist">
            {(payload.event.gameType === "chicken_drop" ? [
              ["bet", "Betting Coop"],
              ["numbers", "Live Betting Board"],
              ["winners", "Winner's Circle"],
              ["boss", "Coop Boss"]
            ] : [
              ["bet", "Betting Coop"],
              ["flock", "Contenders & Races"],
              ["tickets", "Ticket Board"],
              ["winners", "Winner's Circle"],
              ["boss", "Coop Boss"],
              ...(showMerchTab ? [["merch", "Merch"]] : [])
            ]).map(([id, label]) => (
              <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>
            ))}
          </div>
          {tab === "bet" && (payload.event.gameType === "chicken_drop" ? <DropBetting payload={payload} setPayload={setPayload} /> : <Betting payload={payload} setPayload={setPayload} />)}
          {tab === "numbers" && <DropNumberBoard payload={payload} />}
          {tab === "flock" && <Flock chickens={payload.chickens} races={payload.races} officialRule={payload.event.officialRule} />}
          {tab === "tickets" && <Tickets bets={payload.bets} chickens={payload.chickens} races={payload.races} />}
          {tab === "winners" && <Winners payload={payload} />}
          {tab === "boss" && <CoopBoss payload={payload} setPayload={setPayload} initialAdminCode={createdAdminCode} />}
          {tab === "merch" && <section className="panel"><h2>Merch</h2><p className="muted">Chicken Bookie merch is warming up in the coop.</p></section>}
        </>
      )}
      <footer className="site-footer"><a href="/about">About</a><a href="/merch">Merch</a><a href="/privacy">Privacy &amp; Terms</a><a href="/contact">Contact</a></footer>
    </main>
  );
}

function Stat({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return <div className={highlight ? "scoreboard-highlight" : undefined}><span>{label}</span><strong>{value}</strong></div>;
}

function Countdown({ parts, closeAt, resultsOfficial }: { parts: ReturnType<typeof countdownParts>; closeAt: string; resultsOfficial: boolean }) {
  const closeDate = new Date(closeAt);
  const closeLabel = Number.isNaN(closeDate.getTime()) ? closeAt : closeDate.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  if (resultsOfficial) return <div className="countdown"><span>results are official</span><strong>bets closed</strong></div>;
  if (parts.closed) return <div className="countdown"><span>bets closed</span><strong>time's up</strong></div>;
  return <div className="countdown" aria-label={`Bets open until ${closeLabel}`}><span>bets open until {closeLabel}</span><strong>{parts.days}d {String(parts.hours).padStart(2, "0")}h {String(parts.minutes).padStart(2, "0")}m {String(parts.seconds).padStart(2, "0")}s</strong></div>;
}

function CreateEvent({ onCreated }: { onCreated: (payload: EventPayload, adminCode: string) => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [showAdminCode, setShowAdminCode] = useState(false);
  const [gameType, setGameType] = useState<GameType>("race");
  const [resultMode, setResultMode] = useState<"winner" | "full_order">("winner");
  const [dropGridColumns, setDropGridColumns] = useState("6");
  const [dropGridRows, setDropGridRows] = useState("5");
  const [dropTicketPrice, setDropTicketPrice] = useState("5");
  const [copyCode, setCopyCode] = useState("");
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setMessage("");
    const response = await fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, code, adminCode, gameType, resultMode, dropGridColumns: Number(dropGridColumns), dropGridRows: Number(dropGridRows), dropTicketPrice: Number(dropTicketPrice), copyCode: gameType === "race" ? copyCode : "" }) });
    const data = await response.json();
    if (!response.ok) setMessage(friendlyError(data.error ?? "Could not create event.")); else onCreated(data, adminCode);
  }
  return <section className="panel"><h2>Make an event</h2><form className="grid-form" onSubmit={submit}>
    <label>Event name<input value={name} onChange={(event) => setName(event.target.value)} /></label>
    <label>Event code<input value={code} onChange={(event) => setCode(event.target.value.toLowerCase())} /></label>
    <label className="wide-field">Event format<select value={gameType} onChange={(event) => setGameType(event.target.value as GameType)}><option value="race">Chicken Race</option><option value="chicken_drop">Chicken Drop (aka Chicken Shit Bingo)</option></select></label>
    {gameType === "race" ? <>
      <label>Race result style<select value={resultMode} onChange={(event) => setResultMode(event.target.value as "winner" | "full_order")}><option value="winner">only track the winner</option><option value="full_order">rank the whole flock</option></select></label>
      <label>Copy event code (optional)<input value={copyCode} onChange={(event) => setCopyCode(event.target.value)} /></label>
    </> : <>
      <label>Grid columns (across)<input type="number" min="1" max="500" step="1" value={dropGridColumns} onChange={(event) => setDropGridColumns(event.target.value)} /></label>
      <label>Grid rows (down)<input type="number" min="1" max="500" step="1" value={dropGridRows} onChange={(event) => setDropGridRows(event.target.value)} /></label>
      <label>Cost per ticket<input type="number" min="0.01" max="10000" step="0.01" value={dropTicketPrice} onChange={(event) => setDropTicketPrice(event.target.value)} /></label>
      <p className="fine-print wide-field"><b>{Number(dropGridColumns) || 0} columns × {Number(dropGridRows) || 0} rows = {(Number(dropGridColumns) || 0) * (Number(dropGridRows) || 0)} numbered sections.</b> Players pick directly from this exact grid shape. More than one ticket can land on the same number, and every ticket costs the same amount.</p>
    </>}
    <label>Admin code (required)<input required type={showAdminCode ? "text" : "password"} placeholder="only the event admin should know this" value={adminCode} onChange={(event) => setAdminCode(event.target.value)} /></label>
    <p className="fine-print wide-field">Write this down now; Chicken Bookie will not show it again. After creation, Coop Boss will ask you to choose the settlement method before sharing the event.</p>
    <label className="check-row"><input type="checkbox" checked={showAdminCode} onChange={(event) => setShowAdminCode(event.target.checked)} /> Show admin code</label>
    <button type="submit">Create</button>{message && <p className="form-error">{message}</p>}
  </form></section>;
}

function DropBetting({ payload, setPayload }: { payload: EventPayload; setPayload: (payload: EventPayload) => void }) {
  const [bettor, setBettor] = useState("");
  const [venmo, setVenmo] = useState("");
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const resultsOfficial = isResultsOfficial(payload);
  const existingName = useMemo(() => {
    const normalized = normalizeName(bettor);
    if (!normalized) return "";
    return payload.bets.find((bet) => normalizeName(bet.bettor) === normalized)?.bettor ?? "";
  }, [bettor, payload.bets]);
  const existingVenmo = useMemo(() => payload.bets.find((bet) => normalizeName(bet.bettor) === normalizeName(bettor))?.venmo ?? "", [bettor, payload.bets]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setMessage("");
    if (resultsOfficial) { setMessage("The drop result is official. Betting is closed."); return; }
    if (selectedNumber == null) { setMessage("Pick a number from the grid."); return; }
    const response = await fetch("/api/bets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: payload.event.id, bettor, venmo, dropNumber: selectedNumber })
    });
    const data = await response.json();
    if (!response.ok) setMessage(friendlyError(data.error ?? "Could not add Chicken Drop bet."));
    else { setPayload(data); setSelectedNumber(null); setMessage(payload.event.poolMode === "host_managed" ? "Bet added to your unpaid total. Add another ticket or pay the combined total below." : "Bet added."); }
  }

  return <section className="panel drop-betting-panel">
    <div className="panel-title-row"><h2>Chicken Drop betting grid</h2><SettlementHelpTip payload={payload} /></div>
    <p className="muted"><b>Chicken Drop:</b> pick the numbered square where the chicken will make its first confirmed drop.</p>
    <div className="drop-price-card"><span>Fixed cost per ticket</span><strong>{money(payload.event.dropTicketPrice)}</strong><small>Repeat picks on the same number are allowed.</small></div>
    {payload.event.poolMode === "host_managed" && <div className="notice"><b>Pay once when you are finished:</b> 1. Add all your tickets. 2. Pay the running total once. 3. The host confirms every covered ticket together.</div>}
    {resultsOfficial && <div className="notice">The official drop is #{payload.event.dropWinningNumber}. The board stays visible, but new bets are closed. Coop Boss can clear the result to reopen betting before the close time.</div>}
    <form className="drop-bet-form" onSubmit={submit}>
      {!resultsOfficial && <div className="drop-player-fields">
        <label>Name<input value={bettor} onChange={(event) => setBettor(event.target.value)} />{existingName && <small className="field-note">this ticket will be grouped with the previous bettor using this name</small>}</label>
        <label>Venmo {payload.event.poolMode === "host_managed" ? "(required)" : "(optional)"}<div className="venmo-input"><span>@</span><input required={payload.event.poolMode === "host_managed"} value={venmo} placeholder={existingVenmo.replace(/^@/, "") || "username"} onChange={(event) => setVenmo(event.target.value.replace(/^@+/, ""))} /></div></label>
      </div>}
      <DropNumberGrid payload={payload} selectedNumber={selectedNumber} onSelect={resultsOfficial ? undefined : setSelectedNumber} />
      {!resultsOfficial && <button type="submit" className="drop-submit" disabled={selectedNumber == null}>{selectedNumber == null ? "Pick a number to add a ticket" : payload.event.poolMode === "host_managed" ? `Add #${selectedNumber} to my unpaid total` : `Place ${money(payload.event.dropTicketPrice)} bet on #${selectedNumber}`}</button>}
      <p className="fine-print">{payload.event.poolMode === "host_managed" ? "Chicken Bookie records the host's payment confirmation; Venmo processes the actual payment." : "Chicken Bookie tracks Cluck Bucks and settlement math; it does not collect, hold, process, or transfer money."}</p>
      {message && <p className={message.includes("added") || message.includes("submitted") ? "form-ok" : "form-error"}>{message}</p>}
    </form>
    {payload.event.poolMode === "host_managed" && <HostPaymentSummary payload={payload} bettor={bettor} />}
  </section>;
}

function DropNumberBoard({ payload }: { payload: EventPayload }) {
  return <section className="panel"><h2>Live Betting Board</h2><p className="muted">Brighter coral means more tickets have been placed on that number.</p><DropBoardInsights payload={payload} /><DropNumberGrid payload={payload} /></section>;
}

function DropBoardInsights({ payload }: { payload: EventPayload }) {
  const counts = new Map<number, number>();
  for (const bet of countedBets(payload)) {
    if (bet.dropNumber != null) counts.set(bet.dropNumber, (counts.get(bet.dropNumber) ?? 0) + 1);
  }
  const numbers = Array.from({ length: payload.event.dropMaxNumber }, (_, index) => index + 1);
  const fewestTickets = Math.min(...numbers.map((number) => counts.get(number) ?? 0));
  const bestNumbers = numbers.filter((number) => (counts.get(number) ?? 0) === fewestTickets);
  const currentPool = countedBets(payload).reduce((sum, bet) => sum + Number(bet.stake), 0);
  const projectedReturn = (currentPool + payload.event.dropTicketPrice) / (fewestTickets + 1);
  const chance = 100 / payload.event.dropMaxNumber;
  const sectionLabel = bestNumbers.slice(0, 8).map((number) => `#${number}`).join(", ");
  const extra = bestNumbers.length > 8 ? ` + ${bestNumbers.length - 8} more` : "";
  const closed = isResultsOfficial(payload);
  return <div className="drop-insights">
    <div><span>Assumed chance per section</span><strong>1 in {payload.event.dropMaxNumber} <small>({chance.toFixed(chance < 1 ? 2 : 1)}%)</small></strong></div>
    <div><span>{closed ? "Board status" : "Best projected return for next ticket"}</span><strong>{closed ? "Betting closed" : money(projectedReturn)}</strong></div>
    <div><span>Least crowded sections</span><strong>{sectionLabel}{extra}</strong><small>{fewestTickets} current ticket{fewestTickets === 1 ? "" : "s"} each</small></div>
    <p>Projection is total return, including the ticket stake, if no more bets arrive and one of those sections wins. Physical chicken behavior may not make every grid section equally likely.</p>
  </div>;
}

function DropNumberGrid({ payload, selectedNumber = null, onSelect }: { payload: EventPayload; selectedNumber?: number | null; onSelect?: (value: number | null) => void }) {
  const hintId = useId();
  const columns = payload.event.dropGridColumns;
  const rows = payload.event.dropGridRows;
  const numbers = Array.from({ length: payload.event.dropMaxNumber }, (_, index) => index + 1);
  const stats = new Map<number, { count: number; amount: number }>();
  for (const bet of countedBets(payload)) {
    if (bet.dropNumber == null) continue;
    const current = stats.get(bet.dropNumber) ?? { count: 0, amount: 0 };
    current.count += 1;
    current.amount += Number(bet.stake);
    stats.set(bet.dropNumber, current);
  }
  return <div className="drop-board-wrap">
    <div className="drop-heat-legend" aria-label="Bet heat legend"><span>bet heat</span>{[0, 1, 2, 3, 4].map((level) => <i className={`heat-${level}`} key={level} title={level === 4 ? "4 or more bets" : `${level} bet${level === 1 ? "" : "s"}`} />)}<small>0 to 4+ bets</small></div>
    <p className="drop-grid-hint" id={hintId}><b>{columns} columns × {rows} rows.</b> Numbers run left to right, then top to bottom. Swipe or scroll sideways if the full board does not fit.</p>
    <div className="drop-grid-scroll" role="region" tabIndex={0} aria-label={`${columns}-column by ${rows}-row Chicken Drop board`} aria-describedby={hintId}>
      <div className="drop-grid" style={{ gridTemplateColumns: `repeat(${columns}, var(--drop-cell-size))`, gridTemplateRows: `repeat(${rows}, var(--drop-cell-size))` }}>
        {numbers.map((number) => {
          const stat = stats.get(number) ?? { count: 0, amount: 0 };
          const selected = selectedNumber === number;
          const winning = payload.event.dropWinningNumber === number;
          const heatLevel = Math.min(4, stat.count);
          const row = Math.floor((number - 1) / columns) + 1;
          const column = ((number - 1) % columns) + 1;
          return <button type="button" key={number} disabled={!onSelect} aria-pressed={onSelect ? selected : undefined} aria-label={`Number ${number}, row ${row}, column ${column}, ${stat.count} bets, ${money(stat.amount)}${winning ? ", official winner" : ""}`} className={`drop-square heat-${heatLevel}${selected ? " selected" : ""}${winning ? " winning" : ""}`} onClick={() => onSelect?.(selected ? null : number)}>
            <span>#{number}</span><small>{stat.count} bet{stat.count === 1 ? "" : "s"}</small><strong>{money(stat.amount)}</strong>{selected && <em>your pick</em>}{winning && <em>official drop</em>}
          </button>;
        })}
      </div>
    </div>
  </div>;
}

function Betting({ payload, setPayload }: { payload: EventPayload; setPayload: (payload: EventPayload) => void }) {
  const [bettor, setBettor] = useState("");
  const [venmo, setVenmo] = useState("");
  const [stake, setStake] = useState("");
  const [betType, setBetType] = useState<BetType>("race_winner");
  const [race, setRace] = useState(payload.races[0]?.race ?? 1);
  const [picks, setPicks] = useState<number[]>([]);
  const [message, setMessage] = useState("");
  const availableBetTypes = payload.event.resultMode === "full_order" ? fullOrderBetTypes : simpleBetTypes;
  const needed = betType === "exact_ticket" || betType === "any_order_three" ? payload.races.length : betType === "exacta" ? 2 : betType === "trifecta" ? 3 : 1;
  const selectedPicks = picks.slice(0, needed);
  const resultsOfficial = Object.keys(payload.results).length > 0;
  const existingName = useMemo(() => {
    const normalized = normalizeName(bettor);
    if (!normalized) return "";
    return payload.bets.find((bet) => normalizeName(bet.bettor) === normalized)?.bettor ?? "";
  }, [bettor, payload.bets]);
  const existingVenmo = useMemo(() => payload.bets.find((bet) => normalizeName(bet.bettor) === normalizeName(bettor))?.venmo ?? "", [bettor, payload.bets]);
  async function submit(event: FormEvent) {
    event.preventDefault(); setMessage("");
    if (resultsOfficial) { setMessage("Results are official. Betting is closed."); return; }
    const stakeValue = Number(stake);
    if (!Number.isFinite(stakeValue) || stakeValue <= 0) { setMessage("Enter Cluck Bucks greater than zero."); return; }
    if (selectedPicks.length !== needed) { setMessage(`Pick ${needed} chicken${needed === 1 ? "" : "s"}.`); return; }
    const response = await fetch("/api/bets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: payload.event.id, bettor, venmo, stake: stakeValue, betType, race: raceBetTypes.includes(betType) ? race : null, picks: selectedPicks }) });
    const data = await response.json();
    if (!response.ok) setMessage(friendlyError(data.error ?? "Could not add bet.")); else { setPayload(data); setPicks([]); setMessage(payload.event.poolMode === "host_managed" ? "Bet added to your unpaid total. Add another bet or pay the combined total below." : "Bet added."); }
  }
  if (resultsOfficial) return <section className="panel"><div className="panel-title-row"><h2>Betting Coop</h2><SettlementHelpTip payload={payload} /></div><p className="muted">Results are official, so betting is closed for this event.</p><p className="fine-print">Coop Boss can reopen betting only by clearing the winners and setting a new future close time.</p></section>;
  return <section className="panel"><div className="panel-title-row"><h2>Betting Coop</h2><SettlementHelpTip payload={payload} /></div><p className="muted">Use the same name each time. Every Cluck Buck goes into one shared feed bucket for scorekeeping.</p>{payload.event.poolMode === "host_managed" ? <div className="notice"><b>Pay once when you are finished:</b> 1. Add all your bets. 2. Pay the running total once. 3. The host confirms every covered bet together.</div> : <p className="fine-print">Chicken Bookie tracks Cluck Bucks and settlement math; it does not collect, hold, process, or transfer money.</p>}<form className="bet-form" onSubmit={submit}>
    <label>Name<input value={bettor} onChange={(event) => setBettor(event.target.value)} />{existingName && <small className="field-note">this ticket will be grouped with the previous bettor using this name</small>}</label>
    <label>Venmo {payload.event.poolMode === "host_managed" ? "(required)" : "(optional)"}<div className="venmo-input"><span>@</span><input required={payload.event.poolMode === "host_managed"} value={venmo} placeholder={existingVenmo.replace(/^@/, "") || "username"} onChange={(event) => setVenmo(event.target.value.replace(/^@+/, ""))} /></div></label>
    <label>Cluck Bucks<input type="number" min="1" step="1" inputMode="decimal" value={stake} onChange={(event) => setStake(event.target.value)} /></label>
    {payload.event.poolMode === "host_managed" && Number(stake) > 0 && <p className="fine-print">This {money(Number(stake))} bet will be added to your running unpaid total.</p>}
    <label>Bet type<select value={betType} onChange={(event) => { setBetType(event.target.value as BetType); setPicks([]); }}>{availableBetTypes.map((key) => <option key={key} value={key}>{BET_TYPES[key]}</option>)}</select></label>
    {raceBetTypes.includes(betType) && <label>Race<select value={race} onChange={(event) => setRace(Number(event.target.value))}>{payload.races.map((race) => <option key={race.race} value={race.race}>{race.name}</option>)}</select></label>}
    <ChickenPicker chickens={payload.chickens} picks={selectedPicks} setPicks={setPicks} count={needed} exact={betType === "exact_ticket" || betType === "exacta" || betType === "trifecta"} races={payload.races} labels={betType === "exacta" ? ["1st place", "2nd place"] : betType === "trifecta" ? ["1st place", "2nd place", "3rd place"] : undefined} />
    <button type="submit">{payload.event.poolMode === "host_managed" ? "Add bet to my unpaid total" : "Add bet"}</button>{message && <p className={message.includes("added") || message.includes("submitted") ? "form-ok" : "form-error"}>{message}</p>}
  </form>{payload.event.poolMode === "host_managed" && <HostPaymentSummary payload={payload} bettor={bettor} />}</section>;
}

function SettlementHelpTip({ payload }: { payload: EventPayload }) {
  const hostManaged = payload.event.poolMode === "host_managed";
  const isDropEvent = payload.event.gameType === "chicken_drop";
  const tipId = useId();
  return <span className="help-tip" tabIndex={0} role="button" aria-label="How betting and settlement work" aria-describedby={tipId}>
    <span aria-hidden="true">?</span>
    <span className="help-tip-content" id={tipId}>
      <b>{isDropEvent ? "Chicken Drop" : "Chicken Race"} · {hostManaged ? "Host-maintained pool" : "Player-to-player settlement"}</b>
      {hostManaged
        ? `Send ${isDropEvent ? "the fixed ticket price" : "each race-bet stake"} to ${payload.event.hostVenmo}. The ${isDropEvent ? "square" : "bet"} stays pending until the host confirms payment. After the official result, the host sends each bettor's full payout.`
        : `Venmo is optional. After the official ${isDropEvent ? "winning square" : "race results"}, Chicken Bookie suggests direct player-to-player payments; players decide whether and how to settle.`}
      <small>{isDropEvent
        ? "Tickets on the winning square get their ticket price back and split the losing-square pool equally. If nobody picked it, all counted tickets are refunded."
        : "Winning race tickets get their stake back and share the losing-ticket pool based on bet difficulty. If no ticket wins, all counted bets are refunded."}</small>
    </span>
  </span>;
}

function ChickenPicker({ chickens, picks, setPicks, count, exact, races, labels }: { chickens: Chicken[]; picks: number[]; setPicks: (picks: number[]) => void; count: number; exact: boolean; races: Race[]; labels?: string[] }) {
  if (exact) {
    const fields = labels ?? races.map((race) => race.name);
    return <div className="pick-grid">{fields.slice(0, count).map((label, idx) => <label key={label}>{label}<select value={picks[idx] ?? ""} onChange={(event) => { const next = [...picks]; next[idx] = Number(event.target.value); setPicks(next); }}><option value="">Pick chicken</option>{chickens.map((chicken) => <option key={chicken.id} value={chicken.id}>{chicken.name}</option>)}</select></label>)}</div>;
  }
  return <div className="chicken-buttons">{chickens.map((chicken) => {
    const active = picks.includes(chicken.id);
    return <button type="button" key={chicken.id} className={active ? "selected" : ""} onClick={() => setPicks(active ? picks.filter((id) => id !== chicken.id) : [...picks, chicken.id].slice(-count))}><span>#{chicken.slot}</span>{chicken.name}</button>;
  })}</div>;
}

function ChickenPhoto({ chicken, preview = false }: { chicken: Chicken; preview?: boolean }) {
  if (!chicken.photoUrl) return null;
  if (chicken.photoUrl !== "/assets/test-flock-contenders.png") return <img src={chicken.photoUrl} alt={`${chicken.name} chicken${preview ? " preview" : ""}`} />;
  const column = (chicken.slot - 1) % 5;
  const row = Math.floor((chicken.slot - 1) / 5);
  const style = { left: `-${column * 100}%`, top: `-${row * 100}%` } satisfies CSSProperties;
  return <div className="chicken-photo test-flock-photo"><img src={chicken.photoUrl} alt={`${chicken.name} fictional chicken${preview ? " preview" : ""}`} style={style} /></div>;
}

function Flock({ chickens, races, officialRule }: { chickens: Chicken[]; races: Race[]; officialRule: string }) {
  return <section className="split"><div className="panel"><h2>Starting Flock</h2><div className="flock-grid">{chickens.map((chicken) => <div className="bird" key={chicken.id}><ChickenPhoto chicken={chicken} /><span>#{chicken.slot}</span><strong>{chicken.name}</strong>{chicken.bio && <p>{chicken.bio}</p>}</div>)}</div></div><div className="panel"><h2>Race card</h2><article className="race-card race-rules-card"><h3>race rules</h3><p>{officialRule}</p></article>{races.map((race) => <article className="race-card" key={race.race}><span>Race {race.race}</span><h3>{race.name}</h3><p>{race.description}</p></article>)}</div></section>;
}

function Tickets({ bets, chickens, races }: { bets: Bet[]; chickens: Chicken[]; races: Race[] }) {
  return <section className="panel"><h2>Ticket Board</h2><ChickenStatsPanel bets={bets.filter((bet) => bet.paymentVerified)} chickens={chickens} />{bets.length === 0 ? <p className="muted">No bets yet.</p> : <div className="ticket-table"><div className="ticket-row ticket-head"><span>Name</span><span>Win condition</span><span>Cluck Bucks</span></div>{bets.map((bet) => <div className={`ticket-row${bet.paymentVerified ? "" : " pending-ticket"}`} key={bet.id}><strong>{bet.bettor}{!bet.paymentVerified && <small className="field-note">payment pending</small>}</strong><span>{BET_TYPES[bet.betType]} - {describeBet(bet, chickens, races)}</span><b>{money(bet.stake)}</b></div>)}</div>}</section>;
}

function ChickenStatsPanel({ bets, chickens }: { bets: Bet[]; chickens: Chicken[] }) {
  const stats = chickens.map((chicken) => {
    const matching = bets.filter((bet) => pickedChickenIds(bet).includes(chicken.id));
    return { chicken, tickets: matching.length, cluckBucks: matching.reduce((sum, bet) => sum + Number(bet.stake), 0) };
  }).sort((a, b) => b.tickets - a.tickets || b.cluckBucks - a.cluckBucks || a.chicken.slot - b.chicken.slot);
  const maxTickets = Math.max(1, ...stats.map((stat) => stat.tickets));
  return <div className="chicken-stats"><div><span>live flock board</span></div>{stats.map((stat) => <div className="stat-bar" key={stat.chicken.id}><span>{stat.chicken.name}</span><div><i style={{ width: stat.tickets === 0 ? "0%" : `${Math.max(8, (stat.tickets / maxTickets) * 100)}%` }} /></div><b>{stat.tickets} ticket{stat.tickets === 1 ? "" : "s"} | {money(stat.cluckBucks)}</b></div>)}</div>;
}

function Winners({ payload }: { payload: EventPayload }) {
  if (countedBets(payload).length < 2) return <section className="panel"><h2>Winner's Circle</h2><SettlementExplainer payload={payload} /><p className="muted">Oh cluck, not enough confirmed bets yet. Add at least two counted tickets before the feed bucket math is worth settling.</p></section>;
  if (!payload.settlement) return <section className="panel"><h2>Winner's Circle</h2><SettlementExplainer payload={payload} /><p className="muted">{payload.event.gameType === "chicken_drop" ? "The Coop Boss needs to enter the official drop number before settlement is shown." : "The Coop Boss needs to enter every race winner before settlement is shown."}</p></section>;
  const payments = [...payload.settlement.payments].sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || b.amount - a.amount);
  const hostManaged = payload.event.poolMode === "host_managed";
  return <section className="panel"><h2>Winner's Circle</h2><SettlementExplainer payload={payload} /><WinnerCallout payload={payload} /><h3>{hostManaged ? "Host payout checklist" : "Optional who-pays-whom plan"}</h3><div className="payment-list">{payments.length === 0 ? <p>No payments needed.</p> : payments.map((payment, idx) => <div className="payment" key={idx}><span><b>{payment.from}</b> pays <b>{payment.to}</b>{payment.toVenmo && <VenmoHandle handle={payment.toVenmo} />}</span><strong>{money(payment.amount)}</strong></div>)}</div><h3>{hostManaged ? "Host payout overview" : "Settlement overview"}</h3><SettlementLedger people={payload.settlement.people} showPayout={hostManaged} /></section>;
}

function SettlementExplainer({ payload }: { payload: EventPayload }) {
  const isHostManaged = payload.event.poolMode === "host_managed";
  const isDropEvent = payload.event.gameType === "chicken_drop";
  const pendingCount = payload.bets.length - countedBets(payload).length;
  return <details className="settlement-explainer" open>
    <summary>How this {isDropEvent ? "Chicken Drop" : "Chicken Race"} {isHostManaged ? "host pool" : "player settlement"} works</summary>
    <div>
      <p><b>{isHostManaged ? "Host-maintained pool:" : "Player-to-player settlement:"}</b> {isHostManaged
        ? isDropEvent
          ? "Players send the fixed ticket price to the host. Only squares whose payments the host confirms enter the pool. After the winning square is official, the host sends each player the full payout shown below."
          : "Bettors send each race-bet stake to the host. Only bets whose payments the host confirms enter the pool. After race results are official, the host sends each bettor the full payout shown below."
        : isDropEvent
          ? "Venmo is not required and nobody prepays the site or host. After the winning square is official, the optional payment list shows how players could settle the Chicken Drop directly with one another."
          : "Venmo is not required and nobody prepays the site or host. After race results are official, the optional payment list shows how bettors could settle directly with one another."}</p>
      <p><b>{isDropEvent ? "Chicken Drop" : "Chicken Race"} {isHostManaged ? "payout" : "settlement"} math:</b> {isDropEvent
        ? "Every counted ticket on the winning square gets its ticket price back, then those tickets split the losing-square pool equally. If nobody picked the winning square, every counted ticket is refunded."
        : "Each winning ticket gets its stake back, then winning tickets share the losing-ticket pool based on bet difficulty. If no ticket wins, every counted bet is refunded."}</p>
      {isHostManaged && pendingCount > 0 && <p><b>{pendingCount} payment-pending bet{pendingCount === 1 ? " is" : "s are"} excluded</b> from bet counts, pool totals, boards, and payouts until the host confirms receipt.</p>}
      {payload.settlement && <p><b>{isHostManaged ? "Host payout overview:" : "Settlement overview:"}</b> Each bar is net P/L (profit or loss), and the right column shows return percentage{isHostManaged ? " plus the amount the host pays" : ""}. Hover over a bar for the original stake and full details.</p>}
    </div>
  </details>;
}

function VenmoHandle({ handle }: { handle: string }) {
  const [copied, setCopied] = useState(false);
  async function copyHandle() {
    try {
      await navigator.clipboard.writeText(handle);
    } catch {
      const field = document.createElement("textarea");
      field.value = handle;
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      document.execCommand("copy");
      field.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }
  return <button type="button" className="venmo-handle" title={`Copy ${handle}`} aria-label={`Copy Venmo handle ${handle}`} onClick={copyHandle}><span>{handle}</span><small aria-live="polite">{copied ? "Copied!" : "Copy"}</small></button>;
}

function HostPaymentSummary({ payload, bettor }: { payload: EventPayload; bettor: string }) {
  const [copied, setCopied] = useState("");
  const normalizedBettor = normalizeName(bettor);
  if (!normalizedBettor) return null;
  const pendingBets = payload.bets.filter((bet) => !bet.paymentVerified && normalizeName(bet.bettor) === normalizedBettor);
  if (!pendingBets.length) return null;
  const total = pendingBets.reduce((sum, bet) => sum + Number(bet.stake), 0);
  const displayName = pendingBets[0].bettor;
  const note = `${payload.event.name} (${payload.event.code}) - ${pendingBets.length} bet${pendingBets.length === 1 ? "" : "s"} for ${displayName}`;
  async function copyPaymentField(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const field = document.createElement("textarea");
      field.value = value;
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      document.execCommand("copy");
      field.remove();
    }
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1400);
  }
  return <aside className="host-payment-summary" aria-live="polite">
    <header className="host-payment-heading"><h3>Pay once when you are finished betting</h3><p>You can keep adding bets. This total updates automatically, so there is no need to pay after each one.</p></header>
    <ol className="payment-flow-steps"><li className="done"><b>1</b><span>Add bets<strong>{pendingBets.length} ready</strong></span></li><li className="active"><b>2</b><span>Pay once<strong>{money(total)}</strong></span></li><li><b>3</b><span>Host confirms<strong>All together</strong></span></li></ol>
    <div><span>Your unpaid total</span><strong>{money(total)}</strong><small>{pendingBets.length} pending bet{pendingBets.length === 1 ? "" : "s"} for {displayName}</small></div>
    <div className="payment-helper-menu">
      <div><span>1. Recipient</span><strong>{payload.event.hostVenmo}</strong><button type="button" onClick={() => copyPaymentField("recipient", payload.event.hostVenmo)}>{copied === "recipient" ? "Copied!" : "Copy"}</button></div>
      <div><span>2. Amount</span><strong>{money(total)}</strong><button type="button" onClick={() => copyPaymentField("amount", total.toFixed(2))}>{copied === "amount" ? "Copied!" : "Copy"}</button></div>
      <div><span>3. Payment note</span><strong>{note}</strong><button type="button" onClick={() => copyPaymentField("note", note)}>{copied === "note" ? "Copied!" : "Copy"}</button></div>
      <a className="venmo-pay-link" href="https://account.venmo.com/" target="_blank" rel="noreferrer">Open Venmo to pay once</a>
    </div>
    <p>In Venmo, choose Pay/Request and paste these details. Confirm the recipient yourself before sending. Chicken Bookie cannot read Venmo transactions; the host confirms the group after receiving it.</p>
  </aside>;
}

function WinnerCallout({ payload }: { payload: EventPayload }) {
  if (payload.event.gameType === "chicken_drop") {
    const winningNumber = payload.event.dropWinningNumber;
    const winningTickets = countedBets(payload).filter((bet) => bet.dropNumber === winningNumber).length;
    return <div className="winner-callout drop-winner-callout"><span>official Chicken Drop result</span><div><article><b>Winning square</b><strong>#{winningNumber ?? "pending"}</strong><small>{winningTickets === 0 ? "No ticket picked this square, so every ticket is refunded." : `${winningTickets} winning ticket${winningTickets === 1 ? "" : "s"} split the losing pool.`}</small></article></div></div>;
  }
  const chickenNames = new Map(payload.chickens.map((chicken) => [chicken.id, chicken.name]));
  return <div className="winner-callout"><span>official pecking order</span><div>{payload.races.map((race) => {
    const places = payload.results[race.race] ?? [];
    const winner = chickenNames.get(places[0]);
    const extras = places.slice(1).map((id, idx) => `${idx + 2}. ${chickenNames.get(id) ?? "unknown bird"}`).join(" | ");
    return <article key={race.race}><b>{race.name}</b><strong>{winner ?? "winner pending"}</strong>{extras && <small>{extras}</small>}</article>;
  })}</div></div>;
}

function SettlementLedger({ people, showPayout }: { people: Array<{ bettor: string; staked: number; payout: number; net: number }>; showPayout: boolean }) {
  const rows = people.map((person) => ({ ...person, earningsPct: person.staked > 0 ? (person.net / person.staked) * 100 : 0 }))
    .sort((a, b) => b.net - a.net || b.earningsPct - a.earningsPct || a.bettor.localeCompare(b.bettor));
  const rawMaxAxis = Math.max(1, ...rows.map((person) => Math.abs(person.net)));
  const maxAxis = Math.ceil(rawMaxAxis / 25) * 25;
  const axisTicks = [-maxAxis, -maxAxis / 2, 0, maxAxis / 2, maxAxis];
  const netColor = (pct: number) => {
    if (pct > 175) return "var(--win-strong)";
    if (pct > 50) return "var(--win-mid)";
    if (pct > 0) return "var(--win-soft)";
    if (pct === 0) return "var(--net-neutral)";
    if (pct > -50) return "var(--loss-soft)";
    return "var(--loss-mid)";
  };
  return <div className="ledger-graph">
    <p className="fine-print"><b>Net P/L</b> means net profit or loss. The return percentage is on the right{showPayout ? ", with the amount paid by the host underneath" : ""}; hover for the original stake and full details.</p>
    <div className="ledger-axis-head"><span>Bettor</span><div className="ledger-ticks">{axisTicks.map((tick, idx) => <b key={tick} style={{ left: `${idx * 25}%` }}>{tick === 0 ? "$0" : money(tick)}</b>)}</div><span>Return</span></div>
    <div className="ledger-plot">
      <div className="ledger-labels">{rows.map((person) => <strong key={person.bettor}>{person.bettor}</strong>)}</div>
      <div className="ledger-chart-area">
        <i className="ledger-plot-zero" />
        {rows.map((person) => {
        const profitLossWidth = Math.max(2, (Math.abs(person.net) / maxAxis) * 50);
        const pctLabel = `${person.earningsPct >= 0 ? "+" : ""}${Math.round(person.earningsPct)}%`;
        const netLabel = `${person.net >= 0 ? "+" : ""}${money(person.net)}`;
        const detailLabel = showPayout ? `, host payout ${money(person.payout)}` : "";
        return <div className="ledger-axis" key={person.bettor} title={`${person.bettor}: stake ${money(person.staked)}${detailLabel}, P/L ${netLabel}, return ${pctLabel}`} aria-label={`${person.bettor} staked ${money(person.staked)}${detailLabel}, profit loss ${netLabel}, return ${pctLabel}`}>
          <i className={person.net >= 0 ? "profit-loss-layer positive" : "profit-loss-layer"} style={person.net >= 0 ? { left: "50%", width: `${profitLossWidth}%`, background: netColor(person.earningsPct) } : { left: `${50 - profitLossWidth}%`, width: `${profitLossWidth}%`, background: netColor(person.earningsPct) }} />
          <b className={person.net >= 0 ? "ledger-bar-label positive" : "ledger-bar-label"}>{netLabel}</b>
        </div>;
      })}</div>
      <div className="ledger-results">{rows.map((person) => {
        const pctLabel = `${person.earningsPct >= 0 ? "+" : ""}${Math.round(person.earningsPct)}%`;
        return <b className={person.net >= 0 ? "ledger-net positive" : "ledger-net"} key={person.bettor}>{pctLabel}{showPayout && <span>Host pays {money(person.payout)}</span>}</b>;
      })}</div>
    </div>
  </div>;
}

function CoopBoss({ payload, setPayload, initialAdminCode = "" }: { payload: EventPayload; setPayload: (payload: EventPayload) => void; initialAdminCode?: string }) {
  const isDropEvent = payload.event.gameType === "chicken_drop";
  const isTestEvent = payload.event.code === "test" || payload.event.code === "test-drop";
  const [adminCode, setAdminCode] = useState(initialAdminCode);
  const [showAdminCode, setShowAdminCode] = useState(false);
  const [unlocked, setUnlocked] = useState(isTestEvent || Boolean(initialAdminCode));
  const [results, setResults] = useState<Results>(payload.results ?? {});
  const [eventName, setEventName] = useState(payload.event.name);
  const [bettingTimezone, setBettingTimezone] = useState(payload.event.bettingTimezone);
  const [bettingCloseAt, setBettingCloseAt] = useState(dateTimeInputValue(payload.event.bettingCloseAt, payload.event.bettingTimezone));
  const [officialRule, setOfficialRule] = useState(payload.event.officialRule);
  const [resultMode, setResultMode] = useState(payload.event.resultMode);
  const [poolMode, setPoolMode] = useState<PoolMode>(payload.event.poolMode);
  const [hostVenmo, setHostVenmo] = useState(payload.event.hostVenmo.replace(/^@/, ""));
  const [dropGridColumns, setDropGridColumns] = useState(String(payload.event.dropGridColumns));
  const [dropGridRows, setDropGridRows] = useState(String(payload.event.dropGridRows));
  const [dropTicketPrice, setDropTicketPrice] = useState(String(payload.event.dropTicketPrice));
  const [dropWinningNumber, setDropWinningNumber] = useState(payload.event.dropWinningNumber == null ? "" : String(payload.event.dropWinningNumber));
  const [chickens, setChickens] = useState(payload.chickens);
  const [races, setRaces] = useState(payload.races);
  const [bettors, setBettors] = useState(() => Array.from(new Map(payload.bets.map((bet) => [normalizeName(bet.bettor), { name: bet.bettor, venmo: bet.venmo }])).values()));
  const [betSearch, setBetSearch] = useState("");
  const [betPage, setBetPage] = useState(0);
  const [message, setMessage] = useState("");
  async function unlock(event: FormEvent) {
    event.preventDefault(); setMessage("");
    const response = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: payload.event.id, adminCode }) });
    const data = await response.json();
    if (!response.ok) setMessage(friendlyError(data.error ?? "Could not unlock admin.")); else { setUnlocked(true); setMessage(""); }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setMessage("");
    const response = await fetch("/api/results", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: payload.event.id, adminCode, results, winningNumber: isDropEvent ? Number(dropWinningNumber) : null }) });
    const data = await response.json();
    if (!response.ok) setMessage(friendlyError(data.error ?? "Could not save results.")); else { setPayload(data); setMessage(isDropEvent ? "Official drop saved." : "Winners saved."); }
  }
  async function removeBet(betId: number) {
    const bet = payload.bets.find((item) => item.id === betId);
    if (!bet || !window.confirm(`Delete bet #${bet.id} from ${bet.bettor} for ${money(bet.stake)}? This cannot be undone.`)) return;
    const response = await fetch("/api/admin", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: payload.event.id, adminCode, betId }) });
    const data = await response.json();
    if (!response.ok) setMessage(friendlyError(data.error ?? "Could not delete bet.")); else { setPayload(data); setMessage("Bet deleted."); }
  }
  async function setPaymentVerified(betId: number, verified: boolean) {
    setMessage(verified ? "Confirming payment..." : "Moving bet back to pending...");
    const response = await fetch("/api/admin", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify_payment", eventId: payload.event.id, adminCode, betId, verified }) });
    const data = await response.json();
    if (!response.ok) setMessage(friendlyError(data.error ?? "Could not update payment status."));
    else { setPayload(data); setMessage(verified ? "Payment confirmed; bet now counts." : "Payment marked pending; bet no longer counts."); }
  }
  async function confirmBettorPayments(bettor: string, count: number, total: number) {
    if (!window.confirm(`Confirm that ${bettor} paid ${money(total)} for ${count} pending bet${count === 1 ? "" : "s"}? All of them will start counting.`)) return;
    setMessage(`Confirming ${count} bets for ${bettor}...`);
    const response = await fetch("/api/admin", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify_bettor_payments", eventId: payload.event.id, adminCode, bettor }) });
    const data = await response.json();
    if (!response.ok) setMessage(friendlyError(data.error ?? "Could not confirm the grouped payment."));
    else { setPayload(data); setMessage(`${count} bets confirmed for ${bettor}; they now count.`); }
  }
  async function clearWinners() {
    const response = await fetch("/api/results", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: payload.event.id, adminCode }) });
    const data = await response.json();
    if (!response.ok) setMessage(friendlyError(data.error ?? "Could not clear results.")); else { setResults({}); setDropWinningNumber(""); setPayload(data); setMessage("Results cleared."); }
  }
  async function saveBettors(event: FormEvent) {
    event.preventDefault(); setMessage("");
    const response = await fetch("/api/admin", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: payload.event.id, adminCode, bettors }) });
    const data = await response.json();
    if (!response.ok) setMessage(friendlyError(data.error ?? "Could not save Venmo handles.")); else { setPayload(data); setMessage("Venmo handles saved."); }
  }
  async function saveConfig(event: FormEvent) {
    event.preventDefault(); setMessage("");
    setMessage(isDropEvent ? "Saving event setup..." : "Squishing chicken photos...");
    let compactChickens = chickens;
    try {
      compactChickens = await Promise.all(chickens.map(async (chicken) => {
        if (!chicken.photoUrl?.startsWith("data:image/") || chicken.photoUrl.length < 180_000) return chicken;
        return { ...chicken, photoUrl: await compressImageSource(chicken.photoUrl) };
      }));
    } catch {
      setMessage("Could not resize one chicken photo. Remove that photo or upload a different image.");
      return;
    }
    setChickens(compactChickens);
    const body = JSON.stringify({ eventId: payload.event.id, adminCode, name: eventName, bettingCloseAt: zonedDateTimeToIso(bettingCloseAt, bettingTimezone), bettingTimezone, officialRule, resultMode, poolMode, hostVenmo, dropGridColumns: Number(dropGridColumns), dropGridRows: Number(dropGridRows), dropTicketPrice: Number(dropTicketPrice), chickens: compactChickens, races });
    if (body.length > 4_000_000) {
      setMessage("Chicken photos are still too large to save together. Remove one photo or upload smaller images.");
      return;
    }
    setMessage("Saving event setup...");
    try {
      const response = await fetch("/api/admin", { method: "PATCH", headers: { "Content-Type": "application/json" }, body });
      const data = await response.json().catch(() => ({ error: "Chicken photos are too large for this save. Try fewer or smaller photos." }));
      if (!response.ok) setMessage(friendlyError(data.error ?? "Could not save event settings.")); else { setPayload(data); setMessage("Event settings saved."); }
    } catch {
      setMessage("Could not save event settings. If you added several photos, try saving fewer photos at a time.");
    }
  }
  async function uploadChickenPhoto(chickenId: number, file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setMessage("That file is not a chicken-ready image."); return; }
    try {
      setMessage("Squishing chicken photo...");
      const photoUrl = await compressImage(file);
      setChickens(chickens.map((chicken) => chicken.id === chickenId ? { ...chicken, photoUrl } : chicken));
      setMessage("Chicken photo ready. Save event setup when you're done.");
    } catch {
      setMessage("Could not resize that chicken photo. Try a different image.");
    }
  }
  if (!unlocked) {
    return <section className="panel admin-gate"><h2>Coop Boss</h2><form className="admin-unlock" onSubmit={unlock}><label>Admin code<input type={showAdminCode ? "text" : "password"} placeholder="admin code here" value={adminCode} onChange={(event) => setAdminCode(event.target.value)} /></label><label className="check-row"><input type="checkbox" checked={showAdminCode} onChange={(event) => setShowAdminCode(event.target.checked)} /> Show admin code</label><button type="submit">Unlock admin</button>{message && <p className="form-error">{message}</p>}</form></section>;
  }
  const dropGridShapeLocked = payload.bets.length > 0 || payload.event.dropWinningNumber != null;
  const dropTicketPriceLocked = payload.bets.length > 0;
  const settlementTypeLocked = payload.bets.length > 0;
  const configuredDropSections = (Number(dropGridColumns) || 0) * (Number(dropGridRows) || 0);
  const normalizedBetSearch = betSearch.trim().toLowerCase();
  const matchingBets = payload.bets.filter((bet) => !normalizedBetSearch || [
    String(bet.id), `#${bet.id}`, bet.bettor, bet.venmo, bet.betType, describeBet(bet, payload.chickens, payload.races), String(bet.stake), bet.paymentVerified ? "confirmed" : "pending"
  ].join(" ").toLowerCase().includes(normalizedBetSearch));
  const betsPerPage = 25;
  const betPageCount = Math.max(1, Math.ceil(matchingBets.length / betsPerPage));
  const currentBetPage = Math.min(betPage, betPageCount - 1);
  const visibleBets = matchingBets.slice(currentBetPage * betsPerPage, (currentBetPage + 1) * betsPerPage);
  const pendingPaymentGroups = new Map<string, { count: number; total: number }>();
  for (const bet of payload.bets) {
    if (bet.paymentVerified) continue;
    const key = normalizeName(bet.bettor);
    const group = pendingPaymentGroups.get(key) ?? { count: 0, total: 0 };
    group.count += 1;
    group.total += Number(bet.stake);
    pendingPaymentGroups.set(key, group);
  }
  return (
    <section className="panel">
      <h2>Coop Boss</h2>
      <p className="muted admin-intro">Everything for running this event is organized below. Use this menu to jump straight to the job you need.</p>
      {isTestEvent && <div className="notice">Demo admin is already unlocked. The admin code is blank.</div>}
      {!isTestEvent && <form className="admin-unlock" onSubmit={unlock}>
        <label>Admin code<input type={showAdminCode ? "text" : "password"} placeholder="admin code here" value={adminCode} onChange={(event) => setAdminCode(event.target.value)} /></label>
        <label className="check-row"><input type="checkbox" checked={showAdminCode} onChange={(event) => setShowAdminCode(event.target.checked)} /> Show admin code</label>
        <button type="submit">Admin unlocked</button>
      </form>}
      {countedBets(payload).length < 2 && <p className="muted">Oh cluck, not enough counted bets yet. You can save results, but settlement waits until at least two confirmed tickets exist.</p>}
      {payload.bets.length === 0 && <div className="notice"><b>Finish setup before sharing:</b> choose the settlement type below, review the event details and contestants, then press <b>Save event setup</b>.</div>}

      <nav className="admin-section-nav" aria-label="Coop Boss sections">
        <span>Coop Boss dashboard · choose a section</span>
        <div>
          <a href="#admin-event-setup">Event setup</a>
          {!isDropEvent && <a href="#admin-contestants">Contestants & races</a>}
          <a href="#admin-results">{poolMode === "host_managed" ? "Results & payouts" : "Results & settlement"}</a>
          <a href="#admin-bet-management">Bets & payments <b>{payload.bets.length.toLocaleString()}</b></a>
        </div>
      </nav>

      <form id="admin-event-setup" className="grid-form admin-section-target" onSubmit={saveConfig}>
        <h3>Event setup</h3>
        <p className="fine-print wide-field">Update the event name, deadline, rules, and settlement method here.</p>
        <div className="game-format-card wide-field"><span>Event format</span><strong>{isDropEvent ? "Chicken Drop" : "Chicken Race"}</strong></div>
        <label>Settlement type<select disabled={settlementTypeLocked} value={poolMode} onChange={(event) => setPoolMode(event.target.value as PoolMode)}><option value="peer_to_peer">Player-to-player settlement (optional)</option><option value="host_managed">Host-maintained pool</option></select></label>
        {poolMode === "host_managed" && <label>Host Venmo<div className="venmo-input"><span>@</span><input required disabled={settlementTypeLocked} value={hostVenmo} placeholder="host username" onChange={(event) => setHostVenmo(event.target.value.replace(/^@+/, ""))} /></div></label>}
        <p className="fine-print wide-field">{settlementTypeLocked ? "Settlement type and host Venmo are locked after the first bet so nobody’s payment terms change." : "You can choose or change settlement here until the first bet is submitted. Host-maintained pools require a host Venmo and a nonblank admin code."}</p>
        <label>Event name<input value={eventName} onChange={(event) => setEventName(event.target.value)} /></label>
        <label>Bets open until<input type="datetime-local" value={bettingCloseAt} onChange={(event) => setBettingCloseAt(event.target.value)} /></label>
        <label>Timezone<select value={bettingTimezone} onChange={(event) => setBettingTimezone(event.target.value)}>{TIME_ZONES.map((zone) => <option key={zone.value} value={zone.value}>{zone.label}</option>)}</select></label>

        {isDropEvent ? <>
          <label>Grid columns (across)<input type="number" min="1" max="500" step="1" disabled={dropGridShapeLocked} value={dropGridColumns} onChange={(event) => setDropGridColumns(event.target.value)} /></label>
          <label>Grid rows (down)<input type="number" min="1" max="500" step="1" disabled={dropGridShapeLocked} value={dropGridRows} onChange={(event) => setDropGridRows(event.target.value)} /></label>
          <label>Fixed cost per ticket<input type="number" min="0.01" max="10000" step="0.01" disabled={dropTicketPriceLocked} value={dropTicketPrice} onChange={(event) => setDropTicketPrice(event.target.value)} /></label>
          <p className="fine-print wide-field"><b>{Number(dropGridColumns) || 0} columns × {Number(dropGridRows) || 0} rows = {configuredDropSections} numbered sections.</b> Numbers run left to right, then top to bottom.</p>
          {(dropGridShapeLocked || dropTicketPriceLocked) && <p className="fine-print wide-field">The grid shape is locked after the first bet or official result. Ticket price is locked after betting begins so every ticket keeps the same terms.</p>}
          <label className="wide-field">Chicken Drop rules<textarea value={officialRule} placeholder="describe what counts as the official square and how line hits are decided" onChange={(event) => setOfficialRule(event.target.value)} rows={5} /></label>
        </> : <>
          <label>Race result style<select value={resultMode} onChange={(event) => setResultMode(event.target.value as "winner" | "full_order")}><option value="winner">only track the winner</option><option value="full_order">rank the whole flock</option></select></label>
          <label className="wide-field">Race rules<textarea value={officialRule} placeholder="first to the marshmallow wins" onChange={(event) => setOfficialRule(event.target.value)} rows={3} /></label>
          <div id="admin-contestants" className="wide-field admin-section-target admin-subsection-heading"><h3>Contestants & race card</h3><p className="fine-print">Edit race details, chicken names, notes, and photos.</p></div>
          {races.map((race, idx) => <div className="admin-card" key={race.race}>
            <label>Race name<input value={race.name} onChange={(event) => setRaces(races.map((item, itemIdx) => itemIdx === idx ? { ...item, name: event.target.value } : item))} /></label>
            <label>Race details<textarea value={race.description} onChange={(event) => setRaces(races.map((item, itemIdx) => itemIdx === idx ? { ...item, description: event.target.value } : item))} rows={3} /></label>
          </div>)}
          <h3>Flock notes</h3>
          {chickens.map((chicken, idx) => <div className="admin-card chicken-admin-card" key={chicken.id}>
            <ChickenPhoto chicken={chicken} preview />
            <label>Chicken name<input value={chicken.name} onChange={(event) => setChickens(chickens.map((item, itemIdx) => itemIdx === idx ? { ...item, name: event.target.value } : item))} /></label>
            <label>Coop note<textarea value={chicken.bio ?? ""} onChange={(event) => setChickens(chickens.map((item, itemIdx) => itemIdx === idx ? { ...item, bio: event.target.value } : item))} rows={3} /></label>
            <label>Chicken photo<input type="file" accept="image/*" onChange={(event) => uploadChickenPhoto(chicken.id, event.target.files?.[0] ?? null)} /></label>
            {chicken.photoUrl && <button type="button" onClick={() => setChickens(chickens.map((item) => item.id === chicken.id ? { ...item, photoUrl: null } : item))}>Remove photo</button>}
          </div>)}
        </>}
        <button type="submit">Save event setup</button>
      </form>

      <form id="admin-results" className="grid-form result-entry admin-section-target" onSubmit={save}>
        <h3>{poolMode === "host_managed" ? "Results & payouts" : "Results & settlement"}</h3>
        <p className="fine-print wide-field">{isDropEvent ? "Enter the official winning square. Chicken Bookie will identify matching tickets and calculate the split or refunds." : `Enter each official race result. Chicken Bookie will score every bet type and calculate the ${poolMode === "host_managed" ? "host payouts" : "optional settlement plan"}.`}</p>
        <h4 className="wide-field">{isDropEvent ? "Official Chicken Drop result" : "Official race results"}</h4>
        {isDropEvent ? <label>Winning number<input type="number" min="1" max={payload.event.dropMaxNumber} step="1" value={dropWinningNumber} onChange={(event) => setDropWinningNumber(event.target.value)} /></label> : payload.races.map((race) => resultMode === "full_order" ? <div className="admin-card" key={race.race}>
          <h3>{race.name}</h3>
          {payload.chickens.map((_, idx) => <label key={idx}>Place {idx + 1}<select value={results[race.race]?.[idx] ?? ""} onChange={(event) => { const next = [...(results[race.race] ?? [])]; next[idx] = Number(event.target.value); setResults({ ...results, [race.race]: next }); }}><option value="">Pick chicken</option>{payload.chickens.map((chicken) => <option key={chicken.id} value={chicken.id}>{chicken.name}</option>)}</select></label>)}
        </div> : <label key={race.race}>{race.name}<select value={results[race.race]?.[0] ?? ""} onChange={(event) => setResults({ ...results, [race.race]: [Number(event.target.value)] })}><option value="">Pick winner</option>{payload.chickens.map((chicken) => <option key={chicken.id} value={chicken.id}>{chicken.name}</option>)}</select></label>)}
        <button type="submit">{isDropEvent ? "Save official drop" : "Save results"}</button>
        {(isDropEvent ? payload.event.dropWinningNumber != null : Object.keys(payload.results).length > 0) && <button type="button" onClick={clearWinners}>Clear results</button>}
      </form>

      <div id="admin-bet-management" className="admin-management-section admin-section-target">
      {bettors.length > 0 && <form className="grid-form" onSubmit={saveBettors}>
        <h3>Bettor Venmo handles</h3>
        {bettors.map((bettor, idx) => <div className="admin-card bettor-admin-card" key={normalizeName(bettor.name)}>
          <strong>{bettor.name}</strong>
          <label>Venmo {payload.event.poolMode === "host_managed" ? "(required)" : "(optional)"}<div className="venmo-input"><span>@</span><input required={payload.event.poolMode === "host_managed"} value={bettor.venmo.replace(/^@/, "")} placeholder="username" onChange={(event) => setBettors(bettors.map((item, itemIdx) => itemIdx === idx ? { ...item, venmo: event.target.value.replace(/^@+/, "") } : item))} /></div></label>
        </div>)}
        <button type="submit">Save Venmo handles</button>
      </form>}

      {message && <p className={message.includes("saved") || message.includes("deleted") || message.includes("cleared") || message.includes("confirmed") || message.includes("no longer counts") ? "form-ok" : "form-error"}>{message}</p>}
      <section className="bet-manager">
        <div className="bet-manager-heading"><div><h3>Manage bets{payload.event.poolMode === "host_managed" ? " & payments" : ""}</h3><p className="fine-print">Showing at most {betsPerPage} at once instead of loading all {payload.bets.length.toLocaleString()} bets.</p></div><strong>{matchingBets.length.toLocaleString()} match{matchingBets.length === 1 ? "" : "es"}</strong></div>
        <label>Search by bettor, bet ID, pick, amount, Venmo, or payment status<input type="search" value={betSearch} placeholder="e.g. Avery, #142, pending" onChange={(event) => { setBetSearch(event.target.value); setBetPage(0); }} /></label>
        {visibleBets.length === 0 ? <p className="muted">No bets match that search.</p> : <div className="bet-admin-list">{visibleBets.map((bet) => { const pendingGroup = pendingPaymentGroups.get(normalizeName(bet.bettor)); return <article className="bet-admin-row" key={bet.id}>
          <div><strong>#{bet.id} · {bet.bettor}</strong><span>{describeBet(bet, payload.chickens, payload.races)}</span><small>{money(bet.stake)}{bet.venmo ? ` · ${bet.venmo}` : ""}{payload.event.poolMode === "host_managed" ? ` · ${bet.paymentVerified ? "payment confirmed" : "payment pending"}` : ""}</small></div>
          <div>{payload.event.poolMode === "host_managed" && (bet.paymentVerified ? <button type="button" className="ghost-button" onClick={() => setPaymentVerified(bet.id, false)}>Mark pending</button> : <button type="button" className="ghost-button" onClick={() => confirmBettorPayments(bet.bettor, pendingGroup?.count ?? 1, pendingGroup?.total ?? Number(bet.stake))}>Confirm all {pendingGroup?.count ?? 1} · {money(pendingGroup?.total ?? Number(bet.stake))}</button>)}<button className="delete-row" type="button" onClick={() => removeBet(bet.id)}>Delete</button></div>
        </article>; })}</div>}
        {betPageCount > 1 && <nav className="bet-pagination" aria-label="Bet manager pages"><button type="button" disabled={currentBetPage === 0} onClick={() => setBetPage(Math.max(0, currentBetPage - 1))}>Previous</button><span>Page {currentBetPage + 1} of {betPageCount}</span><button type="button" disabled={currentBetPage >= betPageCount - 1} onClick={() => setBetPage(Math.min(betPageCount - 1, currentBetPage + 1))}>Next</button></nav>}
      </section>
      </div>
    </section>
  );
}

function describeBet(bet: Bet, chickens: Chicken[], races: Race[]) {
  const name = (id: number | null | undefined) => chickens.find((chicken) => chicken.id === id)?.name ?? "Unknown bird";
  const raceName = races.find((race) => race.race === bet.race)?.name ?? `Race ${bet.race}`;
  const pickNames = pickedChickenIds(bet).map((pick) => name(pick)).join(", ");
  if (bet.betType === "drop_number") return `Number #${bet.dropNumber ?? "?"}`;
  if (bet.betType === "race_winner") return `${raceName}: ${name(bet.chicken1)}`;
  if (bet.betType === "race_place") return `${raceName}: ${name(bet.chicken1)}`;
  if (bet.betType === "race_show") return `${raceName}: ${name(bet.chicken1)}`;
  if (bet.betType === "exacta") return `${raceName}: ${pickedChickenIds(bet).map((pick) => name(pick)).join(" then ")}`;
  if (bet.betType === "trifecta") return `${raceName}: ${pickedChickenIds(bet).map((pick) => name(pick)).join(" then ")}`;
  if (bet.betType === "sweep") return name(bet.chicken1);
  if (bet.betType === "exact_ticket") return races.map((race, idx) => `${race.name}: ${name(pickedChickenIds(bet)[idx])}`).join(" | ");
  if (bet.betType === "any_win") return name(bet.chicken1);
  return pickNames || "No chickens picked";
}

async function compressImage(file: File) {
  const imageUrl = URL.createObjectURL(file);
  try {
    return await compressImageSource(imageUrl);
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

async function compressImageSource(source: string) {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read chicken photo."));
    img.src = source;
  });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not resize chicken photo.");
  for (const attempt of [{ maxSide: 520, quality: 0.68 }, { maxSide: 420, quality: 0.58 }, { maxSide: 320, quality: 0.52 }]) {
    const scale = Math.min(1, attempt.maxSide / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    canvas.width = width;
    canvas.height = height;
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", attempt.quality);
    if (dataUrl.length < 180_000 || attempt.maxSide === 320) return dataUrl;
  }
  throw new Error("Could not resize chicken photo.");
}

