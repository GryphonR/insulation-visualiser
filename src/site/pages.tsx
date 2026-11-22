// The public site: a landing page and the Learn pages, rendered to static HTML at build time (scripts/prerender.mjs).
// The Learn pages are the app's own LearnPage, with its links pointed at the static pages and /app/.
import type { ReactNode } from 'react';
import { LEARN_SECTIONS, LEARN_TRACKS, LearnPage } from '../ui/LearnPage';
import type { LearnLinks } from '../ui/LearnPage';
import { STEPS } from '../ui/steps';
import { TAGLINE, Wordmark } from '../ui/Wordmark';
import { OPERATOR, Privacy, Terms } from './legal';
import { MAX_PROJECTS, MAX_SCENARIOS } from '../engine/limits';

export interface Page { path: string; title: string; description?: string; body: ReactNode }

// The search and link-preview summary; the landing page itself opens with INTRO.
const LEAD = 'Model a house room by room: how its walls, roofs and floors lose heat and handle moisture, what heating it needs, and what an upgrade would save. Compare scenarios side by side, then hand the customer a report.';
const INTRO: ReactNode[] = [
  "Most insulation tools stop at the U-value. It's the right headline figure, but it describes a wall in a steady state, and our homes live in a world that never stands still: days warm and cool, the sun comes and goes, and the heating switches on and off.",
  <>To model a house as it really behaves, you have to follow heat as it soaks into and travels through the materials. Thermal mass gives every wall a <em>decrement factor</em> (how much a temperature swing is damped) and a <em>decrement delay</em> (how long it takes to arrive). Together they can change a home's heating and cooling needs in ways the U-value alone will never show.</>,
  'Insuliser makes these lesser-discussed sides of insulation easy to see and model.',
];
const FEATURES = [
  'A large library of materials and ready-made build-ups, and you can add your own.',
  'Simulate how a build-up handles heat across a range of conditions.',
  "Simulate a build-up's moisture: screen for interstitial condensation, long-term moisture build-up and rot risk in organic materials.",
  'Model a whole house and work out its heat loss at MCS design-day conditions.',
  "Work out the house's cooling needs in a heatwave.",
  'Add emitters and size them for the heat source and flow temperature.',
  'Place the heat source and hot water cylinder, then design the pipe runs for the whole system.',
  'Pipe sizes, flow rates and pressure drops are calculated for you.',
  'Try upgrades as scenarios, such as loft insulation, new windows or a heat pump, and see what each change saves, then compare any two room by room.',
];

const links = (base: string): LearnLinks => ({
  learn: (id) => (id === 'start' ? `${base}learn/` : `${base}learn/${id}/`),
  app: (...parts) => `${base}app/#/${parts.map(encodeURIComponent).join('/')}`,
});

const Logo = () => <span className="logo" aria-hidden="true"><span /><span /><span /></span>;

function Frame({ base, here, children }: { base: string; here: 'home' | 'learn' | 'pricing' | 'other'; children: ReactNode }) {
  return (
    <div className="site">
      <a className="skip" href="#main">Skip to content</a>
      <header className="top site-top">
        <a className="brand" href={base}><Logo />Insuliser<span className="beta">Beta</span></a>
        <nav className="wf" aria-label="Site">
          <a href={`${base}learn/`} className={here === 'learn' ? 'on' : ''} aria-current={here === 'learn' ? 'page' : undefined}>Learn</a>
          <a href={`${base}pricing/`} className={here === 'pricing' ? 'on' : ''} aria-current={here === 'pricing' ? 'page' : undefined}>Pricing</a>
        </nav>
        <div className="run"><a className="btn-primary" href={`${base}app/`}>Open the app</a></div>
      </header>
      <main id="main" className="site-main">{children}</main>
      <footer className="site-foot">
        <span><Logo /> Insuliser · {TAGLINE}</span>
        <nav aria-label="Footer">
          <a href={`${base}learn/`}>Learn</a> · <a href={`${base}learn/glossary/`}>Glossary</a> · <a href={`${base}pricing/`}>Pricing</a> · <a href={`${base}app/`}>Open the app</a>
          {' · '}<a href={`${base}privacy/`}>Privacy</a> · <a href={`${base}terms/`}>Terms</a>
        </nav>
        <span className="site-copy">© {new Date().getFullYear()} {OPERATOR}. Results are estimates, not professional advice.</span>
      </footer>
    </div>
  );
}

// Links from before the app moved to /app/ (e.g. /#/plan) still land in the app.
const HASH_REDIRECT = (base: string) => `if(/^#\\/./.test(location.hash))location.replace(${JSON.stringify(`${base}app/`)}+location.hash)`;

function Landing({ base, cloud }: { base: string; cloud: boolean }) {
  const L = links(base);
  const stepGuide = ['plan-buildups', 'plan-model', 'plan-heating', 'plan-results'];
  return (
    <Frame base={base} here="home">
      <script dangerouslySetInnerHTML={{ __html: HASH_REDIRECT(base) }} />
      <div className="site-intro">
      <section className="site-hero">
        <Wordmark />
        {INTRO.map((t, i) => <p key={i} className="site-lead">{t}</p>)}
        <div className="chips">
          <a className="btn-primary" href={`${base}app/`}>Open the app</a>
          <a className="btn-secondary" href={L.app('start')}>Start a new project</a>
          <a className="btn-secondary" href={L.learn('start')}>Read the guides</a>
        </div>
        <p className="small muted">
          Free in your browser during the <a href={`${base}pricing/`}>open beta</a>. {cloud ? 'Projects are saved on your device; sign in to keep them in the cloud and open them anywhere.' : 'Projects are saved in your browser, and you can export them as files.'}
        </p>
      </section>

      <section className="site-band" aria-labelledby="features">
        <div className="eyebrow" id="features">Features</div>
        <ul className="site-features card">
          {FEATURES.map((f) => <li key={f}>{f}</li>)}
        </ul>
      </section>
      </div>

      <section className="site-band" aria-labelledby="how">
        <div className="eyebrow" id="how">How it works</div>
        <ol className="site-steps">
          {STEPS.map(([, t, d], i) => (
            <li key={t} className="card">
              <span className="n">{i + 1}</span>
              <h2>{t}</h2>
              <p>{d}</p>
              <a className="inline-link" href={L.learn(stepGuide[i])}>How this step works →</a>
            </li>
          ))}
        </ol>
      </section>

      <section className="site-band site-why" aria-labelledby="why">
        <div className="eyebrow" id="why">Why it's different</div>
        <ul className="site-points">
          <li className="card"><h2>Beyond the U-value</h2><p>Walls are simulated through real days, so you see how thermal mass and sun damp and delay the swings, not just the steady heat loss.</p><a className="inline-link" href={L.learn('planning')}>Why the U-value isn't the whole story →</a></li>
          <li className="card"><h2>Moisture, not just heat</h2><p>Check a build-up for condensation and wetting before you specify it, which matters most for solid and older walls.</p><a className="inline-link" href={L.learn('moist-condensation')}>Condensation explained →</a></li>
          <li className="card"><h2>Heating that fits</h2><p>Size emitters room by room, route pipework on the plan and compare running costs for a boiler or a heat pump.</p><a className="inline-link" href={L.learn('plan-heating')}>Designing the heating →</a></li>
        </ul>
      </section>

      <section className="site-band" aria-labelledby="learn">
        <div className="eyebrow" id="learn">Learn</div>
        <ul className="site-points">
          {LEARN_TRACKS.map((t) => {
            const first = LEARN_SECTIONS.find((x) => x.track === t.name)!;
            return <li key={t.name} className="card"><h2><a href={L.learn(first.id)}>{t.name}</a></h2><p>{t.blurb}</p></li>;
          })}
        </ul>
      </section>
    </Frame>
  );
}

function Pricing({ base }: { base: string }) {
  return (
    <Frame base={base} here="pricing">
      <article className="site-legal card site-pricing">
        <h1>Pricing</h1>
        <p className="site-lead">Insuliser is free for everyone while in open beta.</p>
        <h2>During the beta</h2>
        <p>Every feature is open to everyone, with or without an account. To keep the beta running smoothly, each person can have:</p>
        <ul>
          <li>up to <strong>{MAX_PROJECTS} projects</strong>, and</li>
          <li>up to <strong>{MAX_SCENARIOS} scenarios</strong> in each project.</li>
        </ul>
        <p>To start another project when you have {MAX_PROJECTS}, export one to keep a copy, then delete it within Insuliser.</p>
        <h2>After the beta</h2>
        <p>Once Insuliser is out of beta we intend to keep a comprehensively featured 'Always Free' tier for personal users.</p>
        <div className="chips"><a className="btn-primary" href={`${base}app/`}>Open the app</a></div>
      </article>
    </Frame>
  );
}

function NotFound({ base }: { base: string }) {
  return (
    <Frame base={base} here="other">
      <section className="site-hero">
        <h1>Page not found</h1>
        <p className="site-lead">That page doesn't exist, or it has moved.</p>
        <div className="chips">
          <a className="btn-primary" href={base}>Home</a>
          <a className="btn-secondary" href={`${base}learn/`}>Learn</a>
          <a className="btn-secondary" href={`${base}app/`}>Open the app</a>
        </div>
      </section>
    </Frame>
  );
}

/** Every page of the public site. `path` is relative to the base, with a trailing slash ('' is the home page). */
export function sitePages(base: string, cloud: boolean): Page[] {
  const L = links(base);
  return [
    { path: '', title: `Insuliser · ${TAGLINE}`, description: LEAD, body: <Landing base={base} cloud={cloud} /> },
    ...LEARN_SECTIONS.map((s) => ({
      path: s.id === 'start' ? 'learn/' : `learn/${s.id}/`,
      title: s.id === 'start' ? 'Learn · Insuliser' : `${s.title.replace(/^\d+b?\.\s*/, '')} · Insuliser Learn`,
      body: <Frame base={base} here="learn"><div className="site-learn"><LearnPage section={s.id} links={L} /></div></Frame>,
    })),
    { path: 'pricing/', title: 'Pricing · Insuliser', description: `Insuliser is in open beta and free for everyone: up to ${MAX_PROJECTS} projects with ${MAX_SCENARIOS} scenarios each. After the beta, we intend to keep a comprehensively featured Always Free tier for personal users.`, body: <Pricing base={base} /> },
    { path: 'privacy/', title: 'Privacy · Insuliser', description: 'What Insuliser stores, who handles it and your rights. No analytics, no advertising, no tracking cookies.', body: <Frame base={base} here="other"><Privacy /></Frame> },
    { path: 'terms/', title: 'Terms of use · Insuliser', description: "The terms for using Insuliser, including what its results can and can't be relied on for.", body: <Frame base={base} here="other"><Terms base={base} /></Frame> },
    { path: '404', title: 'Page not found · Insuliser', body: <NotFound base={base} /> },
  ];
}
