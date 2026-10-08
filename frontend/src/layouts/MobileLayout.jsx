import { useEffect } from "react";
import { Link } from "react-router";

// Phone-shaped column used by the driver and rider views. On a desktop it
// stays phone-width, centered, with plain bars on either side.
export default function MobileLayout({ title, actions, children }) {
  // iPhone Safari only shows :active (the "press" grow) if the page listens
  // for touches; an empty listener is enough.
  useEffect(() => {
    const noop = () => {};
    document.addEventListener("touchstart", noop, { passive: true });
    return () => document.removeEventListener("touchstart", noop);
  }, []);

  return (
    <div className="mobile-backdrop">
      <div className="mobile-column">
        {(title || actions) && (
          <header className="mobile-bar">
            <span className="brand">{title}</span>
            {actions}
          </header>
        )}
        <main className="mobile-main">{children}</main>
        <footer className="mobile-footer">
          <Link to="/privacy">Privacy</Link>
        </footer>
      </div>
    </div>
  );
}
