import { useEffect, useRef, useState, type ReactNode } from 'react';

interface Section {
  id: string;
  title: string;
  group: string;
}

const SECTIONS: Section[] = [
  { id: 'planning', title: 'Planning your insulation', group: 'Overview' },
  { id: 'what', title: 'What this tool does', group: 'Overview' },
  { id: 'how-to-use', title: 'Using it in four steps', group: 'Overview' },
  { id: 'heat', title: 'Heat and temperature', group: 'The ideas' },
  { id: 'conduction', title: 'Conduction and R-values', group: 'The ideas' },
  { id: 'u-value', title: 'The U-value', group: 'The ideas' },
  { id: 'mass', title: 'Thermal mass', group: 'The ideas' },
  { id: 'dynamic', title: 'Decrement factor and delay', group: 'The ideas' },
  { id: 'sun', title: 'Sun, and sol-air temperature', group: 'The ideas' },
  { id: 'inner-face', title: 'The inner face and comfort', group: 'The ideas' },
  { id: 'rooms', title: 'Heating modes', group: 'The ideas' },
  { id: 'outputs', title: 'Reading the results', group: 'The ideas' },
  { id: 'sim-overview', title: 'The simulation at a glance', group: 'Under the hood' },
  { id: 'sim-weather', title: '1. Building the day', group: 'Under the hood' },
  { id: 'sim-solar', title: '2. Sun on the surface', group: 'Under the hood' },
  { id: 'sim-solair', title: '3. Sol-air temperature', group: 'Under the hood' },
  { id: 'sim-slices', title: '4. Slicing the wall', group: 'Under the hood' },
  { id: 'sim-balance', title: '5. Heat balance in each slice', group: 'Under the hood' },
  { id: 'sim-stepping', title: '6. Stepping through time', group: 'Under the hood' },
  { id: 'sim-room', title: '7. The room', group: 'Under the hood' },
  { id: 'sim-metrics', title: '8. Working out the results', group: 'Under the hood' },
  { id: 'limits', title: 'What it leaves out', group: 'Under the hood' },
  { id: 'moist-what', title: 'What the moisture tab does', group: 'Moisture: the ideas' },
  { id: 'moist-vapour', title: 'Vapour, humidity and vapour pressure', group: 'Moisture: the ideas' },
  { id: 'moist-mu', title: 'Vapour resistance: µ and sd', group: 'Moisture: the ideas' },
  { id: 'moist-condensation', title: 'Condensation: surface and interstitial', group: 'Moisture: the ideas' },
  { id: 'moist-absorb', title: 'Absorbent and wicking materials', group: 'Moisture: the ideas' },
  { id: 'moist-rain', title: 'Rain and ground moisture', group: 'Moisture: the ideas' },
  { id: 'moist-reading', title: 'Reading the moisture charts', group: 'Moisture: the ideas' },
  { id: 'msim-overview', title: 'The moisture simulation at a glance', group: 'Moisture: under the hood' },
  { id: 'msim-climate', title: '1. Building the year', group: 'Moisture: under the hood' },
  { id: 'msim-profile', title: '2. Slices, heat and vapour', group: 'Moisture: under the hood' },
  { id: 'msim-saturation', title: '3. Storing water: the sorption curve', group: 'Moisture: under the hood' },
  { id: 'msim-balance', title: '4. Capillary flow', group: 'Moisture: under the hood' },
  { id: 'msim-wet', title: '5. Solving each step', group: 'Moisture: under the hood' },
  { id: 'msim-sources', title: '6. Rain, ground moisture and cavities', group: 'Moisture: under the hood' },
  { id: 'msim-results', title: '7. Working out the results', group: 'Moisture: under the hood' },
  { id: 'mlimits', title: 'What the moisture model leaves out', group: 'Moisture: under the hood' },
  { id: 'glossary', title: 'Glossary', group: 'Reference' },
];

function Eq({ children }: { children: ReactNode }) {
  return <div className="eq mono">{children}</div>;
}

function Callout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <aside className="callout">
      <div className="eyebrow">{title}</div>
      <div className="stack-6">{children}</div>
    </aside>
  );
}

/** A schematic of a daily swing being damped and delayed by a wall. */
function LagFigure() {
  const W = 560;
  const H = 190;
  const PL = 36;
  const PR = 544;
  const mid = 96;
  const x = (h: number) => PL + ((PR - PL) * h) / 24;
  const line = (amp: number, peak: number) =>
    Array.from({ length: 97 }, (_, i) => {
      const h = i / 4;
      return `${x(h).toFixed(1)},${(mid - amp * Math.cos((2 * Math.PI * (h - peak)) / 24)).toFixed(1)}`;
    }).join(' ');
  return (
    <figure className="learn-figure">
      <svg viewBox={`0 0 ${W} ${H}`} className="svg-fluid" role="img" aria-label="Two daily curves: the outside driving temperature with a tall peak at 15:00, and the heat flow reaching the inner face, which is much smaller and peaks around 21:00.">
        <line x1={PL} x2={PR} y1={mid} y2={mid} className="grid zero" />
        {[0, 6, 12, 18, 24].map((h) => (
          <g key={h}>
            <line x1={x(h)} x2={x(h)} y1={14} y2={166} className="grid-v" />
            <text x={x(h)} y={182} className="svt-mid">{String(h).padStart(2, '0')}:00</text>
          </g>
        ))}
        <polyline points={line(70, 15)} fill="none" stroke="#c75b00" strokeWidth={2.5} />
        <polyline points={line(21, 21)} fill="none" stroke="#0b63b5" strokeWidth={3} />
        <line x1={x(15)} x2={x(21)} y1={mid - 70} y2={mid - 70} stroke="#51606c" strokeWidth={1.2} strokeDasharray="3 3" />
        <text x={(x(15) + x(21)) / 2} y={mid - 76} className="svt-mid">decrement delay</text>
        <line x1={x(21) + 14} x2={x(21) + 14} y1={mid - 70} y2={mid - 21} stroke="#51606c" strokeWidth={1.2} strokeDasharray="3 3" />
        <text x={x(21) + 20} y={mid - 42} className="svt">damped</text>
        <text x={x(15) - 8} y={mid - 74} className="svt-end" fill="#c75b00" style={{ fill: '#c75b00' }}>outside</text>
        <text x={x(21) + 8} y={mid + 40} className="svt" style={{ fill: '#0b63b5' }}>inside</text>
      </svg>
      <figcaption className="small muted">
        Schematic only. A heavy, well-insulated wall turns a big, early swing outside (orange) into a small, late one inside (blue).
      </figcaption>
    </figure>
  );
}

/** A schematic of the vapour pressure line meeting the saturation line at a cold layer boundary. */
function PressureFigure() {
  const W = 560;
  const H = 210;
  const PL = 44;
  const PR = 544;
  const y = (p: number) => 160 - (p / 2400) * 140;
  const xs = [PL, 300, 440, PR];
  const labels = ['stone', 'internal insulation', 'plaster'];
  return (
    <figure className="learn-figure">
      <svg viewBox={`0 0 ${W} ${H}`} className="svg-fluid" role="img" aria-label="A wall with stone on the outside, insulation and plaster inside. The black vapour pressure line rises from about 750 pascals outside to about 1170 inside. The blue dashed saturation line is lowest at the cold outer face and climbs towards the warm inside. The two lines touch at the boundary between stone and insulation, the coldest boundary between layers, where water condenses.">
        {[0, 1200, 2400].map((p) => (
          <g key={p}>
            <line x1={PL} x2={PR} y1={y(p)} y2={y(p)} className="grid" />
            <text x={PL - 6} y={y(p) + 4} className="svt-end">{p}</text>
          </g>
        ))}
        {labels.map((l, i) => (
          <g key={l}>
            <rect x={xs[i]} y={20} width={xs[i + 1] - xs[i]} height={140} fill={['#cdbf9c', '#d9c77d', '#e6ddd0'][i]} opacity={0.4} />
            <text x={(xs[i] + xs[i + 1]) / 2} y={178} className="svt-mid">{l}</text>
          </g>
        ))}
        <polyline points={`${PL},${y(840)} 300,${y(950)} 440,${y(1750)} ${PR},${y(2150)}`} fill="none" stroke="#0b63b5" strokeWidth={2} strokeDasharray="6 4" />
        <polyline points={`${PL},${y(750)} 300,${y(950)} 440,${y(1140)} ${PR},${y(1170)}`} fill="none" stroke="#14212b" strokeWidth={2.5} />
        <circle cx={300} cy={y(950)} r={5} fill="#b91c1c" stroke="#fff" strokeWidth={1.5} />
        <text x={300} y={y(950) - 10} className="svt-mid" style={{ fill: '#b91c1c', fontWeight: 600 }}>condensation</text>
        <text x={PL} y={198} className="svt">outside: 750 Pa</text>
        <text x={PR} y={198} className="svt-end">inside: 1170 Pa</text>
      </svg>
      <figcaption className="small muted">
        Schematic only. Black: the vapour pressure that is actually in the wall. Dashed blue: the most the air can hold at the temperature of each point. Where they meet, the air is full.
      </figcaption>
    </figure>
  );
}

export function LearnPage({ onOpenSimulator }: { onOpenSimulator: () => void }) {
  const [active, setActive] = useState(SECTIONS[0].id);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const bodyRef = useRef<HTMLElement>(null);

  // Sections are authored inline below; show only the active page.
  useEffect(() => {
    bodyRef.current?.querySelectorAll<HTMLElement>('.learn-section').forEach((el) => { el.hidden = el.id !== active; });
    bodyRef.current?.scrollIntoView({ block: 'start' });
  }, [active]);

  const jump = (id: string) => {
    setActive(id);
    const g = SECTIONS.find((s) => s.id === id)?.group;
    if (g) setClosed((c) => { const n = new Set(c); n.delete(g); return n; });
  };
  const toggle = (name: string) => setClosed((c) => { const n = new Set(c); if (!n.delete(name)) n.add(name); return n; });

  const groups = SECTIONS.reduce<Array<{ name: string; items: Section[] }>>((acc, s) => {
    const last = acc[acc.length - 1];
    if (last && last.name === s.group) last.items.push(s);
    else acc.push({ name: s.group, items: [s] });
    return acc;
  }, []);

  const idx = SECTIONS.findIndex((s) => s.id === active);
  const prev = SECTIONS[idx - 1];
  const next = SECTIONS[idx + 1];

  return (
    <div className="learn">
      <nav aria-label="Learn contents" className="learn-toc card">
        {groups.map((g) => {
          const open = !closed.has(g.name);
          return (
            <div key={g.name} className="learn-toc-group">
              <button type="button" className="toc-head" aria-expanded={open} onClick={() => toggle(g.name)}>
                <span className="toc-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
                {g.name}
              </button>
              {open && (
                <ul>
                  {g.items.map((s) => (
                    <li key={s.id}>
                      <button type="button" className={`toc-link${s.id === active ? ' active' : ''}`} aria-current={s.id === active ? 'page' : undefined} onClick={() => jump(s.id)}>{s.title}</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

      <article className="learn-body card" ref={bodyRef}>
        {/* ------------------------------------------------------------ OVERVIEW */}
        <section id="planning" className="learn-section">
          <h2>Planning your insulation</h2>
          <p>
            The usual starting point is the <b>U-value</b>: the heat that leaks through each square metre of wall for every degree of difference between inside and outside. A lower U-value means less heat lost in winter, so lower heating bills. It is the right first number to look at, and it is what building regulations ask for.
          </p>
          <p>
            But the U-value describes a wall on a day when nothing changes. Real homes live through daily swings: cool nights, sunny afternoons, walls that warm up and cool down. How a wall handles those swings affects how the home <em>feels</em> as well as what it costs.
          </p>
          <ul>
            <li><b>Comfort:</b> a wall that passes big swings through to the inside makes rooms overheat on sunny afternoons and cool quickly in the evening. A wall that damps and delays the swings keeps the inner surface and the room air steadier.</li>
            <li><b>Running cost:</b> the larger the swings in heat flow, the harder the heating or cooling has to work to hold the room steady, and the more capacity it needs. Two walls with the same net heat loss over a day can ask very different things of the system, and the one with bigger swings may use more energy.</li>
            <li><b>Slow heating systems:</b> swings matter most with systems that respond slowly, such as wet underfloor heating, which takes hours to warm up or cool down and so can't correct a sudden gain or loss. Heat pumps running low-temperature emitters also work best at a steady, modest output. Pushing them to chase swings means higher flow temperatures and lower efficiency. A fast-responding system, such as a conventional boiler with radiators, can cope with swings more easily.</li>
          </ul>
          <p>
            So when you plan, look at the U-value for how much heat the wall keeps in, then at the <b>decrement factor</b>, <b>decrement delay</b> and <b>inner face temperatures</b> for how steady it keeps the room. Light, well-insulated walls can have an excellent U-value and a high decrement factor. Because their U-value is low, the swing that actually reaches the room is still small, but it arrives quickly. Adding thermal mass on the room side damps and delays it further. The simulator lets you test that for yourself. Each idea is explained in <button type="button" className="inline-link" onClick={() => jump('u-value')}>The U-value</button>, <button type="button" className="inline-link" onClick={() => jump('dynamic')}>Decrement factor and delay</button> and <button type="button" className="inline-link" onClick={() => jump('outputs')}>Reading the results</button>.
          </p>
        </section>

        <section id="what" className="learn-section">
          <h2>What this tool does</h2>
          <p>
            Most advice about insulation boils a wall down to a single number, the <b>U-value</b>: how much heat leaks through each square metre for every degree of temperature difference between inside and outside. That number is useful, but it describes a wall on a day when nothing changes. Real days do change. The sun comes up, the air warms and cools, and the heat takes time to travel through the materials.
          </p>
          <p>
            This simulator takes a wall or roof, made of layers you choose, and plays out a whole 24-hour day on it. You can watch the heat move through each layer over the day, and see how heavy materials such as brick or concrete soak up heat and give it back later, while light materials such as timber and mineral wool respond quickly.
          </p>
          <p>It calculates:</p>
          <ul>
            <li><b>Steady-state performance:</b> the U-value and total thermal resistance of your build-up.</li>
            <li><b>Dynamic performance:</b> how much of the outside temperature swing reaches the inside (the decrement factor) and how long it takes (the decrement delay).</li>
            <li><b>Temperatures:</b> the temperature in every slice of every layer, plus the surface temperatures on the outer and inner faces, over the day.</li>
            <li><b>Heat flow:</b> how much heat enters or leaves the room through the wall, compared with what a simple U-value calculation would predict.</li>
            <li><b>Sun:</b> how much solar radiation lands on a wall facing any bearing, or on a flat or pitched roof facing any way, for a UK location and month.</li>
            <li><b>Room response (optional):</b> if you let the room float rather than holding it at a set temperature, how the room air itself rises and falls with the wall, windows, ventilation and internal gains.</li>
          </ul>
          <Callout title="A teaching tool, not a compliance tool">
            <p>
              The weather is a smooth, idealised day built from typical UK averages, and the wall is modelled in one dimension. That is enough to show <em>why</em> things behave as they do and to compare build-ups against each other. It is not a substitute for a professional assessment, a SAP or dynamic thermal model, or any regulatory calculation. See <button type="button" className="inline-link" onClick={() => jump('limits')}>What it leaves out</button>.
            </p>
          </Callout>
          <p><button type="button" className="btn-primary" onClick={onOpenSimulator}>Open the simulator</button></p>
        </section>

        <section id="how-to-use" className="learn-section">
          <h2>Using it in four steps</h2>
          <ol className="learn-steps">
            <li>
              <b>Build the wall.</b> Start from a preset such as a modern insulated cavity wall or a Victorian solid brick wall, or add, remove and reorder layers yourself. Layers are listed from outside to inside. Set each layer's thickness.
            </li>
            <li>
              <b>Set the day.</b> Choose a UK city, a month, a type of weather, which way the wall faces and how dark its outer surface is. Then choose how the room behaves: held at a fixed temperature, on a heating schedule, or free-floating.
            </li>
            <li>
              <b>Watch the wall.</b> Press play, or drag the clock. The colours show temperature, and the arrows show which way heat is flowing and how strongly.
            </li>
            <li>
              <b>Compare.</b> The tiles and charts summarise the day. Use <em>Compare build-ups</em> to put several walls side by side under the same weather.
            </li>
          </ol>
        </section>

        {/* ------------------------------------------------------------ IDEAS */}
        <section id="heat" className="learn-section">
          <h2>Heat and temperature</h2>
          <p>
            <b>Heat</b> is energy on the move. <b>Temperature</b> is how hot something is. The two are linked by one simple rule: heat always flows from warmer places to colder places, and the bigger the temperature difference, the faster it flows.
          </p>
          <p>
            In winter your home is warmer than outside, so heat leaks out through the walls, roof, windows and floor. In summer the sun heats the outside of the building, and heat can leak in. Insulation does not create warmth or coolness. It <em>slows</em> the flow of heat down.
          </p>
          <p>
            Heat flow through a wall is measured here in <b>watts per square metre (W/m²)</b>: how much power crosses each square metre of wall. Add up the power over time and you get energy, shown here as <b>watt-hours per square metre (Wh/m²)</b>. A positive heat flow in this tool means heat heading into the room; a negative one means heat leaving it.
          </p>
        </section>

        <section id="conduction" className="learn-section">
          <h2>Conduction and R-values</h2>
          <p>
            Inside a solid wall, heat travels mainly by <b>conduction</b>: vibrating atoms pass energy to their neighbours. Some materials do this easily and some do not. A material's <b>thermal conductivity</b>, written <em>k</em> or λ and measured in W/mK, says how easily. Copper is very high, brick is moderate, and foam insulation is very low, because it traps tiny pockets of still gas that conduct poorly.
          </p>
          <p>
            For a layer of a given thickness, what matters is its <b>thermal resistance</b>, <b>R</b>: how strongly it resists heat flow. Thicker layers resist more, and lower-conductivity materials resist more:
          </p>
          <Eq>R = thickness ÷ k    (m²K/W)</Eq>
          <p>
            A 100 mm layer of insulation with k = 0.022 W/mK has R = 0.1 ÷ 0.022 ≈ 4.5 m²K/W. A 100 mm layer of brick with k = 0.8 has R = 0.125. The insulation resists heat roughly 36 times better, for the same thickness.
          </p>
          <p>
            Resistances in layers add up, just as electrical resistors in series do. Heat has to push through every layer in turn. The surfaces matter too. A thin skin of slow-moving air clings to each face of a wall and resists heat flow a little. The tool uses a standard <b>surface resistance</b> of 0.04 m²K/W outside (where wind sweeps the air film away) and 0.13 m²K/W inside, or 0.10 for a roof, where warm air rises more readily.
          </p>
        </section>

        <section id="u-value" className="learn-section">
          <h2>The U-value</h2>
          <p>Add up every resistance between inside air and outside air, including the two surface films, and invert the total. That is the U-value:</p>
          <Eq>U = 1 ÷ (R<sub>outside film</sub> + R<sub>layer 1</sub> + R<sub>layer 2</sub> + … + R<sub>inside film</sub>)    (W/m²K)</Eq>
          <p>
            A lower U-value means a better-insulated wall. The steady heat flow through it is then simply:
          </p>
          <Eq>heat flow = U × (temperature difference)</Eq>
          <p>
            <b>Worked example.</b> Take 100 mm of brick (R = 0.125) and 100 mm of insulation (R = 4.55), plus the two surface films (0.04 + 0.13 = 0.17). The total is 0.125 + 4.55 + 0.17 ≈ 4.85 m²K/W, so U ≈ 0.21 W/m²K. With 20 °C inside and 0 °C outside, the wall leaks about 20 ÷ 4.85 ≈ 4.1 W through each square metre. Those round numbers are illustrative; the simulator uses each material's own data.
          </p>
          <p>
            The U-value assumes <b>steady state</b>: that the temperatures on both sides have been constant for long enough that nothing inside the wall is still warming up or cooling down. The rest of this page, and most of this tool, is about what happens when they are not.
          </p>
        </section>

        <section id="mass" className="learn-section">
          <h2>Thermal mass</h2>
          <p>
            Every material stores heat. To warm a kilogram of brick by one degree takes energy; cooling it by one degree gives that energy back. How much a material stores is set by its <b>density</b> and its <b>specific heat capacity</b>, how much energy one kilogram needs per degree. Multiply the two by the volume and you have the layer's <b>heat capacity</b>, in joules per kelvin.
          </p>
          <Eq>heat capacity of a layer = density × specific heat × thickness    (per m² of wall)</Eq>
          <p>
            Think of a wall as a series of buckets joined by narrow pipes. The pipes are the resistances. The buckets are the thermal mass. Pour water in at one end and the first bucket fills first, then the next, and the flow out the far end starts late and is smoothed out. A wall with big buckets (heavy masonry) responds slowly and gently. A wall with tiny buckets (a lightweight frame with mineral wool) lets changes straight through.
          </p>
          <p>
            Where the mass sits matters as much as how much there is. Mass <b>on the room side</b> of the insulation can exchange heat with the room, so it evens out room temperature. Mass on the outside of the insulation barely meets the room at all. The tool reports <b>inner thermal mass</b> to show how much sits on the room side of the main insulation layer, within 100 mm.
          </p>
        </section>

        <section id="dynamic" className="learn-section">
          <h2>Decrement factor and delay</h2>
          <p>
            When the outside temperature rises and falls over a day, a wall with thermal mass does two things to that rhythm. It makes the swing <b>smaller</b> and it makes it <b>arrive later</b>. Engineers give these two effects names:
          </p>
          <ul>
            <li>
              <b>Decrement factor</b> (between 0 and 1): the fraction of the outside heat swing that still shows up at the inner face. 0.3 means only 30% gets through. Lower is better in summer.
            </li>
            <li>
              <b>Decrement delay</b> (in hours): the delay between the outside peak and the peak of heat flow at the inner face. You will also see this called "time lag". A decrement delay of 8 hours means the heat from a 3 pm peak arrives at 11 pm.
            </li>
          </ul>
          <LagFigure />
          <p>
            Compare this to a steady-state calculation, which has no memory and no delay. It would say the heat flow follows the outside temperature instantly. The chart called <em>Heat flow into the room</em> shows both: the dashed grey line is the steady-state estimate, and the blue line is what the simulation produces once thermal mass is accounted for.
          </p>
          <p>
            Good insulation and good thermal mass do different jobs. Insulation (a low U-value) shrinks the overall flow. Mass shrinks and shifts the daily <em>swing</em> in that flow. A wall can be strong at one and weak at the other, which is why this tool shows both.
          </p>
          <p>
            The decrement factor is a share of the swing the wall <em>would</em> pass with no mass, which is U × the outside swing. So the swing that actually reaches the room is decrement factor × U × the outside swing. A lightweight, well-insulated wall can have a high decrement factor and still pass only a small swing, because its U-value is small. Compare the heat-flow chart, not the factor alone, when U-values differ a lot.
          </p>
        </section>

        <section id="sun" className="learn-section">
          <h2>Sun, and sol-air temperature</h2>
          <p>
            The air temperature alone does not describe what a wall experiences outside. A dark wall in sunshine can be far hotter than the air next to it, and in winter it gains useful warmth. A clear night sky, meanwhile, can pull heat off a flat roof.
          </p>
          <p>
            Rather than model the sun separately, building physics uses a neat shortcut, the <b>sol-air temperature</b>: a made-up outdoor temperature that would push the same amount of heat into the wall as the real air temperature <em>plus</em> the real sunshine does together. It is the air temperature plus a bonus for the heat the surface absorbs from the sun:
          </p>
          <Eq>sol-air = air temperature + (absorptance × sunshine × R<sub>outside film</sub>)</Eq>
          <p>
            <b>Absorptance</b> is how much of the sun's energy the surface soaks up: about 0.3 for pale colours, 0.55 for mid tones and 0.85 for dark ones. As an example, a mid-coloured wall in 500 W/m² of sunshine gets 0.55 × 500 × 0.04 = 11 K of bonus on top of the air temperature. A dark wall would get 17 K.
          </p>
          <p>
            That is why the same wall behaves so differently facing south or north, in a heatwave or under cloud, painted white or painted black.
          </p>
        </section>

        <section id="inner-face" className="learn-section">
          <h2>The inner face and comfort</h2>
          <p>
            The <b>inner face</b> is the surface of the wall inside the room. Its temperature matters for three reasons.
          </p>
          <ul>
            <li>
              <b>Comfort.</b> You feel the temperature of surfaces as well as of the air. A cold wall draws heat from your body by radiation and creates cold draughts at its surface. A rough guide is that the temperature you feel is about the average of the air and surrounding surfaces. A wall several degrees colder than the air makes the room feel colder than the thermostat says.
            </li>
            <li>
              <b>Condensation and mould.</b> Warm indoor air holds moisture. When it touches a surface colder than its dew point, the moisture condenses, and persistently damp surfaces grow mould. A better-insulated wall has a warmer inner face, and that is a big part of why insulation reduces mould risk. The heat simulation does not model moisture itself, but the inner face temperature is the thing to watch, and the Moisture tab tests it directly: see <button type="button" className="inline-link" onClick={() => jump('moist-condensation')}>Condensation: surface and interstitial</button>.
            </li>
            <li>
              <b>Heat flow.</b> The gap between the room air and the inner face is directly proportional to how much heat flows through the inside film. When the room air is held steady, the inner face temperature and the heat flow are two views of the same signal.
            </li>
          </ul>
        </section>

        <section id="rooms" className="learn-section">
          <h2>Heating modes</h2>
          <p>The room on the inside can behave in three ways in this tool.</p>
          <dl className="learn-dl">
            <dt>Fixed temperature</dt>
            <dd>
              The room air is held at one temperature all day, as if by a perfect thermostat. No real heating system holds a room that steadily, so treat this as a controlled experiment, not a prediction. Because the room never moves, any change you see comes from the wall alone. That makes it the cleanest way to compare walls.
            </dd>
            <dt>Time schedule</dt>
            <dd>
              The room alternates between a <em>comfort</em> temperature when the heating is on and a <em>setback</em> temperature when it is off, with up to two on-periods a day (for instance morning and evening). It is still idealised, because the room jumps to its target instantly, but it shows how a wall's mass interacts with a heating pattern.
            </dd>
            <dt>Free-floating room</dt>
            <dd>
              No heating or cooling. The room air is free to rise and fall, driven by the wall, any windows, ventilation, and the heat from people and appliances. A heavy wall can stop the room from overheating in a heatwave, or fail to, depending on ventilation and glazing. This is the most realistic of the three for showing passive behaviour such as summer overheating.
            </dd>
          </dl>
        </section>

        <section id="outputs" className="learn-section">
          <h2>Reading the results</h2>
          <table className="learn-table">
            <thead>
              <tr><th>Result</th><th>What it means</th></tr>
            </thead>
            <tbody>
              <tr><td>U-value</td><td>Steady-state heat loss per square metre per degree. Lower is better insulated.</td></tr>
              <tr><td>Decrement factor</td><td>Share of the outside heat swing reaching the inner face. Lower damps more.</td></tr>
              <tr><td>Decrement delay</td><td>Hours between the outside peak and the inner heat-flow peak.</td></tr>
              <tr><td>Inner thermal mass</td><td>Heat storage on the room side of the main insulation, kJ/m²K. Whole-wall mass is shown beneath.</td></tr>
              <tr><td>Inner face</td><td>The lowest and highest inner surface temperature over the day.</td></tr>
              <tr><td>Net heat flow, 24 h</td><td>Heat gained minus heat lost through the wall over the day. Positive means a net gain to the room.</td></tr>
              <tr><td>Room air, peak delay</td><td>Free-floating mode only: the room's own temperature range, and how far behind the outdoor peak it runs.</td></tr>
            </tbody>
          </table>
          <h3>The wall diagram</h3>
          <p>
            Each slice of each layer is coloured by its temperature. The scale is anchored on the room temperature, so blue always means colder than the room, red always warmer, and cream about the same, whichever scenario you are looking at. Arrows show heat flow through each slice: pointing right means towards the room, and a thicker arrow means more heat. When the arrows are different on either side of a layer, that layer is storing or releasing heat.
          </p>
          <h3>The charts</h3>
          <ul>
            <li><b>Temperatures:</b> air, sol-air, both wall faces and the room, over 24 hours.</li>
            <li><b>Heat flow into the room:</b> the simulation against the steady-state estimate.</li>
            <li><b>Sunshine on this face:</b> the solar radiation reaching the wall.</li>
            <li><b>Heat map:</b> temperature through the depth of the wall (vertical) against time (horizontal), so you can see the heat wave travel inwards.</li>
          </ul>
          <h3>Why the swings matter, not just the net</h3>
          <p>
            Two walls can have the same net heat flow over 24 hours and still behave very differently. If the heat flow into the room swings widely, the heating or cooling system has to ramp up and down quickly to hold the room steady, and it needs enough capacity to cover the peaks. A wall with small swings asks for a gentle, steady output instead.
          </p>
          <p>
            Swings can also raise the energy used, not only the peak power. If the wall gives heat in the afternoon and loses it overnight, the net can be close to zero while the room still needs cooling at one time and heating at another. Heating and cooling can't cancel each other out, so you pay for both. Systems also tend to run less efficiently when working hard or cycling on and off. On the other hand, if the swings are small enough for the room to ride through without the system switching on, they cost nothing. This is why a low decrement factor and a suitable decrement delay are worth looking at alongside the U-value.
          </p>
        </section>

        {/* ------------------------------------------------------------ UNDER THE HOOD */}
        <section id="sim-overview" className="learn-section">
          <h2>The simulation at a glance</h2>
          <p>
            Everything is calculated in your browser. There is no server and no stored weather file. In outline:
          </p>
          <ol className="learn-steps">
            <li>Build one synthetic day of outdoor air temperature and of sunshine on the chosen face.</li>
            <li>Combine them into the sol-air temperature that drives the outside of the wall.</li>
            <li>Cut the wall into thin slices, each with a resistance to its neighbours and a heat capacity.</li>
            <li>Starting from a sensible guess, step forward in two-minute intervals, working out how heat shifts between slices.</li>
            <li>Repeat the same day several times until the pattern settles down, then record the last one.</li>
            <li>Derive the summary numbers (U-value, decrement factor, decrement delay, and so on) from the recorded day.</li>
          </ol>
        </section>

        <section id="sim-weather" className="learn-section">
          <h2>1. Building the day</h2>
          <p>
            The outdoor air temperature is a smooth wave with one peak and one trough each day. It peaks at 15:00 and is coolest 12 hours earlier, at 03:00:
          </p>
          <Eq>T<sub>air</sub>(h) = T<sub>mean</sub> + (swing ÷ 2) × cos( 2π × (h − 15) ÷ 24 )</Eq>
          <p>The mean and the swing are assembled from a few small tables of typical UK figures:</p>
          <ul>
            <li><b>Monthly mean temperature:</b> from 4.5 °C in January to 17 °C in July.</li>
            <li><b>Daily range:</b> from about 4.5 K in December to 10 K in summer.</li>
            <li><b>City offset:</b> a fixed adjustment from +1.2 K for London to −2 K for Aberdeen.</li>
            <li><b>Weather type:</b> shifts the mean (for example +7 K for a heatwave, −6 K for a cold snap), scales the daily range, and sets the <em>clearness</em> of the sky from 0 (fully overcast) to 1 (cloudless).</li>
          </ul>
          <p>
            The monthly figures are typical long-term averages and the offsets are approximate. This is a synthetic design day, not recorded weather. Real days have clouds drifting across, changing winds and fronts moving through, none of which appear here.
          </p>
        </section>

        <section id="sim-solar" className="learn-section">
          <h2>2. Sun on the surface</h2>
          <p>For each moment of the day, the tool works out how much sunshine lands on a square metre of the chosen surface. It does this in four stages.</p>
          <ol className="learn-steps">
            <li>
              <b>Where the sun is.</b> From the day of the year it finds the sun's declination (how far north or south of the equator it is overhead), using δ = 23.45° × sin(2π(284 + day) ÷ 365). With the latitude of the chosen city and the time of day it then calculates the sun's height above the horizon and its compass direction.
            </li>
            <li>
              <b>How much gets through the atmosphere.</b> Sunlight loses strength passing through air, and more so when the sun is low, because the path is longer. The direct beam on a clear day is 1361 × 0.7<sup>AM<sup>0.678</sup></sup> W/m², where AM, the air mass, is roughly 1 ÷ sin(sun height). 1361 W/m² is the sunlight strength above the atmosphere. This is a simple standard approximation (a Meinel-type model).
            </li>
            <li>
              <b>Cloud.</b> The weather's clearness <em>c</em> weakens the direct beam by c<sup>1.3</sup> and adds sky light (diffuse radiation) that grows as the sky gets cloudier.
            </li>
            <li>
              <b>Onto the surface.</b> The direct beam is multiplied by the cosine of the angle between the sun and the wall's surface direction, so a wall facing away from the sun receives none of it. Diffuse sky light is spread evenly across the sky dome, and the wall sees the part of the dome in front of it. The ground reflects 20% of the light reaching it, and a wall sees half the ground, so it receives 10% of that light. A roof tilts the surface: its angle to the sun mixes the sun's height and its bearing against the slope's pitch and facing, so a flat roof follows the sun's height alone and a south-facing pitched roof catches more winter sun than a flat one. A tilted surface sees more sky and less ground the flatter it is.
            </li>
          </ol>
          <p>
            Together these give a total irradiance in W/m² every two minutes, which is the figure in the Sunshine chart and in the "Sun on surface" readout. Because it comes from clear-sky geometry scaled by a clearness factor, the curve is always smooth. Real cloud makes it jagged.
          </p>
        </section>

        <section id="sim-solair" className="learn-section">
          <h2>3. Sol-air temperature</h2>
          <p>The outside driving temperature is then:</p>
          <Eq>T<sub>sol-air</sub> = T<sub>air</sub> + α × I × R<sub>se</sub>    (walls)</Eq>
          <p>
            where α is the surface absorptance (0.3, 0.55 or 0.85), <em>I</em> is the irradiance from step 2 and R<sub>se</sub> is the 0.04 m²K/W outside surface film. For a roof there is one further term: a long-wave radiation correction of −3.6 × clearness (in kelvin) on a flat roof, representing heat radiated away to the sky, scaled by the cosine of the pitch for a sloping one. It is applied all day and night, and scales with clearness: about −3.4 K on a clear day and about −0.5 K when overcast. Walls get no such term, because they face the ground and surrounding buildings as much as the sky.
          </p>
          <p>
            From here on, the outside of the wall is treated as if it sat in air at exactly the sol-air temperature, connected to the wall's outer surface through the outside film resistance.
          </p>
        </section>

        <section id="sim-slices" className="learn-section">
          <h2>4. Slicing the wall</h2>
          <p>
            Each layer is divided into thin slices (<b>cells</b>): thinner for masonry such as brick and concrete, which stores most of the heat, and thicker for light insulation, which stores little. A layer with conductivity above 0.4 W/mK gets a slice about every 15 mm, and anything else about every 40 mm, with a minimum of 2 and a maximum of 14 slices per layer. Dense, low-conductivity materials such as wood fibre board and hempcrete are the exception: heat soaks into them only a few centimetres over a day, so 40 mm slices are coarse for them, and the tool slightly overstates their damping (its decrement factor comes out about 0.01–0.015 too low). Each slice is described by two numbers:
          </p>
          <ul>
            <li>
              <b>A heat capacity</b>, C = density × specific heat × slice thickness (J/m²K), the size of its bucket.
            </li>
            <li>
              <b>A conductance to each neighbour</b>, the reciprocal of resistance. Heat travels from the middle of one slice to the middle of the next, so the resistance between the two is the sum of half of each slice's own resistance: G = 1 ÷ (dx<sub>1</sub>/2k<sub>1</sub> + dx<sub>2</sub>/2k<sub>2</sub>).
            </li>
          </ul>
          <p>
            The first slice connects to the outside through the outside film (R<sub>se</sub>), and the last to the room through the inside film (R<sub>si</sub>). Air layers hold almost no heat and are given a fixed resistance whatever their width: 0.18 m²K/W for a plain cavity, 0.66 or 0.72 for one with one or two foil faces. Multifoils also use their declared fixed resistance. A <b>ventilated gap</b>, such as a tile batten void, also exchanges heat directly with the outdoor air at a fixed 5 W/m²K, so the layers outside it count for less. Each slice is assumed to be at a single temperature, and the heat flows between neighbours are one-dimensional: straight through the thickness of the wall.
          </p>
        </section>

        <section id="sim-balance" className="learn-section">
          <h2>5. Heat balance in each slice</h2>
          <p>
            For every slice, the rule is conservation of energy: <b>the rate at which its stored heat changes equals the heat flowing in minus the heat flowing out.</b> A slice's temperature rises when more heat arrives from one side than leaves on the other:
          </p>
          <Eq>
            C<sub>i</sub> × dT<sub>i</sub>/dt = G<sub>i−1</sub> (T<sub>i−1</sub> − T<sub>i</sub>) + G<sub>i</sub> (T<sub>i+1</sub> − T<sub>i</sub>)
          </Eq>
          <p>
            For the outermost slice, the outside neighbour is the sol-air temperature. For the innermost, it is the room air. This is the discrete form of the one-dimensional heat equation. Because it is written for every slice at once, it makes a set of linked equations, one per slice.
          </p>
        </section>

        <section id="sim-stepping" className="learn-section">
          <h2>6. Stepping through time</h2>
          <p>
            The day is cut into 720 steps of two minutes. At each step the tool must find all the new slice temperatures from the old ones. It uses the <b>implicit (backward Euler)</b> method, where the heat flows are evaluated using the <em>new</em> temperatures, so the equation for each slice becomes:
          </p>
          <Eq>(C<sub>i</sub> ÷ Δt) (T<sub>i</sub><sup>new</sup> − T<sub>i</sub><sup>old</sup>) = G<sub>i−1</sub> (T<sub>i−1</sub><sup>new</sup> − T<sub>i</sub><sup>new</sup>) + G<sub>i</sub> (T<sub>i+1</sub><sup>new</sup> − T<sub>i</sub><sup>new</sup>)</Eq>
          <p>
            This looks circular, since the new temperatures appear on both sides, but each slice only touches its two neighbours, so the whole set can be solved quickly and exactly by a standard routine for tridiagonal systems (the Thomas algorithm). The implicit method is chosen because it stays stable however thin the slices or long the step. A simpler explicit scheme can blow up with thin, conductive slices.
          </p>
          <h3>Starting up and settling</h3>
          <p>
            The wall has to begin from some state. The tool starts it at the steady-state temperature profile for the day's <em>average</em> outside and inside temperatures, then repeats the same day again and again. In free-floating mode the room starts at the temperature where its gains and losses balance over the day. After a few days the wall has "forgotten" its starting guess and settles into a repeating daily cycle. It runs 6 days for the fixed and scheduled modes, and 14 days for the free-floating mode, where the room has to settle too. Only the final day is recorded: 144 snapshots, one every 10 minutes, plus a closing 24:00 frame.
          </p>
          <p>
            That settled cycle is what you see. A real wall's temperatures also depend on what happened over previous days and weeks. This tool shows the repeating pattern you would get if every day were the same.
          </p>
        </section>

        <section id="sim-room" className="learn-section">
          <h2>7. The room</h2>
          <h3>Fixed and schedule modes</h3>
          <p>
            The room air temperature is simply prescribed for each time step: a constant, or, for the schedule, the comfort or setback value depending on whether the clock falls inside one of the two heating periods. The room is therefore an input, and the model only calculates what the wall does. In schedule mode the room's own daily swing would otherwise show up in the heat flow, so the decrement factor and decrement delay come from a second run with the room held steady.
          </p>
          <h3>Free-floating mode</h3>
          <p>
            Now the room air temperature is an <em>unknown</em> too. The room is treated as a single lump of air and furniture with one temperature and one heat capacity, and given its own energy balance:
          </p>
          <Eq>C<sub>room</sub> × dT<sub>room</sub>/dt = heat from the wall + (heat through the other fabric, windows and ventilation) + solar gain through the glazing + internal gains</Eq>
          <p>The ingredients come from the sliders:</p>
          <ul>
            <li>
              <b>Room heat capacity</b> = air volume × 1.2 kg/m³ × 1005 J/kgK, plus the floor area × the contents' thermal mass (50, 120 or 250 kJ/m²K). The ceiling height is fixed at 2.5 m.
            </li>
            <li>
              <b>Ventilation loss</b> = 0.33 W per m³/h per kelvin × air changes per hour × room volume. This is the standard building-physics shortcut for heating incoming air.
            </li>
            <li>
              <b>Glazing</b> conducts heat with a fixed U-value of 1.4 W/m²K, and lets in sunshine equal to the glazing area × the transmittance factor (<em>g</em> = 0.25, 0.5 or 0.7) × the irradiance on that face.
            </li>
            <li>
              <b>Other external fabric</b> of the room is treated as the same build-up as the modelled wall, at its steady-state U-value, with no sun and no storage of its own.
            </li>
            <li>
              <b>Internal gains</b> (people, appliances, lighting) are a constant in watts.
            </li>
          </ul>
          <p>
            In each time step, the wall equations and the room equation are solved together. This is possible because the wall's response to the room temperature is a fixed relationship that can be worked out once. As in schedule mode, the decrement factor and decrement delay shown are measured separately, in a second run with the room held steady, since they describe the wall itself, not the room.
          </p>
        </section>

        <section id="sim-metrics" className="learn-section">
          <h2>8. Working out the results</h2>
          <h3>Surface temperatures and heat flow</h3>
          <p>
            Slice temperatures are at slice centres. The face temperatures are found by balancing the heat flow across half a slice with the heat flow across the surface film on that side, which sets the surface temperature between the slice centre and the air temperature on that side. The heat flow into the room is:
          </p>
          <Eq>q = (T<sub>inner face</sub> − T<sub>room</sub>) ÷ R<sub>si</sub>    (negative values are flowing out of the room)</Eq>
          <h3>U-value</h3>
          <p>
            The U-value is calculated directly, as 1 ÷ the sum of all layer resistances and the two surface films, as explained above. It is not the result of the simulation. With a ventilated gap, the path through the layers outside the gap runs in parallel with the gap's direct link to outdoor air, and the U-value is worked out from that combination.
          </p>
          <h3>Decrement factor and delay</h3>
          <p>
            A day-long cycle can be broken into a simple, once-a-day cosine wave (its <em>first harmonic</em>) plus faster ripples. The tool fits that daily wave to both the sol-air temperature and the heat flow at the inner face, using a discrete Fourier sum, and compares them:
          </p>
          <Eq>decrement factor = (amplitude of inner heat flow) ÷ (U × amplitude of sol-air temperature)</Eq>
          <Eq>decrement delay = how many hours the inner heat-flow wave peaks after the sol-air wave</Eq>
          <p>
            The denominator is the swing in heat flow you would get with no thermal mass at all, so the ratio says how much of that swing survives.
          </p>
          <h3>Steady-state comparison</h3>
          <p>
            The dashed line in the heat-flow chart is U × (sol-air − room temperature), calculated for each moment. It is the answer a simple U-value calculation would give, with no delay and no storage, from exactly the same outside and room temperatures.
          </p>
          <h3>Energy totals</h3>
          <p>
            The positive and negative parts of the heat flow are added up separately over the 24 hours to give the Wh/m² gained and lost, and the day's sunshine is added up in kWh/m².
          </p>
          <h3>Thermal mass figures</h3>
          <p>
            The tool finds the layer with the highest resistance (normally the insulation) and adds up the heat capacity of the material between it and the room, up to a depth of 100 mm. That is the <em>inner thermal mass</em>. The whole-wall figure simply totals every layer.
          </p>
          <h3>Colours and arrows</h3>
          <p>
            The colour scale is symmetrical about the average room temperature, wide enough to hold the hottest and coldest slice temperatures of the day (and never less than ±2 K). The arrows are the heat flow across each cell boundary, scaled against the largest flow found anywhere in the wall over the day.
          </p>
        </section>

        <section id="limits" className="learn-section">
          <h2>What it leaves out</h2>
          <p>Every model is a simplification. These are the main ones here, so you know how far to trust the numbers.</p>
          <ul>
            <li><b>Synthetic weather.</b> A smooth idealised day from typical monthly averages, repeated until it settles. No clouds passing, no wind, no multi-day cold spells or heatwaves building up. Temperature and sunshine are set independently by the weather type rather than linked physically.</li>
            <li><b>One dimension.</b> Heat is assumed to flow straight through a uniform, infinite wall. Real walls have timber studs, mortar joints, wall ties, lintels, window reveals and corners. These <em>thermal bridges</em> let heat bypass the insulation and can raise real heat loss noticeably.</li>
            <li><b>No moisture in the heat simulation.</b> Damp materials conduct heat better and store more of it, and evaporation and condensation absorb or release heat. None of that is modelled here, and the Moisture tab does not feed back into the heat results either. Vapour movement and condensation are handled separately, with their own limits: see <button type="button" className="inline-link" onClick={() => jump('mlimits')}>What the moisture model leaves out</button>.</li>
            <li><b>Little air movement in the wall.</b> Sealed cavities act as a fixed resistance. A ventilated gap is linked to outdoor air at one fixed rate, whatever the wind. Convection within cavities and air leakage through gaps are not modelled.</li>
            <li><b>Fixed surface films.</b> The outside film is the same whatever the wind speed. The inside film is fixed too, rather than varying with temperature difference, and radiation between room surfaces is not tracked separately from convection.</li>
            <li><b>Constant material properties.</b> Conductivity, density and heat capacity do not vary with temperature or age.</li>
            <li><b>Idealised heating.</b> In fixed and schedule modes the room reaches its target instantly, and no limits on heating power are modelled.</li>
            <li><b>A simple room.</b> The free-floating model is one lump with one temperature. There is no stratification, no other rooms, no floor or ground coupling, glazing is a single area with a fixed U-value, and sunlight through windows is spread into the room's air rather than falling on particular surfaces.</li>
            <li><b>One sunlit face.</b> Only the modelled wall and its glazing see the sun. The "other external fabric" does not.</li>
          </ul>
          <Callout title="How to use it well">
            <p>
              Use it for <b>comparisons</b> (this wall against that wall under the same conditions) and for building intuition about <em>why</em> mass, insulation and orientation matter. Treat the absolute temperatures and energy totals as illustrative.
            </p>
          </Callout>
        </section>

        {/* ------------------------------------------------------------ MOISTURE: IDEAS */}
        <section id="moist-what" className="learn-section">
          <h2>What the moisture tab does</h2>
          <p>
            The heat simulation asks how warm the wall gets. The <b>Moisture over a year</b> tab asks a different question: <em>can water build up inside this wall?</em> Water in a wall rots timber, damages brick and stone when it freezes, ruins insulation and grows mould, and many problems with insulating old buildings come from getting this wrong.
          </p>
          <p>
            You pick up to four build-ups, set a location, the room temperature, how much moisture the household produces, how exposed the wall is to rain and whether the ground at its base is wet. The tool then simulates a typical UK year in two-hour steps, year after year until it settles, and shows:
          </p>
          <ul>
            <li><b>Whether liquid water collects inside the wall,</b> in which layer, and how much, whether it comes from indoor vapour condensing, rain soaking in or damp rising from the ground.</li>
            <li><b>Whether that water dries out again</b> in the summer, or stays from one year to the next.</li>
            <li><b>Whether timber and fibre layers get wet enough to rot,</b> and whether the inner surface is damp enough for mould.</li>
            <li><b>Which way moisture is moving</b> through each layer, month by month, with animated arrows.</li>
          </ul>
          <Callout title="A screening tool, not a full hygrothermal study">
            <p>
              It follows both vapour and liquid water, with each material's own ability to wick and store moisture, so a lime render and a cement render behave differently. But the weather is a typical year built from monthly averages, the material data are typical values rather than measured for a product, and cracks and air leaks are not modelled. Use it to compare build-ups and to spot ones worth worrying about. See <button type="button" className="inline-link" onClick={() => jump('mlimits')}>What the moisture model leaves out</button>.
            </p>
          </Callout>
        </section>

        <section id="moist-vapour" className="learn-section">
          <h2>Vapour, humidity and vapour pressure</h2>
          <p>
            Air always carries some water as an invisible gas, <b>water vapour</b>. There are two ways to describe how much:
          </p>
          <ul>
            <li><b>Relative humidity (RH)</b> is how full the air is, as a percentage of the most it could hold <em>at its current temperature</em>.</li>
            <li><b>Vapour pressure</b>, in pascals (Pa), is how much vapour is actually there. It is the pressure that the water vapour molecules alone exert.</li>
          </ul>
          <p>
            Warm air can hold far more vapour than cold air. The most it can hold, called the <b>saturation vapour pressure</b>, is about 610 Pa at 0 °C, 1230 Pa at 10 °C and 2340 Pa at 20 °C. So the same RH means very different amounts of water at different temperatures.
          </p>
          <p>
            Vapour moves from where the vapour pressure is high to where it is low, just as heat flows from warm to cold. It does this whatever the relative humidity. That is why a wall can be driving vapour <em>outwards</em> in winter even though the air outside feels damper:
          </p>
          <ul>
            <li>Outside on a January day: 4.5 °C at 89% RH is only about <b>750 Pa</b>, because cold air holds so little.</li>
            <li>Inside: 20 °C at 50% RH is about <b>1170 Pa</b>, and the household keeps adding more (cooking, breathing, washing).</li>
          </ul>
          <p>
            The room has roughly half as much vapour again as the air outside, so vapour drifts out through the wall. In summer the difference is small. It only reverses when something raises the vapour pressure on the outside, for example sun shining on a rain-soaked wall. See <button type="button" className="inline-link" onClick={() => jump('moist-rain')}>Rain and ground moisture</button>.
          </p>
        </section>

        <section id="moist-mu" className="learn-section">
          <h2>Vapour resistance: µ and sd</h2>
          <p>
            Materials resist the passage of vapour much as they resist heat. Each material has a <b>vapour resistance factor, µ</b> (pronounced "mu"), which says how many times harder the vapour finds it to get through the material than through still air of the same thickness. Still air is µ = 1. Typical values:
          </p>
          <table className="learn-table">
            <thead><tr><th>Material</th><th style={{ textTransform: 'none' }}>µ</th></tr></thead>
            <tbody>
              <tr><td>Mineral wool, sheep's wool, cellulose</td><td>1–2</td></tr>
              <tr><td>Wood fibre board</td><td>about 3–5</td></tr>
              <tr><td>Brick, lime plaster</td><td>about 10–16</td></tr>
              <tr><td>Softwood timber</td><td>about 50</td></tr>
              <tr><td>EPS, unfaced PIR foam board</td><td>about 50–60</td></tr>
              <tr><td>Foil-faced PIR board</td><td>effectively infinite (the foil facings)</td></tr>
              <tr><td>Hard, dense limestone</td><td>about 200 (soft limestones are far lower)</td></tr>
              <tr><td>Metal, glass, foil-faced products</td><td>effectively infinite</td></tr>
            </tbody>
          </table>
          <p>
            To compare layers of different thickness, multiply by the thickness to get the <b>equivalent air thickness, sd</b>, in metres. It is the thickness of still air that would resist vapour equally:
          </p>
          <Eq>sd = µ × thickness    (m)</Eq>
          <p>
            100 mm of unfaced PIR (µ 60) is sd = 6 m: as much resistance as six metres of air. Most PIR boards sold in the UK are foil-faced, which makes them effectively vapour-tight. The tool has both: "PIR / PUR board, foil-faced" for those, and "PIR / PUR board, unfaced" for bare boards, which let far more vapour through. A foil-faced board's resistance only holds if its joints are taped; gaps and unsealed edges let vapour and moist air past it. 80 mm of wood fibre (µ about 5) is only sd = 0.4 m. Like R-values, sd values in layers add up. The material picker shows µ where the tool has a figure. Many materials list two values, a <b>dry-cup</b> one and a <b>wet-cup</b> one, because materials such as wood fibre and lime let vapour through more easily when damp.
          </p>
          <p>
            Layers with no µ in the tool's data are treated as fully open (µ = 1) and flagged on the page.
          </p>
        </section>

        <section id="moist-condensation" className="learn-section">
          <h2>Condensation: surface and interstitial</h2>
          <p>Moisture does damage in the wall in two places.</p>
          <dl className="learn-dl">
            <dt>On the inner surface</dt>
            <dd>
              Air touching a surface cools towards the surface's temperature. If that pushes it past what the air can hold, water condenses. Even before that, mould can grow when the air at the surface stays above about <b>80% RH</b> for long periods. A colder inner face (a poorly insulated wall) means higher surface humidity, which is why the inner-face temperature on the heat tab matters. The Moisture tab charts the surface RH for every month and marks the 80% line.
            </dd>
            <dt>Inside the wall: interstitial condensation</dt>
            <dd>
              Vapour does not stop at the inner surface. It diffuses into the wall, moving through the layers as the temperature falls. The cooler the layer, the less vapour the air in it can hold. If vapour pressure reaches that limit at a boundary between two layers, water condenses there, out of sight.
            </dd>
          </dl>
          <PressureFigure />
          <p>
            Where does condensation happen? It needs <b>vapour to reach a cold boundary</b>, so what matters is which layers let vapour in and which let it out.
          </p>
          <ul>
            <li>A <b>vapour-tight layer</b> (foam board, foil) stops most vapour entering the wall at all. Little water condenses behind it. But anything already in the wall, from rain or the ground, can't escape inwards, and gaps and air leaks around the boards can still carry moist air to the cold face.</li>
            <li>A <b>vapour-open layer</b> (wood fibre, lime plaster) lets room vapour through to the cold boundary behind it, so some condensation is likely in winter. It also lets the wall dry back into the room in spring and summer.</li>
          </ul>
          <p>
            Neither is simply "safe". What matters is whether the water that arrives in winter leaves again, and what the materials around it can tolerate. That is what the yearly simulation tests.
          </p>
        </section>

        <section id="moist-absorb" className="learn-section">
          <h2>Absorbent and wicking materials</h2>
          <p>
            Many traditional materials, such as wood fibre, cork, wool, timber, lime, clay, brick and stone, are <b>hygroscopic</b>: they take up moisture from damp air and give it back when the air dries. How much each holds at a given humidity is its <b>sorption curve</b>. The tool stores moisture in every layer along its own curve, so an absorbent layer buffers winter dampness instead of letting it collect as free water at a boundary.
          </p>
          <p>
            Porous mineral materials also <b>wick</b>: liquid water moves through their fine pores by capillary suction, from wetter to drier, much faster than vapour can diffuse. How strongly is measured by the <b>water absorption coefficient, A</b>: the water a face soaks up from contact with water, in kg/m² per square root of time.
          </p>
          <table className="learn-table">
            <thead><tr><th>Material</th><th>A, kg/(m²·s<sup>½</sup>)</th></tr></thead>
            <tbody>
              <tr><td>Calcium silicate board</td><td>about 1</td></tr>
              <tr><td>Soft and stock brick</td><td>about 0.25–0.3</td></tr>
              <tr><td>Gypsum plaster and plasterboard</td><td>about 0.3</td></tr>
              <tr><td>Solid brick, porous limestone</td><td>about 0.15–0.2</td></tr>
              <tr><td>Lime render and plaster</td><td>about 0.06–0.08</td></tr>
              <tr><td>Lime-cement render</td><td>about 0.03</td></tr>
              <tr><td>Cement render, concrete</td><td>about 0.01–0.02</td></tr>
              <tr><td>Granite, foam boards, mineral wool</td><td>effectively 0</td></tr>
            </tbody>
          </table>
          <p>
            This is why a lime render behaves so differently from a cement one on an old solid wall, although their µ values are close. Water that gets into the brick behind a lime render is wicked back out to the face, where it evaporates. A cement render wicks so slowly that the water must leave as vapour, through a layer that resists it, so the brick behind it stays wetter for longer. No rule about "breathable" materials is involved: it follows from each material's A, its sorption curve and its µ.
          </p>
          <p>
            For <b>organic</b> layers (wood fibre, cork, wool, hemp, cellulose, timber boards and similar) the tool also reports the peak <b>moisture content</b>, as a percentage of dry mass, averaged over the 10 mm at the layer's wetter face. It uses <b>18%</b> as the limit, a cautious figure: about 20% is usually quoted for the onset of rot in timber. Mineral materials are not given a limit, because no single threshold fits their frost and salt risks.
          </p>
        </section>

        <section id="moist-rain" className="learn-section">
          <h2>Rain and ground moisture</h2>
          <p>
            Old solid walls are rarely wetted only by indoor vapour. Rain soaks the outer face, and moisture can rise from the ground. You can set both on the tab.
          </p>
          <dl className="learn-dl">
            <dt>Rain exposure</dt>
            <dd>
              Sheltered (urban, trees), moderate, exposed (hill, coast, south-west face) or severe. It sets how much of the month's rain actually lands on the wall: 5%, 15%, 30% or 50%. The rain falls as showers, and the outer face takes up only what its own capillarity allows. The rest runs off. Open brick soaks up most of a shower, a cement render less, granite and foam boards almost nothing.
            </dd>
            <dt>Ground moisture</dt>
            <dd>
              Dry ground or a working DPC, wet in winter, or wet all year: liquid water is available at the base of the wall from November to March, or all year. A damp-proof course (DPC) that works stops it reaching the wall above, which the tool treats the same as dry ground. The wet options assume there is none, or that it has failed or is bridged, for instance by render, raised ground or a path running over it. This is what is often called rising damp, a term worth using carefully: damp low on a wall is frequently condensation, rain getting in, raised ground or paths bridging the base, a leak, or salts drawing moisture from the air, so rule those out first. It is drawn up by capillary flow into the run of wicking layers from the outside, such as brick and stone, up to the first layer that doesn't wick, such as insulation. How far it rises depends on how well those layers wick and how fast the wall can dry: a vapour-tight render or internal insulation slows the drying, so the damp rises higher. The tool reports that height, and its results are for the wall 1 m above the footing.
            </dd>
          </dl>
          <p>
            Once in the wall, that water spreads by wicking and leaves by evaporating, either outward through the face or inward towards the room. In sunshine a wet face warms, its vapour pressure rises, and in summer it can exceed the room's, so the arrows reverse and moisture is driven <em>inwards</em>. A vapour-open insulation lets damp masonry dry into the room. A vapour-tight one does not, so the inward flow through it is almost nothing.
          </p>
          <p>
            On the chart, a blue strip marks rain taken up by the outer face that month, and with wet ground, a second chart below shows the wall from the side, with the moisture climbing it.
          </p>
        </section>

        <section id="moist-reading" className="learn-section">
          <h2>Reading the moisture charts</h2>
          <h3>The verdict</h3>
          <p>Above each wall's chart is one of these results. They only describe how much water the wall holds and when. Whether that water does harm is judged separately, layer by layer, in the checks that follow: rot for timber and fibre layers, frost for masonry, the interface behind internal insulation, gypsum, and mould on the inner surface. This follows how hygrothermal results are normally assessed, under WTA 6-5 for internal insulation.</p>
          <table className="learn-table">
            <thead><tr><th>Result</th><th>What it means</th></tr></thead>
            <tbody>
              <tr><td>Stays dry</td><td>No layer holds liquid water at any point in the year: every layer stays below the moisture it would hold at 95% humidity.</td></tr>
              <tr><td>Gets wet, then dries out</td><td>Liquid water collects in winter, with a peak amount, month and layer, and has gone again by the month named. Rain-exposed walls often start to rewet in the autumn, which is normal. This is generally acceptable if the materials can tolerate that much moisture for a few months.</td></tr>
              <tr><td>Stays damp all year</td><td>Some water is still there even in the driest month, but no more than the year before: the wall has settled at a damp level. Common for rain-exposed masonry, and not a fault in itself. The checks below say whether the materials suffer from it.</td></tr>
              <tr><td>Gets wetter year on year</td><td>Water is still there even in the driest month, and more than the year before, so it builds up. The danger is rot, frost damage and loss of insulation.</td></tr>
            </tbody>
          </table>
          <h3>Moisture moving through each wall</h3>
          <ul>
            <li><b>Black line:</b> the vapour pressure actually in the wall, from the outside value on the left to the inside value on the right, as a monthly average. Both ends are labelled with temperature and humidity.</li>
            <li><b>Blue dashed line:</b> the saturation pressure, the most the air can hold at the temperature of each point.</li>
            <li><b>Red dot:</b> liquid water held in that layer at the end of the month, in g/m².</li>
            <li><b>Hollow blue dot:</b> condensation in an air cavity, assumed to drain away through the weep holes. It is labelled with the amount that month but is not added to the water held in the wall.</li>
            <li><b>Arrows along the bottom:</b> the moisture flow through each layer, vapour and liquid together. The dashes move in the direction it travels. A thicker, darker arrow means more.</li>
            <li><b>Play button and slider:</b> step through the year from October. All the charts glide between months.</li>
          </ul>
          <h3>Ground moisture up the wall</h3>
          <p>
            Shown below each wall's vapour chart when the ground at the base is wet. It is the wall seen from the side, from the ground up to 3 m, with the same layers across. Blue shows how full of water each layer is, on one scale for every wall, from clear when dry to solid when saturated. Each layer matches its simulated wetness at 1 m, and in the wet zone the shading follows the same taper the simulation uses, wettest at the base and drying out towards the damp front, the line labelled with its height. Where the front stays below 1 m, the wall above it shows its own wetness from rain and vapour. Dashed arrows show water wicking up from the ground while it is wet. Arrows out of the outer face and inward show where it dries out, labelled in millimetres of water a day, thicker for more. Inward drying goes into the room, or into the layer behind if that doesn't wick, such as insulation, where it is usually small. The dashed line at 1 m is the height the vapour chart and the other results are for, labelled with how saturated the wettest layer is there.
          </p>
          <h3>Moisture held in the wall</h3>
          <p>
            Total liquid water held at the end of each month, in the last simulated year. If it never comes back to zero, the wall is not drying out. Where the wall is still getting wetter, a dashed line shows year one for comparison.
          </p>
          <h3>Inner surface humidity</h3>
          <p>
            The relative humidity of the air touching the inside face, by month, against the 80% mould line.
          </p>
          <h3>Comparing walls</h3>
          <p>
            Each column has its own build-up, chosen from the same library as the Compare tab, and all share one climate and indoor setting. The yearly charts then overlay every wall in its own colour. Changing a setting reruns every wall in the background, which takes a moment ("Calculating…").
          </p>
        </section>

        {/* ------------------------------------------------------------ MOISTURE: UNDER THE HOOD */}
        <section id="msim-overview" className="learn-section">
          <h2>The moisture simulation at a glance</h2>
          <p>
            Again, everything is calculated in your browser. The method follows the standard approach for transient heat and moisture in building components (EN 15026, after Künzel). In outline:
          </p>
          <ol className="learn-steps">
            <li>Build a typical year of outdoor temperature, humidity, sun and rain showers, in two-hour steps, from the monthly tables.</li>
            <li>Cut each layer into thin slices, each with its own temperature and humidity.</li>
            <li>At every step, work out the heat flow, and the vapour and liquid water flow, between neighbouring slices and at the two faces.</li>
            <li>Update each slice's temperature and the water it holds, storing water along each material's sorption curve.</li>
            <li>Shed rain the face can't take up and water condensing in a cavity, and feed in ground moisture.</li>
          </ol>
          <p>
            Every layer starts at 80% humidity in October, and the year is run again and again until it repeats: until a year's wettest and driest month ends are within 2% of the year before's. That takes at least three years, and longer for thick masonry, which can take five to eight to settle; the run stops at twelve. The results come from the last year, by which time that starting guess has washed out. The first year is kept to show whether a wall is still getting wetter.
          </p>
        </section>

        <section id="msim-climate" className="learn-section">
          <h2>1. Building the year</h2>
          <p>
            The outdoor air temperature uses the same monthly means as the heat tab (4.5 °C in January to 17 °C in July, plus the city offset), and the outdoor relative humidity a table of typical UK values, from 89–90% in winter to about 74% in May and June. Both change smoothly through the year, interpolated between mid-months, rather than jumping on the first of the month. The outdoor vapour pressure is then:
          </p>
          <Eq>p<sub>out</sub> = RH<sub>out</sub> × p<sub>sat</sub>(T<sub>out</sub>)</Eq>
          <p>
            The saturation pressure uses the standard formula from ISO 13788, with a slightly different constant below freezing:
          </p>
          <Eq>p<sub>sat</sub> = 610.5 × exp( 17.269 T ÷ (237.3 + T) )    (T at or above 0 °C)</Eq>
          <p>
            The sun warms the outer face between 6 am and 6 pm, peaking at midday. Its 24-hour average is a typical monthly figure, from about 0.3 K in December to 5.5 K in June and July. Rain falls as a six-hour shower every 60 hours, about twelve a month, sharing out that month's rain on the wall: a typical Midlands monthly total (about 50 to 80 mm), scaled for the city from 0.8 for London to 1.4 for Cardiff, times the exposure share. Of the rain reaching the wall, 70% is taken to stay on the face and the rest to splash off, the usual default in hygrothermal tools. During a shower there is no sun and the outdoor humidity is at least 95%.
          </p>
          <p>
            The room's vapour pressure is the outdoor pressure plus what the household adds. The moisture setting is the peak vapour excess in the room air: 2, 4 or 6 g/m³ for low, typical and high. It is strongest in the coldest weather, when windows are shut, and falls steadily to zero as the outdoor temperature rises from 0 to 20 °C:
          </p>
          <Eq>excess = peak × (20 − T<sub>out</sub>) ÷ 20    (with T<sub>out</sub> held between 0 and 20 °C)</Eq>
          <Eq>p<sub>in</sub> = p<sub>out</sub> + excess × 461.5 × (T<sub>in</sub> + 273.15)</Eq>
          <p>
            The 461.5 J/kgK is the gas constant for water vapour. The room pressure can never exceed saturation at room temperature, so it is capped there.
          </p>
        </section>

        <section id="msim-profile" className="learn-section">
          <h2>2. Slices, heat and vapour</h2>
          <p>
            Each layer is cut into slices 2 mm thick at both of its faces, growing by 60% at a time to at most 20 mm in its middle, because the sharpest changes happen at faces and boundaries. An air cavity is a single slice with its own thermal resistance. If the build-up has a <b>ventilated gap</b> (a roof tile batten void, for instance), everything outside it is at outdoor conditions, so the analysis starts at the inner face of the gap.
          </p>
          <p>
            <b>Heat</b> flows between slices as on the heat tab, with surface films of 0.04 m²K/W outside and 0.13 inside (0.10 for a roof). Two things differ. Water conducts heat, so a wet material conducts more, by the usual allowance of 8% per percent of moisture by mass:
          </p>
          <Eq>λ = λ<sub>dry</sub> × (1 + 8 × w ÷ ρ)    (w the water held, ρ the dry density, both kg/m³)</Eq>
          <p>
            And water condensing in a slice releases 2.5 MJ per kg, which evaporation takes back, so a drying face is cooled by its own evaporation.
          </p>
          <p>
            <b>Vapour</b> flows between slices by diffusion, from high vapour pressure to low:
          </p>
          <Eq>g<sub>vapour</sub> = (δ<sub>air</sub> ÷ µ) × Δp ÷ Δx    δ<sub>air</sub> = 2 × 10⁻¹⁰ kg/(m·s·Pa)</Eq>
          <p>
            Each slice's µ moves smoothly from the material's dry-cup value at 50% humidity to its wet-cup value at 90%, because hygroscopic materials let vapour through more freely when damp. At the faces, vapour passes to the air through a surface film, worked out from the convective heat transfer by the standard Lewis relation.
          </p>
        </section>

        <section id="msim-saturation" className="learn-section">
          <h2>3. Storing water: the sorption curve</h2>
          <p>
            Each slice holds water w (kg/m³) in balance with its relative humidity φ. The tool uses Künzel's one-parameter sorption curve, fitted to each material's moisture content at 80% humidity (w<sub>80</sub>) and its free water saturation (w<sub>f</sub>, the most it takes up by soaking):
          </p>
          <Eq>w = w<sub>f</sub> × (b − 1) × φ ÷ (b − φ)    b chosen so that w = w<sub>80</sub> at φ = 0.8</Eq>
          <p>
            The curve rises gently through ordinary humidities and steeply above about 95%, where the pores start to fill with liquid. Beyond saturation a slice can hold more free water, but its vapour pressure stays at saturation, as it would against a pool of condensate. Materials with no storage data, such as foam boards, mineral wool and some products, hold almost nothing (0.01 kg/m³, little more than the air in their pores) until they are saturated, so water condensing in them collects as free water.
          </p>
        </section>

        <section id="msim-balance" className="learn-section">
          <h2>4. Capillary flow</h2>
          <p>
            Liquid water moves through a wicking material from wetter to drier. Künzel's approximation gives its liquid diffusivity from the water absorption coefficient A and the free saturation:
          </p>
          <Eq>D<sub>w</sub> = 3.8 × (A ÷ w<sub>f</sub>)² × 1000<sup>(w ÷ w<sub>f</sub> − 1)</sup>    m²/s</Eq>
          <p>
            It rises a thousandfold from dry to saturated, so a nearly dry material barely wicks and a wet one wicks fast. This is the suction value, used while it rains. Between showers, when water redistributes rather than being drawn in, a tenth of it is used, as Künzel recommends. The flow is driven by the gradient of relative humidity:
          </p>
          <Eq>g<sub>liquid</sub> = D<sub>w</sub> × (dw/dφ) × Δφ ÷ Δx</Eq>
          <p>
            Driving the flow by humidity, not by water content, is what lets it cross from one material to the next: water moves from brick into a lime render whenever the brick is at a higher humidity, even though the two hold very different amounts at that humidity. A layer with no capillary data, or A of zero, passes no liquid at all, so water can only leave it as vapour.
          </p>
        </section>

        <section id="msim-wet" className="learn-section">
          <h2>5. Solving each step</h2>
          <p>
            Each two-hour step is solved implicitly, which stays stable however thin the slices are. Heat comes first, then moisture. The unknown for moisture is each slice's humidity. Because storage, µ and capillary flow all depend on that humidity, the tool guesses it, works out the flows, solves for the new humidities, and repeats until no slice changes by more than 0.0001 (usually two to five passes). The storage term is set up so that water is conserved exactly at every pass. If a step won't settle, typically at the start of a shower, it is split in half, and halved again if needed.
          </p>
          <p>
            As a check, the tool adds up all the water entering and leaving over the final year and compares it with the change in water held. They agree to within a few tens of grams per square metre at most, against tens or hundreds of kilograms of water moving through in a wet wall.
          </p>
        </section>

        <section id="msim-sources" className="learn-section">
          <h2>6. Rain, ground moisture and cavities</h2>
          <h3>Rain</h3>
          <p>
            During a shower, the rain on the wall is added to the outer slice. Capillary flow then draws it inward, as fast as the material's suction allows. Whatever the outer slice can't hold beyond its free saturation runs off at the end of the step. So a strongly wicking face takes up most of a shower, and a face with low A saturates in its outer millimetres and sheds the rest.
          </p>
          <h3>Ground moisture</h3>
          <p>
            Ground moisture reaches the run of layers from the outside that have capillary data, stopping at the first that doesn't (usually insulation). The model looks at the wall 1 m above the footing. It can't follow water rising from below, so while water stands at the footing (November to March for "wet in winter", all year for "wet all year"), each slice in that run is fed by capillary flow, worked out with the Kirchhoff potential, the integral of the liquid diffusivity, K(w) = ∫ D<sub>w</sub> dw. The wall is saturated at the base and dry at the damp front, height h (below). In between, evaporation draws water off evenly with height, so the upward flow falls steadily to nothing at the front and the potential tapers as:
          </p>
          <Eq>K(z) = K(w<sub>f</sub>) × (1 − z ÷ h)²</Eq>
          <p>
            Because the liquid diffusivity rises steeply with water content, the wall stays fairly wet most of the way up and dries out close to the front. The slice at 1 m is fed towards the value at z = 1 m:
          </p>
          <Eq>supply = [ K(1 m) − K(w) ] ÷ (h − 1 m)²    per m³ of material</Eq>
          <p>
            The distance h − 1 m is the gap over which the profile falls to nothing, so as the front comes down towards 1 m the supply settles at K(w<sub>f</sub>) ÷ h² rather than vanishing.
          </p>
          <p>
            It only ever adds water: a slice wetter than that, from rain for instance, is not drained by the ground. It is strongest in materials that wick well.
          </p>
          <p>
            How high the damp actually rises comes from sharp-front theory (Hall and Hoff). The wet zone, height h, is fed by capillary inflow at the base and dries through its faces at a rate e per square metre of wall. The tool follows it through the year:
          </p>
          <Eq>d(h²)/dt = S² ÷ θ² − 2 e h² ÷ (θ b)    settling at h = S × √( b ÷ (2 θ e) )</Eq>
          <p>
            Here S is the sorptivity of the wicking run (its A divided by the density of water), b its thickness and θ its water content at free saturation as a volume fraction. The drying rate e comes from the simulation at every step: what the wicking run would lose through its outer face and into the layers behind it if it were wet, so it depends on the weather and the build-up. When the ground at the base dries, the inflow stops and the front falls. The tool reports the highest and lowest the front reaches over the year. With "wet in winter" the front starts low each November and climbs towards the winter height; with "wet all year" it stays up all year and is lowest in summer, when walls dry fastest. A render or insulation that slows drying lowers e and raises h. The slice at 1 m only receives rising damp once the front has climbed past it.
          </p>
          <h3>Saturated layers</h3>
          <p>
            A wicking material can only hold so much water in its pores: its free saturation. Water arriving beyond that, from heavy rain, ground moisture or condensation, can't be held, so it runs down out of the layer. The tool removes it at each step and reports it as water running down inside the wall. Layers with no storage data, such as foam boards and mineral wool, keep condensation as free water instead.
          </p>
          <h3>Cavities</h3>
          <p>
            Water that would collect in an <b>air cavity</b> beyond saturation is assumed to run down and out through the weep holes. It is counted as "drained" but not held. This assumes the cavity is clear and has working drainage, which is worth checking on site, especially in older walls where mortar droppings can block it. Condensation on a wicking cavity face, such as brick, soaks into that layer instead, and is held there.
          </p>
        </section>

        <section id="msim-results" className="learn-section">
          <h2>7. Working out the results</h2>
          <h3>Water held and the verdict</h3>
          <p>
            "Liquid water held" in a layer is the water above what it would hold at 95% humidity, added up over its slices, at the end of each month. Hygroscopic moisture below that level is normal and is not counted. <b>Stays dry</b> if the total never reaches 5 g/m² in the final year. <b>Gets wet, then dries out</b> if it does, but at some month end (the wall's driest point, often summer, before autumn rain starts again) every layer is dry again: under 5 g/m², or under a tenth of the water it could hold above 95% humidity, whichever is more. The tenth is a judgement call so that thick masonry, which in a wet climate always keeps a little water in its outer part, is judged against its own size: for a thin board the limit is still 5 g/m², for 500 mm of stone it is several kilograms. A wall that has still not settled after twelve years, its driest month wetter than the year before's, <b>gets wetter year on year</b>, however little it holds yet. Otherwise it <b>stays damp all year</b>. The peak is the largest month-end total, and the layer named is the one holding most of it then.
          </p>
          <h3>Settled state</h3>
          <p>
            Following WTA 6-5, the wall has settled once the water in every layer, and in the wall as a whole, changes by less than 1% from the same date a year before. Results come from the year after that. A wall still changing after twelve years, with its driest month wetter than the year before's, is reported as getting wetter year on year.
          </p>
          <h3>Frost</h3>
          <p>
            The part of each masonry layer that can freeze is found from the steady temperatures on a −5 °C night. Through November to March, the water in that part is compared with its open pore volume. WTA 6-5 allows masonry of unknown frost resistance to fill 30% of its pores, about half the saturation at which frost damage usually starts, or more if the humidity there stays under 95%. The model has no porosity data, so open porosity is estimated from free saturation, which typically fills about three quarters of the pores (164 sandstones average 0.71; ASTM C216 caps brick at 0.78).
          </p>
          <p>
            The simulation takes the wall to be in good condition. A sound existing wall has already shown it survives its own winters, so going over 30% only counts as a frost risk where insulation makes the freezing zone wetter than the same wall without it. That before-and-after comparison is how internal insulation is normally judged for frost (WTA 6-5; Straube and Mensinga). For the comparison, insulation lining the wall is taken off, and a filled cavity goes back to an empty one.
          </p>
          <h3>Behind internal insulation</h3>
          <p>
            Where insulation is fixed inside masonry, with only thin finishes on the room side, the peak monthly humidity where the two meet is graded as WTA 6-5 does. Up to 95% suits any materials. 95–99% suits only materials that tolerate damp, frost and rot: mineral layers such as lime, insulating plaster, mineral board and stone do, while timber and fibre, gypsum and foam boards are flagged. Over 99%, condensation can form and the system needs a full design study.
          </p>
          <h3>Gypsum</h3>
          <p>
            A gypsum plaster or plasterboard layer is flagged if its humidity goes over 95% at either face (WTA 6-5), as gypsum loses strength when damp.
          </p>
          <h3>Rot</h3>
          <p>
            For each organic layer, the moisture content by mass is averaged over the 10 mm at each face, every step of the final year, and the higher peak is compared with 18%.
          </p>
          <h3>Mould</h3>
          <p>
            The inner surface humidity is the room's vapour pressure divided by the saturation pressure at the inner surface's temperature, from the monthly mean temperatures. Months above 80% are flagged. For this check only, the inside film is taken as 0.25 m²K/W, as ISO 13788 sets for walls and roofs. That allows for the colder spots in corners and behind furniture, where mould usually starts.
          </p>
          <h3>Pressure line and flow arrows</h3>
          <p>
            The pressure chart shows monthly averages at each layer boundary. Each layer's arrow is the vapour and liquid flow together, through the middle of the layer, averaged over the month and converted to grams per square metre per day, positive towards the inside. Arrow thickness and darkness are in proportion to the flow, with 50 g/m² per day or more drawn at full width, so a layer passing a tenth as much shows a tenth the arrow. Hover over an arrow for its figure.
          </p>
          <h3>Animation</h3>
          <p>
            When you move to another month, every number on the pressure chart is eased from the old value to the new one over about half a second. The easing is only for show: the whole simulation is run once, up front.
          </p>
        </section>

        <section id="mlimits" className="learn-section">
          <h2>What the moisture model leaves out</h2>
          <p>Again, these are the main simplifications, so you know how far to trust the results.</p>
          <ul>
            <li><b>Typical, not measured, weather.</b> The year is built from monthly tables, with an even pattern of showers. There are no storms, heatwaves or cold snaps, and the driving rain is a fixed share of the rainfall rather than worked out from wind.</li>
            <li><b>Typical material data.</b> Each material's capillary and storage values are representative figures for its type from published hygrothermal data, not measured for a product. Real bricks and stones vary several-fold, so treat the comparison between build-ups as more reliable than the absolute amounts. Materials with no data are treated as not wicking or storing water, and are listed on the page.</li>
            <li><b>No cracks or gaps.</b> A render is treated as perfect. In practice rain often gets behind a cracked cement render and can't get out, which is a large part of its bad reputation on old walls. None of that is modelled.</li>
            <li><b>No air leakage.</b> Moist air leaking through gaps, joints and service penetrations can carry far more water than diffusion does.</li>
            <li><b>No freezing.</b> Ice in the pores isn't simulated, and the monthly weather never drops below 0 °C. The frost check therefore uses a fixed −5 °C night to find the part of the wall that can freeze, and judges how wet that part is over the winter, rather than counting real freeze–thaw cycles. Porosity is estimated, and the real frost resistance of a brick or stone can only be measured.</li>
            <li><b>Ground moisture in one dimension.</b> The wall is followed at a single height, 1 m above the footing, fed towards a moisture level that tapers from saturation at the base to dry at the front. The rise height uses sharp-front theory and the brick's own wicking, ignoring mortar bed joints, which usually wick more slowly, and the ground is taken as free water, so heights lean high. Salts, which hold water and drive much of the damage, are not modelled.</li>
            <li><b>One dimension.</b> A uniform wall, with no thermal bridges, window reveals, corners or junctions with the floor.</li>
            <li><b>Mould as a single line.</b> 80% surface humidity is a standard simplification. Real mould depends on the material, its temperature and how long the conditions last.</li>
          </ul>
          <Callout title="When you need a full moisture study">
            <p>
              For a real project, especially internal insulation on a solid old wall, have it checked with a validated hygrothermal tool such as WUFI or Delphin, using measured weather for the site and data for the actual products. Use this tab to compare build-ups and to learn <em>why</em> vapour-open, vapour-tight and wicking systems behave differently.
            </p>
          </Callout>
        </section>

        {/* ------------------------------------------------------------ REFERENCE */}
        <section id="glossary" className="learn-section">
          <h2>Glossary</h2>
          <dl className="learn-dl">
            <dt>Absorptance (α)</dt>
            <dd>The fraction of incoming solar radiation that a surface absorbs. Pale surfaces have low values, dark surfaces high.</dd>
            <dt>Air changes per hour (ACH)</dt>
            <dd>How many times per hour the room's air is replaced by outside air.</dd>
            <dt>Conductivity (k, λ)</dt>
            <dd>How readily a material conducts heat, in W/mK. Lower means a better insulator.</dd>
            <dt>Decrement factor</dt>
            <dd>The fraction of the outside daily heat swing that reaches the inner surface, after being damped by the wall.</dd>
            <dt>Decrement delay</dt>
            <dd>The delay, in hours, between a peak outside and the resulting peak of heat flow at the inner face. Also called time lag or time shift.</dd>
            <dt>Diffuse radiation</dt>
            <dd>Sunlight scattered by the sky and clouds, arriving from all directions, as opposed to the direct beam.</dd>
            <dt>Free-floating</dt>
            <dd>A room with no heating or cooling, whose temperature is whatever its surroundings make it.</dd>
            <dt>Hygroscopic</dt>
            <dd>Able to take up moisture from the air and release it again. Wood fibre, wool, timber, lime and clay are, and so are stone and brick to a degree.</dd>
            <dt>Interstitial condensation</dt>
            <dd>Condensation that forms inside a wall, at a boundary between layers, rather than on a surface.</dd>
            <dt>Irradiance</dt>
            <dd>The power of solar radiation arriving on a surface, in W/m².</dd>
            <dt>Operative temperature</dt>
            <dd>A measure of how warm a room feels, combining air temperature and the temperature of surrounding surfaces. Roughly their average.</dd>
            <dt>R-value (thermal resistance)</dt>
            <dd>How strongly a layer resists heat flow, in m²K/W. Thickness divided by conductivity. Higher means better insulated.</dd>
            <dt>Relative humidity (RH)</dt>
            <dd>How much water vapour the air holds, as a percentage of the most it could hold at its temperature.</dd>
            <dt>Rising damp</dt>
            <dd>A contested name for moisture drawn up from the ground into the base of a wall by capillary action. It is often blamed for damp with other causes, such as condensation, rain getting in, raised ground bridging the base, leaks or salts. The tool calls it ground moisture, and models it only when water is actually available at the base.</dd>
            <dt>Saturation vapour pressure</dt>
            <dd>The most water vapour the air can hold at a given temperature, in pascals. It rises steeply as the air warms.</dd>
            <dt>sd (equivalent air thickness)</dt>
            <dd>A layer's vapour resistance expressed as the thickness of still air, in metres, that would resist vapour equally: µ × thickness.</dd>
            <dt>Sol-air temperature</dt>
            <dd>A notional outdoor temperature that combines the air temperature with the effect of absorbed sunshine.</dd>
            <dt>Specific heat capacity</dt>
            <dd>The energy needed to warm one kilogram of a material by one kelvin, in J/kgK.</dd>
            <dt>Steady state</dt>
            <dd>A condition in which temperatures have stopped changing with time.</dd>
            <dt>Thermal bridge</dt>
            <dd>A part of the structure that conducts heat more easily than its surroundings, letting heat bypass insulation.</dd>
            <dt>Thermal mass</dt>
            <dd>The ability of a material to store heat. High-density materials such as brick and concrete have a lot.</dd>
            <dt>U-value</dt>
            <dd>The steady rate of heat flow through one square metre of a wall per kelvin of temperature difference, in W/m²K. The reciprocal of total resistance.</dd>
            <dt>Vapour pressure</dt>
            <dd>The pressure exerted by the water vapour in the air, in pascals. It measures how much vapour there actually is, and vapour moves from high to low.</dd>
            <dt>Vapour resistance factor (µ)</dt>
            <dd>How many times more a material resists the passage of water vapour than still air of the same thickness. Dry-cup and wet-cup values apply to dry and damp conditions.</dd>
          </dl>
          <p><button type="button" className="btn-primary" onClick={onOpenSimulator}>Back to the simulator</button></p>
        </section>

        <div className="learn-pager">
          {prev ? <button type="button" className="btn-secondary" onClick={() => jump(prev.id)}>← {prev.title}</button> : <span />}
          {next ? <button type="button" className="btn-secondary" onClick={() => jump(next.id)}>{next.title} →</button> : <span />}
        </div>
      </article>
    </div>
  );
}
