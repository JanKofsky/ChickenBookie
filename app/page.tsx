"use client";

import { FormEvent, useMemo, useState } from "react";
import type { Bet, BetType, Chicken, EventPayload, Race, Results } from "../lib/chickenBookie";

const BET_TYPES: Record<BetType, string> = {
  race_winner: "Single-race winner",
  sweep: "Same chicken wins every race",
  exact_ticket: "Exact winners for every race",
  any_win: "Chicken wins at least one race",
  any_order_three: "Picked chickens win in any order"
};
const betTypeOrder: BetType[] = ["race_winner", "any_win", "any_order_three", "exact_ticket", "sweep"];
const showMerchTab = false;
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);

function friendlyError(message: string) {
  if (message.includes("missing_connection_string") || message.includes("POSTGRES_URL")) {
    return "The coop database is not connected yet. Add Vercel Postgres/Neon env vars to this preview deployment, then redeploy.";
  }
  return message;
}

export default function Home() {
  const [eventCode, setEventCode] = useState("");
  const [payload, setPayload] = useState<EventPayload | null>(null);
  const [tab, setTab] = useState("bet");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadEvent(code = eventCode) {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/event?code=${encodeURIComponent(code)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(friendlyError(data.error ?? "Could not load event."));
      setPayload(data); setEventCode(data.event.code);
    } catch (err) {
      setError(err instanceof Error ? friendlyError(err.message) : "Could not load event.");
    } finally { setLoading(false); }
  }

  const totalPool = useMemo(() => payload?.bets.reduce((sum, bet) => sum + Number(bet.stake), 0) ?? 0, [payload]);

  return (
    <main className="shell">
      <header className="hero">
        <section className="hero-grid">
          <div>
            <div className="hero-title">
              {!payload && <img className="hero-logo" src="/assets/chicken_bookie_logo.png" alt="Chicken Bookie chicken logo" />}
              <h1>{payload?.event.name ?? "Chicken Bookie"}</h1>
            </div>
            <p className="hero-subtitle">A private barnyard betting tool</p>
            {payload && <p className="lede">{payload.event.officialRule} Keep the pool private, the math clean, and the settlement list short.</p>}
            <form className="event-switch hero-switch" onSubmit={(event) => { event.preventDefault(); loadEvent(); }}>
              <input value={eventCode} onChange={(event) => setEventCode(event.target.value)} aria-label="Event code" placeholder="Event code here" />
              <button type="submit">Open event</button>
            </form>
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
      {!payload ? <div className="setup-panel"><CreateEvent onCreated={setPayload} /></div> : (
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
          {tab === "flock" && <Flock chickens={payload.chickens} races={payload.races} />}
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

function CreateEvent({ onCreated }: { onCreated: (payload: EventPayload) => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [showAdminCode, setShowAdminCode] = useState(false);
  const [copyCode, setCopyCode] = useState("");
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setMessage("");
    const response = await fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, code, adminCode, copyCode }) });
    const data = await response.json();
    if (!response.ok) setMessage(friendlyError(data.error ?? "Could not create event.")); else onCreated(data);
  }
  return <section className="panel"><h2>Make a coop</h2><p className="muted">Start with the default flock, or copy an existing event code.</p><form className="grid-form" onSubmit={submit}>
    <label>Event name<input value={name} onChange={(event) => setName(event.target.value)} /></label>
    <label>Event code<input value={code} onChange={(event) => setCode(event.target.value)} /></label>
    <label>Admin code (optional)<input type={showAdminCode ? "text" : "password"} placeholder="Leave blank if you do not want one" value={adminCode} onChange={(event) => setAdminCode(event.target.value)} /></label>
    <label className="check-row"><input type="checkbox" checked={showAdminCode} onChange={(event) => setShowAdminCode(event.target.checked)} /> Show admin code</label>
    <label>Copy event code (optional)<input value={copyCode} onChange={(event) => setCopyCode(event.target.value)} /></label>
    <button type="submit">Create coop</button>{message && <p className="form-error">{message}</p>}
  </form></section>;
}

function Betting({ payload, setPayload }: { payload: EventPayload; setPayload: (payload: EventPayload) => void }) {
  const [bettor, setBettor] = useState("");
  const [stake, setStake] = useState(5);
  const [betType, setBetType] = useState<BetType>("race_winner");
  const [race, setRace] = useState(payload.races[0]?.race ?? 1);
  const [picks, setPicks] = useState<number[]>([]);
  const [message, setMessage] = useState("");
  const needed = betType === "exact_ticket" || betType === "any_order_three" ? payload.races.length : 1;
  const selectedPicks = picks.slice(0, needed);
  async function submit(event: FormEvent) {
    event.preventDefault(); setMessage("");
    if (selectedPicks.length !== needed) { setMessage(`Pick ${needed} chicken${needed === 1 ? "" : "s"}.`); return; }
    const response = await fetch("/api/bets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: payload.event.id, bettor, stake, betType, race: betType === "race_winner" ? race : null, picks: selectedPicks }) });
    const data = await response.json();
    if (!response.ok) setMessage(friendlyError(data.error ?? "Could not add bet.")); else { setPayload(data); setPicks([]); setMessage("Bet added."); }
  }
  return <section className="panel"><h2>Betting Coop</h2><p className="muted">Private events only. Chicken Bookie tracks Cluck Bucks and settlement math; it does not collect, hold, process, or transfer money.</p><p className="muted">Use the same name each time. Every Cluck Buck goes into one shared feed bucket for scorekeeping.</p><form className="bet-form" onSubmit={submit}>
    <label>Gambler name<input value={bettor} onChange={(event) => setBettor(event.target.value)} /></label>
    <label>Cluck Bucks<input type="number" min="1" step="1" value={stake} onChange={(event) => setStake(Number(event.target.value))} /></label>
    <label>Bet type<select value={betType} onChange={(event) => { setBetType(event.target.value as BetType); setPicks([]); }}>{betTypeOrder.map((key) => <option key={key} value={key}>{BET_TYPES[key]}</option>)}</select></label>
    {betType === "race_winner" && <label>Race<select value={race} onChange={(event) => setRace(Number(event.target.value))}>{payload.races.map((race) => <option key={race.race} value={race.race}>{race.name}</option>)}</select></label>}
    <ChickenPicker chickens={payload.chickens} picks={selectedPicks} setPicks={setPicks} count={needed} exact={betType === "exact_ticket"} races={payload.races} />
    <button type="submit">Add bet</button>{message && <p className={message.includes("added") ? "form-ok" : "form-error"}>{message}</p>}
  </form></section>;
}

function ChickenPicker({ chickens, picks, setPicks, count, exact, races }: { chickens: Chicken[]; picks: number[]; setPicks: (picks: number[]) => void; count: number; exact: boolean; races: Race[] }) {
  if (exact) return <div className="pick-grid">{races.map((race, idx) => <label key={race.race}>{race.name}<select value={picks[idx] ?? ""} onChange={(event) => { const next = [...picks]; next[idx] = Number(event.target.value); setPicks(next); }}><option value="">Pick chicken</option>{chickens.map((chicken) => <option key={chicken.id} value={chicken.id}>{chicken.name}</option>)}</select></label>)}</div>;
  return <div className="chicken-buttons">{chickens.map((chicken) => {
    const active = picks.includes(chicken.id);
    return <button type="button" key={chicken.id} className={active ? "selected" : ""} onClick={() => setPicks(active ? picks.filter((id) => id !== chicken.id) : [...picks, chicken.id].slice(-count))}><span>#{chicken.slot}</span>{chicken.name}</button>;
  })}</div>;
}

function Flock({ chickens, races }: { chickens: Chicken[]; races: Race[] }) {
  return <section className="split"><div className="panel"><h2>Starting Flock</h2><div className="flock-grid">{chickens.map((chicken) => <div className="bird" key={chicken.id}><span>#{chicken.slot}</span><strong>{chicken.name}</strong></div>)}</div></div><div className="panel"><h2>Race card</h2>{races.map((race) => <article className="race-card" key={race.race}><span>Race {race.race}</span><h3>{race.name}</h3><p>{race.description}</p></article>)}</div></section>;
}

function Tickets({ bets, chickens, races }: { bets: Bet[]; chickens: Chicken[]; races: Race[] }) {
  return <section className="panel"><h2>Ticket Board</h2>{bets.length === 0 ? <p className="muted">No bets yet.</p> : <div className="table">{bets.map((bet) => <div className="ticket" key={bet.id}><strong>{bet.bettor}</strong><span>{BET_TYPES[bet.betType]}</span><span>{describeBet(bet, chickens, races)}</span><b>{money(bet.stake)}</b></div>)}</div>}</section>;
}

function Winners({ payload }: { payload: EventPayload }) {
  if (payload.bets.length < 2) return <section className="panel"><h2>Winner's Circle</h2><p className="muted">Oh cluck, not enough bets yet. Add at least two tickets before the feed bucket math is worth settling.</p></section>;
  if (!payload.settlement) return <section className="panel"><h2>Winner's Circle</h2><p className="muted">The Coop Boss needs to enter every race winner before settlement is shown.</p></section>;
  return <section className="panel"><h2>Winner's Circle</h2><div className="payment-list">{payload.settlement.payments.length === 0 ? <p>No payments needed.</p> : payload.settlement.payments.map((payment, idx) => <div className="payment" key={idx}>{payment.from} pays {payment.to} <strong>{money(payment.amount)}</strong></div>)}</div><h3>Ledger</h3><div className="table">{payload.settlement.people.map((person) => <div className="ticket" key={person.bettor}><strong>{person.bettor}</strong><span>Cluck Bucks {money(person.staked)}</span><span>Payout {money(person.payout)}</span><b>{money(person.net)}</b></div>)}</div></section>;
}

function CoopBoss({ payload, setPayload }: { payload: EventPayload; setPayload: (payload: EventPayload) => void }) {
  const [adminCode, setAdminCode] = useState("");
  const [showAdminCode, setShowAdminCode] = useState(false);
  const [results, setResults] = useState<Results>(payload.results ?? {});
  const [message, setMessage] = useState("");
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
  return <section className="panel"><h2>Coop Boss</h2><label>Admin code (optional)<input type={showAdminCode ? "text" : "password"} placeholder="Leave blank if this coop does not have one" value={adminCode} onChange={(event) => setAdminCode(event.target.value)} /></label><label className="check-row"><input type="checkbox" checked={showAdminCode} onChange={(event) => setShowAdminCode(event.target.checked)} /> Show admin code</label>{payload.bets.length < 2 && <p className="muted">Oh cluck, not enough bets yet. You can save winners, but settlement waits until at least two tickets exist.</p>}<form className="grid-form" onSubmit={save}>{payload.races.map((race) => <label key={race.race}>{race.name}<select value={results[race.race] ?? ""} onChange={(event) => setResults({ ...results, [race.race]: Number(event.target.value) })}><option value="">Pick winner</option>{payload.chickens.map((chicken) => <option key={chicken.id} value={chicken.id}>{chicken.name}</option>)}</select></label>)}<button type="submit">Save winners</button></form>{message && <p className={message.includes("saved") || message.includes("deleted") ? "form-ok" : "form-error"}>{message}</p>}<h3>Delete accidental bet</h3>{payload.bets.length === 0 ? <p className="muted">No accidental bets to delete.</p> : payload.bets.map((bet) => <button className="delete-row" key={bet.id} onClick={() => removeBet(bet.id)}>Delete #{bet.id} - {bet.bettor} - {money(bet.stake)}</button>)}</section>;
}

function describeBet(bet: Bet, chickens: Chicken[], races: Race[]) {
  const name = (id: number | null | undefined) => chickens.find((chicken) => chicken.id === id)?.name ?? "Unknown bird";
  if (bet.betType === "race_winner") return `${races.find((race) => race.race === bet.race)?.name ?? `Race ${bet.race}`} winner: ${name(bet.chicken1)}`;
  if (bet.betType === "sweep") return `${name(bet.chicken1)} wins every race`;
  if (bet.betType === "exact_ticket") return races.map((race, idx) => `${race.name}: ${name(bet.picks[idx])}`).join(" | ");
  if (bet.betType === "any_win") return `${name(bet.chicken1)} wins at least one race`;
  return `${bet.picks.map((pick) => name(pick)).join(", ")} win in any order`;
}

