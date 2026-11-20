export const TAGLINE = "It's not all about U";

/** The big logo, title, beta stamp and tagline (start screen and landing page). The tagline's letters are spread to span exactly the word "Insuliser". */
export function Wordmark() {
  return (
    <div className="proj-hero">
      <span className="logo big" aria-hidden="true"><span /><span /><span /></span>
      <h1>Insuliser</h1>
      <span className="beta">Beta</span>
      <p className="tagline">
        <span className="sr-only">{TAGLINE}</span>
        {[...TAGLINE].map((c, i) => <span key={i} aria-hidden="true">{c === ' ' ? ' ' : c}</span>)}
      </p>
    </div>
  );
}
