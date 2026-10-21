import type { ReactNode } from 'react';

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
  { id: 'moist-absorb', title: 'Absorbent and breathable materials', group: 'Moisture: the ideas' },
  { id: 'moist-rain', title: 'Rain and rising damp', group: 'Moisture: the ideas' },
  { id: 'moist-reading', title: 'Reading the moisture charts', group: 'Moisture: the ideas' },
  { id: 'msim-overview', title: 'The moisture simulation at a glance', group: 'Moisture: under the hood' },
  { id: 'msim-climate', title: '1. Building the year', group: 'Moisture: under the hood' },
  { id: 'msim-profile', title: '2. Temperature and vapour pressure through the wall', group: 'Moisture: under the hood' },
  { id: 'msim-saturation', title: '3. Where it saturates', group: 'Moisture: under the hood' },
  { id: 'msim-balance', title: '4. Condensing and drying through the year', group: 'Moisture: under the hood' },
  { id: 'msim-wet', title: '5. Wet-cup µ and absorbent layers', group: 'Moisture: under the hood' },
  { id: 'msim-sources', title: '6. Rain and rising damp as vapour sources', group: 'Moisture: under the hood' },
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
  const jump = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };

  const groups = SECTIONS.reduce<Array<{ name: string; items: Section[] }>>((acc, s) => {
    const last = acc[acc.length - 1];
    if (last && last.name === s.group) last.items.push(s);
    else acc.push({ name: s.group, items: [s] });
    return acc;
  }, []);

  return (
    <div className="learn">
      <nav aria-label="Learn contents" className="learn-toc card">
        {groups.map((g) => (
          <div key={g.name} className="learn-toc-group">
            <div className="eyebrow">{g.name}</div>
            <ul>
              {g.items.map((s) => (
                <li key={s.id}>
                  <button type="button" className="toc-link" onClick={() => jump(s.id)}>{s.title}</button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <article className="learn-body card">
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
            <li><b>Sun:</b> how much solar radiation lands on a wall facing north, east, south or west, or on a flat roof, for a UK location and month.</li>
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
              <b>Onto the surface.</b> The direct beam is multiplied by the cosine of the angle between the sun and the wall's surface direction, so a wall facing away from the sun receives none of it. Diffuse sky light is spread evenly across the sky dome, and the wall sees the part of the dome in front of it. The ground reflects 20% of the light reaching it, and a wall sees half the ground, so it receives 10% of that light. For a flat roof the sun's height directly sets the angle.
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
            where α is the surface absorptance (0.3, 0.55 or 0.85), <em>I</em> is the irradiance from step 2 and R<sub>se</sub> is the 0.04 m²K/W outside surface film. For a flat roof there is one further term: a long-wave radiation correction of −3.6 × clearness (in kelvin), representing heat radiated away to the sky. It is applied all day and night, and scales with clearness: about −3.4 K on a clear day and about −0.5 K when overcast. Walls get no such term, because they face the ground and surrounding buildings as much as the sky.
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
            You pick up to four build-ups, set a location, the room temperature, how much moisture the household produces, how exposed the wall is to rain and whether the footings are damp. The tool then runs through a typical UK year, month by month, and shows:
          </p>
          <ul>
            <li><b>Whether vapour condenses inside the wall,</b> where, and how much water is held.</li>
            <li><b>Whether that water dries out again</b> in the summer, or builds up from one year to the next.</li>
            <li><b>Whether the inner surface is damp enough for mould.</b></li>
            <li><b>Which way vapour is moving</b> through each layer, month by month, with animated arrows.</li>
          </ul>
          <Callout title="A screening tool, not a moisture simulation">
            <p>
              It treats water purely as vapour moving by diffusion, using monthly averages. It does not track liquid water soaking through stone or brick, which matters a great deal in old buildings. Use it to compare build-ups and to spot ones worth worrying about. See <button type="button" className="inline-link" onClick={() => jump('mlimits')}>What the moisture model leaves out</button>.
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
            The room has roughly half as much vapour again as the air outside, so vapour drifts out through the wall. In summer the difference is small. It only reverses when something raises the vapour pressure on the outside, for example sun shining on a rain-soaked wall. See <button type="button" className="inline-link" onClick={() => jump('moist-rain')}>Rain and rising damp</button>.
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
              <tr><td>Hard, dense limestone</td><td>about 200 (soft limestones are far lower)</td></tr>
              <tr><td>Metal, glass, foil-faced products</td><td>effectively infinite</td></tr>
            </tbody>
          </table>
          <p>
            To compare layers of different thickness, multiply by the thickness to get the <b>equivalent air thickness, sd</b>, in metres. It is the thickness of still air that would resist vapour equally:
          </p>
          <Eq>sd = µ × thickness    (m)</Eq>
          <p>
            100 mm of unfaced PIR (µ 60) is sd = 6 m: as much resistance as six metres of air. Most PIR boards sold in the UK are foil-faced, which makes them effectively vapour-tight. The tool's "PIR / PUR board" is the unfaced figure, so it lets more vapour through than a typical foil-faced board would. 80 mm of wood fibre (µ about 5) is only sd = 0.4 m. Like R-values, sd values in layers add up. The material picker shows µ where the tool has a figure. Many materials list two values, a <b>dry-cup</b> one and a <b>wet-cup</b> one, because materials such as wood fibre and lime let vapour through more easily when damp.
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
          <h2>Absorbent and breathable materials</h2>
          <p>
            Many traditional materials, such as wood fibre, cork, wool, timber, lime, clay and stone, are <b>hygroscopic</b>: they take up moisture from damp air and release it when the air dries, without being harmed, within limits. A wall built from them is often called <b>breathable</b>. They act as a buffer, soaking up winter condensation and giving it back in summer.
          </p>
          <p>
            A simple diffusion calculation treats every boundary as a bare surface where water collects, which overstates the risk for these materials. The tool corrects for that in one way:
          </p>
          <ul>
            <li>For <b>organic absorbent</b> layers (wood fibre, cork, wool, hemp, cellulose, timber boards and similar), the condensed water is shared with the nearest layers, assumed to soak up to 30 mm deep. The tool reports the resulting <b>moisture content</b> as a percentage of the material's dry mass. The tool uses <b>18%</b> as the limit. That is a cautious figure: about 20% is the level usually quoted for the onset of rot in timber.</li>
            <li>Where no absorbent layer sits next to the condensation, it is <b>free water</b> on a hard surface. The rule of thumb used is 500 g/m² as an upper limit.</li>
            <li>Condensation on the face of an <b>air cavity</b> is a special case. That is what a drained cavity is for: the water runs down the face and out through the weep holes and trays at the base. The tool counts it, and shows it as a hollow blue dot labelled "drains", but does not add it to the water held in the wall. Water on any boundary <em>not</em> next to a cavity, such as sheathing behind it, is still held.</li>
            <li>Mineral materials (stone, brick, lime) are not given a limit, because no single threshold fits their frost and salt risks. The tool does not treat them as absorbing the water.</li>
          </ul>
          <p>
            Dense boards absorb more per square metre than light batts. A low-density batt right on a cold face may reach a high moisture content from the same amount of water.
          </p>
        </section>

        <section id="moist-rain" className="learn-section">
          <h2>Rain and rising damp</h2>
          <p>
            Old solid walls are rarely wetted only by indoor vapour. Rain soaks the outer face, and moisture can rise from the ground. You can set both on the tab.
          </p>
          <dl className="learn-dl">
            <dt>Rain exposure</dt>
            <dd>
              Sheltered (urban, trees), moderate, exposed (hill, coast, south-west face) or severe. It sets how much of the month's rain actually lands on the wall: 5%, 15%, 30% or 50%. How wet the face gets also depends on the outer layer: open brick and clay tiles take the rain up readily, dense hard stone and concrete tiles much less, and metal or foil not at all.
            </dd>
            <dt>Footings</dt>
            <dd>
              Dry, damp (occasional) or wet (standing damp). A damp or wet base holds the lower masonry of the wall at 85% or 97% humidity.
            </dd>
          </dl>
          <p>
            Both are modelled as <b>vapour sources</b>, not as liquid water. A wetted outer face has a high vapour pressure, and in sunshine its temperature rises, so that pressure rises further. In summer it can exceed the room's, and the arrows reverse: vapour is driven <em>inwards</em>. Damp masonry likewise pushes vapour both outwards and inwards. A vapour-open insulation lets that moisture dry into the room. A vapour-tight one does not, so the inward arrow through it is almost nothing.
          </p>
          <p>
            On the chart, a blue strip marks a rain-wetted outer face, and blue shading marks masonry held damp by rising damp.
          </p>
        </section>

        <section id="moist-reading" className="learn-section">
          <h2>Reading the moisture charts</h2>
          <h3>The verdict</h3>
          <p>Above each wall's chart is one of three results, followed by a mould check.</p>
          <table className="learn-table">
            <thead><tr><th>Result</th><th>What it means</th></tr></thead>
            <tbody>
              <tr><td>No interstitial condensation</td><td>Vapour reaches the inside without saturating anywhere in the wall, all year.</td></tr>
              <tr><td>Condenses, then dries out</td><td>Water forms at a boundary in winter, with a peak amount and month, and is gone again by the month named. This is generally acceptable if the materials can tolerate that much moisture for a few months.</td></tr>
              <tr><td>Builds up year on year</td><td>Some water is still there at the end of the fifth year, so it does not fully dry out each summer. The danger is rot, frost damage and loss of insulation.</td></tr>
            </tbody>
          </table>
          <h3>Vapour moving through each wall</h3>
          <ul>
            <li><b>Black line:</b> the vapour pressure actually in the wall, from the outside value on the left to the inside value on the right. Both are labelled, with temperature and humidity.</li>
            <li><b>Blue dashed line:</b> the saturation pressure, the most the air can hold at the temperature of each point.</li>
            <li><b>Red dot:</b> the two lines meet, so water condenses. The label shows how much is held, in g/m².</li>
            <li><b>Hollow blue dot:</b> condensation on the face of an air cavity, which is assumed to drain away through the weep holes. It is labelled with the amount that month but is not added to the water held in the wall.</li>
            <li><b>Arrows along the bottom:</b> the vapour flow through each layer. The dashes move in the direction vapour is travelling. A thicker, darker arrow means more.</li>
            <li><b>Play button and slider:</b> step through the year from October. All the charts glide between months.</li>
          </ul>
          <h3>Moisture held in the wall</h3>
          <p>
            Total water held through the year, starting dry in October. A dashed line, shown only when needed, is the same curve in the fifth year. If it sits above zero by September, the wall is not drying out.
          </p>
          <h3>Inner surface humidity</h3>
          <p>
            The relative humidity of the air touching the inside face, by month, against the 80% mould line.
          </p>
          <h3>Comparing walls</h3>
          <p>
            Each column has its own build-up, chosen from the same library as the Compare tab, and all share one climate and indoor setting. The yearly charts then overlay every wall in its own colour.
          </p>
        </section>

        {/* ------------------------------------------------------------ MOISTURE: UNDER THE HOOD */}
        <section id="msim-overview" className="learn-section">
          <h2>The moisture simulation at a glance</h2>
          <p>
            Again, everything is calculated in your browser. In outline, for each month of the year:
          </p>
          <ol className="learn-steps">
            <li>Take the typical outdoor temperature and humidity, and work out the room's vapour pressure from the temperature and moisture setting.</li>
            <li>Find the temperature at every layer boundary, and so the most vapour the air there could hold.</li>
            <li>Draw the vapour pressure line from outside to inside, with each layer's drop in proportion to its sd.</li>
            <li>Wherever the line would pass the limit, pin it to the limit and call that boundary a condensation plane.</li>
            <li>Work out how much water arrives at or leaves each plane that month, and update the amount held.</li>
          </ol>
          <p>
            This is repeated from October for twelve months, for five years in a row. The first year is what the charts step through, and the fifth tells you whether any water carries over.
          </p>
        </section>

        <section id="msim-climate" className="learn-section">
          <h2>1. Building the year</h2>
          <p>
            Each month is a single steady condition, with no daily cycle. The outdoor air temperature is the same monthly mean used on the heat tab (4.5 °C in January to 17 °C in July, plus the city offset). The outdoor relative humidity is a table of typical UK values, from 89–90% in the winter months to about 74% in May and June. The outdoor vapour pressure is then:
          </p>
          <Eq>p<sub>out</sub> = RH<sub>out</sub> × p<sub>sat</sub>(T<sub>out</sub>)</Eq>
          <p>
            The saturation pressure uses the standard formula from ISO 13788, with a slightly different constant below freezing:
          </p>
          <Eq>p<sub>sat</sub> = 610.5 × exp( 17.269 T ÷ (237.3 + T) )    (T at or above 0 °C)</Eq>
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
          <h2>2. Temperature and vapour pressure through the wall</h2>
          <p>
            Temperatures at layer boundaries come from the layers' thermal resistances, exactly as in the heat tab's steady-state calculation, using the monthly mean outdoor and room temperatures. Sun is not included. The outside film is 0.04 m²K/W and the inside film 0.13 (0.10 for a roof):
          </p>
          <Eq>T<sub>k</sub> = T<sub>out</sub> + (T<sub>in</sub> − T<sub>out</sub>) × (R<sub>se</sub> + ΣR up to boundary k) ÷ R<sub>total</sub></Eq>
          <p>
            Vapour flows by diffusion through each layer in proportion to the pressure difference across it and in inverse proportion to its sd:
          </p>
          <Eq>g = δ<sub>air</sub> × Δp ÷ sd    δ<sub>air</sub> = 2 × 10⁻¹⁰ kg/(m·s·Pa)</Eq>
          <p>
            In a steady state the same flow passes through every layer, so the drop in pressure across each is proportional to its sd. That is the vapour twin of temperature falling in proportion to R. Most of the drop falls across the vapour-tight layers, and open layers are nearly flat.
          </p>
          <p>
            If the build-up has a <b>ventilated gap</b> (a roof tile batten void, for instance), everything outside it is at outdoor conditions, so the analysis starts at the inner face of the gap.
          </p>
        </section>

        <section id="msim-saturation" className="learn-section">
          <h2>3. Where it saturates</h2>
          <p>
            At every layer boundary the tool works out the saturation pressure from the temperature there. The straight vapour pressure line from outside to inside is then checked against it. The air cannot hold more than saturation, so where the line would go above it, the pressure there is <b>pinned to saturation</b> and the water that would have been extra condenses.
          </p>
          <p>
            Pinning a boundary changes the line on both sides of it, which may push another boundary over the limit. The tool therefore repeats: it pins the boundary with the largest excess, redraws, re-checks the others, and carries on until nothing is over (at most 50 passes, normally one or two). The boundaries it pins are the <b>condensation planes</b>. Condensation is only checked at the boundaries between layers, not inside a layer.
          </p>
        </section>

        <section id="msim-balance" className="learn-section">
          <h2>4. Condensing and drying through the year</h2>
          <p>
            A condensation plane sits between two vapour flows: vapour arriving from the warm, inner side and vapour leaving towards the cold, outer side. The difference is the water left behind:
          </p>
          <Eq>condensation rate = δ<sub>air</sub> × [ (p<sub>in side</sub> − p<sub>sat</sub>) ÷ sd<sub>in side</sub> − (p<sub>sat</sub> − p<sub>out side</sub>) ÷ sd<sub>out side</sub> ]</Eq>
          <p>
            Multiply by the seconds in the month, and by 1000, to get grams per square metre. A positive result is water accumulating. A negative one means evaporation, which can only take away what is already there, so the amount held never goes below zero.
          </p>
          <p>
            Any boundary that holds water from an earlier month is treated as <b>saturated</b> from the start of the next month, because wet material keeps the air in it full. That is how the water dries out again: as spring arrives the vapour pressure on either side falls below the saturation level of the damp boundary, the balance turns negative, and the stored water evaporates away.
          </p>
          <p>
            The one exception is a boundary next to an <b>air cavity</b>. The water formed there is assumed to drain out through the weep holes, so the amount is recorded as "drained" each month but the amount held stays at zero. This assumes the cavity is clear and has working drainage, which is worth checking on site, especially in older walls where mortar droppings can block it.
          </p>
          <p>
            The simulation starts in <b>October</b>, with everything dry, so the winter build-up and summer drying appear in order. It runs five years back to back. Under 0.5 g/m² counts as dry.
          </p>
        </section>

        <section id="msim-wet" className="learn-section">
          <h2>5. Wet-cup µ and absorbent layers</h2>
          <p>
            Each layer starts with its dry-cup µ. But the pressure profile decides the humidity in each layer, and the humidity decides which µ applies. To square this, the tool re-solves the month up to four times: any layer whose average humidity is above <b>70%</b> switches to its wet-cup µ (when that is lower), and the profile is redrawn until the choices stop changing. Hygroscopic materials let vapour through more freely when damp, and this lets the model capture it.
          </p>
          <p>
            For absorbent layers, the water at the busiest boundary is divided over the organic absorbent layers either side, taking the depth of each as at most 30 mm. The capacity in grams of dry material per square metre is density × depth in millimetres, and the moisture content is:
          </p>
          <Eq>moisture content = water held ÷ dry material in the absorbing depth    (compared with 18%)</Eq>
          <p>
            If no absorbent layer is adjacent, the result is reported as free water instead.
          </p>
        </section>

        <section id="msim-sources" className="learn-section">
          <h2>6. Rain and rising damp as vapour sources</h2>
          <p>
            Both are added as <b>fixed pressures</b> at particular points in the wall, drawn into the profile before condensation is checked. They are supplies, not stores: they never run out and never accumulate.
          </p>
          <h3>Rain</h3>
          <p>
            The wetness of the outer face for the month, from 0 to 1, is:
          </p>
          <Eq>wetness = (monthly rain × exposure share × absorbency) ÷ 15 mm    (capped at 1)</Eq>
          <p>
            The monthly rain is a typical Midlands table (about 50 to 80 mm) scaled for the city, from 0.8 for London to 1.4 for Cardiff. The exposure share is 5%, 15%, 30% or 50%. The absorbency is 1 if the outer layer's µ is 60 or less, 0.3 if it is up to 1000, and 0 if it is tighter than that or is not a solid layer. The 15 mm is the monthly rain on the wall that keeps a porous face fully wet, allowing for run-off and drying between showers. The vapour pressure at the outer face then moves from the outdoor value towards saturation at a sun-warmed face:
          </p>
          <Eq>p<sub>face</sub> = p<sub>out</sub> + wetness × ( p<sub>sat</sub>(T<sub>out</sub> + sun warming) − p<sub>out</sub> )</Eq>
          <p>
            The sun-warming is a typical monthly daytime mean, from about 0.3 K in December to 5.5 K in June and July. It affects the pressure only, not the wall's temperatures.
          </p>
          <h3>Rising damp</h3>
          <p>
            The tool finds the <b>base masonry</b>: the run of layers from the outside whose conductivity is between 0.3 and 5 W/mK, stopping at the first insulation or air layer. Every boundary inside that run, other than the room side, is pinned to the footing humidity (85% or 97%) of its own saturation pressure. It is never set below the outdoor pressure, and never above 99% of saturation, so it behaves as a damp source and not as condensation.
          </p>
        </section>

        <section id="msim-results" className="learn-section">
          <h2>7. Working out the results</h2>
          <h3>The verdict</h3>
          <p>
            <b>None</b> if the total held never reaches 0.5 g/m². <b>Dries out</b> if it does, but is below 0.5 g/m² again at the end of year five. <b>Builds up</b> otherwise. The peak is the largest total in any month, and the boundary named is the one holding the most at that time. The "dry again by" month is the first one after the first-year peak when the total is back under 0.5 g/m².
          </p>
          <h3>Mould</h3>
          <p>
            The inner surface humidity is the room's vapour pressure divided by the saturation pressure at the inner surface's temperature. Months above 80% are flagged. For this check only, the inside film is taken as 0.25 m²K/W, as ISO 13788 sets for walls and roofs. That allows for the colder spots in corners and behind furniture, where mould usually starts, so the surface is a little colder than in the condensation calculation.
          </p>
          <h3>Flow arrows</h3>
          <p>
            For each layer, the flow is δ<sub>air</sub> × (pressure on the outer side − pressure on the inner side) ÷ sd, converted to grams per square metre per day, positive towards the inside. Arrow thickness and darkness are drawn on a logarithmic scale, because flows differ by factors of thousands, and about 100 g/m² per day is the full width. The moving dashes always run in the direction of flow.
          </p>
          <h3>Animation</h3>
          <p>
            When you move to another month, every number on the pressure chart is eased from the old value to the new one over about half a second. The easing is only for show: the calculation for each month is done once, up front.
          </p>
        </section>

        <section id="mlimits" className="learn-section">
          <h2>What the moisture model leaves out</h2>
          <p>Again, these are the main simplifications, so you know how far to trust the results.</p>
          <ul>
            <li><b>Monthly averages.</b> There are no daily swings, heatwaves, cold snaps or storms. The sun-warming of a wet wall in a hot afternoon is understated.</li>
            <li><b>No liquid water.</b> Water is a vapour source or a stored amount at a boundary. It does not soak through stone or brick by capillary action, run down a face, or redistribute itself within a layer. For stone and brick walls this is the biggest gap. Frost damage is not modelled either.</li>
            <li><b>No storage in masonry.</b> Rain and rising damp are unlimited supplies at fixed vapour pressures. The wall does not get wetter or drier over time because of them.</li>
            <li><b>Limited absorption.</b> Only organic materials are treated as absorbing condensate, within a fixed 30 mm. Real absorbent materials hold water much more gradually and redistribute it.</li>
            <li><b>Two numbers per material.</b> One dry-cup and one wet-cup µ, with a single switch at 70% humidity. Real materials change smoothly. Several heritage values are mid-range picks from wide published ranges, and a few materials have no µ at all.</li>
            <li><b>Diffusion only.</b> Moist air leaking through gaps, joints and service penetrations can carry far more water than diffusion does, and none of that is modelled.</li>
            <li><b>One dimension.</b> A uniform wall, with no thermal bridges, window reveals, corners or junctions with the floor.</li>
            <li><b>Typical, not measured, climate.</b> The outdoor humidity and rain are broad UK tables, and the indoor vapour load is a simple rule that falls with outdoor temperature.</li>
            <li><b>No latent heat.</b> Condensation and evaporation release and absorb heat, but the temperatures are taken from the heat calculation without that.</li>
            <li><b>Mould as a single line.</b> 80% surface humidity is a standard simplification. Real mould depends on the material, its temperature and how long the conditions last.</li>
          </ul>
          <Callout title="When you need a proper moisture simulation">
            <p>
              For a real project, especially internal insulation on a solid old wall, use a transient hygrothermal tool such as WUFI. It follows moisture hour by hour, including liquid water and the storage of the materials. Use this tab to compare build-ups and to learn <em>why</em> vapour-open and vapour-tight systems behave differently.
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
            <dd>Moisture drawn up from the ground into the base of a wall by capillary action.</dd>
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
      </article>
    </div>
  );
}
