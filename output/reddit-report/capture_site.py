import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / ".tools"))

from playwright.sync_api import sync_playwright


OUT = Path(__file__).resolve().parent / "screenshots"
OUT.mkdir(parents=True, exist_ok=True)
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
BASE = "https://chickenbookie.com"


def capture(page, name: str) -> None:
    page.screenshot(path=str(OUT / name), full_page=True)


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path=CHROME, headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1000}, device_scale_factor=1)

    page.goto(BASE, wait_until="networkidle")
    page.evaluate("document.fonts.ready")
    capture(page, "01-home.png")

    page.goto(f"{BASE}/?event=test", wait_until="networkidle")
    page.get_by_role("heading", name="Chicken Bookie Test Event").wait_for()
    page.evaluate("document.fonts.ready")
    capture(page, "02-race-betting-coop.png")

    page.get_by_role("button", name="Contenders & Races").click()
    page.get_by_role("heading", name="Starting Flock").wait_for()
    capture(page, "03-contenders-and-races.png")

    page.get_by_role("button", name="Ticket Board").click()
    page.get_by_role("heading", name="Ticket Board").wait_for()
    capture(page, "04-race-ticket-board.png")

    page.get_by_role("button", name="Winner's Circle").click()
    page.get_by_role("heading", name="Winner's Circle").wait_for()
    capture(page, "05-race-winners.png")

    page.goto(f"{BASE}/?event=test-drop", wait_until="networkidle")
    page.get_by_role("heading", name="Chicken Drop Test Event").wait_for()
    page.get_by_role("heading", name="Chicken Drop betting grid").wait_for()
    page.evaluate("document.fonts.ready")
    capture(page, "06-drop-betting-grid.png")

    page.get_by_role("button", name="Live Betting Board").click()
    page.get_by_role("heading", name="Live Betting Board").wait_for()
    capture(page, "07-drop-live-betting-board.png")

    page.get_by_role("button", name="Winner's Circle").click()
    page.get_by_role("heading", name="Winner's Circle").wait_for()
    capture(page, "08-drop-pending-result.png")

    page.get_by_role("button", name="Coop Boss").click()
    page.get_by_role("heading", name="Coop Boss").wait_for()
    capture(page, "09-drop-admin.png")

    browser.close()
