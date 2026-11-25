// Read-only snapshots shared by link (worker/api.ts). What is sent is stripped of the customer's details here, before it leaves the browser.
import { postcodeDistrict } from './climate-mcs';
import { parseProjectFile, projectFileText } from './projects';
import type { Project } from './house-scenarios';

export interface Share { id: string; name: string; created: number }

/** The project as others will see it: under the given name, the postcode cut to its district, no customer, address, job number or traced images. */
export function redact(p: Project, name: string): Project {
  const { customer: _c, address: _a, number: _n, trace: _t, ...rest } = p;
  return {
    ...rest,
    scenarios: p.scenarios.map((s) => ({ ...s, house: { ...s.house, name, climate: { ...s.house.climate, postcode: postcodeDistrict(s.house.climate.postcode ?? '') } } })),
  };
}

export const shareUrl = (id: string) => `${location.origin}${location.pathname}#/shared/${id}`;

const req = async (method: string, path: string, body?: unknown) => {
  const r = await fetch(path, { method, credentials: 'same-origin', ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(r.status === 401 ? 'sign in first' : data?.error === 'terms' ? 'accept the terms in Account first' : data?.error === 'limit' ? 'you have reached the limit of 50 shared links' : r.status === 413 ? 'the project is too large' : `the server said ${r.status}`);
  return data;
};

export const createShare = (projectId: string, p: Project, name: string): Promise<Share> =>
  req('POST', '/api/shares', { project: projectId, name, body: projectFileText(redact(p, name)) });
export const listShares = (projectId: string): Promise<Share[]> => req('GET', `/api/shares?project=${encodeURIComponent(projectId)}`);
export const deleteShare = (id: string): Promise<unknown> => req('DELETE', `/api/shares/${encodeURIComponent(id)}`);

/** A shared snapshot, ready to show; throws if the link is gone or unreadable. */
export async function fetchShared(id: string): Promise<{ name: string; project: Project }> {
  const r = await fetch(`/api/shared/${encodeURIComponent(id)}`);
  if (r.status === 404) throw new Error('This link has been stopped, or never existed.');
  if (!r.ok) throw new Error(`The server said ${r.status}.`);
  const s = await r.json() as { name: string; body: string };
  const project = parseProjectFile(s.body);
  if (!project) throw new Error('The shared project has no usable scenarios.');
  return { name: s.name, project };
}
