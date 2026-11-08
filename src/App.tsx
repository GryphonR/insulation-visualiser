import { Suspense, lazy, useEffect, useState } from 'react';
import { loadCustomStackups, saveCustomStackups } from './engine/library';
import type { Stackup } from './engine/library';
import { newProject } from './engine/house-scenarios';
import { hasSaved } from './engine/projects';
import { BuildupsPage } from './ui/BuildupsPage';
import { ErrorScreen } from './ui/ErrorScreen';
import { EnergyPage, SitePage, StoreysPage, VentPage } from './ui/HouseSettings';
import { HouseBills } from './ui/HouseBills';
import { HouseHeating } from './ui/HouseHeating';
import { HouseMoisture } from './ui/HouseMoisture';
import { HouseReport } from './ui/HouseReport';
import { HouseRuns } from './ui/HouseRuns';
import { ChecksPage, FloorPage, GainsPage, OpeningsPage, SpacesPage } from './ui/HouseMore';
import { HouseStart } from './ui/HouseStart';
import { CompareAB, ScenariosPage } from './ui/HouseWorkspace';
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
import { go, useRoute } from './ui/route';
import { sanitizeProject } from './engine/house-scenarios';
import { addImportedMaterials } from './engine/data';
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
  const [firstVisit] = useState(() => !hasSaved());

  return (
    <ErrorScreen>
      <ProjectProvider customStackups={customStackups} setCustomStackups={setCustomStackups}>
        <Routes firstVisit={firstVisit} />
      </ProjectProvider>
    </ErrorScreen>
  );
}

function Routes({ firstVisit }: { firstVisit: boolean }) {
  const parts = useRoute();
  const { house, active, ordered, project, setProject, setHouse, createProject } = useProject();
  const [started, setStarted] = useState(!firstVisit);
  // No hash: a first visit starts a project; otherwise open the build-ups (step 1).
  const route = parts[0] ?? (started ? 'buildups' : 'start');
  const arg = parts[1], arg2 = parts[2];
  useEffect(() => { window.scrollTo(0, 0); }, [route, route === 'wall' ? '' : arg]); // Simulate rewrites its ids as you pick build-ups

  let page;
  switch (route) {
    case 'start':
      page = (
        <HouseStart
          onCancel={started ? () => go('plan') : undefined}
          onDemo={(p) => { createProject(p); setStarted(true); go('plan'); }}
          onCreate={(h) => {
            createProject(newProject(h)); setStarted(true); go('plan');
          }} />
      );
      break;
    case 'plan': page = <PlanPage key={arg ?? 'p'} selected={arg} />; break;
    case 'view3d': page = <Suspense fallback={<p className="muted small">Loading the 3D view…</p>}><House3D /></Suspense>; break;
    case 'room': page = <RoomPage key={`${arg}/${arg2 ?? ""}`} id={arg ?? ''} initialTab={arg2} />; break;
    case 'projects': page = <ProjectsPage />; break;
    case 'site': page = <SitePage />; break;
    case 'storeys': page = <StoreysPage />; break;
    case 'vent': page = <VentPage />; break;
    case 'buildups': page = <BuildupsPage key={arg ?? 'b'} selected={arg} />; break;
    case 'library': page = <LibraryPage />; break;
    case 'materials': page = <MaterialsPage />; break;
    case 'compare-buildups': case 'wall': page = <WallPage ids={parts.slice(1)} />; break;
    case 'heating': case 'emitters': case 'zones': case 'pipes':
      page = <HouseHeating key={`${active.id}/${route}`} house={house} setHouse={setHouse} section={({ heating: 'system', emitters: 'emitters', zones: 'zones', pipes: 'pipes' } as const)[route]} />; break;
    case 'floor': page = <FloorPage />; break;
    case 'openings': page = <OpeningsPage />; break;
    case 'spaces': page = <SpacesPage />; break;
    case 'checks': page = <ChecksPage />; break;
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
    case 'scenarios': page = <ScenariosPage />; break;
    case 'compare': page = <CompareAB />; break;
    case 'learn': page = <LearnPage section={arg} onOpenSimulator={() => go('plan')} />; break;
    default: page = <PlanPage />;
  }
  return <Shell route={route}>{page}</Shell>;
}
