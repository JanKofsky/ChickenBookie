# Chicken Bookie detailed launch report

Updated for the current Next.js/Vercel app, the fictional race demo, Venmo-assisted settlement, and Chicken Drop (aka Chicken Shit Bingo).

## Suggested Reddit title

I built a tiny website for absurdly serious chicken-race pools and Chicken Shit Bingo

## Full post

Hey all — I built a side project called **Chicken Bookie** for running private chicken-race pools and **Chicken Drop**, also known as **Chicken Shit Bingo**.

The app is meant for a group watching the same real-world event. A host creates an event, chooses the game format, gets a private event code, configures the rules, and shares the code with everyone playing. Participants do not need accounts: they enter a display name, optionally add a Venmo handle, and place tickets using imaginary **Cluck Bucks**.

Chicken Bookie never collects, holds, processes, or transfers money. It is the event board, scorekeeper, pool calculator, and “who pays whom” helper.

### Chicken Race mode

For a race event, the host can customize the flock, chicken photos and biographies, the race card, close time, timezone, rules, and how detailed the official results will be.

The lighter winner-only mode supports:

- Picking the winner of one race.
- Picking a chicken to win at least one race.
- Picking one chicken to sweep every race.
- Picking the exact winners across all races.
- Picking a group of chickens to win in any order.

If the host records the full finishing order, the event also supports place, show, exacta, and trifecta tickets.

The **Contenders & Races** tab introduces the flock and keeps the event rules visually separate from the individual race cards. The **Ticket Board** shows which chickens have the most tickets and Cluck Bucks behind them, plus every submitted ticket and its exact win condition.

### Chicken Drop / Chicken Shit Bingo mode

Chicken Drop is a separate event format rather than one more race wager. The host chooses the number of grid sections — numbered `1` through that count — and sets one fixed cost for every ticket.

Participants place the bet directly on the board. They click a numbered square, see a visible “your pick” state, and submit one fixed-price ticket. More than one person can choose the same square, and one person can hold multiple tickets on the same square.

Every square shows its live ticket count and total Cluck Bucks. The board is also a heatmap: empty squares stay dark and increasingly popular numbers become brighter coral. The **Live Betting Board** adds the assumed per-section chance and identifies the least-crowded numbers with the best projected total return for the next ticket, while warning that later bets and real chicken behavior can change those assumptions.

The default rules cover a few physical-game details that otherwise become arguments later:

- The first confirmed dropping decides the square.
- If it touches a line, use the square containing most of the dropping.
- If that cannot be called clearly, reset for another drop.
- If nobody bought the winning square, every ticket is refunded.

The host enters one official number. The winning square lights up on the board, and each ticket on that square receives one equal share of the losing pool. Holding two winning tickets means receiving two shares.

### Settlement and Venmo helper

Both formats use one shared pool with no house takeout. Winning tickets receive their original stake back, then divide the money staked on losing tickets. Chicken Drop shares are equal per winning ticket; race shares are weighted by how difficult the winning prediction was.

The final ledger combines all of a person’s tickets, calculates their net result, and simplifies the event to a short list of payments from net losers to net winners.

Players may attach an optional Venmo handle. In an “X pays Y” row, only Y’s handle appears, because that is the destination the payer needs. The handle is small and muted but has an explicit Copy control, so it can be pasted into Venmo without retyping it. The host can add or correct handles later.

### Admin controls

The **Coop Boss** can:

- Edit event name, close time, timezone, and rules.
- Manage flock details and race cards for Race events.
- Set the numbered board and fixed ticket cost for Chicken Drop events before betting begins.
- Record or clear official results.
- Add or correct bettor Venmo handles.
- Delete accidental tickets.

Chicken Drop’s board size and ticket price lock after the first ticket so everybody keeps the same terms.

I leaned hard into a dark old-barn / cheerful bookmaker look because none of this needed to be remotely serious.

### Safe demos

The public demos use only fictional data:

- Open **https://chickenbookie.com/?event=test** for a completed four-race event with 15 made-up chickens, fake tickets, fake Venmo handles, and a visible settlement.
- Open **https://chickenbookie.com/?event=test-drop** for an open 30-section Chicken Drop board with a `$5` fixed ticket, varied heat levels, and fake participants. Place a grid ticket, then use the unlocked Coop Boss to choose the official square and reveal settlement.

The test admin areas are intentionally unlocked and use blank admin codes. In `test-drop`, place a ticket directly on the grid and then save a winning number to see settlement calculate.

I would love feedback on whether either flow makes sense, which labels are confusing, and what real-world rule or edge case I have missed.

## Short version

I built **Chicken Bookie**, a private event-code app for chicken-race pools and **Chicken Drop / Chicken Shit Bingo**.

Race events support single-race and multi-race picks, a customizable flock and race card, live ticket stats, official results, and weighted shared-pool settlement. Chicken Drop events use a clickable numbered heatmap: each square shows its ticket count and dollars wagered, every ticket has one host-set price, and the official square splits the losing pool between the winning tickets.

Players do not need accounts. They can optionally add a Venmo handle, and the final “X pays Y” plan gives the payer a one-click copy control for only the payee’s handle. The site does not collect or transfer money.

Try the fictional demos:

- Race: **https://chickenbookie.com/?event=test**
- Chicken Drop: **https://chickenbookie.com/?event=test-drop**

## Detailed screenshot plan

1. `01-home.png` — Home page with the event-code field and the event-format selector in Make an event.
2. `02-race-betting-coop.png` — Fictional `test` event Betting Coop with name, optional Venmo, wager type, race, and chicken selection.
3. `03-contenders-and-races.png` — The 15 fictional contenders, properly framed artwork, highlighted race rules, and four-race card.
4. `04-race-ticket-board.png` — Live fictional flock totals and race ticket details.
5. `05-race-winners.png` — Completed race results, ledger, payment plan, and copyable payee Venmo handles.
6. `06-drop-betting-grid.png` — Open `test-drop` board showing 30 sections, fixed `$5` cost, varied ticket counts, dollar totals, coral heat levels, and click-to-pick controls.
7. `07-drop-live-betting-board.png` — Live heatmap plus assumed per-section chance and best projected next-ticket returns.
8. `08-drop-pending-result.png` — Winner’s Circle before the Coop Boss chooses the official square.
9. `09-drop-admin.png` — Auto-unlocked demo admin showing the Chicken Drop label, blank-code notice, locked board/price terms, official-number control, bettor handles, and ticket deletion controls.

## Posting notes

- Use only screenshots from `test` and `test-drop`; never use the real event as a public demo.
- Put the clickable Chicken Drop grid near the front of a gallery because it explains the new mode fastest.
- If a community dislikes gambling language, describe the site as a private prediction-pool scorekeeper and emphasize that it never processes money.
- Check each community’s self-promotion rules before posting.
- Re-run `capture_site.py` after a production deployment so screenshots match the current labels and fixtures.

## Implementation summary for technical audiences

- Next.js App Router, React, and TypeScript.
- Supabase Postgres through a small server-side `postgres` wrapper.
- Server-authoritative validation for close times, official-result locks, valid picks, fixed Chicken Drop pricing, and board range.
- Idempotent schema upgrades using `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
- Separate race and Chicken Drop settlement paths feeding one shared person-level payment netting function.
- Vercel production deployment from `main`, using the mirrored `vercel-site` application tree.
