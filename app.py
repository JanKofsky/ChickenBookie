from __future__ import annotations

import base64
import json
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
FALLBACK_CHICKEN_IMAGE_COUNT = 60
ADMIN_CODE = "NekoFatty123!"
EASTERN_TZ = timezone(timedelta(hours=-4), "Eastern")
BETTING_CLOSE_AT = datetime(2026, 7, 18, 17, 30, tzinfo=EASTERN_TZ)
DEFAULT_BETTING_WINDOW = timedelta(days=7)
DEFAULT_EVENT_CODE = "corn hub"
DEFAULT_EVENT_NAME = "The Great American Chicken Race"
DEFAULT_OFFICIAL_RULE = "First chicken to get the marshmallow wins."

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

RACE_NAMES = {
    1: "Race 1 - Barnyard Dash",
    2: "Race 2 - The Hay Bale Hustle",
    3: "Race 3 - The Coop Gauntlet",
}

RACE_DESCRIPTIONS = {
    1: "Straight coop sprint. First bird to the marshmallow wins.",
    2: "Obstacles enter the barnyard. Marshmallow target still decides it.",
    3: "Maximum chicken-race nonsense, final marshmallow glory.",
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


def normalize_event_code(code: str) -> str:
    return " ".join(code.strip().lower().split())


def close_at_to_text(close_at: datetime) -> str:
    return close_at.isoformat()


def close_at_from_text(value: str | None) -> datetime:
    if not value:
        return BETTING_CLOSE_AT
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=EASTERN_TZ)
    return parsed.astimezone(EASTERN_TZ)


def init_db() -> None:
    with connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                admin_code TEXT NOT NULL,
                betting_close_at TEXT NOT NULL,
                official_rule TEXT NOT NULL DEFAULT 'First chicken to get the marshmallow wins.',
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS event_chickens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id INTEGER NOT NULL,
                slot INTEGER NOT NULL,
                name TEXT NOT NULL,
                photo BLOB,
                photo_mime TEXT,
                UNIQUE(event_id, slot),
                FOREIGN KEY (event_id) REFERENCES events(id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS event_races (
                event_id INTEGER NOT NULL,
                race INTEGER NOT NULL,
                name TEXT NOT NULL,
                description TEXT NOT NULL,
                PRIMARY KEY (event_id, race),
                FOREIGN KEY (event_id) REFERENCES events(id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS event_bettors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(event_id, name),
                FOREIGN KEY (event_id) REFERENCES events(id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS event_bets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id INTEGER NOT NULL,
                bettor_id INTEGER NOT NULL,
                bet_type TEXT NOT NULL,
                stake REAL NOT NULL,
                race INTEGER,
                chicken_1 INTEGER,
                chicken_2 INTEGER,
                chicken_3 INTEGER,
                picks TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (event_id) REFERENCES events(id),
                FOREIGN KEY (bettor_id) REFERENCES event_bettors(id),
                FOREIGN KEY (chicken_1) REFERENCES event_chickens(id),
                FOREIGN KEY (chicken_2) REFERENCES event_chickens(id),
                FOREIGN KEY (chicken_3) REFERENCES event_chickens(id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS event_results (
                event_id INTEGER NOT NULL,
                race INTEGER NOT NULL,
                chicken_id INTEGER NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (event_id, race),
                FOREIGN KEY (event_id) REFERENCES events(id),
                FOREIGN KEY (chicken_id) REFERENCES event_chickens(id)
            )
            """
        )
        ensure_column(conn, "events", "official_rule", f"TEXT NOT NULL DEFAULT '{DEFAULT_OFFICIAL_RULE}'")
        ensure_column(conn, "event_bets", "picks", "TEXT")
        ensure_column(conn, "event_chickens", "photo", "BLOB")
        ensure_column(conn, "event_chickens", "photo_mime", "TEXT")
        ensure_default_event(conn)
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


def ensure_event_defaults(conn: sqlite3.Connection, event_id: int) -> None:
    existing_chickens = conn.execute(
        "SELECT COUNT(*) FROM event_chickens WHERE event_id = ?", (event_id,)
    ).fetchone()[0]
    if existing_chickens == 0:
        conn.executemany(
            "INSERT INTO event_chickens (event_id, slot, name) VALUES (?, ?, ?)",
            [(event_id, i, name) for i, name in enumerate(DEFAULT_CHICKEN_NAMES, start=1)],
        )

    existing_races = conn.execute(
        "SELECT COUNT(*) FROM event_races WHERE event_id = ?", (event_id,)
    ).fetchone()[0]
    if existing_races == 0:
        conn.executemany(
            "INSERT INTO event_races (event_id, race, name, description) VALUES (?, ?, ?, ?)",
            [(event_id, race, name, RACE_DESCRIPTIONS[race]) for race, name in RACE_NAMES.items()],
        )


def ensure_column(conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    if column not in columns:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def ensure_default_event(conn: sqlite3.Connection) -> None:
    code = normalize_event_code(DEFAULT_EVENT_CODE)
    row = conn.execute("SELECT id FROM events WHERE code = ?", (code,)).fetchone()
    if row is None:
        row = conn.execute("SELECT id FROM events WHERE code = ?", ("birthday corn",)).fetchone()
        if row is not None:
            conn.execute("UPDATE events SET code = ? WHERE id = ?", (code, int(row["id"])))
    if row is None:
        cursor = conn.execute(
            """
            INSERT INTO events (code, name, admin_code, betting_close_at, official_rule, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (code, DEFAULT_EVENT_NAME, ADMIN_CODE, close_at_to_text(BETTING_CLOSE_AT), DEFAULT_OFFICIAL_RULE, now()),
        )
        event_id = int(cursor.lastrowid)
    else:
        event_id = int(row["id"])
        conn.execute(
            "UPDATE events SET name = ? WHERE id = ? AND name = ?",
            (DEFAULT_EVENT_NAME, event_id, "Birthday Corn"),
        )
    ensure_event_defaults(conn, event_id)


def now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def betting_is_open(event: sqlite3.Row | pd.Series | dict[str, Any]) -> bool:
    return datetime.now(EASTERN_TZ) < close_at_from_text(event["betting_close_at"])


def money(value: float) -> str:
    return f"${value:,.2f}"


def asset_data_uri(path: Path, mime_type: str) -> str:
    if not path.exists():
        return ""
    payload = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime_type};base64,{payload}"


def probability_context(chicken_count: int, race_count: int) -> dict[str, float]:
    chicken_count = max(int(chicken_count), 1)
    race_count = max(int(race_count), 1)
    single = 1 / chicken_count
    any_win = 1 - ((chicken_count - 1) / chicken_count) ** race_count
    all_exact = 1 / (chicken_count ** race_count)
    any_order = factorial(race_count) / (chicken_count ** race_count) if race_count <= chicken_count else 0.0
    return {
        "race_winner": single,
        "any_win": any_win,
        "exact_ticket": all_exact,
        "sweep": all_exact,
        "any_order_three": any_order,
    }


def bet_weights(chicken_count: int, race_count: int) -> dict[str, float]:
    probabilities = probability_context(chicken_count, race_count)
    single = probabilities["race_winner"]
    return {
        bet_type: (single / probability if probability > 0 else 0.0)
        for bet_type, probability in probabilities.items()
    }


def weight_label(bet_type: str, chicken_count: int = CHICKEN_COUNT, race_count: int = RACE_COUNT) -> str:
    weight = bet_weights(chicken_count, race_count).get(bet_type, 1.0)
    if weight >= 10:
        return f"{weight:,.0f}x"
    return f"{weight:.2f}".rstrip("0").rstrip(".") + "x"


def probability_label(probability: float) -> str:
    return f"{probability * 100:.3f}%"


def bet_probability(bet_type: str, chicken_count: int = CHICKEN_COUNT, race_count: int = RACE_COUNT) -> float:
    return probability_context(chicken_count, race_count).get(bet_type, 1 / max(chicken_count, 1))


def format_race(race: int, races: pd.DataFrame | None = None) -> str:
    if races is not None and not races.empty:
        match = races[races["race"] == race]
        if not match.empty:
            return str(match.iloc[0]["name"])
    return RACE_NAMES.get(race, f"Race {race}")


def inject_theme_css() -> None:
    bg_uri = asset_data_uri(ASSET_DIR / "barn_panel_background.jpg", "image/jpeg")
    st.markdown(
        """
        <style>
        :root {
            --barn-red: #b63d34;
            --comb-red: #e15a4e;
            --egg: #fff3d8;
            --straw: #d9aa3c;
            --feed: #a66928;
            --grass: #6fa34b;
            --pasture: #88b94f;
            --leaf: #294f2b;
            --ink: #fff3d8;
            --muted: #dbcaa7;
            --rail: #281611;
            --coop: #120f0d;
            --coop-panel: #231814;
            --coop-panel-2: #182317;
        }

        .stApp {
            background:
                linear-gradient(90deg, rgba(221, 151, 70, 0.22) 0 2px, transparent 2px 5px, rgba(7, 12, 8, 0.28) 5px 8px, transparent 8px 82px),
                repeating-linear-gradient(90deg, rgba(255, 229, 153, 0.075) 0 1px, transparent 1px 41px, rgba(0, 0, 0, 0.22) 41px 44px, transparent 44px 82px),
                repeating-linear-gradient(0deg, rgba(255, 229, 153, 0.026) 0 1px, transparent 1px 17px),
                radial-gradient(ellipse at 18% 8%, rgba(221, 151, 70, 0.16), transparent 24rem),
                radial-gradient(ellipse at 76% 18%, rgba(255, 214, 128, 0.12), transparent 22rem),
                linear-gradient(90deg, #122218 0%, #1f3a29 42%, #172d20 68%, #10170f 100%);
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
            border: 1px solid rgba(255, 243, 216, 0.16);
            border-radius: 8px;
            background:
                linear-gradient(180deg, rgba(35, 24, 20, 0.96), rgba(24, 35, 23, 0.94));
            box-shadow: 0 10px 26px rgba(0, 0, 0, 0.22);
        }

        div[data-testid="stMetric"] {
            background: linear-gradient(180deg, rgba(47, 31, 24, 0.96), rgba(27, 39, 24, 0.96));
            border: 1px solid rgba(255, 243, 216, 0.16);
            border-radius: 8px;
            padding: 0.75rem 0.9rem;
            box-shadow: inset 0 -3px 0 rgba(111, 163, 75, 0.24);
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
            color: #fff7df;
            font-weight: 900;
            text-shadow: 0 2px 8px rgba(38, 20, 14, 0.60);
        }

        .coop-hero {
            border: 1px solid rgba(255, 243, 216, 0.22);
            border-radius: 10px;
            background:
                linear-gradient(135deg, transparent 0 45%, rgba(221, 151, 70, 0.22) 45% 47%, transparent 47%),
                repeating-linear-gradient(90deg, rgba(255, 229, 153, 0.10) 0 2px, transparent 2px 44px),
                linear-gradient(90deg, rgba(23, 47, 32, 0.98), rgba(67, 42, 22, 0.92));
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
            background: linear-gradient(90deg, #fff3d8, #6fa34b, #b63d34, #fff3d8);
        }

        .coop-hero-inner {
            background:
                radial-gradient(circle at 92% 16%, rgba(255, 243, 216, 0.10), transparent 8rem),
                linear-gradient(135deg, rgba(111, 163, 75, 0.18), transparent 38%),
                linear-gradient(180deg, rgba(255, 255, 255, 0.035), transparent);
            border-left: 7px solid #dd9746;
            padding: 1.55rem 1.65rem 1.75rem;
            color: var(--ink);
        }

        .coop-logo {
            width: 68px;
            height: 68px;
            object-fit: contain;
            margin-bottom: 0.35rem;
            opacity: 0.96;
        }

        .coop-kicker {
            font-size: 0.82rem;
            font-weight: 900;
            letter-spacing: 0.10em;
            text-transform: uppercase;
            color: #f1c852;
        }

        .coop-title {
            font-size: clamp(2.25rem, 5vw, 4rem);
            line-height: 1;
            font-weight: 950;
            margin: 0.2rem 0 0.45rem;
            color: #fff3d8;
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
            border: 1px solid rgba(255, 243, 216, 0.26);
            border-radius: 999px;
            background: rgba(18, 15, 13, 0.42);
            color: #fff3d8;
            font-weight: 850;
        }

        .poster-badges {
            display: flex;
            flex-wrap: wrap;
            gap: 0.45rem;
            margin-top: 0.55rem;
        }

        .poster-badge {
            border: 1px solid rgba(255, 243, 216, 0.24);
            border-radius: 999px;
            background: rgba(255, 243, 216, 0.12);
            color: #f5d989;
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
            background: rgba(18, 15, 13, 0.52);
            color: var(--muted);
            border: 1px solid rgba(255, 243, 216, 0.18);
            border-radius: 6px;
            padding: 0.55rem 0.8rem;
            min-width: 130px;
            box-shadow: inset 0 -3px 0 rgba(111, 163, 75, 0.22);
        }

        .coop-stat strong {
            display: block;
            font-size: 1.25rem;
            color: #fff3d8;
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
            border: 1px solid rgba(255, 243, 216, 0.18);
            background:
                linear-gradient(180deg, rgba(43, 29, 24, 0.96), rgba(24, 38, 22, 0.94));
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
            background: linear-gradient(90deg, #b63d34, #d9aa3c, #6fa34b);
        }

        .race-card b {
            color: #fff3d8;
            display: block;
            font-size: 1.05rem;
        }

        .race-card em {
            display: inline-block;
            margin-bottom: 0.28rem;
            color: #95ca68;
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
            color: #fff3d8;
            border-top: 3px solid rgba(182, 61, 52, 0.84);
        }

        div[data-testid="stImage"] img {
            border-radius: 10px;
            border: 1px solid rgba(255, 243, 216, 0.20);
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
            border: 1px solid rgba(255, 243, 216, 0.16);
            border-left: 5px solid var(--barn-red);
            border-radius: 8px;
            background:
                linear-gradient(90deg, rgba(111, 163, 75, 0.14), transparent 44%),
                rgba(24, 35, 23, 0.92);
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
    if bg_uri:
        st.markdown(
            f"""
            <style>
            .stApp {{
                background-image:
                    linear-gradient(rgba(7, 12, 8, 0.72), rgba(7, 12, 8, 0.86)),
                    url("{bg_uri}") !important;
                background-size: cover !important;
                background-position: center top !important;
                background-attachment: fixed !important;
            }}
            </style>
            """,
            unsafe_allow_html=True,
        )


def clean_sentence(value: str) -> str:
    return str(value).strip().rstrip(".")


def render_hero(event: sqlite3.Row, bets: pd.DataFrame, chickens: pd.DataFrame, races: pd.DataFrame) -> None:
    total_pool = float(bets["stake"].sum()) if not bets.empty else 0.0
    bettors = int(bets["bettor"].nunique()) if not bets.empty else 0
    official_rule = clean_sentence(event["official_rule"])
    chicken_count = len(chickens)
    race_count = len(races)
    logo_uri = asset_data_uri(ASSET_DIR / "chicken_bookie_logo.png", "image/png")
    logo_html = f'<img class="coop-logo" src="{logo_uri}" alt="Chicken Bookie logo">' if logo_uri else ""
    st.markdown(
        f"""
        <div class="coop-hero">
            <div class="coop-hero-inner">
                {logo_html}
                <div class="coop-kicker">Chicken Bookie</div>
                <div class="coop-title">{event["name"]}</div>
                <div class="coop-subtitle">Barnyard race-day betting. Check the flock, place your coop tickets, then settle up after the pecking order is official.</div>
                <div class="marshmallow-pill">Official rule: {official_rule}.</div>
                <div class="poster-badges">
                    <span class="poster-badge">{chicken_count} birds</span>
                    <span class="poster-badge">{race_count} races</span>
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


def render_countdown(event: sqlite3.Row | pd.Series | dict[str, Any]) -> None:
    close_at = close_at_from_text(event["betting_close_at"])
    close_label = (
        f"{close_at.strftime('%B')} {close_at.day}, "
        f"{close_at.year} at {close_at.hour % 12 or 12}:"
        f"{close_at.minute:02d} {close_at.strftime('%p')} Eastern"
    )
    target_iso = close_at.isoformat()
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


def render_race_strip(races: pd.DataFrame | None = None) -> None:
    race_rows = []
    for race in range(1, RACE_COUNT + 1):
        if races is not None and not races.empty:
            match = races[races["race"] == race]
            if not match.empty:
                race_rows.append((race, str(match.iloc[0]["name"]), str(match.iloc[0]["description"])))
                continue
        race_rows.append((race, RACE_NAMES[race], RACE_DESCRIPTIONS[race]))
    st.markdown(
        f"""
        <div class="race-strip">
            <div class="race-card"><em>Race 1</em><b>{race_rows[0][1]}</b><span>{race_rows[0][2]}</span></div>
            <div class="race-card"><em>Race 2</em><b>{race_rows[1][1]}</b><span>{race_rows[1][2]}</span></div>
            <div class="race-card"><em>Race 3</em><b>{race_rows[2][1]}</b><span>{race_rows[2][2]}</span></div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def get_event_by_code(code: str) -> sqlite3.Row | None:
    cleaned = normalize_event_code(code)
    if not cleaned:
        return None
    with connect() as conn:
        row = conn.execute("SELECT * FROM events WHERE code = ?", (cleaned,)).fetchone()
        if row is not None:
            ensure_event_defaults(conn, int(row["id"]))
        return row


def get_events() -> pd.DataFrame:
    with connect() as conn:
        return pd.read_sql_query("SELECT id, code, name, created_at FROM events ORDER BY name", conn)


def get_chickens(event_id: int) -> pd.DataFrame:
    with connect() as conn:
        return pd.read_sql_query(
            "SELECT id, slot, name, photo, photo_mime FROM event_chickens WHERE event_id = ? ORDER BY slot",
            conn,
            params=(event_id,),
        )


def get_races(event_id: int) -> pd.DataFrame:
    with connect() as conn:
        return pd.read_sql_query(
            "SELECT race, name, description FROM event_races WHERE event_id = ? ORDER BY race",
            conn,
            params=(event_id,),
        )


def get_results(event_id: int) -> dict[int, int]:
    with connect() as conn:
        rows = conn.execute("SELECT race, chicken_id FROM event_results WHERE event_id = ?", (event_id,)).fetchall()
    return {int(row["race"]): int(row["chicken_id"]) for row in rows}


def get_bets(event_id: int) -> pd.DataFrame:
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
            FROM event_bets b
            JOIN event_bettors p ON p.id = b.bettor_id
            LEFT JOIN event_chickens c1 ON c1.id = b.chicken_1
            LEFT JOIN event_chickens c2 ON c2.id = b.chicken_2
            LEFT JOIN event_chickens c3 ON c3.id = b.chicken_3
            WHERE b.event_id = ?
            ORDER BY b.created_at DESC, b.id DESC
            """,
            conn,
            params=(event_id,),
        )


def upsert_bettor(event_id: int, name: str) -> int:
    cleaned = " ".join(name.strip().split())
    if not cleaned:
        raise ValueError("Enter a gambler name.")
    with connect() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO event_bettors (event_id, name, created_at) VALUES (?, ?, ?)",
            (event_id, cleaned, now()),
        )
        row = conn.execute(
            "SELECT id FROM event_bettors WHERE event_id = ? AND name = ?", (event_id, cleaned)
        ).fetchone()
        return int(row["id"])


def add_bet(
    event_id: int,
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
            INSERT INTO event_bets
                (event_id, bettor_id, bet_type, stake, race, chicken_1, chicken_2, chicken_3, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (event_id, bettor_id, bet_type, float(stake), race, chicken_1, chicken_2, chicken_3, now()),
        )


def save_results(event_id: int, results: dict[int, int]) -> None:
    if len(results) != RACE_COUNT:
        raise ValueError("Pick a winner for all 3 races.")
    with connect() as conn:
        conn.executemany(
            """
            INSERT INTO event_results (event_id, race, chicken_id, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(event_id, race) DO UPDATE SET
                chicken_id = excluded.chicken_id,
                updated_at = excluded.updated_at
            """,
            [(event_id, race, chicken_id, now()) for race, chicken_id in results.items()],
        )


def delete_bet(event_id: int, bet_id: int) -> None:
    with connect() as conn:
        conn.execute("DELETE FROM event_bets WHERE event_id = ? AND id = ?", (event_id, bet_id))


def clear_bets(event_id: int) -> None:
    with connect() as conn:
        conn.execute("DELETE FROM event_bets WHERE event_id = ?", (event_id,))
        conn.execute("DELETE FROM event_bettors WHERE event_id = ?", (event_id,))


def reset_all(event_id: int) -> None:
    with connect() as conn:
        conn.execute("DELETE FROM event_bets WHERE event_id = ?", (event_id,))
        conn.execute("DELETE FROM event_bettors WHERE event_id = ?", (event_id,))
        conn.execute("DELETE FROM event_results WHERE event_id = ?", (event_id,))


def update_event_settings(event_id: int, name: str, admin_code: str, close_at: datetime, official_rule: str) -> None:
    clean_name = " ".join(name.strip().split())
    clean_admin = admin_code.strip()
    clean_rule = " ".join(official_rule.strip().split())
    if not clean_name:
        raise ValueError("Enter an event name.")
    if not clean_admin:
        raise ValueError("Enter an admin code.")
    if not clean_rule:
        raise ValueError("Enter the official rule.")
    with connect() as conn:
        conn.execute(
            """
            UPDATE events
            SET name = ?, admin_code = ?, betting_close_at = ?, official_rule = ?
            WHERE id = ?
            """,
            (clean_name, clean_admin, close_at_to_text(close_at), clean_rule, event_id),
        )


def update_chickens(event_id: int, names_by_slot: dict[int, str]) -> None:
    cleaned = {slot: " ".join(name.strip().split()) for slot, name in names_by_slot.items()}
    if any(not name for name in cleaned.values()):
        raise ValueError("Every chicken needs a name.")
    with connect() as conn:
        conn.executemany(
            "UPDATE event_chickens SET name = ? WHERE event_id = ? AND slot = ?",
            [(name, event_id, slot) for slot, name in cleaned.items()],
        )


def update_chicken_photo(event_id: int, slot: int, photo: bytes, mime: str) -> None:
    with connect() as conn:
        conn.execute(
            "UPDATE event_chickens SET photo = ?, photo_mime = ? WHERE event_id = ? AND slot = ?",
            (photo, mime, event_id, slot),
        )


def update_races(event_id: int, race_data: dict[int, tuple[str, str]]) -> None:
    cleaned: dict[int, tuple[str, str]] = {}
    for race, (name, description) in race_data.items():
        clean_name = " ".join(name.strip().split())
        clean_description = " ".join(description.strip().split())
        if not clean_name:
            raise ValueError("Every race needs a name.")
        cleaned[race] = (clean_name, clean_description)
    with connect() as conn:
        conn.executemany(
            """
            UPDATE event_races
            SET name = ?, description = ?
            WHERE event_id = ? AND race = ?
            """,
            [(name, description, event_id, race) for race, (name, description) in cleaned.items()],
        )


def create_event(code: str, name: str, admin_code: str, source_event_id: int | None = None) -> int:
    clean_code = normalize_event_code(code)
    clean_name = " ".join(name.strip().split())
    clean_admin = admin_code.strip()
    if not clean_code:
        raise ValueError("Enter an event code.")
    if not clean_name:
        raise ValueError("Enter an event name.")
    if not clean_admin:
        raise ValueError("Enter an admin code.")

    with connect() as conn:
        existing = conn.execute("SELECT id FROM events WHERE code = ?", (clean_code,)).fetchone()
        if existing is not None:
            raise ValueError("That event code already exists.")

        source = None
        if source_event_id is not None:
            source = conn.execute("SELECT * FROM events WHERE id = ?", (source_event_id,)).fetchone()
        close_at = source["betting_close_at"] if source is not None else close_at_to_text(BETTING_CLOSE_AT)
        official_rule = source["official_rule"] if source is not None else DEFAULT_OFFICIAL_RULE

        cursor = conn.execute(
            """
            INSERT INTO events (code, name, admin_code, betting_close_at, official_rule, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (clean_code, clean_name, clean_admin, close_at, official_rule, now()),
        )
        event_id = int(cursor.lastrowid)

        if source_event_id is None:
            ensure_event_defaults(conn, event_id)
        else:
            source_chickens = conn.execute(
                "SELECT slot, name, photo, photo_mime FROM event_chickens WHERE event_id = ? ORDER BY slot",
                (source_event_id,),
            ).fetchall()
            conn.executemany(
                "INSERT INTO event_chickens (event_id, slot, name, photo, photo_mime) VALUES (?, ?, ?, ?, ?)",
                [(event_id, row["slot"], row["name"], row["photo"], row["photo_mime"]) for row in source_chickens],
            )
            source_races = conn.execute(
                "SELECT race, name, description FROM event_races WHERE event_id = ? ORDER BY race",
                (source_event_id,),
            ).fetchall()
            conn.executemany(
                "INSERT INTO event_races (event_id, race, name, description) VALUES (?, ?, ?, ?)",
                [(event_id, row["race"], row["name"], row["description"]) for row in source_races],
            )
        return event_id


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


def describe_bet(row: pd.Series, races: pd.DataFrame | None = None) -> str:
    label = BET_TYPES.get(row.bet_type, row.bet_type)
    if row.bet_type == "race_winner":
        return f"{format_race(int(row.race), races)} winner: {row.pick_1}"
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


def format_bet_table(bets: pd.DataFrame, races: pd.DataFrame | None = None) -> pd.DataFrame:
    if bets.empty:
        return bets
    shown = bets.copy()
    shown["Bet type"] = shown["bet_type"].map(BET_TYPES)
    shown["Weight"] = shown["bet_type"].map(weight_label)
    shown["Bet"] = shown.apply(lambda row: describe_bet(row, races), axis=1)
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
    fallback_id = ((chicken_id - 1) % FALLBACK_CHICKEN_IMAGE_COUNT) + 1
    specific = ASSET_DIR / "chickens" / f"chicken_{fallback_id:02d}.png"
    if specific.exists():
        return specific
    return ASSET_DIR / "chickens" / "placeholder.png"


def render_event_gate() -> sqlite3.Row | None:
    saved_code = st.session_state.get("event_code")
    if saved_code:
        event = get_event_by_code(saved_code)
    else:
        event = None
    if event is not None:
        c1, c2 = st.columns([3, 1])
        with c1:
            st.markdown(
                f'<div class="coop-callout">Current event: <b>{event["name"]}</b> | code: <b>{event["code"]}</b></div>',
                unsafe_allow_html=True,
            )
        with c2:
            if st.button("Switch event"):
                st.session_state.pop("event_code", None)
                st.rerun()
        return event

    st.subheader("Enter the Coop")
    st.markdown(
        '<div class="coop-callout">Enter the event code for your chicken race.</div>',
        unsafe_allow_html=True,
    )
    with st.form("event_login_form"):
        code = st.text_input("Event code", value=saved_code or DEFAULT_EVENT_CODE)
        submitted = st.form_submit_button("Open event", type="primary")
    if submitted:
        event = get_event_by_code(code)
        if event is None:
            st.error("No event found with that code.")
        else:
            st.session_state["event_code"] = normalize_event_code(code)
            st.rerun()

    with st.expander("Make a new event"):
        with st.form("create_event_form"):
            new_name = st.text_input("New event name")
            new_code = st.text_input("New event code")
            new_admin = st.text_input("New admin code", type="password")
            starting_setup = st.radio(
                "Starting setup",
                options=["Start from default", "Copy event code"],
                horizontal=True,
            )
            copy_code = ""
            if starting_setup == "Copy event code":
                copy_code = st.text_input("Event code to copy")
            create_submitted = st.form_submit_button("Create event")
        if create_submitted:
            try:
                source_event_id = None
                if starting_setup == "Copy event code":
                    source = get_event_by_code(copy_code)
                    if source is None:
                        raise ValueError("No event found with that code to copy.")
                    source_event_id = int(source["id"])
                event_id = create_event(
                    new_code,
                    new_name,
                    new_admin,
                    source_event_id,
                )
                st.session_state["event_code"] = normalize_event_code(new_code)
                st.success(f"Event created. ID {event_id}.")
                st.rerun()
            except ValueError as exc:
                st.error(str(exc))
    return None


def render_roster(event: sqlite3.Row, chickens: pd.DataFrame) -> None:
    st.subheader("Starting Flock")
    official_rule = clean_sentence(event["official_rule"])
    st.markdown(
        f'<div class="coop-callout">{len(chickens)} contenders enter the coop. {official_rule}, farm rules.</div>',
        unsafe_allow_html=True,
    )

    cols = st.columns(4)
    for idx, row in chickens.iterrows():
        with cols[idx % 4]:
            slot = int(row.get("slot", row["id"]))
            photo = row.get("photo")
            if isinstance(photo, bytes):
                st.image(photo, use_container_width=True)
            else:
                st.image(str(chicken_image_path(slot)), use_container_width=True)
            st.markdown(f'<div class="roster-name">#{slot} {row["name"]}</div>', unsafe_allow_html=True)


def render_betting(event: sqlite3.Row, chickens: pd.DataFrame, races: pd.DataFrame) -> None:
    st.subheader("Betting Coop")
    event_id = int(event["id"])
    is_open = betting_is_open(event)
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

    bettor_name = st.text_input("Gambler name")
    stake = st.number_input("Stake ($)", min_value=1.0, value=5.0, step=1.0, format="%.2f")
    race = None
    chicken_1 = chicken_2 = chicken_3 = None

    if bet_type == "race_winner":
        race = st.selectbox("Race", options=[1, 2, 3], format_func=lambda race_id: format_race(race_id, races))
        chicken_1 = select_chicken("Pick the bird to win this race", chickens, "race_winner_pick")
    elif bet_type == "sweep":
        chicken_1 = select_chicken("Pick the bird to rule the whole barnyard", chickens, "sweep_pick")
    elif bet_type == "exact_ticket":
        cols = st.columns(3)
        with cols[0]:
            chicken_1 = select_chicken(format_race(1, races), chickens, "exact_1")
        with cols[1]:
            chicken_2 = select_chicken(format_race(2, races), chickens, "exact_2")
        with cols[2]:
            chicken_3 = select_chicken(format_race(3, races), chickens, "exact_3")
    elif bet_type == "any_win":
        chicken_1 = select_chicken("Pick the bird to win at least one race", chickens, "any_win_pick")
    elif bet_type == "any_order_three":
        picked = st.multiselect(
            "Pick exactly 3 chickens",
            options=chickens["id"].tolist(),
            format_func=lambda id_: chickens.set_index("id").loc[id_, "name"],
            max_selections=3,
        )
        if len(picked) == 3:
            chicken_1, chicken_2, chicken_3 = [int(value) for value in picked]

    submitted = st.button("Add bet", type="primary", disabled=not is_open)

    if submitted:
        try:
            if not betting_is_open(event):
                raise ValueError("Betting is closed. No new tickets can be added.")
            if chicken_1 is None:
                raise ValueError("Pick a chicken for this bet.")
            if bet_type == "any_order_three" and not all([chicken_1, chicken_2, chicken_3]):
                raise ValueError("Pick exactly 3 chickens for this bet.")
            bettor_id = upsert_bettor(event_id, bettor_name)
            add_bet(event_id, bettor_id, bet_type, stake, race, int(chicken_1), chicken_2, chicken_3)
            st.success("Bet added.")
            st.rerun()
        except ValueError as exc:
            st.error(str(exc))


def render_results(event: sqlite3.Row, chickens: pd.DataFrame, races: pd.DataFrame) -> None:
    st.subheader("Winner's Perch")
    event_id = int(event["id"])
    current = get_results(event_id)

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
                        f"{format_race(race, races)} winner",
                        options=options,
                        index=index,
                        format_func=lambda id_: chickens.set_index("id").loc[id_, "name"],
                    )
                )
        submitted = st.form_submit_button("Save results", type="primary")

    if submitted:
        try:
            save_results(event_id, selections)
            st.success("Results saved.")
            st.rerun()
        except ValueError as exc:
            st.error(str(exc))


def render_settlement(event: sqlite3.Row, chickens: pd.DataFrame, races: pd.DataFrame, bets: pd.DataFrame) -> None:
    st.subheader("Settle the Scratch")
    results = get_results(int(event["id"]))
    names_by_id = dict(zip(chickens["id"], chickens["name"]))

    if len(results) != RACE_COUNT:
        st.info("Enter all 3 race winners before settling.")
        return

    result_text = " | ".join(f"{format_race(race, races)}: {names_by_id[chicken_id]}" for race, chicken_id in sorted(results.items()))
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
    detail["Bet"] = detail.apply(lambda row: describe_bet(row, races), axis=1)
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


def render_admin(event: sqlite3.Row, chickens: pd.DataFrame, races: pd.DataFrame, bets: pd.DataFrame) -> None:
    st.subheader("Coop Boss")
    event_id = int(event["id"])
    code = st.text_input("Admin code", type="password")
    if code != event["admin_code"]:
        st.caption("Enter the admin code to manage chickens, bets, and event resets.")
        return

    with st.expander("Event setup", expanded=True):
        close_at = close_at_from_text(event["betting_close_at"])
        with st.form("event_settings_form"):
            event_name = st.text_input("Event name / big title", value=event["name"])
            admin_code = st.text_input("Admin code for this event", value=event["admin_code"], type="password")
            close_date = st.date_input("Bets open until date", value=close_at.date())
            close_time = st.time_input("Bets open until time", value=close_at.time().replace(tzinfo=None))
            official_rule = st.text_input("Official rule / way to win", value=event["official_rule"])
            if st.form_submit_button("Save event setup"):
                try:
                    new_close_at = datetime.combine(close_date, close_time, tzinfo=EASTERN_TZ)
                    update_event_settings(event_id, event_name, admin_code, new_close_at, official_rule)
                    st.success("Event setup saved.")
                    st.rerun()
                except ValueError as exc:
                    st.error(str(exc))

    with st.expander("Edit race numbers and details"):
        with st.form("race_settings_form"):
            race_updates: dict[int, tuple[str, str]] = {}
            for row in races.itertuples(index=False):
                st.markdown(f"**Race {int(row.race)}**")
                race_name = st.text_input(f"Race {int(row.race)} name/title", value=row.name, key=f"race_name_{row.race}")
                race_description = st.text_input(
                    f"Race {int(row.race)} details",
                    value=row.description,
                    key=f"race_desc_{row.race}",
                )
                race_updates[int(row.race)] = (race_name, race_description)
            if st.form_submit_button("Save races"):
                try:
                    update_races(event_id, race_updates)
                    st.success("Race cards saved.")
                    st.rerun()
                except ValueError as exc:
                    st.error(str(exc))

    with st.expander("Edit chickens and photos"):
        with st.form("chicken_names_form"):
            chicken_updates: dict[int, str] = {}
            photo_updates: dict[int, Any] = {}
            cols = st.columns(2)
            for idx, row in enumerate(chickens.itertuples(index=False)):
                with cols[idx % 2]:
                    chicken_updates[int(row.slot)] = st.text_input(
                        f"Chicken #{int(row.slot)}",
                        value=row.name,
                        key=f"chicken_name_{row.slot}",
                    )
                    photo_updates[int(row.slot)] = st.file_uploader(
                        f"Photo for #{int(row.slot)}",
                        type=["png", "jpg", "jpeg"],
                        key=f"chicken_photo_{row.slot}",
                    )
            if st.form_submit_button("Save chickens"):
                try:
                    update_chickens(event_id, chicken_updates)
                    for slot, uploaded in photo_updates.items():
                        if uploaded is not None:
                            update_chicken_photo(event_id, slot, uploaded.getvalue(), uploaded.type)
                    st.success("Chicken names and photos saved.")
                    st.rerun()
                except ValueError as exc:
                    st.error(str(exc))

    with st.expander("Delete accidental bet", expanded=True):
        if bets.empty:
            st.write("No bets to delete.")
        else:
            st.write("Pick one mistaken bet below. This only deletes the selected bet.")
            st.dataframe(format_bet_table(bets, races), use_container_width=True, hide_index=True)
            bet_options = {
                int(row.id): f"#{int(row.id)} - {row.bettor} - {money(float(row.stake))} - {describe_bet(row, races)}"
                for row in bets.itertuples(index=False)
            }
            bet_id = st.selectbox(
                "Accidental bet to delete",
                options=list(bet_options.keys()),
                format_func=lambda id_: bet_options[id_],
            )
            confirm_delete = st.checkbox("I want to delete only this selected bet")
            if st.button("Delete selected bet", disabled=not confirm_delete):
                delete_bet(event_id, int(bet_id))
                st.success("Bet deleted.")
                st.rerun()

    with st.expander("Clear bets"):
        st.warning("This clears all gamblers and bets. Chicken names, photos, and saved race results stay.")
        confirm = st.text_input('Type "CLEAR BETS" to clear all bets')
        if st.button("Clear all bets") and confirm == "CLEAR BETS":
            clear_bets(event_id)
            st.success("Bets cleared.")
            st.rerun()

    with st.expander("Start over"):
        st.warning("This clears gamblers, bets, and results. Chicken names stay.")
        confirm = st.text_input('Type "RESET" to clear this event')
        if st.button("Clear event") and confirm == "RESET":
            reset_all(event_id)
            st.success("Event cleared.")
            st.rerun()


def main() -> None:
    st.set_page_config(page_title=APP_TITLE, page_icon="C", layout="wide")
    inject_theme_css()
    init_db()

    event = render_event_gate()
    if event is None:
        return

    event_id = int(event["id"])
    chickens = get_chickens(event_id)
    races = get_races(event_id)
    bets = get_bets(event_id)
    render_hero(event, bets, chickens, races)
    render_countdown(event)

    tabs = st.tabs(["Betting Coop", "Starting Flock", "Ticket Board", "Winner's Circle", "Coop Boss"])
    with tabs[0]:
        render_betting(event, chickens, races)
    with tabs[1]:
        render_roster(event, chickens)
    with tabs[2]:
        st.subheader("Ticket Board")
        st.markdown(
            '<div class="coop-callout">Every ticket in the coop, sorted newest first.</div>',
            unsafe_allow_html=True,
        )
        if bets.empty:
            st.info("No bets entered yet.")
        else:
            st.dataframe(format_bet_table(bets, races), use_container_width=True, hide_index=True)
    with tabs[3]:
        render_results(event, chickens, races)
        render_settlement(event, chickens, races, bets)
    with tabs[4]:
        render_admin(event, chickens, races, bets)


if __name__ == "__main__":
    main()

