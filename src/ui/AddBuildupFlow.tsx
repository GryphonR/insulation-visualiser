import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { BUILTIN_STACKUPS } from '../engine/library';
import type { Buildup, BuildupKind } from '../engine/house';
import { AddBuildupModal } from './AddBuildupModal';
import { StackupModal } from './StackupModal';
import { uid } from './hform';
import { useProject } from './project';

/** The value of the "Add build-up…" entry at the bottom of a build-up picker. */
export const ADD_BUILDUP = '__add-buildup';
export const ADD_BUILDUP_LABEL = '＋ Add build-up…';

type Ask = (kind: BuildupKind, picked: (id: string) => void) => void;
const Ctx = createContext<Ask>(() => {});
/** Opens the add build-up modal on `kind`; once one is added to the project, `picked` gets its id to apply it where the picker was. */
export const useAddBuildup = () => useContext(Ctx);

export function AddBuildupProvider({ children }: { children: ReactNode }) {
  const { house, upd, customStackups } = useProject();
  const library = useMemo(() => [...BUILTIN_STACKUPS, ...customStackups], [customStackups]);
  const [ask, setAsk] = useState<{ kind: BuildupKind; picked: (id: string) => void; creating?: boolean } | null>(null);
  const add = (b: Omit<Buildup, 'id'>) => {
    const id = uid('b');
    upd((h) => { h.buildups.push({ ...structuredClone(b), id }); });
    ask?.picked(id);
    setAsk(null);
  };
  return (
    <Ctx.Provider value={(kind, picked) => setAsk({ kind, picked })}>
      {children}
      {ask && !ask.creating && (
        <AddBuildupModal library={library} have={new Set(house.buildups.map((x) => x.name))} initialCat={ask.kind}
          onClose={() => setAsk(null)} onAdd={(p) => add(p)} onCustom={() => setAsk({ ...ask, creating: true })}
          // Starts from a typical modern unit; its own figures are set under Build-ups.
          onCustomFixed={(k) => add(k === 'glazing' ? { name: 'Custom window', kind: k, layers: [], u: 1.4, g: 0.63, frame: 0.3 } : { name: 'Custom door', kind: k, layers: [], u: 1.4 })} />
      )}
      {ask?.creating && (
        <StackupModal library={library} title="New build-up" initial={{ name: '', layers: [['pir', 100]], kind: ask.kind === 'glazing' || ask.kind === 'door' ? undefined : ask.kind, orient: ask.kind === 'roof' ? 'roof' : undefined }}
          onCancel={() => setAsk(null)} onSave={(d) => add({ name: d.name, kind: d.kind ?? 'wall', layers: d.layers })} />
      )}
    </Ctx.Provider>
  );
}
