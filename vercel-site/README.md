# Chicken Bookie Vercel App

This folder is the production Chicken Bookie web app for `chickenbookie.com`.

## Vercel setup

1. Import `JanKofsky/ChickenBookie` into Vercel.
2. Set the project root directory to `vercel-site`.
3. Add a Postgres database through Vercel Storage / Marketplace. Neon Postgres is fine.
4. Make sure the database environment variables are linked to this Vercel project.
5. Deploy.
6. Add `chickenbookie.com` and `www.chickenbookie.com` under Project Settings -> Domains.

The app creates its schema on first load and seeds the default `corn hub` event.

## Local dev

Install Node/npm first, then run:

```bash
cd vercel-site
npm install
npm run dev
```

Local development also needs the same Postgres environment variables Vercel provides.

## Notes

The old Streamlit app remains at the repo root as a prototype/reference. The website itself is now the app; there is no separate "launch app" button.

Admin code can be blank for casual events. Blank means anyone who opens Coop Boss can enter winners or delete accidental bets.
