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
const BET_TYPE_HELP: Record<BetType, string> = {
  race_winner: "Pick the chicken that will finish 1st in one race.",
  race_place: "Pick a chicken to finish 1st or 2nd in one race.",
  race_show: "Pick a chicken to finish in the top 3 in one race.",
  exacta: "Pick the exact 1st- and 2nd-place order.",
  trifecta: "Pick the exact 1st-, 2nd-, and 3rd-place order.",
  sweep: "Pick one chicken to win every race.",
  exact_ticket: "Pick the winner of every race in order.",
  any_win: "Pick one chicken to win at least one race.",
  any_order_three: "Pick the race winners; the race order does not matter.",
  drop_number: "Pick the winning Chicken Drop number."
};
const BET_TYPE_CATEGORY: Record<BetType, string> = {
  race_winner: "Single-race bet",
  race_place: "Single-race bet",
  race_show: "Single-race bet",
  exacta: "Exact-order bet",
  trifecta: "Exact-order bet",
  sweep: "Multi-race bet",
  exact_ticket: "Multi-race bet",
  any_win: "Multi-race bet",
  any_order_three: "Multi-race bet",
  drop_number: "Chicken Drop bet"
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
const paymentMemoPart = (value: string, fallback: string) => value.trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60) || fallback;
const paymentMemo = (eventCode: string, bettor: string, paymentId: string) => `${paymentMemoPart(eventCode, "event")}_${paymentMemoPart(bettor, "bettor")}_${paymentId}`;
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

function LoadingFlock() {
  return <div className="loading-flock" role="status" aria-live="polite"><div className="loading-runway" aria-hidden="true"><i /><i /><i /><i /></div><span>Loading the coop...</span></div>;
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
              <Stat label="Bets" value={String(countedBets(payload).length)} />
              <Stat label="Cluck bucket" value={money(totalPool)} />
            </div>
          )}
        </section>
      </header>

      {error && <div className="notice error">{error}</div>}
      {loading && <LoadingFlock />}
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
          {tab === "tickets" && <Tickets payload={payload} />}
          {tab === "winners" && <Winners payload={payload} />}
          {tab === "boss" && <CoopBoss payload={payload} setPayload={setPayload} initialAdminCode={createdAdminCode} onDeleted={leaveEvent} />}
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
      <label>Copy another race setup (optional)<input autoComplete="off" value={copyCode} placeholder="Leave blank for a fresh flock" onChange={(event) => setCopyCode(event.target.value)} /><small className="field-note">Only enter a code when you intentionally want that event’s chicken names, photos, races, and rules.</small></label>
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
    {payload.event.poolMode === "host_managed" && <div className="notice">1. Place your bet(s). 2. Pay the host. 3. Done—your bets become active after host verification.</div>}
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
    {payload.event.poolMode === "host_managed" && <HostPaymentSummary payload={payload} bettor={bettor} setPayload={setPayload} />}
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

function chickensForRace(race: Race, chickens: Chicken[]) {
  return race.chickenIds.length ? chickens.filter((chicken) => race.chickenIds.includes(chicken.id)) : chickens;
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
  const selectedRace = payload.races.find((item) => item.race === race) ?? payload.races[0];
  const enteredChickenIds = new Set(payload.races.flatMap((item) => chickensForRace(item, payload.chickens).map((chicken) => chicken.id)));
  const sweepChickenIds = new Set(payload.chickens.filter((chicken) => payload.races.every((item) => chickensForRace(item, payload.chickens).some((entry) => entry.id === chicken.id))).map((chicken) => chicken.id));
  const pickerChickens = raceBetTypes.includes(betType) && selectedRace
    ? chickensForRace(selectedRace, payload.chickens)
    : betType === "sweep"
      ? payload.chickens.filter((chicken) => sweepChickenIds.has(chicken.id))
      : payload.chickens.filter((chicken) => enteredChickenIds.has(chicken.id));
  const exactTicketOptions = betType === "exact_ticket" ? payload.races.map((item) => chickensForRace(item, payload.chickens)) : undefined;
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
  return <section className="panel"><div className="panel-title-row"><h2>Betting Coop</h2><SettlementHelpTip payload={payload} /></div>{payload.event.poolMode === "host_managed" ? <div className="notice">1. Place your bet(s). 2. Pay the host. 3. Done—your bets become active after host verification.</div> : <p className="fine-print">Chicken Bookie tracks Cluck Bucks and settlement math; it does not collect, hold, process, or transfer money.</p>}<form className="bet-form" onSubmit={submit}>
    <fieldset className="bettor-details"><legend>Who are you?</legend><label>Name<input value={bettor} onChange={(event) => setBettor(event.target.value)} />{existingName && <small className="field-note">Grouped with your previous bets</small>}</label><label>Venmo {payload.event.poolMode === "host_managed" ? "(required)" : "(optional)"}<div className="venmo-input"><span>@</span><input required={payload.event.poolMode === "host_managed"} value={venmo} placeholder={existingVenmo.replace(/^@/, "") || "username"} onChange={(event) => setVenmo(event.target.value.replace(/^@+/, ""))} /></div></label></fieldset>
    <fieldset className="wager-details"><legend>Bet slip</legend><label className="bet-amount-field"><span className="wager-step-label"><b>01</b>Bet amount</span><input type="number" min="1" step="1" inputMode="decimal" value={stake} onChange={(event) => setStake(event.target.value)} /><small>{Number(stake) > 0 ? `${money(Number(stake))} in Cluck Bucks${payload.event.poolMode === "host_managed" ? " · added to your unpaid total" : ""}` : "Enter your Cluck Bucks"}</small></label><label className="bet-type-field"><span className="wager-step-label"><b>02</b>What are you betting on?</span><select value={betType} onChange={(event) => { setBetType(event.target.value as BetType); setPicks([]); }}>{availableBetTypes.map((key) => <option key={key} value={key}>{BET_TYPES[key]}</option>)}</select><span className="bet-type-help"><b>{BET_TYPE_CATEGORY[betType]}</b><small>{BET_TYPE_HELP[betType]}</small></span></label><section className="pick-details"><h3 className="wager-step-label"><b>03</b>Select your pick</h3>{raceBetTypes.includes(betType) && <label>Race<select value={race} onChange={(event) => { setRace(Number(event.target.value)); setPicks([]); }}>{payload.races.map((race) => <option key={race.race} value={race.race}>{race.name}</option>)}</select></label>}<ChickenPicker chickens={pickerChickens} optionsByIndex={exactTicketOptions} picks={selectedPicks} setPicks={setPicks} count={needed} exact={betType === "exact_ticket" || betType === "exacta" || betType === "trifecta"} races={payload.races} labels={betType === "exacta" ? ["1st place", "2nd place"] : betType === "trifecta" ? ["1st place", "2nd place", "3rd place"] : undefined} /></section><button type="submit">Add bet</button></fieldset>
    {message && <p className={message.includes("added") || message.includes("submitted") ? "form-ok" : "form-error"}>{message}</p>}
  </form>{payload.event.poolMode === "host_managed" && <HostPaymentSummary payload={payload} bettor={bettor} setPayload={setPayload} />}</section>;
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
        ? `Send ${isDropEvent ? "the fixed ticket price" : "each race-bet stake"} to the host (${payload.event.hostVenmo}). The ${isDropEvent ? "square" : "bet"} stays pending until the host confirms payment. After the official result, the host sends each bettor's full payout.`
        : `Venmo is optional. After the official ${isDropEvent ? "winning square" : "race results"}, Chicken Bookie suggests direct player-to-player payments; players decide whether and how to settle.`}
      <small>{isDropEvent
        ? "Tickets on the winning square get their ticket price back and split the losing-square pool equally. If nobody picked it, all counted tickets are refunded."
        : "Winning race tickets get their stake back and share the losing-ticket pool based on bet difficulty. If no ticket wins, all counted bets are refunded."}</small>
    </span>
  </span>;
}

function ChickenPicker({ chickens, optionsByIndex, picks, setPicks, count, exact, races, labels }: { chickens: Chicken[]; optionsByIndex?: Chicken[][]; picks: number[]; setPicks: (picks: number[]) => void; count: number; exact: boolean; races: Race[]; labels?: string[] }) {
  if (exact) {
    const fields = labels ?? races.map((race) => race.name);
    return <div className="pick-grid">{fields.slice(0, count).map((label, idx) => <label key={label}>{label}<select value={picks[idx] ?? ""} onChange={(event) => { const next = [...picks]; next[idx] = Number(event.target.value); setPicks(next); }}><option value="">Pick chicken</option>{(optionsByIndex?.[idx] ?? chickens).map((chicken) => <option key={chicken.id} value={chicken.id}>{chicken.name}</option>)}</select></label>)}</div>;
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

function Tickets({ payload }: { payload: EventPayload }) {
  const { bets, chickens, races } = payload;
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const groupsPerPage = 8;
  const confirmedBets = bets.filter((bet) => bet.paymentVerified);
  const pendingCount = bets.length - confirmedBets.length;
  const query = normalizeName(search).replace(/^@/, "");
  const orderedBets = [...bets].sort((a, b) => Number(b.paymentVerified) - Number(a.paymentVerified) || a.bettor.localeCompare(b.bettor) || a.id - b.id);
  const matchingBets = query ? orderedBets.filter((bet) => [bet.bettor, bet.venmo, bet.paymentId, BET_TYPES[bet.betType], describeBet(bet, chickens, races), money(bet.stake), bet.paymentVerified ? "confirmed" : "pending"].some((value) => normalizeName(String(value)).replace(/^@/, "").includes(query))) : orderedBets;
  const groupMap = new Map<string, { bettor: string; paymentVerified: boolean; paymentId: string; bets: Bet[] }>();
  for (const bet of matchingBets) {
    const key = `${bet.paymentVerified ? "confirmed" : `pending:${bet.paymentId}`}:${normalizeName(bet.bettor)}`;
    const group = groupMap.get(key) ?? { bettor: bet.bettor, paymentVerified: bet.paymentVerified, paymentId: bet.paymentId, bets: [] };
    group.bets.push(bet);
    groupMap.set(key, group);
  }
  const groupedBets = Array.from(groupMap.values());
  const pageCount = showAll ? 1 : Math.max(1, Math.ceil(groupedBets.length / groupsPerPage));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleGroups = showAll ? groupedBets : groupedBets.slice(currentPage * groupsPerPage, (currentPage + 1) * groupsPerPage);
  return <section className="panel"><h2>Ticket Board</h2>{payload.event.poolMode === "host_managed" && <div className="ticket-count-summary"><strong>{confirmedBets.length} confirmed bet{confirmedBets.length === 1 ? "" : "s"} count</strong>{pendingCount > 0 && <span>{pendingCount} pending</span>}</div>}<ChickenStatsPanel bets={confirmedBets} chickens={chickens} confirmedOnly={payload.event.poolMode === "host_managed"} />{bets.length === 0 ? <p className="muted">No bets yet.</p> : <><div className="ticket-directory-controls"><label>Search tickets<input type="search" value={search} placeholder="Name, chicken, ID, or status" onChange={(event) => { setSearch(event.target.value); setPage(0); }} /></label><span>{query ? `${matchingBets.length} found` : `${bets.length} total`}</span>{groupedBets.length > groupsPerPage && <button type="button" className="ghost-button" onClick={() => { setShowAll(!showAll); setPage(0); }}>{showAll ? "Show less" : "Show all"}</button>}</div><div className="ticket-groups">{visibleGroups.length === 0 ? <p className="muted">No tickets found.</p> : visibleGroups.map((group) => {
    const total = group.bets.reduce((sum, bet) => sum + Number(bet.stake), 0);
    return <section className={`ticket-group${group.paymentVerified ? "" : " pending-ticket"}`} key={`${group.paymentVerified}:${group.paymentId}:${normalizeName(group.bettor)}`}><header><div><strong>{group.bettor}</strong>{!group.paymentVerified && <span>Pending</span>}</div><b>{group.bets.length} bet{group.bets.length === 1 ? "" : "s"} · {money(total)}</b>{payload.event.poolMode === "host_managed" && !group.paymentVerified && <PaymentMemoTip memo={paymentMemo(payload.event.code, group.bettor, group.paymentId)} />}</header>{group.bets.map((bet) => <div className="ticket-row" key={bet.id}><strong>{BET_TYPES[bet.betType]}</strong><span>{describeBet(bet, chickens, races)}</span><b>{money(bet.stake)}</b></div>)}</section>;
  })}</div>{pageCount > 1 && <nav className="bet-pagination" aria-label="Ticket Board pages"><button type="button" disabled={currentPage === 0} onClick={() => setPage(Math.max(0, currentPage - 1))}>Previous</button><span>Page {currentPage + 1} of {pageCount}</span><button type="button" disabled={currentPage >= pageCount - 1} onClick={() => setPage(Math.min(pageCount - 1, currentPage + 1))}>Next</button></nav>}</>}</section>;
}

function PaymentMemoTip({ memo }: { memo: string }) {
  const [open, setOpen] = useState(false);
  return <span className={`ticket-memo-wrap${open ? " open" : ""}`}><button type="button" className="ticket-memo-trigger" aria-expanded={open} onClick={() => setOpen(!open)}>Payment memo</button><span className="ticket-memo-detail" role="tooltip"><small>Use this exact Venmo memo</small><b>{memo}</b></span></span>;
}

function HostPayoutPayments({ payload }: { payload: EventPayload }) {
  const payments = payload.settlement?.payments.filter((payment) => payment.amount > 0.004) ?? [];
  return <section className="host-payout-manager coop-section"><h3>Pay winners</h3>{payments.length === 0 ? <p className="muted">No payouts needed.</p> : <div className="admin-table-wrap"><table className="admin-data-table payout-payment-table"><thead><tr><th>Winner</th><th>Venmo</th><th>Payout</th><th>Memo</th><th>Action</th></tr></thead><tbody>{payments.map((payment) => {
    const handle = payment.toVenmo.replace(/^@/, "");
    const note = `${paymentMemoPart(payload.event.code, "event")}_${paymentMemoPart(payment.to, "winner")}_PAYOUT`;
    const url = new URL(`https://account.venmo.com/u/${encodeURIComponent(handle)}`);
    url.searchParams.set("txn", "pay");
    url.searchParams.set("recipients", handle);
    url.searchParams.set("amount", payment.amount.toFixed(2));
    url.searchParams.set("note", note);
    return <tr key={`${payment.to}:${payment.amount}`}><td><strong>{payment.to}</strong></td><td>{payment.toVenmo}</td><td><strong>{money(payment.amount)}</strong></td><td><PaymentMemoTip memo={note} /></td><td>{handle ? <a className="venmo-pay-link payout-venmo-link" href={url.toString()} target="_blank" rel="noreferrer">Pay in Venmo</a> : <span className="table-status waiting">Missing Venmo</span>}</td></tr>;
  })}</tbody></table></div>}</section>;
}

function ChickenStatsPanel({ bets, chickens, confirmedOnly = false }: { bets: Bet[]; chickens: Chicken[]; confirmedOnly?: boolean }) {
  const stats = chickens.map((chicken) => {
    const matching = bets.filter((bet) => pickedChickenIds(bet).includes(chicken.id));
    return { chicken, tickets: matching.length, cluckBucks: matching.reduce((sum, bet) => sum + Number(bet.stake), 0) };
  }).sort((a, b) => b.tickets - a.tickets || b.cluckBucks - a.cluckBucks || a.chicken.slot - b.chicken.slot);
  const maxTickets = Math.max(1, ...stats.map((stat) => stat.tickets));
  return <div className="chicken-stats"><div><span>live flock board{confirmedOnly ? " · confirmed bets only" : ""}</span></div>{stats.map((stat) => <div className="stat-bar" key={stat.chicken.id}><span>{stat.chicken.name}</span><div><i style={{ width: stat.tickets === 0 ? "0%" : `${Math.max(8, (stat.tickets / maxTickets) * 100)}%` }} /></div><b>{stat.tickets} ticket{stat.tickets === 1 ? "" : "s"} | {money(stat.cluckBucks)}</b></div>)}</div>;
}

function Winners({ payload }: { payload: EventPayload }) {
  const resultsOfficial = isResultsOfficial(payload);
  if (countedBets(payload).length < 2) return <section className="panel"><h2>Winner's Circle</h2>{resultsOfficial && <WinnerCallout payload={payload} />}<SettlementExplainer payload={payload} /><p className="muted">Not enough confirmed bets to calculate settlement yet.</p></section>;
  if (!payload.settlement) return <section className="panel"><h2>Winner's Circle</h2>{resultsOfficial && <WinnerCallout payload={payload} />}<SettlementExplainer payload={payload} /><p className="muted">{payload.event.gameType === "chicken_drop" ? "Waiting for the official drop number." : "Waiting for every official race winner."}</p></section>;
  const payments = [...payload.settlement.payments].sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || b.amount - a.amount);
  const hostManaged = payload.event.poolMode === "host_managed";
  return <section className="panel"><h2>Winner's Circle</h2><WinnerCallout payload={payload} /><SettlementExplainer payload={payload} /><h3>{hostManaged ? "Host payout checklist" : "Optional who pays who plan"}</h3><SettlementPaymentDirectory payments={payments} searchable={!hostManaged} /><h3>{hostManaged ? "Host payout overview" : "Settlement overview"}</h3><SettlementLedger people={payload.settlement.people} tickets={payload.settlement.tickets} showPayout={hostManaged} /></section>;
}

function SettlementPaymentDirectory({ payments, searchable }: { payments: Array<{ from: string; fromVenmo: string; to: string; toVenmo: string; amount: number }>; searchable: boolean }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const pageSize = 12;
  const query = normalizeName(search).replace(/^@/, "");
  const matching = query ? payments.filter((payment) => [payment.from, payment.fromVenmo, payment.to, payment.toVenmo].some((value) => normalizeName(value).replace(/^@/, "").includes(query))) : payments;
  const pageCount = showAll ? 1 : Math.max(1, Math.ceil(matching.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = showAll ? matching : matching.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  return <div className="settlement-payment-directory">
    {searchable && <div className="settlement-payment-search"><label>Search payments<input type="search" value={search} placeholder="Your name or Venmo" onChange={(event) => { setSearch(event.target.value); setPage(0); }} /></label><span>{query ? `${matching.length} found` : `${payments.length} total`}</span>{payments.length > pageSize && <button type="button" className="ghost-button settlement-show-all" onClick={() => { setShowAll(!showAll); setPage(0); }}>{showAll ? "Show less" : "Show all"}</button>}</div>}
    <div className="payment-list">{payments.length === 0 ? <p>No payments needed.</p> : visible.length === 0 ? <p>No payments match that name or Venmo.</p> : visible.map((payment, idx) => <div className="payment" key={`${payment.from}-${payment.to}-${currentPage}-${idx}`}><span><b>{payment.from}</b> pays <b>{payment.to}</b>{payment.toVenmo && <VenmoHandle handle={payment.toVenmo} />}</span><strong>{money(payment.amount)}</strong></div>)}</div>
    {pageCount > 1 && <nav className="bet-pagination settlement-payment-pages" aria-label="Settlement payment pages"><button type="button" disabled={currentPage === 0} onClick={() => setPage(Math.max(0, currentPage - 1))}>Previous</button><span>Page {currentPage + 1} of {pageCount}</span><button type="button" disabled={currentPage >= pageCount - 1} onClick={() => setPage(Math.min(pageCount - 1, currentPage + 1))}>Next</button></nav>}
  </div>;
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
          ? `Players send the fixed ticket price to the host (${payload.event.hostVenmo}). Only squares whose payments the host confirms enter the pool. After the winning square is official, the host sends each player the full payout shown below.`
          : `Bettors send each race-bet stake to the host (${payload.event.hostVenmo}). Only bets whose payments the host confirms enter the pool. After race results are official, the host sends each bettor's full payout shown below.`
        : isDropEvent
          ? "Venmo is not required and nobody prepays the site or host. After the winning square is official, the optional payment list shows how players could settle the Chicken Drop directly with one another."
          : "Stakes are not prepaid. After race results are official, the optional payment list shows how bettors settle directly with one another."}</p>
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

function HostPaymentSummary({ payload, bettor, setPayload }: { payload: EventPayload; bettor: string; setPayload: (payload: EventPayload) => void }) {
  const [copied, setCopied] = useState("");
  const [cartMessage, setCartMessage] = useState("");
  const normalizedBettor = normalizeName(bettor);
  if (!normalizedBettor) return null;
  const allPendingBets = payload.bets.filter((bet) => !bet.paymentVerified && normalizeName(bet.bettor) === normalizedBettor);
  if (!allPendingBets.length) return null;
  const paymentId = (allPendingBets.find((bet) => !bet.paymentSubmitted) ?? allPendingBets[0]).paymentId;
  const pendingBets = allPendingBets.filter((bet) => bet.paymentId === paymentId);
  const paymentSubmitted = pendingBets.every((bet) => bet.paymentSubmitted);
  const total = pendingBets.reduce((sum, bet) => sum + Number(bet.stake), 0);
  const displayName = pendingBets[0].bettor;
  const note = paymentMemo(payload.event.code, displayName, paymentId);
  const hostProfileUrl = payload.event.hostVenmoLink || "https://account.venmo.com/";
  const venmoPaymentUrl = (() => {
    const url = new URL(hostProfileUrl);
    url.searchParams.set("txn", "pay");
    url.searchParams.set("recipients", payload.event.hostVenmo.replace(/^@/, ""));
    url.searchParams.set("amount", total.toFixed(2));
    url.searchParams.set("note", note);
    return url.toString();
  })();
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
  async function leaveForVenmo() {
    const submittedUpdate = updateSubmitted(true);
    await copyPaymentField("note", note);
    await submittedUpdate;
  }
  async function updateSubmitted(submitted: boolean) {
    const response = await fetch("/api/bets", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: payload.event.id, paymentId, venmo: pendingBets[0].venmo, submitted }), keepalive: true });
    const data = await response.json();
    if (!response.ok) { window.alert(friendlyError(data.error ?? "Could not update payment status.")); return false; }
    setPayload(data);
    return true;
  }
  async function removeFromCart(bet: Bet) {
    setCartMessage(`Removing bet #${bet.id}...`);
    const response = await fetch("/api/bets", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: payload.event.id, betId: bet.id, paymentId, venmo: pendingBets[0].venmo }) });
    const data = await response.json();
    if (!response.ok) { setCartMessage(friendlyError(data.error ?? "Could not remove that bet.")); return; }
    setPayload(data);
    setCartMessage(`Bet #${bet.id} removed. Your total was updated.`);
  }
  const memoEditor = <div className="payment-memo-editor"><span>Use this exact Venmo memo</span><div><code>{note}</code><button type="button" onClick={() => copyPaymentField("note", note)}>{copied === "note" ? "Copied!" : "Copy memo"}</button></div></div>;
  if (paymentSubmitted) return <aside className="host-payment-summary payment-congrats"><div><span className="payment-hatch" aria-hidden="true">🥚 → 🐣</span><span>Payment ID <span className="payment-id-badge">{paymentId}</span></span><h3>Egg-cellent! Payment is headed to the Coop Boss.</h3><p>Your host will verify the receipt before your bets count.</p>{memoEditor}<button type="button" className="payment-retry-link" onClick={() => { void updateSubmitted(false); }}>Payment didn’t go through? Try again</button></div></aside>;
  return <aside className="host-payment-summary" aria-live="polite">
    <header className="host-payment-heading"><h3>Pay once when you are finished betting</h3><p>You can keep adding bets. This total updates automatically, so there is no need to pay after each one.</p></header>
    <ol className="payment-flow-steps"><li className="done"><b>1</b><span>Add bets<strong>{pendingBets.length} ready</strong></span></li><li className="active"><b>2</b><span>Pay once<strong>{money(total)}</strong></span></li><li><b>3</b><span>Host confirms<strong>All together</strong></span></li></ol>
    <section className="pending-bet-cart"><header><span>Your pending bet cart</span><strong>{pendingBets.length} bet{pendingBets.length === 1 ? "" : "s"}</strong></header>{pendingBets.map((bet) => <div key={bet.id}><span><b>{describeBet(bet, payload.chickens, payload.races)}</b><small>Bet #{bet.id}</small></span><strong>{money(bet.stake)}</strong><button type="button" aria-label={`Remove bet ${bet.id}`} onClick={() => { void removeFromCart(bet); }}>Remove</button></div>)}{cartMessage && <p>{cartMessage}</p>}</section>
    <div><span>Your unpaid total</span><strong>{money(total)}</strong><small>{pendingBets.length} pending bet{pendingBets.length === 1 ? "" : "s"} for {displayName}</small></div>
    <a className="venmo-pay-link full-payment-link" href={venmoPaymentUrl} target="_blank" rel="noreferrer" onClick={() => { void leaveForVenmo(); }}>Send {money(total)} to the host ({payload.event.hostVenmo})</a>
    {memoEditor}
    <p>Click to pay in Venmo. If the recipient, amount, or memo doesn’t fill in automatically, enter it manually. Your host will verify receipt.</p>
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

function SettlementLedger({ people, tickets, showPayout }: { people: Array<{ bettor: string; staked: number; payout: number; net: number }>; tickets: Array<{ bettor: string; result: string }>; showPayout: boolean }) {
  const [selectedBettor, setSelectedBettor] = useState<string | null>(null);
  const rows = people.map((person) => {
    const personTickets = tickets.filter((ticket) => ticket.bettor === person.bettor);
    return {
      ...person,
      earningsPct: person.staked > 0 ? (person.net / person.staked) * 100 : 0,
      betCount: personTickets.length,
      wonBets: personTickets.filter((ticket) => ticket.result === "Won").length,
      lostBets: personTickets.filter((ticket) => ticket.result === "Lost").length,
      refundedBets: personTickets.filter((ticket) => ticket.result === "Refunded").length
    };
  })
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
  const selectedPerson = rows.find((person) => person.bettor === selectedBettor) ?? null;
  return <div className="ledger-graph">
    <p className="fine-print"><b>Net P/L</b> means net profit or loss. The return percentage is on the right{showPayout ? ", with the amount paid by the host underneath" : ""}. Hover with a mouse or tap a bar to see the original stake and full details.</p>
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
        const betSummary = `${person.betCount} bet${person.betCount === 1 ? "" : "s"}: ${person.wonBets} won, ${person.lostBets} lost${person.refundedBets ? `, ${person.refundedBets} refunded` : ""}`;
        return <button type="button" className={`ledger-axis${selectedBettor === person.bettor ? " selected" : ""}`} key={person.bettor} title={`${person.bettor}: ${betSummary}, stake ${money(person.staked)}${detailLabel}, P/L ${netLabel}, return ${pctLabel}`} aria-label={`${person.bettor}, ${betSummary}, staked ${money(person.staked)}${detailLabel}, profit loss ${netLabel}, return ${pctLabel}. Tap for details.`} aria-expanded={selectedBettor === person.bettor} onClick={() => setSelectedBettor(selectedBettor === person.bettor ? null : person.bettor)}>
          <i className={person.net >= 0 ? "profit-loss-layer positive" : "profit-loss-layer"} style={person.net >= 0 ? { left: "50%", width: `${profitLossWidth}%`, background: netColor(person.earningsPct) } : { left: `${50 - profitLossWidth}%`, width: `${profitLossWidth}%`, background: netColor(person.earningsPct) }} />
          <b className={person.net >= 0 ? "ledger-bar-label positive" : "ledger-bar-label"}>{netLabel}</b>
        </button>;
      })}</div>
      <div className="ledger-results">{rows.map((person) => {
        const pctLabel = `${person.earningsPct >= 0 ? "+" : ""}${Math.round(person.earningsPct)}%`;
        return <b className={person.net >= 0 ? "ledger-net positive" : "ledger-net"} key={person.bettor}>{pctLabel}{showPayout && <span>Host pays {money(person.payout)}</span>}</b>;
      })}</div>
    </div>
    {selectedPerson && <div className="ledger-tap-detail" aria-live="polite">
      <div><span>Bettor</span><strong>{selectedPerson.bettor}</strong></div>
      <div><span>Bets</span><strong>{selectedPerson.betCount} total · {selectedPerson.wonBets} won · {selectedPerson.lostBets} lost{selectedPerson.refundedBets ? ` · ${selectedPerson.refundedBets} refunded` : ""}</strong></div>
      <div><span>Original stake</span><strong>{money(selectedPerson.staked)}</strong></div>
      <div><span>Net P/L</span><strong className={selectedPerson.net >= 0 ? "positive" : ""}>{selectedPerson.net >= 0 ? "+" : ""}{money(selectedPerson.net)}</strong></div>
      <div><span>Return</span><strong>{selectedPerson.earningsPct >= 0 ? "+" : ""}{Math.round(selectedPerson.earningsPct)}%</strong></div>
      {showPayout && <div><span>Host pays</span><strong>{money(selectedPerson.payout)}</strong></div>}
      <button type="button" className="ghost-button" onClick={() => setSelectedBettor(null)}>Close details</button>
    </div>}
  </div>;
}

function CoopBoss({ payload, setPayload, initialAdminCode = "", onDeleted }: { payload: EventPayload; setPayload: (payload: EventPayload) => void; initialAdminCode?: string; onDeleted: () => void }) {
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
  const [showAllAdminBets, setShowAllAdminBets] = useState(false);
  const [message, setMessage] = useState("");
  const pendingHostBets = poolMode === "host_managed" ? payload.bets.filter((bet) => !bet.paymentVerified) : [];
  async function unlock(event: FormEvent) {
    event.preventDefault(); setMessage("");
    const response = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: payload.event.id, adminCode }) });
    const data = await response.json();
    if (!response.ok) setMessage(friendlyError(data.error ?? "Could not unlock admin.")); else { setUnlocked(true); setMessage(""); }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setMessage("");
    const removeUnverified = pendingHostBets.length > 0;
    if (removeUnverified) {
      const groups = new Map<string, { bettor: string; count: number; total: number }>();
      for (const bet of pendingHostBets) {
        const key = bet.paymentId || normalizeName(bet.bettor);
        const group = groups.get(key) ?? { bettor: bet.bettor, count: 0, total: 0 };
        group.count += 1; group.total += Number(bet.stake); groups.set(key, group);
      }
      const groupRows = Array.from(groups.values());
      const details = groupRows.slice(0, 10).map((group) => `${group.bettor}: ${group.count} bet${group.count === 1 ? "" : "s"}, ${money(group.total)}`).join("\n") + (groupRows.length > 10 ? `\n…and ${groupRows.length - 10} more payment batch${groupRows.length - 10 === 1 ? "" : "es"}` : "");
      const pendingTotal = pendingHostBets.reduce((sum, bet) => sum + Number(bet.stake), 0);
      if (!window.confirm(`PAYMENT CHECK\n\n${pendingHostBets.length} unverified bet${pendingHostBets.length === 1 ? "" : "s"} totaling ${money(pendingTotal)}:\n${details}\n\nConfirm received payments first if any were paid. If you continue now, every bet listed above will be permanently removed and will not count. Continue and remove them?`)) {
        setMessage("Results not saved. Confirm the waiting payments below, or try again when you are ready to remove the unpaid bets.");
        return;
      }
    }
    const response = await fetch("/api/results", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: payload.event.id, adminCode, results, winningNumber: isDropEvent ? Number(dropWinningNumber) : null, removeUnverified }) });
    const data = await response.json();
    if (!response.ok) setMessage(friendlyError(data.error ?? "Could not save results.")); else { setPayload(data); setMessage(`${isDropEvent ? "Official drop saved." : "Winners saved."}${removeUnverified ? ` ${pendingHostBets.length} unverified bet${pendingHostBets.length === 1 ? " was" : "s were"} removed.` : ""}`); }
  }
  async function removeBet(betId: number) {
    const bet = payload.bets.find((item) => item.id === betId);
    if (!bet || !window.confirm(`Delete bet #${bet.id} from ${bet.bettor} for ${money(bet.stake)}? This cannot be undone.`)) return;
    const response = await fetch("/api/admin", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: payload.event.id, adminCode, betId }) });
    const data = await response.json();
    if (!response.ok) setMessage(friendlyError(data.error ?? "Could not delete bet.")); else { setPayload(data); setMessage("Bet deleted."); }
  }
  async function removeEvent() {
    if (!window.confirm(`Delete “${payload.event.name}” (${payload.event.code}) and every bet, result, chicken, and race in it? This cannot be undone.`)) return;
    const response = await fetch("/api/events", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: payload.event.id, adminCode }) });
    const data = await response.json();
    if (!response.ok) { setMessage(friendlyError(data.error ?? "Could not delete event.")); return; }
    onDeleted();
  }
  async function updatePaymentBatch(paymentId: string, bettor: string, count: number, total: number, verified: boolean) {
    const prompt = verified
      ? `Confirm payment ${paymentId} from ${bettor} for ${money(total)}? All ${count} covered bet${count === 1 ? "" : "s"} will start counting.`
      : `Undo confirmation for payment ${paymentId}? All ${count} covered bet${count === 1 ? "" : "s"} will return to pending.`;
    if (!window.confirm(prompt)) return;
    setMessage(`${verified ? "Confirming" : "Reopening"} payment ${paymentId} for ${bettor}...`);
    const response = await fetch("/api/admin", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify_bettor_payments", eventId: payload.event.id, adminCode, paymentId, verified }) });
    const data = await response.json();
    if (!response.ok) setMessage(friendlyError(data.error ?? "Could not update the grouped payment."));
    else { setPayload(data); setMessage(verified ? `Payment ${paymentId} confirmed; ${count} bet${count === 1 ? "" : "s"} for ${bettor} now count.` : `Payment ${paymentId} returned to pending.`); }
  }
  async function removePaymentBatch(paymentId: string, bettor: string, count: number, total: number) {
    if (!window.confirm(`Delete all ${count} bet${count === 1 ? "" : "s"} from ${bettor} in payment ${paymentId} (${money(total)})? This cannot be undone.`)) return;
    const response = await fetch("/api/admin", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: payload.event.id, adminCode, paymentId }) });
    const data = await response.json();
    if (!response.ok) setMessage(friendlyError(data.error ?? "Could not delete that payment batch.")); else { setPayload(data); setMessage(`${count} bet${count === 1 ? "" : "s"} deleted.`); }
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
      if (!response.ok) setMessage(friendlyError(data.error ?? "Could not save event settings.")); else { setPayload(data); setChickens(data.chickens); setRaces(data.races); setMessage("Event settings saved."); }
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
  const raceStructureLocked = payload.bets.length > 0 || Object.keys(payload.results).length > 0;
  const configuredDropSections = (Number(dropGridColumns) || 0) * (Number(dropGridRows) || 0);
  const normalizedBetSearch = betSearch.trim().toLowerCase();
  const matchingBets = payload.bets.filter((bet) => !normalizedBetSearch || [
    String(bet.id), `#${bet.id}`, bet.paymentId, bet.bettor, bet.venmo, bet.betType, describeBet(bet, payload.chickens, payload.races), String(bet.stake), bet.paymentVerified ? "confirmed" : bet.paymentSubmitted ? "sent submitted ready verify" : "pending"
  ].join(" ").toLowerCase().includes(normalizedBetSearch));
  const betsPerPage = 12;
  const betPageCount = showAllAdminBets ? 1 : Math.max(1, Math.ceil(matchingBets.length / betsPerPage));
  const currentBetPage = Math.min(betPage, betPageCount - 1);
  const visibleBets = showAllAdminBets ? matchingBets : matchingBets.slice(currentBetPage * betsPerPage, (currentBetPage + 1) * betsPerPage);
  const paymentGroups = new Map<string, { paymentId: string; bettor: string; venmo: string; count: number; total: number; submittedCount: number; verifiedCount: number }>();
  for (const bet of payload.bets) {
    if (payload.event.poolMode !== "host_managed") continue;
    const key = bet.paymentId || normalizeName(bet.bettor);
    const group = paymentGroups.get(key) ?? { paymentId: bet.paymentId, bettor: bet.bettor, venmo: bet.venmo, count: 0, total: 0, submittedCount: 0, verifiedCount: 0 };
    group.count += 1;
    group.total += Number(bet.stake);
    if (bet.paymentSubmitted) group.submittedCount += 1;
    if (bet.paymentVerified) group.verifiedCount += 1;
    paymentGroups.set(key, group);
  }
  const paymentBatches = Array.from(paymentGroups.values()).sort((a, b) => {
    const rank = (group: { count: number; submittedCount: number; verifiedCount: number }) => group.verifiedCount === group.count ? 2 : group.submittedCount > 0 ? 0 : 1;
    return rank(a) - rank(b);
  });
  const pendingPaymentBatches = paymentBatches.filter((group) => group.verifiedCount < group.count);
  return (
    <section className="panel coop-boss">
      <div className="coop-boss-heading"><h2>Coop Boss</h2>{!isTestEvent && <div className="admin-session-status"><span>Admin unlocked</span><button type="button" className="ghost-button" onClick={() => setUnlocked(false)}>Lock</button></div>}</div>
      {isTestEvent && <div className="notice">Demo admin is already unlocked. The admin code is blank.</div>}
      {countedBets(payload).length < 2 && <p className="muted">Not enough counted bets for settlement yet.</p>}
      {payload.bets.length === 0 && <div className="notice"><b>Finish setup before sharing:</b> choose the settlement type below, review the event details and contestants, then press <b>Save event setup</b>.</div>}

      <nav className="admin-section-nav" aria-label="Coop Boss sections">
        <span>Jump to</span>
        <div>
          <a href="#admin-event-setup">Event setup</a>
          {!isDropEvent && <a href="#admin-contestants">Contestants & races</a>}
          {poolMode === "host_managed" && <a href="#admin-payments">Payments{pendingPaymentBatches.length > 0 && <b>{pendingPaymentBatches.length}</b>}</a>}
          <a href="#admin-bet-management">Bet management</a>
          <a href="#admin-results">Results</a>
        </div>
      </nav>
      {poolMode === "host_managed" && pendingPaymentBatches.length > 0 && <div className="notice payment-alert"><div><b>{pendingPaymentBatches.length} payment{pendingPaymentBatches.length === 1 ? " needs" : "s need"} review</b></div><a href="#admin-payments">Review payments</a></div>}

      <form id="admin-event-setup" className="grid-form admin-section-target coop-section coop-event-section" onSubmit={saveConfig}>
        <h3>Event setup</h3>
        <p className="fine-print wide-field">Update event details and settlement.</p>
        <div className="game-format-card wide-field"><span>Event format</span><strong>{isDropEvent ? "Chicken Drop" : "Chicken Race"}</strong></div>
        <label>Settlement type<select disabled={settlementTypeLocked} value={poolMode} onChange={(event) => setPoolMode(event.target.value as PoolMode)}><option value="peer_to_peer">Player-to-player settlement (optional)</option><option value="host_managed">Host-maintained pool</option></select></label>
        {poolMode === "host_managed" && <>
          <label>Host Venmo username<div className="venmo-input"><span>@</span><input required disabled={settlementTypeLocked} value={hostVenmo} placeholder="host username" onChange={(event) => setHostVenmo(event.target.value.replace(/^@+/, ""))} /></div>{hostVenmo && <a className="venmo-profile-check" href={`https://account.venmo.com/u/${encodeURIComponent(hostVenmo)}`} target="_blank" rel="noreferrer"><span aria-hidden="true">V</span>Verify @{hostVenmo}</a>}</label>
        </>}
        <p className="fine-print wide-field">{settlementTypeLocked ? "Settlement type and host Venmo are locked after the first bet." : "Choose the settlement type before betting begins."}</p>
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
          <div id="admin-contestants" className="wide-field admin-section-target admin-subsection-heading"><h3>Contestants & race card</h3><p className="fine-print">{raceStructureLocked ? "Locked to protect existing bets. Delete all bets and clear results to change the lineup." : "Add only what you need."}</p></div>
          {races.map((race, idx) => <div className="admin-card" key={race.race}>
            <label>Race name<input value={race.name} onChange={(event) => setRaces(races.map((item, itemIdx) => itemIdx === idx ? { ...item, name: event.target.value } : item))} /></label>
            <label>Race details<textarea value={race.description} onChange={(event) => setRaces(races.map((item, itemIdx) => itemIdx === idx ? { ...item, description: event.target.value } : item))} rows={3} /></label>
            <label className="check-row race-roster-toggle"><input type="checkbox" disabled={raceStructureLocked} checked={race.chickenIds.length > 0} onChange={(event) => setRaces(races.map((item, itemIdx) => itemIdx === idx ? { ...item, chickenIds: event.target.checked ? chickens.map((chicken) => chicken.id) : [] } : item))} /> Use a different flock for this race</label>
            {race.chickenIds.length > 0 && <div className="race-roster-picker"><span>Chickens running in this race</span>{chickens.map((chicken) => <label className="check-row" key={chicken.id}><input type="checkbox" disabled={raceStructureLocked} checked={race.chickenIds.includes(chicken.id)} onChange={(event) => { const chickenIds = event.target.checked ? [...race.chickenIds, chicken.id] : race.chickenIds.filter((id) => id !== chicken.id); if (!chickenIds.length) return; setRaces(races.map((item, itemIdx) => itemIdx === idx ? { ...item, chickenIds } : item)); }} /> {chicken.name}</label>)}</div>}
            <button type="button" className="trash-icon-button" disabled={raceStructureLocked || races.length === 1} title="Delete race" aria-label={`Delete ${race.name}`} onClick={() => setRaces(races.filter((_, itemIdx) => itemIdx !== idx))}>Delete race</button>
          </div>)}
          <button type="button" className="wide-field add-setup-row" disabled={raceStructureLocked} onClick={() => { const race = Math.max(0, ...races.map((item) => item.race)) + 1; setRaces([...races, { race, name: `Race ${race}`, description: "Add race details.", chickenIds: [] }]); }}>+ Add race</button>
          <h3>Flock notes</h3>
          {chickens.map((chicken, idx) => <div className="admin-card chicken-admin-card" key={chicken.id}>
            <ChickenPhoto chicken={chicken} preview />
            <label>Chicken name<input value={chicken.name} onChange={(event) => setChickens(chickens.map((item, itemIdx) => itemIdx === idx ? { ...item, name: event.target.value } : item))} /></label>
            <label>Coop note<textarea value={chicken.bio ?? ""} onChange={(event) => setChickens(chickens.map((item, itemIdx) => itemIdx === idx ? { ...item, bio: event.target.value } : item))} rows={3} /></label>
            <label>Chicken photo<input type="file" accept="image/*" onChange={(event) => uploadChickenPhoto(chicken.id, event.target.files?.[0] ?? null)} /></label>
            {chicken.photoUrl && <button type="button" onClick={() => setChickens(chickens.map((item) => item.id === chicken.id ? { ...item, photoUrl: null } : item))}>Remove photo</button>}
            <button type="button" className="trash-icon-button" disabled={raceStructureLocked || chickens.length === 1} title="Delete chicken" aria-label={`Delete ${chicken.name}`} onClick={() => { const remaining = chickens.filter((_, itemIdx) => itemIdx !== idx); setChickens(remaining); setRaces(races.map((item) => { if (!item.chickenIds.length) return item; const chickenIds = item.chickenIds.filter((id) => id !== chicken.id); return { ...item, chickenIds: chickenIds.length ? chickenIds : remaining.map((entry) => entry.id) }; })); }}>Delete chicken</button>
          </div>)}
          <button type="button" className="wide-field add-setup-row" disabled={raceStructureLocked} onClick={() => { const id = Math.min(0, ...chickens.map((item) => item.id)) - 1; setChickens([...chickens, { id, slot: chickens.length + 1, name: `Chicken ${chickens.length + 1}`, photoUrl: null, bio: "" }]); }}>+ Add chicken</button>
        </>}
        <button type="submit">Save event setup</button>
      </form>

      {payload.event.poolMode === "host_managed" && <section id="admin-payments" className="payment-batch-manager admin-section-target coop-section">
        <div className="bet-manager-heading"><div><h3>Payment review & approval</h3><p className="fine-print">Match the ID in Venmo, then approve the batch.</p></div><strong>{pendingPaymentBatches.length} to review</strong></div>
        {paymentBatches.length === 0 ? <p className="muted">Payment rows will appear after bettors add bets.</p> : <div className="admin-table-wrap"><table className="admin-data-table payment-review-table"><thead><tr><th>Bettor</th><th>Payment ID</th><th>Venmo</th><th>Bets</th><th>Total</th><th>Status</th><th>Action</th></tr></thead><tbody>{paymentBatches.map((group) => {
          const verified = group.verifiedCount === group.count;
          const readyForReview = !verified && group.submittedCount > 0;
          return <tr className={verified ? "confirmed" : readyForReview ? "ready-review" : "pending"} key={group.paymentId || normalizeName(group.bettor)}><td><strong>{group.bettor}</strong></td><td><span className="payment-id-badge">{group.paymentId}</span></td><td>{group.venmo}</td><td>{group.count}</td><td><strong>{money(group.total)}</strong></td><td><span className={`table-status ${verified ? "confirmed" : readyForReview ? "ready" : "waiting"}`}>{verified ? "✓ Approved" : readyForReview ? "Ready to review" : "Pending"}</span></td><td><span className="payment-row-actions"><button type="button" className={verified ? "ghost-button" : ""} onClick={() => updatePaymentBatch(group.paymentId, group.bettor, group.count, group.total, !verified)}>{verified ? "Undo" : readyForReview ? "Approve" : "Confirm"}</button><button type="button" className="delete-row" onClick={() => removePaymentBatch(group.paymentId, group.bettor, group.count, group.total)}>Delete bets</button></span></td></tr>;
        })}</tbody></table></div>}
      </section>}
      {bettors.length > 0 && <form className="grid-form coop-section coop-venmo-section" onSubmit={saveBettors}>
        <h3>Bettor Venmo handles</h3>
        <div className="admin-table-wrap"><table className="admin-data-table venmo-handle-table"><thead><tr><th>Bettor</th><th>Venmo handle</th></tr></thead><tbody>{bettors.map((bettor, idx) => <tr key={normalizeName(bettor.name)}><td><strong>{bettor.name}</strong></td><td><div className="venmo-input"><span>@</span><input aria-label={`${bettor.name} Venmo handle`} required={payload.event.poolMode === "host_managed"} value={bettor.venmo.replace(/^@/, "")} placeholder="username" onChange={(event) => setBettors(bettors.map((item, itemIdx) => itemIdx === idx ? { ...item, venmo: event.target.value.replace(/^@+/, "") } : item))} /></div></td></tr>)}</tbody></table></div>
        <button type="submit">Save Venmo handles</button>
      </form>}

      {message && <p className={message.includes("saved") || message.includes("deleted") || message.includes("cleared") || message.includes("confirmed") || message.includes("no longer counts") ? "form-ok" : "form-error"}>{message}</p>}
      <div id="admin-bet-management" className="admin-management-section admin-section-target coop-section">
      <section className="bet-manager">
        <div className="bet-manager-heading"><h3>Bet management</h3><div className="bet-manager-actions"><strong>{matchingBets.length.toLocaleString()} bet{matchingBets.length === 1 ? "" : "s"}</strong>{matchingBets.length > betsPerPage && <button type="button" className="ghost-button" onClick={() => { setShowAllAdminBets(!showAllAdminBets); setBetPage(0); }}>{showAllAdminBets ? "Show less" : "Show all"}</button>}</div></div>
        <label>Search bets<input type="search" value={betSearch} placeholder="Name, payment ID, bet ID, pick, or status" onChange={(event) => { setBetSearch(event.target.value); setBetPage(0); setShowAllAdminBets(false); }} /></label>
        {visibleBets.length === 0 ? <p className="muted">No bets match that search.</p> : <div className="admin-table-wrap"><table className="admin-data-table bet-management-table"><thead><tr><th>Ticket</th><th>Bettor</th><th>Pick</th><th>Amount</th><th>Venmo</th>{payload.event.poolMode === "host_managed" && <><th>Payment ID</th><th>Payment</th></>}<th>Action</th></tr></thead><tbody>{visibleBets.map((bet) => <tr key={bet.id}><td><strong>#{bet.id}</strong></td><td>{bet.bettor}</td><td>{describeBet(bet, payload.chickens, payload.races)}</td><td>{money(bet.stake)}</td><td>{bet.venmo || "—"}</td>{payload.event.poolMode === "host_managed" && <><td><span className="payment-id-badge">{bet.paymentId}</span></td><td><span className={`table-status ${bet.paymentVerified ? "confirmed" : "waiting"}`}>{bet.paymentVerified ? "✓ Confirmed" : "Payment not confirmed"}</span></td></>}<td><button className="delete-row" type="button" onClick={() => removeBet(bet.id)}>Delete</button></td></tr>)}</tbody></table></div>}
        {betPageCount > 1 && <nav className="bet-pagination" aria-label="Bet manager pages"><button type="button" disabled={currentBetPage === 0} onClick={() => setBetPage(Math.max(0, currentBetPage - 1))}>Previous</button><span>Page {currentBetPage + 1} of {betPageCount}</span><button type="button" disabled={currentBetPage >= betPageCount - 1} onClick={() => setBetPage(Math.min(betPageCount - 1, currentBetPage + 1))}>Next</button></nav>}
      </section>
      </div>

      <form id="admin-results" className="grid-form result-entry admin-section-target coop-section" onSubmit={save}>
        <h3>Results</h3>
        <p className="fine-print wide-field">{isDropEvent ? "Enter the official winning square." : "Enter the official race results."}</p>
        {poolMode === "host_managed" && pendingHostBets.length > 0 && <div className="notice error wide-field"><b>Payment check required:</b> {pendingHostBets.length} unverified bet{pendingHostBets.length === 1 ? "" : "s"} will be permanently removed if you save winners now. <a href="#admin-payments">Review and confirm payments first.</a></div>}
        <h4 className="wide-field">{isDropEvent ? "Official Chicken Drop result" : "Official race results"}</h4>
        {isDropEvent ? <label>Winning number<input type="number" min="1" max={payload.event.dropMaxNumber} step="1" value={dropWinningNumber} onChange={(event) => setDropWinningNumber(event.target.value)} /></label> : payload.races.map((race) => resultMode === "full_order" ? <div className="admin-card" key={race.race}>
          <h3>{race.name}</h3>
          {chickensForRace(race, payload.chickens).map((_, idx) => <label key={idx}>Place {idx + 1}<select value={results[race.race]?.[idx] ?? ""} onChange={(event) => { const next = [...(results[race.race] ?? [])]; next[idx] = Number(event.target.value); setResults({ ...results, [race.race]: next }); }}><option value="">Pick chicken</option>{chickensForRace(race, payload.chickens).map((chicken) => <option key={chicken.id} value={chicken.id}>{chicken.name}</option>)}</select></label>)}
        </div> : <label key={race.race}>{race.name}<select value={results[race.race]?.[0] ?? ""} onChange={(event) => setResults({ ...results, [race.race]: [Number(event.target.value)] })}><option value="">Pick winner</option>{chickensForRace(race, payload.chickens).map((chicken) => <option key={chicken.id} value={chicken.id}>{chicken.name}</option>)}</select></label>)}
        <button type="submit">{isDropEvent ? "Save official drop" : "Save results"}</button>
        {(isDropEvent ? payload.event.dropWinningNumber != null : Object.keys(payload.results).length > 0) && <button type="button" className="ghost-button" onClick={clearWinners}>Clear results</button>}
      </form>
      {poolMode === "host_managed" && payload.settlement && <HostPayoutPayments payload={payload} />}
      <div className="event-danger-zone"><span><b>Delete this event</b><small>Removes all bets, payments, contestants, races, and results.</small></span><button type="button" className="trash-event-button" onClick={removeEvent}>Delete event</button></div>
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

