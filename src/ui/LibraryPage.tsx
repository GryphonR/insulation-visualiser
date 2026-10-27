import { useMemo, useState } from 'react';
import { BUILTIN_STACKUPS } from '../engine/library';
import { Card, uid } from './hform';
import { PresetBrowser } from './AddBuildupModal';
import { useProject } from './project';
import { StackupModal } from './StackupModal';

/** The wider build-up library: browse presets, create your own, remove your own, or add any to the project. */
export function LibraryPage() {
  const { house, upd, customStackups, setCustomStackups } = useProject();
  const [creating, setCreating] = useState(false);
  const library = useMemo(() => [...BUILTIN_STACKUPS, ...customStackups], [customStackups]);
  return (
    <div style={{ padding: 20 }}>
      <Card title="Build-up library" note="Presets and your own build-ups. Add any of them to this project; your own can also be removed from the library."
        right={<button type="button" className="btn-primary" onClick={() => setCreating(true)}>+ New build-up</button>}>
        <PresetBrowser tools library={library} have={new Set(house.buildups.map((x) => x.name))}
          onAdd={(p) => upd((h) => { h.buildups.push({ ...structuredClone(p), id: uid('b') }); })}
          onDelete={(id) => setCustomStackups((prev) => prev.filter((s) => s.id !== id))} />
      </Card>
      {creating && (
        <StackupModal library={library} title="New build-up" initial={{ name: '', layers: [['pir', 100]] }}
          onCancel={() => setCreating(false)}
          onSave={(d) => { setCustomStackups((prev) => [...prev, { id: uid('custom'), name: d.name, layers: d.layers, orient: d.orient }]); setCreating(false); }} />
      )}
    </div>
  );
}
