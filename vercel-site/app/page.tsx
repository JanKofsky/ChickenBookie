"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Bet, BetType, Chicken, EventPayload, Race, Results } from "../lib/chickenBookie";

const BET_TYPES: Record<BetType, string> = {
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
const simpleBetTypes: BetType[] = ["race_winner", "any_win", "any_order_three", "exact_ticket", "sweep"];
const fullOrderBetTypes: BetType[] = ["race_winner", "race_place", "race_show", "exacta", "trifecta", "any_win", "any_order_three", "exact_ticket", "sweep"];
const raceBetTypes: BetType[] = ["race_winner", "race_place", "race_show", "exacta", "trifecta"];
const showMerchTab = false;
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);
const dateTimeInputValue = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
      window.history.replaceState(null, "", `?event=${encodeURIComponent(data.event.code)}`);
    } catch (err) {
      setError(err instanceof Error ? friendlyError(err.message) : "Could not load event.");
    } finally { setLoading(false); }
  }

  function leaveEvent() {
    setPayload(null);
    setEventCode("");
    setTab("bet");
    setError("");
    window.history.replaceState(null, "", "/");
  }

  function openCreated(data: EventPayload) {
    setPayload(data);
    setEventCode(data.event.code);
    window.history.replaceState(null, "", `?event=${encodeURIComponent(data.event.code)}`);
  }

  const totalPool = useMemo(() => payload?.bets.reduce((sum, bet) => sum + Number(bet.stake), 0) ?? 0, [payload]);
  const countdown = payload ? countdownParts(payload.event.bettingCloseAt, now) : null;

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
            <img src="/assets/chicken_bookie_logo.png" alt="Chicken Bookie chicken logo" />
          </a>
          <button type="button" className="ghost-button" onClick={leaveEvent}>Back to main page</button>
        </div>
      )}
      <header className="hero">
        <section className="hero-grid">
          <div>
            <div className="hero-title">
              <h1>{payload?.event.name ?? "Chicken Bookie"}</h1>
              {!payload && <img className="hero-logo" src="/assets/chicken_bookie_logo.png" alt="Chicken Bookie chicken logo" />}
            </div>
            <p className="hero-subtitle">{payload ? `${payload.chickens.length} chickens | ${payload.races.length} races` : "a private barnyard betting tool"}</p>
            {payload ? <p className="lede">{payload.event.officialRule}</p> : (
              <form className="event-switch hero-switch" onSubmit={(event) => { event.preventDefault(); loadEvent(); }}>
                <input value={eventCode} onChange={(event) => setEventCode(event.target.value)} aria-label="Event code" placeholder="Event code here" />
                <button type="submit">Open event</button>
              </form>
            )}
            {payload && countdown && <Countdown parts={countdown} closeAt={payload.event.bettingCloseAt} />}
          </div>
          {payload && (
            <div className="scoreboard">
              <Stat label="Cluck bucket" value={money(totalPool)} />
              <Stat label="Bets" value={String(payload.bets.length)} />
              <Stat label="Event code" value={payload.event.code} />
            </div>
          )}
        </section>
      </header>

      {error && <div className="notice error">{error}</div>}
      {loading && <div className="notice">Loading the coop...</div>}
      {!payload ? <div className="setup-panel"><CreateEvent onCreated={openCreated} /></div> : (
        <>
          <div className="tabs" role="tablist">
            {[
              ["bet", "Betting Coop"],
              ["flock", "Starting Flock"],
              ["tickets", "Ticket Board"],
              ["winners", "Winner's Circle"],
              ["boss", "Coop Boss"],
              ...(showMerchTab ? [["merch", "Merch"]] : [])
            ].map(([id, label]) => (
              <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>
            ))}
          </div>
          {tab === "bet" && <Betting payload={payload} setPayload={setPayload} />}
          {tab === "flock" && <Flock chickens={payload.chickens} races={payload.races} officialRule={payload.event.officialRule} />}
          {tab === "tickets" && <Tickets bets={payload.bets} chickens={payload.chickens} races={payload.races} />}
          {tab === "winners" && <Winners payload={payload} />}
          {tab === "boss" && <CoopBoss payload={payload} setPayload={setPayload} />}
          {tab === "merch" && <section className="panel"><h2>Merch</h2><p className="muted">Chicken Bookie merch is warming up in the coop.</p></section>}
        </>
      )}
      <footer className="site-footer"><a href="/about">About</a><a href="/contact">Contact</a><a href="/privacy">Privacy &amp; Terms</a></footer>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function Countdown({ parts, closeAt }: { parts: ReturnType<typeof countdownParts>; closeAt: string }) {
  const closeDate = new Date(closeAt);
  const closeLabel = Number.isNaN(closeDate.getTime()) ? closeAt : closeDate.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  if (parts.closed) return <div className="countdown"><span>bets closed</span><strong>time's up</strong></div>;
  return <div className="countdown" aria-label={`Bets open until ${closeLabel}`}><span>bets open until {closeLabel}</span><strong>{parts.days}d {String(parts.hours).padStart(2, "0")}h {String(parts.minutes).padStart(2, "0")}m {String(parts.seconds).padStart(2, "0")}s</strong></div>;
}

function CreateEvent({ onCreated }: { onCreated: (payload: EventPayload) => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [showAdminCode, setShowAdminCode] = useState(false);
  const [resultMode, setResultMode] = useState<"winner" | "full_order">("winner");
  const [copyCode, setCopyCode] = useState("");
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setMessage("");
    const response = await fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, code, adminCode, resultMode, copyCode }) });
    const data = await response.json();
    if (!response.ok) setMessage(friendlyError(data.error ?? "Could not create event.")); else onCreated(data);
  }
  return <section className="panel"><h2>Make an event</h2><form className="grid-form" onSubmit={submit}>
    <label>Event name<input value={name} onChange={(event) => setName(event.target.value)} /></label>
    <label>Event code<input value={code} onChange={(event) => setCode(event.target.value.toLowerCase())} /></label>
    <label>Race result style<select value={resultMode} onChange={(event) => setResultMode(event.target.value as "winner" | "full_order")}><option value="winner">only track the winner</option><option value="full_order">rank the whole flock</option></select></label>
    <label>Admin code (optional)<input type={showAdminCode ? "text" : "password"} placeholder="leave blank if you don't give a cluck" value={adminCode} onChange={(event) => setAdminCode(event.target.value)} /></label>
    <p className="fine-print wide-field">write this down now; Chicken Bookie will not show it again</p>
    <label className="check-row"><input type="checkbox" checked={showAdminCode} onChange={(event) => setShowAdminCode(event.target.checked)} /> Show admin code</label>
    <label>Copy event code (optional)<input value={copyCode} onChange={(event) => setCopyCode(event.target.value)} /></label>
    <button type="submit">Create</button>{message && <p className="form-error">{message}</p>}
  </form></section>;
}

function Betting({ payload, setPayload }: { payload: EventPayload; setPayload: (payload: EventPayload) => void }) {
  const [bettor, setBettor] = useState("");
  const [stake, setStake] = useState("");
  const [betType, setBetType] = useState<BetType>("race_winner");
  const [race, setRace] = useState(payload.races[0]?.race ?? 1);
  const [picks, setPicks] = useState<number[]>([]);
  const [message, setMessage] = useState("");
  const availableBetTypes = payload.event.resultMode === "full_order" ? fullOrderBetTypes : simpleBetTypes;
  const needed = betType === "exact_ticket" || betType === "any_order_three" ? payload.races.length : betType === "exacta" ? 2 : betType === "trifecta" ? 3 : 1;
  const selectedPicks = picks.slice(0, needed);
  async function submit(event: FormEvent) {
    event.preventDefault(); setMessage("");
    const stakeValue = Number(stake);
    if (!Number.isFinite(stakeValue) || stakeValue <= 0) { setMessage("Enter Cluck Bucks greater than zero."); return; }
    if (selectedPicks.length !== needed) { setMessage(`Pick ${needed} chicken${needed === 1 ? "" : "s"}.`); return; }
    const response = await fetch("/api/bets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: payload.event.id, bettor, stake: stakeValue, betType, race: raceBetTypes.includes(betType) ? race : null, picks: selectedPicks }) });
    const data = await response.json();
    if (!response.ok) setMessage(friendlyError(data.error ?? "Could not add bet.")); else { setPayload(data); setPicks([]); setMessage("Bet added."); }
  }
  return <section className="panel"><h2>Betting Coop</h2><p className="muted">Use the same name each time. Every Cluck Buck goes into one shared feed bucket for scorekeeping.</p><p className="fine-print">Chicken Bookie tracks Cluck Bucks and settlement math; it does not collect, hold, process, or transfer money.</p><ChickenStatsPanel bets={payload.bets} chickens={payload.chickens} /><form className="bet-form" onSubmit={submit}>
    <label>Gambler name<input value={bettor} onChange={(event) => setBettor(event.target.value)} /></label>
    <label>Cluck Bucks<input type="number" min="1" step="1" inputMode="decimal" value={stake} onChange={(event) => setStake(event.target.value)} /></label>
    <label>Bet type<select value={betType} onChange={(event) => { setBetType(event.target.value as BetType); setPicks([]); }}>{availableBetTypes.map((key) => <option key={key} value={key}>{BET_TYPES[key]}</option>)}</select></label>
    {raceBetTypes.includes(betType) && <label>Race<select value={race} onChange={(event) => setRace(Number(event.target.value))}>{payload.races.map((race) => <option key={race.race} value={race.race}>{race.name}</option>)}</select></label>}
    <ChickenPicker chickens={payload.chickens} picks={selectedPicks} setPicks={setPicks} count={needed} exact={betType === "exact_ticket" || betType === "exacta" || betType === "trifecta"} races={payload.races} labels={betType === "exacta" ? ["1st place", "2nd place"] : betType === "trifecta" ? ["1st place", "2nd place", "3rd place"] : undefined} />
    <button type="submit">Add bet</button>{message && <p className={message.includes("added") ? "form-ok" : "form-error"}>{message}</p>}
  </form></section>;
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

function Flock({ chickens, races, officialRule }: { chickens: Chicken[]; races: Race[]; officialRule: string }) {
  return <section className="split"><div className="panel"><h2>Starting Flock</h2><div className="flock-grid">{chickens.map((chicken) => <div className="bird" key={chicken.id}>{chicken.photoUrl && <img src={chicken.photoUrl} alt={`${chicken.name} chicken`} />}<span>#{chicken.slot}</span><strong>{chicken.name}</strong>{chicken.bio && <p>{chicken.bio}</p>}</div>)}</div></div><div className="panel"><h2>Race card</h2><article className="race-card"><span>How results are determined</span><h3>race rules</h3><p>{officialRule}</p></article>{races.map((race) => <article className="race-card" key={race.race}><span>Race {race.race}</span><h3>{race.name}</h3><p>{race.description}</p></article>)}</div></section>;
}

function Tickets({ bets, chickens, races }: { bets: Bet[]; chickens: Chicken[]; races: Race[] }) {
  return <section className="panel"><h2>Ticket Board</h2><ChickenStatsPanel bets={bets} chickens={chickens} />{bets.length === 0 ? <p className="muted">No bets yet.</p> : <div className="ticket-table"><div className="ticket-row ticket-head"><span>Name</span><span>Win condition</span><span>Cluck Bucks</span></div>{bets.map((bet) => <div className="ticket-row" key={bet.id}><strong>{bet.bettor}</strong><span>{BET_TYPES[bet.betType]} - {describeBet(bet, chickens, races)}</span><b>{money(bet.stake)}</b></div>)}</div>}</section>;
}

function ChickenStatsPanel({ bets, chickens }: { bets: Bet[]; chickens: Chicken[] }) {
  const stats = chickens.map((chicken) => {
    const matching = bets.filter((bet) => pickedChickenIds(bet).includes(chicken.id));
    return { chicken, tickets: matching.length, cluckBucks: matching.reduce((sum, bet) => sum + Number(bet.stake), 0) };
  }).sort((a, b) => b.tickets - a.tickets || b.cluckBucks - a.cluckBucks || a.chicken.slot - b.chicken.slot).slice(0, 3);
  const maxTickets = Math.max(1, ...stats.map((stat) => stat.tickets));
  return <div className="chicken-stats"><div><span>live flock board</span><strong>top chickens by tickets</strong></div>{stats.map((stat, idx) => <div className="stat-bar" key={stat.chicken.id}><span>#{idx + 1} {stat.chicken.name}</span><div><i style={{ width: `${Math.max(8, (stat.tickets / maxTickets) * 100)}%` }} /></div><b>{stat.tickets} ticket{stat.tickets === 1 ? "" : "s"} | {money(stat.cluckBucks)}</b></div>)}</div>;
}

function Winners({ payload }: { payload: EventPayload }) {
  if (payload.bets.length < 2) return <section className="panel"><h2>Winner's Circle</h2><p className="muted">Oh cluck, not enough bets yet. Add at least two tickets before the feed bucket math is worth settling.</p></section>;
  if (!payload.settlement) return <section className="panel"><h2>Winner's Circle</h2><p className="muted">The Coop Boss needs to enter every race winner before settlement is shown.</p></section>;
  return <section className="panel"><h2>Winner's Circle</h2><div className="payment-list">{payload.settlement.payments.length === 0 ? <p>No payments needed.</p> : payload.settlement.payments.map((payment, idx) => <div className="payment" key={idx}>{payment.from} pays {payment.to} <strong>{money(payment.amount)}</strong></div>)}</div><h3>Ledger</h3><div className="table">{payload.settlement.people.map((person) => <div className="ticket" key={person.bettor}><strong>{person.bettor}</strong><span>Cluck Bucks {money(person.staked)}</span><span>Payout {money(person.payout)}</span><b>{money(person.net)}</b></div>)}</div></section>;
}

function CoopBoss({ payload, setPayload }: { payload: EventPayload; setPayload: (payload: EventPayload) => void }) {
  const [adminCode, setAdminCode] = useState("");
  const [showAdminCode, setShowAdminCode] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [results, setResults] = useState<Results>(payload.results ?? {});
  const [eventName, setEventName] = useState(payload.event.name);
  const [bettingCloseAt, setBettingCloseAt] = useState(dateTimeInputValue(payload.event.bettingCloseAt));
  const [officialRule, setOfficialRule] = useState(payload.event.officialRule);
  const [resultMode, setResultMode] = useState(payload.event.resultMode);
  const [chickens, setChickens] = useState(payload.chickens);
  const [races, setRaces] = useState(payload.races);
  const [message, setMessage] = useState("");
  async function unlock(event: FormEvent) {
    event.preventDefault(); setMessage("");
    const response = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: payload.event.id, adminCode }) });
    const data = await response.json();
    if (!response.ok) setMessage(friendlyError(data.error ?? "Could not unlock admin.")); else { setUnlocked(true); setMessage(""); }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setMessage("");
    const response = await fetch("/api/results", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: payload.event.id, adminCode, results }) });
    const data = await response.json();
    if (!response.ok) setMessage(friendlyError(data.error ?? "Could not save winners.")); else { setPayload(data); setMessage("Winners saved."); }
  }
  async function removeBet(betId: number) {
    const response = await fetch("/api/admin", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: payload.event.id, adminCode, betId }) });
    const data = await response.json();
    if (!response.ok) setMessage(friendlyError(data.error ?? "Could not delete bet.")); else { setPayload(data); setMessage("Bet deleted."); }
  }
  async function saveConfig(event: FormEvent) {
    event.preventDefault(); setMessage("");
    const response = await fetch("/api/admin", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: payload.event.id, adminCode, name: eventName, bettingCloseAt, officialRule, resultMode, chickens, races }) });
    const data = await response.json();
    if (!response.ok) setMessage(friendlyError(data.error ?? "Could not save event settings.")); else { setPayload(data); setMessage("Event settings saved."); }
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
  return <section className="panel"><h2>Coop Boss</h2><form className="admin-unlock" onSubmit={unlock}><label>Admin code<input type={showAdminCode ? "text" : "password"} placeholder="admin code here" value={adminCode} onChange={(event) => setAdminCode(event.target.value)} /></label><label className="check-row"><input type="checkbox" checked={showAdminCode} onChange={(event) => setShowAdminCode(event.target.checked)} /> Show admin code</label><button type="submit">Admin unlocked</button></form>{payload.bets.length < 2 && <p className="muted">Oh cluck, not enough bets yet. You can save winners, but settlement waits until at least two tickets exist.</p>}<form className="grid-form" onSubmit={saveConfig}><h3>Event setup</h3><label>Event name<input value={eventName} onChange={(event) => setEventName(event.target.value)} /></label><label>Bets open until<input type="datetime-local" value={bettingCloseAt} onChange={(event) => setBettingCloseAt(event.target.value)} /></label><label>Race result style<select value={resultMode} onChange={(event) => setResultMode(event.target.value as "winner" | "full_order")}><option value="winner">only track the winner</option><option value="full_order">rank the whole flock</option></select></label><label className="wide-field">Race rules<textarea value={officialRule} placeholder="first to the marshmallow wins" onChange={(event) => setOfficialRule(event.target.value)} rows={3} /></label><h3>Race card</h3>{races.map((race, idx) => <div className="admin-card" key={race.race}><label>Race name<input value={race.name} onChange={(event) => setRaces(races.map((item, itemIdx) => itemIdx === idx ? { ...item, name: event.target.value } : item))} /></label><label>Race details<textarea value={race.description} onChange={(event) => setRaces(races.map((item, itemIdx) => itemIdx === idx ? { ...item, description: event.target.value } : item))} rows={3} /></label></div>)}<h3>Flock notes</h3>{chickens.map((chicken, idx) => <div className="admin-card chicken-admin-card" key={chicken.id}>{chicken.photoUrl && <img src={chicken.photoUrl} alt={`${chicken.name} chicken preview`} />}<label>Chicken name<input value={chicken.name} onChange={(event) => setChickens(chickens.map((item, itemIdx) => itemIdx === idx ? { ...item, name: event.target.value } : item))} /></label><label>Coop note<textarea value={chicken.bio ?? ""} onChange={(event) => setChickens(chickens.map((item, itemIdx) => itemIdx === idx ? { ...item, bio: event.target.value } : item))} rows={3} /></label><label>Chicken photo<input type="file" accept="image/*" onChange={(event) => uploadChickenPhoto(chicken.id, event.target.files?.[0] ?? null)} /></label>{chicken.photoUrl && <button type="button" onClick={() => setChickens(chickens.map((item) => item.id === chicken.id ? { ...item, photoUrl: null } : item))}>Remove photo</button>}</div>)}<button type="submit">Save event setup</button></form><form className="grid-form" onSubmit={save}><h3>Result entry</h3>{payload.races.map((race) => resultMode === "full_order" ? <div className="admin-card" key={race.race}><h3>{race.name}</h3>{payload.chickens.map((_, idx) => <label key={idx}>Place {idx + 1}<select value={results[race.race]?.[idx] ?? ""} onChange={(event) => { const next = [...(results[race.race] ?? [])]; next[idx] = Number(event.target.value); setResults({ ...results, [race.race]: next }); }}><option value="">Pick chicken</option>{payload.chickens.map((chicken) => <option key={chicken.id} value={chicken.id}>{chicken.name}</option>)}</select></label>)}</div> : <label key={race.race}>{race.name}<select value={results[race.race]?.[0] ?? ""} onChange={(event) => setResults({ ...results, [race.race]: [Number(event.target.value)] })}><option value="">Pick winner</option>{payload.chickens.map((chicken) => <option key={chicken.id} value={chicken.id}>{chicken.name}</option>)}</select></label>)}<button type="submit">Save results</button></form>{message && <p className={message.includes("saved") || message.includes("deleted") ? "form-ok" : "form-error"}>{message}</p>}<h3>Delete accidental bet</h3>{payload.bets.length === 0 ? <p className="muted">No accidental bets to delete.</p> : payload.bets.map((bet) => <button className="delete-row" key={bet.id} onClick={() => removeBet(bet.id)}>Delete #{bet.id} - {bet.bettor} - {money(bet.stake)}</button>)}</section>;
}

function describeBet(bet: Bet, chickens: Chicken[], races: Race[]) {
  const name = (id: number | null | undefined) => chickens.find((chicken) => chicken.id === id)?.name ?? "Unknown bird";
  const raceName = races.find((race) => race.race === bet.race)?.name ?? `Race ${bet.race}`;
  const pickNames = pickedChickenIds(bet).map((pick) => name(pick)).join(", ");
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
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not read chicken photo."));
      img.src = imageUrl;
    });
    const maxSide = 1100;
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not resize chicken photo.");
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.78);
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

