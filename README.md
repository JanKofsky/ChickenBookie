# Chicken Bookie

A private barnyard betting tool for chicken race forecasts, payout, and race-day settlement.

## Vercel env vars

The Next.js app stores event data in Supabase Postgres and sends contact form messages through Resend.

Required for the database:

```text
POSTGRES_URL
```

Required for the contact form:

```text
RESEND_API_KEY
CONTACT_TO_EMAIL
CONTACT_FROM_EMAIL
```

`CONTACT_TO_EMAIL` is the private inbox that receives messages. `CONTACT_FROM_EMAIL` should be a sender address verified in Resend, usually something like `Chicken Bookie <hello@chickenbookie.com>`.

## Run it

```powershell
pip install -r requirements.txt
streamlit run app.py
```

The app stores data in `chicken_race.db` next to `app.py`.

Chicken placeholder pictures live in `assets/chickens`. Replace `chicken_01.png` through `chicken_12.png` with real photos when you have them.

Betting closes at `July 18, 2026, 5:30 PM Eastern`. The app shows a live countdown and disables new bets after that time.

## Betting markets

- Race winner: pick the winner of race 1, 2, or 3.
- Same chicken wins all 3: one chicken must sweep every race.
- Exact winners for races 1-3: all three race winners must match exactly.
- Chicken wins at least one race: one chicken must win any race.
- Three picked chickens win the 3 races, any order: the set of winners must match the three selected chickens.

## Settlement

All bets go into one shared pot, with no house takeout. Winning tickets always get their stake back first. The remaining losing money is split by bet difficulty, so harder winning bets get more upside. A big pot does not guarantee a huge payout if a lot of that pot was also bet on winning tickets.

Difficulty weights are based on exact odds, assuming 12 equally good chickens and 3 independent, equally difficult races:

- Chicken wins at least one race: about `0.36x`
- Race winner: `1x`
- Three picked chickens win the 3 races, any order: `24x`
- Exact winners for races 1-3: `144x`
- Same chicken wins all 3: `144x`

Example: a winning `$10` race-winner ticket has `10` payout weight. A winning `$10` exact ticket has `1,440` payout weight. Both get their `$10` stake back first, then the losing-money bonus is split by those payout weights. If there are no winning tickets, everyone is refunded.

The app nets everyone out before showing Venmo payments, so people do not pay for each individual bet. It shows a simplified "who pays who" plan from net losers to net winners.

The default admin code is `NekoFatty123!`; change `ADMIN_CODE` in `app.py` if needed.

## Chickens

1. Tilly
2. Pepperoni
3. Peanut
4. Joan Rivers
5. Jetcar Junior
6. Maple Creamie
7. Squish
8. Booger
9. Dirty Boi
10. Guppy Troupe
11. Sheryl Crow
12. Jiminy Giant
