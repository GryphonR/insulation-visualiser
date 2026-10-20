import type { ReactNode } from 'react';

interface Section {
  id: string;
  title: string;
  group: string;
}

const SECTIONS: Section[] = [
  { id: 'what', title: 'What this tool does', group: 'Overview' },
  { id: 'how-to-use', title: 'Using it in four steps', group: 'Overview' },
  { id: 'heat', title: 'Heat and temperature', group: 'The ideas' },
  { id: 'conduction', title: 'Conduction and R-values', group: 'The ideas' },
  { id: 'u-value', title: 'The U-value', group: 'The ideas' },
  { id: 'mass', title: 'Thermal mass', group: 'The ideas' },
  { id: 'dynamic', title: 'Decrement and time lag', group: 'The ideas' },
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
        <text x={(x(15) + x(21)) / 2} y={mid - 76} className="svt-mid">time lag</text>
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
        <section id="what" className="learn-section">
          <h2>What this tool does</h2>
          <p>
            Most advice about insulation boils a wall down to a single number, the <b>U-value</b>: how much heat leaks through each square metre for every degree of temperature difference between inside and outside. That number is useful, but it describes a wall on a day when nothing changes. Real days do change. The sun comes up, the air warms and cools, and the heat takes time to travel through the materials.
          </p>
          <p>
            This simulator takes a wall or roof, made of layers you choose, and plays out a whole 24-hour day on it. You can watch the heat move through each layer, minute by minute, and see how heavy materials such as brick or concrete soak up heat and give it back later, while light materials such as timber and mineral wool respond quickly.
          </p>
          <p>It calculates:</p>
          <ul>
            <li><b>Steady-state performance:</b> the U-value and total thermal resistance of your build-up.</li>
            <li><b>Dynamic performance:</b> how much of the outside temperature swing reaches the inside (the decrement factor) and how long it takes (the time lag).</li>
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
            <b>Worked example.</b> Take 100 mm of brick (R = 0.125) and 100 mm of insulation (R = 4.55), plus the two surface films (0.04 + 0.13 = 0.17). The total is 0.125 + 4.55 + 0.17 ≈ 4.85 m²K/W, so U ≈ 0.21 W/m²K. With 20 °C inside and 0 °C outside, the wall leaks about 0.21 × 20 ≈ 4.1 W through each square metre. Those round numbers are illustrative; the simulator uses each material's own data.
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
          <h2>Decrement and time lag</h2>
          <p>
            When the outside temperature rises and falls over a day, a wall with thermal mass does two things to that rhythm. It makes the swing <b>smaller</b> and it makes it <b>arrive later</b>. Engineers give these two effects names:
          </p>
          <ul>
            <li>
              <b>Decrement factor</b> (between 0 and 1): the fraction of the outside heat swing that still shows up at the inner face. 0.3 means only 30% gets through. Lower is better in summer.
            </li>
            <li>
              <b>Time lag</b> (in hours): the delay between the outside peak and the peak of heat flow at the inner face. A lag of 8 hours means the heat from a 3 pm peak arrives at 11 pm.
            </li>
          </ul>
          <LagFigure />
          <p>
            Compare this to a steady-state calculation, which has no memory and no delay. It would say the heat flow follows the outside temperature instantly. The chart called <em>Heat flow into the room</em> shows both: the dashed grey line is the steady-state estimate, and the blue line is what the simulation produces once thermal mass is accounted for.
          </p>
          <p>
            Good insulation and good thermal mass do different jobs. Insulation (a low U-value) shrinks the overall flow. Mass shrinks and shifts the daily <em>swing</em> in that flow. A wall can be strong at one and weak at the other, which is why this tool shows both.
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
              <b>Condensation and mould.</b> Warm indoor air holds moisture. When it touches a surface colder than its dew point, the moisture condenses, and persistently damp surfaces grow mould. A better-insulated wall has a warmer inner face, and that is a big part of why insulation reduces mould risk. This tool does not model moisture itself, but the inner face temperature is the thing to watch.
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
              <tr><td>Time lag</td><td>Hours between the outside peak and the inner heat-flow peak.</td></tr>
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
            <li>Derive the summary numbers (U-value, decrement, lag, and so on) from the recorded day.</li>
          </ol>
          <p>
            The engine is a small amount of TypeScript. Sun position and brightness are in <code>solar.ts</code>, the wall model in <code>simulate.ts</code>, and the assembly of a scenario in <code>scenario.ts</code>. The reference data (materials, locations, weather presets) lives in <code>data.ts</code>.
          </p>
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
              <b>Onto the surface.</b> The direct beam is multiplied by the cosine of the angle between the sun and the wall's surface direction, so a wall facing away from the sun receives none of it. Diffuse sky light is split evenly across the sky dome, and a fixed 20% of the light reaching the ground is reflected back onto the wall. For a flat roof the sun's height directly sets the angle.
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
            where α is the surface absorptance (0.3, 0.55 or 0.85), <em>I</em> is the irradiance from step 2 and R<sub>se</sub> is the 0.04 m²K/W outside surface film. For a flat roof there is one further term: a long-wave radiation correction of −3.6 × clearness (in kelvin), representing heat radiated away to a clear sky. It is largest on clear nights, and absent under cloud.
          </p>
          <p>
            From here on, the outside of the wall is treated as if it sat in air at exactly the sol-air temperature, connected to the wall's outer surface through the outside film resistance.
          </p>
        </section>

        <section id="sim-slices" className="learn-section">
          <h2>4. Slicing the wall</h2>
          <p>
            Each layer is divided into thin slices (<b>cells</b>), thinner for dense, conductive materials such as brick and concrete, where heat moves quickly, and thicker for insulators. A layer with conductivity above 0.4 W/mK gets a slice about every 15 mm, and anything else about every 40 mm, with a minimum of 2 and a maximum of 14 slices per layer. Each slice is described by two numbers:
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
            The first slice connects to the outside through the outside film (R<sub>se</sub>), and the last to the room through the inside film (R<sub>si</sub>). An air cavity is given a fixed resistance (0.18 m²K/W) whatever its width, and holds almost no heat. Each slice is assumed to be at a single temperature, and the heat flows between neighbours are one-dimensional: straight through the thickness of the wall.
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
            The wall has to begin from some state. The tool starts it at the steady-state temperature profile for the day's <em>average</em> outside and inside temperatures, then repeats the same day again and again. After a few days the wall has "forgotten" its starting guess and settles into a repeating daily cycle. It runs 6 days for the fixed and scheduled modes, and 14 days for the free-floating mode, where the room has to settle too. Only the final day is recorded: 144 snapshots, one every 10 minutes, plus a closing 24:00 frame.
          </p>
          <p>
            That settled cycle is what you see. A real wall's temperatures also depend on what happened over previous days and weeks. This tool shows the repeating pattern you would get if every day were the same.
          </p>
        </section>

        <section id="sim-room" className="learn-section">
          <h2>7. The room</h2>
          <h3>Fixed and schedule modes</h3>
          <p>
            The room air temperature is simply prescribed for each time step: a constant, or, for the schedule, the comfort or setback value depending on whether the clock falls inside one of the two heating periods. The room is therefore an input, and the model only calculates what the wall does.
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
            In each time step, the wall equations and the room equation are solved together. This is possible because the wall's response to the room temperature is a fixed relationship that can be worked out once. In this mode the decrement factor and time lag shown are measured separately, in a second run with the room held steady, since they describe the wall itself, not the room.
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
            The U-value is calculated directly, as 1 ÷ the sum of all layer resistances and the two surface films, as explained above. It is not the result of the simulation.
          </p>
          <h3>Decrement factor and time lag</h3>
          <p>
            A day-long cycle can be broken into a simple, once-a-day cosine wave (its <em>first harmonic</em>) plus faster ripples. The tool fits that daily wave to both the sol-air temperature and the heat flow at the inner face, using a discrete Fourier sum, and compares them:
          </p>
          <Eq>decrement factor = (amplitude of inner heat flow) ÷ (U × amplitude of sol-air temperature)</Eq>
          <Eq>time lag = how many hours the inner heat-flow wave peaks after the sol-air wave</Eq>
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
            <li><b>No moisture.</b> Damp materials conduct heat better and store more of it, and evaporation and condensation absorb or release heat. None of that is modelled. Nor is vapour movement, interstitial condensation or mould growth.</li>
            <li><b>No air movement in the wall.</b> Cavities act as a fixed resistance. Ventilated cavities, convection in cavities and air leakage through gaps are not modelled.</li>
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
            <dt>Diffuse radiation</dt>
            <dd>Sunlight scattered by the sky and clouds, arriving from all directions, as opposed to the direct beam.</dd>
            <dt>Free-floating</dt>
            <dd>A room with no heating or cooling, whose temperature is whatever its surroundings make it.</dd>
            <dt>Irradiance</dt>
            <dd>The power of solar radiation arriving on a surface, in W/m².</dd>
            <dt>Operative temperature</dt>
            <dd>A measure of how warm a room feels, combining air temperature and the temperature of surrounding surfaces. Roughly their average.</dd>
            <dt>R-value (thermal resistance)</dt>
            <dd>How strongly a layer resists heat flow, in m²K/W. Thickness divided by conductivity. Higher means better insulated.</dd>
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
            <dt>Time lag</dt>
            <dd>The delay, in hours, between a peak outside and the resulting peak of heat flow at the inner face.</dd>
            <dt>U-value</dt>
            <dd>The steady rate of heat flow through one square metre of a wall per kelvin of temperature difference, in W/m²K. The reciprocal of total resistance.</dd>
          </dl>
          <p><button type="button" className="btn-primary" onClick={onOpenSimulator}>Back to the simulator</button></p>
        </section>
      </article>
    </div>
  );
}
