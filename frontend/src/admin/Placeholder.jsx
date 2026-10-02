// Stand-in for admin pages that later parts will build.
export default function Placeholder({ title, children }) {
  return (
    <section>
      <h1>{title}</h1>
      <p className="muted">{children}</p>
    </section>
  );
}
