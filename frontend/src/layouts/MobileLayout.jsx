// Phone-shaped column used by the driver and rider views. On a desktop it
// stays phone-width, centered, with plain bars on either side.
export default function MobileLayout({ title, actions, children }) {
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
      </div>
    </div>
  );
}
