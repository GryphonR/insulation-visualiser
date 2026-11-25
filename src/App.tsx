import { Suspense, lazy, useEffect, useState } from 'react';
import { LIBRARY_KEY, loadCustomStackups, saveCustomStackups } from './engine/library';
import type { Stackup } from './engine/library';
import { newProject } from './engine/house-scenarios';
import { AdminPage } from './ui/AdminPage';
import { BuildupsPage } from './ui/BuildupsPage';
import { ErrorScreen } from './ui/ErrorScreen';
import { EnergyPage, SitePage, StoreysPage, VentPage } from './ui/HouseSettings';
import { HouseBills } from './ui/HouseBills';
import { HouseHeating } from './ui/HouseHeating';
import { HouseMoisture } from './ui/HouseMoisture';
import { HouseReport } from './ui/HouseReport';
import { HouseRuns } from './ui/HouseRuns';
import { FloorPage, GainsPage, OpeningsPage, SpacesPage } from './ui/HouseMore';
import { HouseStart } from './ui/HouseStart';
import { ScenariosPage } from './ui/HouseWorkspace';
import { HouseSchematic } from './ui/HouseSchematic';
import { LearnPage } from './ui/LearnPage';
import { LibraryPage } from './ui/LibraryPage';
import { MaterialsPage } from './ui/MaterialsPage';
import { PlanPage } from './ui/PlanPage';
import { ProjectsPage } from './ui/ProjectsPage';
import { ResultsPage } from './ui/ResultsPage';
import { RoomPage } from './ui/RoomPage';
import { Shell } from './ui/Shell';
import { WallPage } from './ui/WallPage';
import { ProjectProvider, useProject } from './ui/project';
import { go, href, useRoute } from './ui/route';
import { PROJECT_LIMIT_MSG } from './engine/limits';
import { sanitizeProject } from './engine/house-scenarios';
import { addImportedMaterials } from './engine/data';
import { fetchShared } from './engine/share';
import './ui/house.css';

// Three.js is big: load the 3D view only when it is opened.
const House3D = lazy(() => import('./ui/House3D'));
import './ui/shell.css';

export default function App() {
  const [customStackups, setCustomStackups] = useState<Stackup[]>(() => loadCustomStackups());
  // Don't write back what we just loaded: if the stored JSON was unreadable, that would wipe it.
  const [loadedStackups] = useState(customStackups);
  useEffect(() => {
    if (customStackups !== loadedStackups) saveCustomStackups(customStackups);
  }, [customStackups, loadedStackups]);
  // Changed in another tab, or synced from another device.
  useEffect(() => {
    const f = (e: StorageEvent) => { if (e.key === LIBRARY_KEY) setCustomStackups(loadCustomStackups()); };
    window.addEventListener('storage', f);
    return () => window.removeEventListener('storage', f);
  }, []);

  return (
    <ErrorScreen>
      <ProjectProvider customStackups={customStackups} setCustomStackups={setCustomStackups}>
        <Routes />
      </ProjectProvider>
    </ErrorScreen>
  );
}

function Routes() {
  const parts = useRoute();
  const { house, active, ordered, project, setProject, setHouse, createProject, canAddProject } = useProject();
  // No hash: the projects screen is where the app opens.
  const route = parts[0] ?? 'projects';
  const arg = parts[1], arg2 = parts[2];
  useEffect(() => { window.scrollTo(0, 0); }, [route, route === 'wall' ? '' : arg]); // Simulate rewrites its ids as you pick build-ups

  let page;
  switch (route) {
    case 'start':
      page = !canAddProject ? (
        <section className="card panel">
          <h2>Project limit reached</h2>
          <p>{PROJECT_LIMIT_MSG}</p>
          <div className="chips"><a className="btn-primary as-btn" href={href('projects')}>Go to projects</a></div>
        </section>
      ) : (
        <HouseStart
          onCancel={() => go('projects')}
          onCreate={(h, job) => {
            // No heating zones to start with: they are added by hand where wanted (rarely, with a heat pump).
            createProject({ ...newProject({ ...h, heating: { ...h.heating, zones: [], emitters: h.heating.emitters.map((e) => ({ ...e, zone: '' })) } }), ...job }); go('buildups', 'start');
          }} />
      );
      break;
    case 'plan': page = <PlanPage key={arg ?? 'p'} selected={arg} />; break;
    case 'layout': page = <PlanPage key={`h${arg ?? ''}`} selected={arg} mode="heating" />; break;
    case 'view3d': page = <Suspense fallback={<p className="muted small">Loading the 3D view…</p>}><House3D /></Suspense>; break;
    case 'room': page = <RoomPage key={`${arg}/${arg2 ?? ""}`} id={arg ?? ''} initialTab={arg2} />; break;
    case 'projects': page = <ProjectsPage />; break;
    case 'site': case 'settings': page = <SitePage />; break;
    case 'storeys': case 'floor': page = <><StoreysPage /><FloorPage /></>; break;
    case 'vent': page = <VentPage />; break;
    case 'buildups': page = <BuildupsPage key={arg ?? 'b'} selected={arg} />; break;
    case 'library': page = <LibraryPage />; break;
    case 'materials': page = <MaterialsPage />; break;
    case 'compare-buildups': case 'wall': page = <WallPage ids={parts.slice(1)} />; break;
    case 'heating': case 'emitters': case 'zones': case 'pipes':
      page = <HouseHeating key={`${active.id}/${route}`} house={house} setHouse={setHouse} section={({ heating: 'system', emitters: 'emitters', zones: 'zones', pipes: 'pipes' } as const)[route]} />; break;
    case 'schematic': page = <HouseSchematic />; break;
    case 'openings': page = <OpeningsPage />; break;
    case 'spaces': page = <SpacesPage />; break;
    case 'gains': page = <GainsPage />; break;
    case 'results': page = <ResultsPage />; break;
    case 'year': case 'conditions': page = <HouseRuns key={`${active.id}/${arg}/${arg2}`} house={house} setHouse={setHouse} project={project} ordered={ordered} initialCase={arg} initialRoom={arg2} />; break;
    case 'energy': page = <EnergyPage />; break;
    case 'bills': page = <HouseBills key={active.id} house={house} setHouse={setHouse} />; break;
    case 'moisture': page = <HouseMoisture key={active.id} house={house} />; break;
    case 'report':
      page = <HouseReport house={house} scenarioName={active.name} project={project}
        onImport={(p) => {
          // Register the file's custom materials first, or cleaning the project drops the layers made of them.
          addImportedMaterials((p as { materials?: unknown }).materials);
          const q = sanitizeProject(p); if (q) setProject(q); else alert('That file has no usable scenarios.');
        }} />;
      break;
    case 'scenarios': case 'compare': page = <ScenariosPage key={route} initial={route === 'compare' ? 'compare' : 'changes'} />; break;
    case 'learn': page = <LearnPage section={arg} />; break;
    case 'admin': page = <AdminPage />; break;
    case 'shared': page = <SharedOpen id={arg ?? ''} />; break;
    default: page = <PlanPage />;
  }
  return <Shell route={route}>{page}</Shell>;
}

/** A shared link (#/shared/<id>): fetch the snapshot and show it read-only, on the plan. */
function SharedOpen({ id }: { id: string }) {
  const { viewShared } = useProject();
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    fetchShared(id).then((s) => { if (live) { viewShared({ ...s, id }); go('plan'); } }, (e) => live && setErr((e as Error).message));
    return () => { live = false; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  return err
    ? <section className="card panel"><h2>Can't open this shared project</h2><p>{err}</p><div className="chips"><a className="btn-primary as-btn" href={href('projects')}>Go to projects</a></div></section>
    : <p className="muted small">Opening the shared project…</p>;
}
