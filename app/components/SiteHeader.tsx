export default function SiteHeader() {
  return (
    <nav className="topbar" aria-label="Primary">
      <a className="brand" href="/">
        <img src="/assets/chicken_bookie_logo.png" alt="Chicken Bookie chicken logo" />
        <span>Chicken Bookie</span>
      </a>
      <div className="nav-links" aria-label="Site pages">
        <a href="/about">About</a>
        <a href="/contact">Contact</a>
        <a href="/privacy">Terms + Privacy</a>
      </div>
    </nav>
  );
}
