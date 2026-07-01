from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from math import factorial
from pathlib import Path
from typing import Any

import pandas as pd
import streamlit as st
import streamlit.components.v1 as components


APP_TITLE = "Chicken Bookie"
DB_PATH = Path(__file__).with_name("chicken_race.db")
ASSET_DIR = Path(__file__).with_name("assets")
RACE_COUNT = 3
CHICKEN_COUNT = 12
ADMIN_CODE = "NekoFatty123!"
EASTERN_TZ = timezone(timedelta(hours=-4), "Eastern")
BETTING_CLOSE_AT = datetime(2026, 7, 18, 17, 30, tzinfo=EASTERN_TZ)

DEFAULT_CHICKEN_NAMES = [
    "Tilly",
    "Pepperoni",
    "Peanut",
    "Joan Rivers",
    "Jetcar Junior",
    "Maple Creamie",
    "Squish",
    "Booger",
    "Dirty Boi",
    "Guppy Troupe",
    "Sheryl Crow",
    "Jiminy Giant",
]


BET_TYPES = {
    "race_winner": "Single-race winner",
    "sweep": "Barnyard sweep: same chicken wins all 3",
    "exact_ticket": "Exact 3-race ticket",
    "any_win": "Chicken wins at least one race",
    "any_order_three": "Three picked chickens win the 3 races, any order",
}

SINGLE_RACE_WIN_PROBABILITY = 1 / CHICKEN_COUNT
ANY_WIN_PROBABILITY = 1 - ((CHICKEN_COUNT - 1) / CHICKEN_COUNT) ** RACE_COUNT
ALL_RACES_EXACT_PROBABILITY = 1 / (CHICKEN_COUNT ** RACE_COUNT)
ALL_RACES_ANY_ORDER_PROBABILITY = factorial(RACE_COUNT) / (CHICKEN_COUNT ** RACE_COUNT)

BET_WEIGHTS = {
    "any_win": SINGLE_RACE_WIN_PROBABILITY / ANY_WIN_PROBABILITY,
    "race_winner": 1.0,
    "any_order_three": SINGLE_RACE_WIN_PROBABILITY / ALL_RACES_ANY_ORDER_PROBABILITY,
    "exact_ticket": SINGLE_RACE_WIN_PROBABILITY / ALL_RACES_EXACT_PROBABILITY,
    "sweep": SINGLE_RACE_WIN_PROBABILITY / ALL_RACES_EXACT_PROBABILITY,
}

RACE_NAMES = {
    1: "Race 1 - Barnyard Dash",
    2: "Race 2 - The Hay Bale Hustle",
    3: "Race 3 - The Coop Gauntlet",
}


@dataclass(frozen=True)
class SettlementLine:
    person: str
    total_staked: float
    payout: float
    net: float


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS chickens (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL UNIQUE
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS bettors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS bets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                bettor_id INTEGER NOT NULL,
                bet_type TEXT NOT NULL,
                stake REAL NOT NULL,
                race INTEGER,
                chicken_1 INTEGER,
                chicken_2 INTEGER,
                chicken_3 INTEGER,
                created_at TEXT NOT NULL,
                FOREIGN KEY (bettor_id) REFERENCES bettors(id),
                FOREIGN KEY (chicken_1) REFERENCES chickens(id),
                FOREIGN KEY (chicken_2) REFERENCES chickens(id),
                FOREIGN KEY (chicken_3) REFERENCES chickens(id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS results (
                race INTEGER PRIMARY KEY,
                chicken_id INTEGER NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (chicken_id) REFERENCES chickens(id)
            )
            """
        )
        existing = conn.execute("SELECT COUNT(*) FROM chickens").fetchone()[0]
        if existing == 0:
            conn.executemany(
                "INSERT INTO chickens (id, name) VALUES (?, ?)",
                [(i, name) for i, name in enumerate(DEFAULT_CHICKEN_NAMES, start=1)],
            )
        else:
            rows = conn.execute("SELECT id, name FROM chickens ORDER BY id").fetchall()
            has_default_names = all(row["name"] == f"Chicken {row['id']}" for row in rows)
            if len(rows) == CHICKEN_COUNT and has_default_names:
                conn.executemany(
                    "UPDATE chickens SET name = ? WHERE id = ?",
                    [(name, i) for i, name in enumerate(DEFAULT_CHICKEN_NAMES, start=1)],
                )


def now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def betting_is_open() -> bool:
    return datetime.now(EASTERN_TZ) < BETTING_CLOSE_AT


def money(value: float) -> str:
    return f"${value:,.2f}"


def weight_label(bet_type: str) -> str:
    weight = BET_WEIGHTS.get(bet_type, 1.0)
    if weight >= 10:
        return f"{weight:,.0f}x"
    return f"{weight:.2f}".rstrip("0").rstrip(".") + "x"


def probability_label(probability: float) -> str:
    return f"{probability * 100:.3f}%"


def bet_probability(bet_type: str) -> float:
    if bet_type == "any_win":
        return ANY_WIN_PROBABILITY
    if bet_type == "race_winner":
        return SINGLE_RACE_WIN_PROBABILITY
    if bet_type == "any_order_three":
        return ALL_RACES_ANY_ORDER_PROBABILITY
    if bet_type in {"exact_ticket", "sweep"}:
        return ALL_RACES_EXACT_PROBABILITY
    return SINGLE_RACE_WIN_PROBABILITY


def format_race(race: int) -> str:
    return RACE_NAMES.get(race, f"Race {race}")


def inject_theme_css() -> None:
    st.markdown(
        """
        <style>
        :root {
            --barn-red: #c84a3f;
            --comb-red: #ee6658;
            --egg: #f7e7be;
            --straw: #d8a83f;
            --feed: #b77b29;
            --grass: #72b36d;
            --ink: #f6ead2;
            --muted: #c8bda8;
            --rail: #261a17;
            --coop: #171211;
            --coop-panel: #211916;
            --coop-panel-2: #2a211d;
        }

        .stApp {
            background:
                linear-gradient(90deg, rgba(84, 43, 24, 0.22) 0 1px, transparent 1px 44px),
                repeating-linear-gradient(180deg, rgba(247, 231, 190, 0.035) 0 2px, transparent 2px 34px),
                radial-gradient(circle at 12% 8%, rgba(216, 168, 63, 0.20), transparent 20rem),
                radial-gradient(circle at 88% 18%, rgba(154, 49, 38, 0.22), transparent 22rem),
                radial-gradient(circle at bottom right, rgba(114, 179, 109, 0.16), transparent 32rem),
                linear-gradient(180deg, #140f0d 0%, #2a1a12 46%, #171f13 100%);
            color: var(--ink);
        }

        .block-container {
            padding-top: 1.25rem;
            max-width: min(96vw, 1680px);
        }

        div[data-testid="stTabs"] button {
            border-radius: 0;
            border-bottom: 3px solid transparent;
            color: var(--ink);
            font-weight: 800;
        }

        div[data-testid="stTabs"] button[aria-selected="true"] {
            border-bottom-color: var(--straw);
            color: #ffe0a0;
        }

        div[data-testid="stForm"], div[data-testid="stExpander"] {
            border: 1px solid rgba(247, 231, 190, 0.14);
            border-radius: 8px;
            background:
                linear-gradient(180deg, rgba(45, 33, 25, 0.88), rgba(33, 25, 22, 0.88));
            box-shadow: 0 10px 26px rgba(0, 0, 0, 0.22);
        }

        div[data-testid="stMetric"] {
            background: linear-gradient(180deg, rgba(42, 33, 29, 0.95), rgba(33, 25, 22, 0.95));
            border: 1px solid rgba(247, 231, 190, 0.16);
            border-radius: 8px;
            padding: 0.75rem 0.9rem;
            box-shadow: inset 0 -3px 0 rgba(216, 168, 63, 0.20);
        }

        .stButton > button, div[data-testid="stFormSubmitButton"] button {
            border-radius: 6px;
            border: 1px solid rgba(247, 231, 190, 0.25);
            background: linear-gradient(180deg, #d85043, #9f2e28);
            color: #fff5dc;
            font-weight: 900;
            box-shadow: 0 3px 0 #321611;
        }

        .stButton > button:disabled {
            background: #5c5148;
            color: #c8bda8;
            box-shadow: none;
        }

        h2, h3 {
            color: #ffe0a0;
            font-weight: 900;
        }

        .coop-hero {
            border: 1px solid rgba(247, 231, 190, 0.20);
            border-radius: 10px;
            background:
                repeating-linear-gradient(90deg, rgba(116, 62, 34, 0.32) 0 2px, transparent 2px 30px),
                linear-gradient(90deg, rgba(85, 36, 26, 0.72), transparent 44%),
                linear-gradient(180deg, rgba(62, 39, 24, 0.98), rgba(29, 21, 17, 0.98));
            padding: 0;
            margin-bottom: 1rem;
            box-shadow: 0 16px 38px rgba(0, 0, 0, 0.28);
            overflow: hidden;
            position: relative;
        }

        .coop-hero::after {
            content: "";
            position: absolute;
            inset: auto 0 0 0;
            height: 5px;
            background: linear-gradient(90deg, #8f3b2f, #d8a83f, #5f8f4e, #d8a83f, #8f3b2f);
        }

        .coop-hero-inner {
            background:
                linear-gradient(90deg, rgba(247, 231, 190, 0.045) 1px, transparent 1px) 0 0 / 28px 100%,
                radial-gradient(circle at 92% 16%, rgba(247, 231, 190, 0.14), transparent 8rem),
                linear-gradient(135deg, rgba(143, 59, 47, 0.36), transparent 38%),
                linear-gradient(180deg, rgba(255, 255, 255, 0.035), transparent);
            border-left: 6px solid #b88a31;
            padding: 1.55rem 1.65rem 1.75rem;
            color: var(--ink);
        }

        .coop-kicker {
            font-size: 0.82rem;
            font-weight: 900;
            letter-spacing: 0.10em;
            text-transform: uppercase;
            color: #f0c35d;
        }

        .coop-title {
            font-size: clamp(2.25rem, 5vw, 4rem);
            line-height: 1;
            font-weight: 950;
            margin: 0.2rem 0 0.45rem;
            color: #fff3d1;
            text-shadow: 0 3px 18px rgba(0, 0, 0, 0.45);
        }

        .coop-subtitle {
            max-width: 780px;
            font-size: 1.04rem;
            font-weight: 650;
            color: var(--muted);
        }

        .marshmallow-pill {
            display: inline-block;
            margin-top: 0.85rem;
            padding: 0.38rem 0.62rem;
            border: 1px solid rgba(247, 231, 190, 0.18);
            border-radius: 999px;
            background: linear-gradient(180deg, rgba(247, 231, 190, 0.13), rgba(247, 231, 190, 0.06));
            color: #fff3d1;
            font-weight: 850;
        }

        .poster-badges {
            display: flex;
            flex-wrap: wrap;
            gap: 0.45rem;
            margin-top: 0.55rem;
        }

        .poster-badge {
            border: 1px solid rgba(247, 231, 190, 0.15);
            border-radius: 999px;
            background: rgba(92, 58, 31, 0.34);
            color: #f5d484;
            font-size: 0.8rem;
            font-weight: 850;
            padding: 0.28rem 0.55rem;
        }

        .coop-stats {
            display: flex;
            flex-wrap: wrap;
            gap: 0.7rem;
            margin-top: 1rem;
        }

        .coop-stat {
            background: rgba(18, 15, 14, 0.58);
            color: var(--muted);
            border: 1px solid rgba(247, 231, 190, 0.18);
            border-radius: 6px;
            padding: 0.55rem 0.8rem;
            min-width: 130px;
            box-shadow: inset 0 -2px 0 rgba(216, 168, 63, 0.16);
        }

        .coop-stat strong {
            display: block;
            font-size: 1.25rem;
            color: #fff3d1;
        }

        .coop-rail {
            margin-top: 0.9rem;
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 0.45rem;
        }

        .coop-rail div {
            border: 1px solid rgba(247, 231, 190, 0.13);
            border-radius: 6px;
            background:
                linear-gradient(180deg, rgba(18, 15, 14, 0.58), rgba(18, 15, 14, 0.32));
            color: #d8c7a6;
            font-size: 0.82rem;
            font-weight: 800;
            padding: 0.42rem 0.55rem;
        }

        .coop-rail b {
            display: block;
            color: #f5d484;
            font-size: 0.9rem;
        }

        .race-strip {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 0.75rem;
            margin: 0.75rem 0 1.1rem;
        }

        .race-card, .roster-name, .payment-callout {
            border-radius: 8px;
            border: 1px solid rgba(247, 231, 190, 0.16);
            background:
                linear-gradient(180deg, rgba(47, 34, 25, 0.92), rgba(31, 24, 20, 0.92));
            box-shadow: 0 8px 20px rgba(0, 0, 0, 0.18);
        }

        .race-card {
            padding: 0.8rem;
            position: relative;
            overflow: hidden;
        }

        .race-card::before {
            content: "";
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 3px;
            background: linear-gradient(90deg, #9b4637, #d8a83f, #6a944f);
        }

        .race-card b {
            color: #f0c35d;
            display: block;
            font-size: 1.05rem;
        }

        .race-card em {
            display: inline-block;
            margin-bottom: 0.28rem;
            color: #93c982;
            font-style: normal;
            font-size: 0.72rem;
            font-weight: 900;
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }

        .race-card span {
            color: var(--muted);
        }

        .roster-name {
            margin: -0.15rem 0 1rem;
            padding: 0.55rem 0.65rem;
            text-align: center;
            font-weight: 950;
            color: #fff3d1;
            border-top: 3px solid rgba(216, 168, 63, 0.72);
        }

        div[data-testid="stImage"] img {
            border-radius: 10px;
            border: 1px solid rgba(247, 231, 190, 0.16);
            box-shadow: 0 10px 24px rgba(0, 0, 0, 0.26);
        }

        .payment-callout {
            margin: 0.45rem 0;
            padding: 0.62rem 0.8rem;
            font-weight: 900;
            border-left: 5px solid var(--grass);
            color: #f3ffe8;
        }

        .section-note {
            color: var(--muted);
            font-weight: 700;
        }

        .coop-callout {
            border: 1px solid rgba(247, 231, 190, 0.14);
            border-left: 5px solid var(--straw);
            border-radius: 8px;
            background:
                linear-gradient(90deg, rgba(216, 168, 63, 0.10), transparent 44%),
                rgba(33, 25, 22, 0.76);
            color: var(--muted);
            font-weight: 750;
            padding: 0.62rem 0.75rem;
            margin: 0.6rem 0 0.8rem;
        }

        @media (max-width: 760px) {
            .coop-title {
                font-size: 2rem;
            }
            .race-strip {
                grid-template-columns: 1fr;
            }
            .coop-rail {
                grid-template-columns: repeat(2, minmax(0, 1fr));
            }
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


def render_hero(bets: pd.DataFrame) -> None:
    total_pool = float(bets["stake"].sum()) if not bets.empty else 0.0
    bettors = int(bets["bettor"].nunique()) if not bets.empty else 0
    st.markdown(
        f"""
        <div class="coop-hero">
            <div class="coop-hero-inner">
                <div class="coop-kicker">The Great American Chicken Race</div>
                <div class="coop-title">Chicken Bookie</div>
                <div class="coop-subtitle">
                    Barnyard race-day betting, but the athletes have feathers and the finish line is a marshmallow.
                    Check the flock, place your coop tickets, then settle up after the pecking order is official.
                </div>
                <div class="marshmallow-pill">Official rule: first chicken to get the marshmallow wins.</div>
                <div class="poster-badges">
                    <span class="poster-badge">12 birds</span>
                    <span class="poster-badge">3 marshmallow races</span>
                </div>
                <div class="coop-rail">
                    <div><b>Starting Flock</b>Inspect the birds</div>
                    <div><b>Betting Coop</b>Place tickets</div>
                    <div><b>Marshmallow</b>First beak wins</div>
                    <div><b>Winner's Circle</b>Settle up</div>
                </div>
                <div class="coop-stats">
                    <div class="coop-stat"><span>Total Pool</span><strong>{money(total_pool)}</strong></div>
                    <div class="coop-stat"><span>Gamblers</span><strong>{bettors}</strong></div>
                </div>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_countdown() -> None:
    close_label = (
        f"{BETTING_CLOSE_AT.strftime('%B')} {BETTING_CLOSE_AT.day}, "
        f"{BETTING_CLOSE_AT.year} at {BETTING_CLOSE_AT.hour % 12 or 12}:"
        f"{BETTING_CLOSE_AT.minute:02d} {BETTING_CLOSE_AT.strftime('%p')} Eastern"
    )
    target_iso = BETTING_CLOSE_AT.isoformat()
    components.html(
        f"""
        <div class="countdown-wrap">
            <div class="countdown-label">
                <strong>Bets open until</strong>
                <span>{close_label}</span>
            </div>
            <div class="countdown-grid" id="countdown-grid">
                <div><strong id="days">--</strong><span>days</span></div>
                <div><strong id="hours">--</strong><span>hours</span></div>
                <div><strong id="minutes">--</strong><span>minutes</span></div>
                <div><strong id="seconds">--</strong><span>seconds</span></div>
            </div>
            <div class="countdown-closed" id="countdown-closed">Betting is closed. Time to chase marshmallows.</div>
        </div>
        <style>
            body {{
                margin: 0;
                background: transparent;
                font-family: "Source Sans Pro", sans-serif;
                color: #f6ead2;
            }}
            .countdown-wrap {{
                box-sizing: border-box;
                width: 100%;
                border: 1px solid rgba(247, 231, 190, 0.16);
                border-left: 4px solid #72b36d;
                border-radius: 8px;
                background: rgba(33, 25, 22, 0.82);
                padding: 0.45rem 0.65rem;
                display: grid;
                grid-template-columns: minmax(220px, 1.2fr) minmax(320px, 1.8fr);
                gap: 0.65rem;
                align-items: center;
            }}
            .countdown-label strong {{
                display: block;
                color: #fff3d1;
                font-size: 0.95rem;
                line-height: 1.1;
            }}
            .countdown-label span {{
                color: #c8bda8;
                font-size: 0.82rem;
                font-weight: 700;
            }}
            .countdown-grid {{
                display: grid;
                grid-template-columns: repeat(4, minmax(0, 1fr));
                gap: 0.35rem;
            }}
            .countdown-grid div {{
                border: 1px solid rgba(247, 231, 190, 0.12);
                border-radius: 6px;
                background: rgba(18, 15, 14, 0.62);
                padding: 0.32rem 0.4rem;
                text-align: center;
            }}
            .countdown-grid strong {{
                display: block;
                color: #f0c35d;
                font-size: 1.05rem;
                line-height: 1;
            }}
            .countdown-grid span {{
                color: #c8bda8;
                font-size: 0.62rem;
                font-weight: 800;
                text-transform: uppercase;
                letter-spacing: 0.04em;
            }}
            .countdown-closed {{
                display: none;
                color: #fff3d1;
                font-weight: 900;
                padding: 0.45rem 0;
            }}
            @media (max-width: 520px) {{
                .countdown-wrap {{
                    grid-template-columns: 1fr;
                }}
                .countdown-grid {{
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                }}
            }}
        </style>
        <script>
            const target = new Date("{target_iso}").getTime();
            const grid = document.getElementById("countdown-grid");
            const closed = document.getElementById("countdown-closed");
            function pad(value) {{
                return String(value).padStart(2, "0");
            }}
            function tick() {{
                const distance = target - Date.now();
                if (distance <= 0) {{
                    grid.style.display = "none";
                    closed.style.display = "block";
                    return;
                }}
                const secondsTotal = Math.floor(distance / 1000);
                const days = Math.floor(secondsTotal / 86400);
                const hours = Math.floor((secondsTotal % 86400) / 3600);
                const minutes = Math.floor((secondsTotal % 3600) / 60);
                const seconds = secondsTotal % 60;
                document.getElementById("days").textContent = days;
                document.getElementById("hours").textContent = pad(hours);
                document.getElementById("minutes").textContent = pad(minutes);
                document.getElementById("seconds").textContent = pad(seconds);
            }}
            tick();
            setInterval(tick, 1000);
        </script>
        """,
        height=82,
    )


def render_race_strip() -> None:
    st.markdown(
        """
        <div class="race-strip">
            <div class="race-card"><em>Race 1</em><b>Barnyard Dash</b><span>Straight coop sprint. First bird to the marshmallow wins.</span></div>
            <div class="race-card"><em>Race 2</em><b>The Hay Bale Hustle</b><span>Obstacles enter the barnyard. Marshmallow target still decides it.</span></div>
            <div class="race-card"><em>Race 3</em><b>The Coop Gauntlet</b><span>Maximum chicken-race nonsense, final marshmallow glory.</span></div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def get_chickens() -> pd.DataFrame:
    with connect() as conn:
        return pd.read_sql_query("SELECT id, name FROM chickens ORDER BY id", conn)


def get_bettors() -> pd.DataFrame:
    with connect() as conn:
        return pd.read_sql_query("SELECT id, name, created_at FROM bettors ORDER BY name", conn)


def get_results() -> dict[int, int]:
    with connect() as conn:
        rows = conn.execute("SELECT race, chicken_id FROM results").fetchall()
    return {int(row["race"]): int(row["chicken_id"]) for row in rows}


def get_bets() -> pd.DataFrame:
    with connect() as conn:
        return pd.read_sql_query(
            """
            SELECT
                b.id,
                p.name AS bettor,
                b.bet_type,
                b.stake,
                b.race,
                c1.name AS pick_1,
                c2.name AS pick_2,
                c3.name AS pick_3,
                b.chicken_1,
                b.chicken_2,
                b.chicken_3,
                b.created_at
            FROM bets b
            JOIN bettors p ON p.id = b.bettor_id
            LEFT JOIN chickens c1 ON c1.id = b.chicken_1
            LEFT JOIN chickens c2 ON c2.id = b.chicken_2
            LEFT JOIN chickens c3 ON c3.id = b.chicken_3
            ORDER BY b.created_at DESC, b.id DESC
            """,
            conn,
        )


def upsert_bettor(name: str) -> int:
    cleaned = " ".join(name.strip().split())
    if not cleaned:
        raise ValueError("Enter a gambler name.")
    with connect() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO bettors (name, created_at) VALUES (?, ?)",
            (cleaned, now()),
        )
        row = conn.execute("SELECT id FROM bettors WHERE name = ?", (cleaned,)).fetchone()
        return int(row["id"])


def add_bet(
    bettor_id: int,
    bet_type: str,
    stake: float,
    race: int | None,
    chicken_1: int,
    chicken_2: int | None = None,
    chicken_3: int | None = None,
) -> None:
    if stake <= 0:
        raise ValueError("Stake must be greater than zero.")
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO bets
                (bettor_id, bet_type, stake, race, chicken_1, chicken_2, chicken_3, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (bettor_id, bet_type, float(stake), race, chicken_1, chicken_2, chicken_3, now()),
        )


def save_results(results: dict[int, int]) -> None:
    if len(results) != RACE_COUNT:
        raise ValueError("Pick a winner for all 3 races.")
    with connect() as conn:
        conn.executemany(
            """
            INSERT INTO results (race, chicken_id, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(race) DO UPDATE SET
                chicken_id = excluded.chicken_id,
                updated_at = excluded.updated_at
            """,
            [(race, chicken_id, now()) for race, chicken_id in results.items()],
        )


def delete_bet(bet_id: int) -> None:
    with connect() as conn:
        conn.execute("DELETE FROM bets WHERE id = ?", (bet_id,))


def clear_bets() -> None:
    with connect() as conn:
        conn.execute("DELETE FROM bets")
        conn.execute("DELETE FROM bettors")


def reset_all() -> None:
    with connect() as conn:
        conn.execute("DELETE FROM bets")
        conn.execute("DELETE FROM bettors")
        conn.execute("DELETE FROM results")


def is_winning_bet(row: pd.Series, results: dict[int, int]) -> bool:
    winners = [results[race] for race in range(1, RACE_COUNT + 1)]
    if row.bet_type == "race_winner":
        return results.get(int(row.race)) == int(row.chicken_1)
    if row.bet_type == "sweep":
        return all(winner == int(row.chicken_1) for winner in winners)
    if row.bet_type == "exact_ticket":
        return winners == [int(row.chicken_1), int(row.chicken_2), int(row.chicken_3)]
    if row.bet_type == "any_win":
        return int(row.chicken_1) in winners
    if row.bet_type == "any_order_three":
        picks = sorted([int(row.chicken_1), int(row.chicken_2), int(row.chicken_3)])
        return sorted(winners) == picks
    return False


def describe_bet(row: pd.Series) -> str:
    label = BET_TYPES.get(row.bet_type, row.bet_type)
    if row.bet_type == "race_winner":
        return f"{format_race(int(row.race))} winner: {row.pick_1}"
    if row.bet_type == "sweep":
        return f"{row.pick_1} wins all 3"
    if row.bet_type == "exact_ticket":
        return f"R1 {row.pick_1}, R2 {row.pick_2}, R3 {row.pick_3}"
    if row.bet_type == "any_win":
        return f"{row.pick_1} wins at least one race"
    if row.bet_type == "any_order_three":
        return f"{row.pick_1}, {row.pick_2}, {row.pick_3} win in any order"
    return label


def calculate_settlement(bets: pd.DataFrame, results: dict[int, int]) -> tuple[pd.DataFrame, pd.DataFrame]:
    if bets.empty:
        return pd.DataFrame(), pd.DataFrame()

    settled = bets.copy()
    settled["won"] = settled.apply(lambda row: is_winning_bet(row, results), axis=1)
    settled["weight"] = settled["bet_type"].map(BET_WEIGHTS).fillna(1.0)
    settled["payout_weight"] = settled["stake"] * settled["weight"]
    settled["payout"] = 0.0
    settled["result"] = "Lost"

    total_pool = float(settled["stake"].sum())
    winners = settled[settled["won"]]
    winning_stake = float(winners["stake"].sum())
    winning_payout_weight = float(winners["payout_weight"].sum())

    if winning_payout_weight <= 0:
        settled["payout"] = settled["stake"]
        settled["result"] = "Refunded"
    else:
        bonus_pool = total_pool - winning_stake
        settled.loc[winners.index, "payout"] = (
            winners["stake"] + winners["payout_weight"] * (bonus_pool / winning_payout_weight)
        )
        settled.loc[winners.index, "result"] = "Won"

    settled["net"] = settled["payout"] - settled["stake"]
    settled["bet"] = settled.apply(describe_bet, axis=1)

    people = (
        settled.groupby("bettor", as_index=False)
        .agg(total_staked=("stake", "sum"), payout=("payout", "sum"), net=("net", "sum"))
        .sort_values(["net", "bettor"], ascending=[False, True])
    )
    return settled, people


def make_payment_plan(people: pd.DataFrame) -> pd.DataFrame:
    if people.empty:
        return pd.DataFrame(columns=["from", "to", "amount"])

    debtors = [
        SettlementLine(row.bettor, row.total_staked, row.payout, -row.net)
        for row in people.itertuples(index=False)
        if row.net < -0.004
    ]
    creditors = [
        SettlementLine(row.bettor, row.total_staked, row.payout, row.net)
        for row in people.itertuples(index=False)
        if row.net > 0.004
    ]

    payments: list[dict[str, Any]] = []
    i = 0
    j = 0
    debtor_remaining = debtors[0].net if debtors else 0.0
    creditor_remaining = creditors[0].net if creditors else 0.0

    while i < len(debtors) and j < len(creditors):
        amount = min(debtor_remaining, creditor_remaining)
        if amount > 0.004:
            payments.append(
                {
                    "from": debtors[i].person,
                    "to": creditors[j].person,
                    "amount": round(amount, 2),
                }
            )
        debtor_remaining -= amount
        creditor_remaining -= amount
        if debtor_remaining <= 0.004:
            i += 1
            debtor_remaining = debtors[i].net if i < len(debtors) else 0.0
        if creditor_remaining <= 0.004:
            j += 1
            creditor_remaining = creditors[j].net if j < len(creditors) else 0.0

    return pd.DataFrame(payments)


def format_bet_table(bets: pd.DataFrame) -> pd.DataFrame:
    if bets.empty:
        return bets
    shown = bets.copy()
    shown["Bet type"] = shown["bet_type"].map(BET_TYPES)
    shown["Weight"] = shown["bet_type"].map(weight_label)
    shown["Bet"] = shown.apply(describe_bet, axis=1)
    shown["Stake ($)"] = shown["stake"].map(money)
    return shown[["id", "bettor", "Bet type", "Weight", "Bet", "Stake ($)", "created_at"]].rename(
        columns={"id": "ID", "bettor": "Gambler", "created_at": "Entered"}
    )


def select_chicken(label: str, chickens: pd.DataFrame, key: str) -> int:
    names_by_id = dict(zip(chickens["id"], chickens["name"]))
    selected = st.selectbox(
        label,
        options=list(names_by_id.keys()),
        format_func=lambda id_: names_by_id[id_],
        key=key,
    )
    return int(selected)


def chicken_image_path(chicken_id: int) -> Path:
    specific = ASSET_DIR / "chickens" / f"chicken_{chicken_id:02d}.png"
    if specific.exists():
        return specific
    return ASSET_DIR / "chickens" / "placeholder.png"


def render_roster(chickens: pd.DataFrame) -> None:
    st.subheader("Starting Flock")
    st.markdown(
        '<div class="coop-callout">Twelve contenders enter the coop. First beak to the marshmallow takes the race, farm rules.</div>',
        unsafe_allow_html=True,
    )

    cols = st.columns(4)
    for idx, row in chickens.iterrows():
        with cols[idx % 4]:
            st.image(str(chicken_image_path(int(row["id"]))), use_container_width=True)
            st.markdown(f'<div class="roster-name">#{int(row["id"])} {row["name"]}</div>', unsafe_allow_html=True)


def render_betting(chickens: pd.DataFrame) -> None:
    st.subheader("Betting Coop")
    is_open = betting_is_open()
    if not is_open:
        st.error("Betting is closed. No new tickets can be added.")
    st.markdown(
        '<div class="coop-callout">Use the same name each time you submit a bet. Every dollar you bet (stake) goes into one shared pot. Winning tickets get their stake back, then split the losing money by odds.</div>',
        unsafe_allow_html=True,
    )
    with st.expander("Bet difficulty weights"):
        weights = pd.DataFrame(
            [
                {
                    "Bet type": BET_TYPES[key],
                    "Chance": probability_label(bet_probability(key)),
                    "Weight": weight_label(key),
                }
                for key in ["any_win", "race_winner", "any_order_three", "exact_ticket", "sweep"]
            ]
        )
        st.dataframe(weights, use_container_width=True, hide_index=True)

    bet_type_label = st.selectbox("Bet type", options=list(BET_TYPES.values()))
    bet_type = next(key for key, value in BET_TYPES.items() if value == bet_type_label)

    with st.form("bet_form", clear_on_submit=False):
        bettor_name = st.text_input("Gambler name")
        stake = st.number_input("Stake ($)", min_value=1.0, value=5.0, step=1.0, format="%.2f")
        race = None
        chicken_1 = chicken_2 = chicken_3 = None

        if bet_type == "race_winner":
            race = st.selectbox("Race", options=[1, 2, 3], format_func=format_race)
            chicken_1 = select_chicken("Bird to get the marshmallow first", chickens, "race_winner_pick")
        elif bet_type == "sweep":
            chicken_1 = select_chicken("Bird to rule the whole barnyard", chickens, "sweep_pick")
        elif bet_type == "exact_ticket":
            cols = st.columns(3)
            with cols[0]:
                chicken_1 = select_chicken(format_race(1), chickens, "exact_1")
            with cols[1]:
                chicken_2 = select_chicken(format_race(2), chickens, "exact_2")
            with cols[2]:
                chicken_3 = select_chicken(format_race(3), chickens, "exact_3")
        elif bet_type == "any_win":
            chicken_1 = select_chicken("Bird to win at least one race", chickens, "any_win_pick")
        elif bet_type == "any_order_three":
            picked = st.multiselect(
                "Pick exactly 3 chickens",
                options=chickens["id"].tolist(),
                format_func=lambda id_: chickens.set_index("id").loc[id_, "name"],
                max_selections=3,
            )
            if len(picked) == 3:
                chicken_1, chicken_2, chicken_3 = [int(value) for value in picked]

        submitted = st.form_submit_button("Add bet", type="primary", disabled=not is_open)

    if submitted:
        try:
            if not betting_is_open():
                raise ValueError("Betting is closed. No new tickets can be added.")
            if bet_type == "any_order_three" and not all([chicken_1, chicken_2, chicken_3]):
                raise ValueError("Pick exactly 3 chickens for this bet.")
            bettor_id = upsert_bettor(bettor_name)
            add_bet(bettor_id, bet_type, stake, race, int(chicken_1), chicken_2, chicken_3)
            st.success("Bet added.")
            st.rerun()
        except ValueError as exc:
            st.error(str(exc))


def render_results(chickens: pd.DataFrame) -> None:
    st.subheader("Winner's Perch")
    current = get_results()

    with st.form("results_form"):
        selections: dict[int, int] = {}
        cols = st.columns(3)
        for race in range(1, RACE_COUNT + 1):
            with cols[race - 1]:
                default = current.get(race, int(chickens.iloc[0]["id"]))
                options = chickens["id"].tolist()
                index = options.index(default) if default in options else 0
                selections[race] = int(
                    st.selectbox(
                        f"{format_race(race)} winner",
                        options=options,
                        index=index,
                        format_func=lambda id_: chickens.set_index("id").loc[id_, "name"],
                    )
                )
        submitted = st.form_submit_button("Save results", type="primary")

    if submitted:
        try:
            save_results(selections)
            st.success("Results saved.")
            st.rerun()
        except ValueError as exc:
            st.error(str(exc))


def render_settlement(chickens: pd.DataFrame, bets: pd.DataFrame) -> None:
    st.subheader("Settle the Scratch")
    results = get_results()
    names_by_id = dict(zip(chickens["id"], chickens["name"]))

    if len(results) != RACE_COUNT:
        st.info("Enter all 3 race winners before settling.")
        return

    result_text = " | ".join(f"{format_race(race)}: {names_by_id[chicken_id]}" for race, chicken_id in sorted(results.items()))
    st.markdown(f'<div class="section-note">{result_text}</div>', unsafe_allow_html=True)

    settled, people = calculate_settlement(bets, results)
    if settled.empty:
        st.info("No bets entered yet.")
        return

    payments = make_payment_plan(people)
    total_pool = float(people["total_staked"].sum())
    total_paid = float(people["payout"].sum())
    bonus_pool = total_pool - float(settled.loc[settled["won"], "stake"].sum())

    c1, c2, c3 = st.columns(3)
    c1.metric("Total pool", money(total_pool))
    c2.metric("Total paid out", money(total_paid))
    c3.metric("Losing-money bonus", money(bonus_pool))
    st.markdown(
        '<div class="coop-callout">One-pot settlement: winning tickets get their stake back first. The remaining losing money is split by difficulty weight. A big total pool can still pay modestly if lots of money was also bet on winners.</div>',
        unsafe_allow_html=True,
    )

    people_display = people.copy()
    for col in ["total_staked", "payout", "net"]:
        people_display[col] = people_display[col].map(money)
    st.markdown("**Winner's Circle Ledger**")
    st.dataframe(
        people_display.rename(
            columns={"bettor": "Gambler", "total_staked": "Staked", "payout": "Payout", "net": "Net"}
        ),
        use_container_width=True,
        hide_index=True,
    )

    st.markdown("**Simplified Venmo Pecking Order**")
    if payments.empty:
        st.write("No payments needed.")
    else:
        st.write("This is netted down so people make as few payments as practical.")
        for payer, payee, amount in payments.itertuples(index=False, name=None):
            st.markdown(
                f'<div class="payment-callout">{payer} pays {payee} {money(float(amount))}</div>',
                unsafe_allow_html=True,
            )
        pay_display = payments.copy()
        pay_display["amount"] = pay_display["amount"].map(money)
        st.dataframe(
            pay_display.rename(columns={"from": "From", "to": "To", "amount": "Amount"}),
            use_container_width=True,
            hide_index=True,
        )

    st.markdown("**Ticket Board: Glory and Also Not Glory**")
    detail = settled.copy()
    detail["Bet type"] = detail["bet_type"].map(BET_TYPES)
    detail["Weight"] = detail["weight"].map(lambda value: f"{value:g}x")
    detail["Bet"] = detail.apply(describe_bet, axis=1)
    detail["Stake ($)"] = detail["stake"].map(money)
    detail["Payout weight"] = detail["payout_weight"].map(lambda value: f"{value:,.2f}")
    detail["Payout"] = detail["payout"].map(money)
    detail["Net"] = detail["net"].map(money)
    detail["Result"] = detail["result"]
    st.dataframe(
        detail[["bettor", "Bet type", "Weight", "Bet", "Stake ($)", "Payout weight", "Result", "Payout", "Net"]].rename(
            columns={"bettor": "Gambler"}
        ),
        use_container_width=True,
        hide_index=True,
    )


def render_admin(chickens: pd.DataFrame, bets: pd.DataFrame) -> None:
    st.subheader("Coop Boss")
    code = st.text_input("Admin code", type="password")
    if code != ADMIN_CODE:
        st.caption("Enter the admin code to manage chickens, bets, and event resets.")
        return

    with st.expander("Delete accidental bet", expanded=True):
        if bets.empty:
            st.write("No bets to delete.")
        else:
            st.write("Pick one mistaken bet below. This only deletes the selected bet.")
            st.dataframe(format_bet_table(bets), use_container_width=True, hide_index=True)
            bet_options = {
                int(row.id): f"#{int(row.id)} - {row.bettor} - {money(float(row.stake))} - {describe_bet(row)}"
                for row in bets.itertuples(index=False)
            }
            bet_id = st.selectbox(
                "Accidental bet to delete",
                options=list(bet_options.keys()),
                format_func=lambda id_: bet_options[id_],
            )
            confirm_delete = st.checkbox("I want to delete only this selected bet")
            if st.button("Delete selected bet", disabled=not confirm_delete):
                delete_bet(int(bet_id))
                st.success("Bet deleted.")
                st.rerun()

    with st.expander("Clear bets"):
        st.warning("This clears all gamblers and bets. Chicken names, photos, and saved race results stay.")
        confirm = st.text_input('Type "CLEAR BETS" to clear all bets')
        if st.button("Clear all bets") and confirm == "CLEAR BETS":
            clear_bets()
            st.success("Bets cleared.")
            st.rerun()

    with st.expander("Start over"):
        st.warning("This clears gamblers, bets, and results. Chicken names stay.")
        confirm = st.text_input('Type "RESET" to clear this event')
        if st.button("Clear event") and confirm == "RESET":
            reset_all()
            st.success("Event cleared.")
            st.rerun()


def main() -> None:
    st.set_page_config(page_title=APP_TITLE, page_icon="C", layout="wide")
    inject_theme_css()
    init_db()

    chickens = get_chickens()
    bets = get_bets()
    render_hero(bets)
    render_countdown()

    tabs = st.tabs(["Betting Coop", "Starting Flock", "Ticket Board", "Winner's Circle", "Coop Boss"])
    with tabs[0]:
        render_betting(chickens)
    with tabs[1]:
        render_roster(chickens)
    with tabs[2]:
        st.subheader("Ticket Board")
        st.markdown(
            '<div class="coop-callout">Every ticket in the coop, sorted newest first.</div>',
            unsafe_allow_html=True,
        )
        if bets.empty:
            st.info("No bets entered yet.")
        else:
            st.dataframe(format_bet_table(bets), use_container_width=True, hide_index=True)
    with tabs[3]:
        render_results(chickens)
        render_settlement(chickens, bets)
    with tabs[4]:
        render_admin(chickens, bets)


if __name__ == "__main__":
    main()
