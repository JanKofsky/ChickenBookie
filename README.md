# Chicken Bookie

Chicken Bookie is a private, event-code-based scorekeeping app for two gloriously unserious games:

- Chicken Race pools, with single-race and multi-race wagers.
- Chicken Drop, also known as Chicken Shit Bingo, with bets placed directly on a numbered board.

The app records picks in Cluck Bucks, calculates a shared-pool settlement, and produces a simplified “who pays whom” plan. It does not create player accounts and does not collect, hold, process, or transfer money.

After creating an event, the administrator chooses its settlement type in Coop Boss: optional **player-to-player settlement guidance**, where Venmo is not required and players decide whether and how to pay one another after the event, or a **host-maintained pool**. For a host-maintained pool, the host supplies a Venmo username and the official profile-share link copied from Venmo; bettors supply their own Venmo handle. A bettor can submit several tickets and then use one full-total payment button. All unpaid tickets in that batch share a short payment ID, and the copyable Venmo memo uses `eventname_bettor_paymentid`. The button opens the exact official host profile supplied by the host and copies the combined amount, while a payment-helper menu keeps the recipient, amount, payment ID, and memo visible and separately copyable. The app never constructs an undocumented prefilled-payment link. Submitted tickets remain payment pending—and are excluded from totals, boards, projections, and settlement—until the host matches the payment ID and confirms the whole batch in Coop Boss. Chicken Bookie records that manual confirmation but does not access Venmo transaction data.

## Current production architecture

The active product is the Next.js App Router application deployed through Vercel. The older Streamlit/SQLite prototype remains in the repository only as legacy code and is not part of the production or preview deployment.

The repository intentionally contains two synchronized copies of the Next.js app:

- `app/`, `lib/`, and `public/` are the root application.
- `vercel-site/app/`, `vercel-site/lib/`, and `vercel-site/public/` are the copy used by the Vercel project whose Root Directory is `vercel-site`.

Any production feature must be mirrored in both trees. Event data lives in Supabase Postgres through the `postgres` package. The contact form sends through Resend.

## Event access

An administrator creates an event with:

- An event name.
- A shareable event code.
- A game format.
- A required admin code.
- Format-specific settings.

The creator is then taken directly to the unlocked Coop Boss dashboard to select settlement, review setup and contestants, and save before sharing the event.

Players open the event with its code. They do not need an account. A player enters a display name and may add a Venmo handle; the handle is required in host-maintained pools. Chicken Bookie automatically normalizes it to include one leading `@`.

Using the same display name groups that person’s tickets in settlement. The Coop Boss can correct or add bettor Venmo handles later.

## Game format 1: Chicken Race

Race events contain a configurable flock, race card, event rules, betting close time, timezone, and result style.

### Result styles

- Winner only: the admin records the winner of each race.
- Full order: the admin ranks the whole flock for every race, enabling place, show, exacta, and trifecta markets.

### Supported race bets

- Race winner: pick first place in one race.
- Race place: pick a top-two finisher.
- Race show: pick a top-three finisher.
- Exacta: pick exact first and second place.
- Trifecta: pick exact first, second, and third place.
- Sweep: one chicken wins every race.
- Exact ticket: pick the exact winner of every race.
- Any win: one chicken wins at least one race.
- Any-order group: the selected chickens win the races in any order.

The participant flow is split into Betting Coop, Contenders & Races, Ticket Board, Winner’s Circle, and Coop Boss. The Ticket Board includes a live popularity summary for the flock and the submitted ticket list.

## Game format 2: Chicken Drop (aka Chicken Shit Bingo)

Chicken Drop is a first-class event format, not a special race bet. The admin chooses:

- The physical grid shape as columns across × rows down, such as `2 × 2`, `4 × 2`, or `3 × 8`. The product becomes the number of sections.
- One fixed cost for every ticket.
- The event close time and timezone.
- The written rules used to identify the official square.

The default rules say that the first confirmed chicken dropping decides the winning square. If a dropping touches a line, the square containing most of it wins; if that cannot be determined, the drop is reset. An admin can rewrite those rules for the physical board being used.

### Player flow

Players place a ticket by entering their name, entering a Venmo handle when required by the pool mode, and clicking a numbered square on the grid. The selected square receives a visible gold outline and a “your pick” label before submission. Numbers run left to right and then top to bottom, and the board always preserves the host’s exact column × row shape. On a narrow screen, the board scrolls sideways instead of rearranging its squares.

Every square shows live public totals:

- The square number.
- The number of tickets on that square.
- The total Cluck Bucks on that square.

The board is a heatmap. Empty squares are darkest; squares become progressively brighter coral at one, two, three, and four-or-more tickets. Text, selection outlines, and labels ensure the state is not communicated by color alone. Green remains reserved for the official winning square and positive settlement states.

Repeat tickets are allowed. Multiple people may choose the same number, and one person may buy more than one ticket on the same number. Each submission creates one ticket at the event’s fixed price.

Chicken Drop events use Betting Coop, Live Betting Board, Winner’s Circle, and Coop Boss. They do not show the race-only Contenders & Races or Ticket Board tabs. The Live Betting Board also shows the assumed per-section chance and the least-crowded sections with the best projected total return for the next ticket. That projection assumes no later bets and clearly warns that a physical chicken may not use every grid section equally.

### Official result

The Coop Boss records one winning number. Saving it immediately closes betting and highlights that square as the official drop. Clearing the result reopens betting only if the configured close time is still in the future.

If several tickets picked the winning square, each winning ticket receives one equal share. A person holding two winning tickets receives two shares. If nobody picked the official square, every ticket is refunded.

The exact grid shape and ticket price are locked in the UI after the first ticket so all bettors keep the same terms and every number remains in the same physical location. The grid shape also locks when an official result exists. The server enforces those locks as well.

## Shared-pool settlement

All event tickets feed one shared pool with no house takeout.

For a winning ticket:

1. Its original stake is returned.
2. The money staked on losing tickets becomes the bonus pool.
3. The bonus pool is divided among winning tickets.

Chicken Drop tickets all have weight `1`, so shares are equal per winning ticket.

Race tickets use probability-derived difficulty weights. A single-race winner is the baseline. Harder correct predictions receive more payout weight than easier predictions. The calculation adapts to the event’s actual chicken and race counts rather than assuming one fixed flock size.

If an official result produces no winning ticket, the settlement marks every ticket as refunded. Settlement waits until at least two tickets exist.

### Payment plan and Venmo handles

Ticket payouts are aggregated by normalized bettor name. Chicken Bookie calculates each person’s total stake, payout, and net result, then reduces the ledger to a short set of payments from net losers to net winners.

In each “X pays Y” row, only the payee’s Venmo handle is shown. The handle appears as small, muted, copyable text with an explicit Copy control. The payer’s handle is intentionally omitted because the person viewing the row only needs the destination handle.

## Coop Boss controls

The administrator can:

- Unlock an event with its admin code.
- Choose player-to-player or host-maintained settlement before the first bet.
- Edit the event name, close time, timezone, and rules.
- Edit race metadata, chicken names, chicken bios, and chicken photos for race events.
- Set the Chicken Drop board’s columns, rows, and fixed ticket cost before betting begins.
- Record, replace, or clear official results.
- Add or correct bettor Venmo handles.
- Confirm one combined host payment for all of a bettor's pending tickets.
- Delete accidental tickets.

Admin codes are not displayed after creation and there is no recovery flow. Only intentionally open built-in demos use blank admin codes.

## Database model

`lib/chickenBookie.ts` owns schema creation, compatibility migrations, fixtures, validation, and settlement.

Core tables:

- `events`: shared event settings plus `game_type`, `pool_mode`, host Venmo, and Chicken Drop configuration.
- `chickens`: race-event flock entries and image/bio metadata.
- `races`: race-event race card entries.
- `bettors`: event-scoped display names and normalized Venmo handles.
- `bets`: common stake/type fields, race picks, optional `drop_number`, and host payment-confirmation state.
- `results`: first-place race results.
- `result_places`: full-order race results.
- `app_migrations`: one-time fixture migration markers.

`ensureSchema()` uses `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` so an existing production database can adopt new fields without resetting event data.

## API surface

- `GET /api/event?code=...`: loads one complete event payload.
- `POST /api/events`: creates a Race or Chicken Drop event.
- `POST /api/bets`: validates and records one race or drop ticket.
- `POST /api/results`: records race results or one Chicken Drop winning number.
- `DELETE /api/results`: clears official results.
- `POST /api/admin`: verifies an admin code.
- `PATCH /api/admin`: updates event configuration.
- `PUT /api/admin`: updates bettor Venmo handles or confirms host-received payments.
- `DELETE /api/admin`: deletes one accidental ticket.
- `POST /api/contact`: sends the public contact form without exposing private provider details to the browser.

The API is the authority for close times, result locks, valid event picks, Chicken Drop grid dimensions, and fixed drop pricing. The client cannot move numbered sections or change the price of a Chicken Drop ticket after betting by modifying the request.

## Demo events and data isolation

Three event codes have distinct purposes:

- `corn hub` is the real event. The default-event helper creates it only if it does not exist; feature migrations do not reset or reseed it.
- `test` is the fictional race demo. It contains 15 made-up contenders, four races, fake bettors, fake Venmo handles, fake tickets, and completed results. Its admin area is intentionally unlocked.
- `test-drop` is the Chicken Drop demo. It uses a `6 × 5` board (30 numbered sections), a fixed `$5` ticket, fake bettors and Venmo handles, and deliberately uneven ticket counts for the heatmap. It starts with no official result so the grid is open for new bets. Its admin area is intentionally unlocked with a blank admin code; use Coop Boss to choose the winning number and reveal settlement.

The two test events contain no real flock names or contact information.

## Visual assets and metadata

- `public/assets/chicken_bookie_logo.png`: transparent in-page logo.
- `public/assets/barn_panel_background.jpg`: main site background.
- `public/assets/test-flock-contenders.png`: fictional test-event chicken artwork.
- `public/search-icon-dark-green.png`: search/favicon version of the cream chicken on a dark green square, used so the logo does not disappear on a white search-results background.

The corresponding assets are mirrored under `vercel-site/public/`.

## Environment variables

Required for Postgres:

```text
POSTGRES_URL
```

The database helper also recognizes `DATABASE_URL`, `POSTGRES_PRISMA_URL`, and `SUPABASE_DB_URL` as fallbacks.

Required for the contact form:

```text
RESEND_API_KEY
CONTACT_TO_EMAIL
CONTACT_FROM_EMAIL
```

`CONTACT_TO_EMAIL` is private server-side configuration. Browser-visible contact errors remain generic and do not expose the inbox or email provider response.

## Local Next.js commands

With Node.js installed:

```powershell
npm install
npm run dev
npm run build
```

The legacy Streamlit command is not part of the current Vercel workflow.

## Deployment

The Vercel project deploys the mirrored `vercel-site` app. Production is triggered by pushing `main`:

```powershell
git push origin main
```

Preview deployments are produced by the Vercel-connected preview branch/workflow. Root and `vercel-site` copies should be byte-for-byte synchronized before pushing.

## Validation checklist

Before deployment:

- Confirm `app/` and `vercel-site/app/` match.
- Confirm `lib/` and `vercel-site/lib/` match.
- Confirm shared public assets exist in both public directories.
- Run `git diff --check`.
- Run `npm run build` when Node.js is available.
- Load `test` and verify the fictional 15-chicken, four-race fixture.
- Load `test-drop` and verify all 30 squares, heat levels, fixed price, winning square, settlement, and copyable payee handles.
- Confirm `corn hub` data was not changed by the feature diff.

## Key source map

- `app/page.tsx`: participant UI, admin UI, grids, tickets, results, settlement presentation, and Venmo copy controls.
- `app/globals.css`: all shared styling, including Chicken Drop heat levels.
- `app/api/`: event, bet, result, admin, and contact routes.
- `lib/chickenBookie.ts`: schema, fixtures, validation, event operations, race settlement, drop settlement, and payment netting.
- `lib/db.ts`: Postgres connection selection and query wrapper.
- `app/layout.tsx`: metadata and search-facing icons.
- `vercel-site/`: Vercel-root mirror of the deployed Next.js application.
