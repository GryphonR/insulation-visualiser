import { describe, expect, it } from 'vitest';
import { redact } from './share';
import { newProject, withPostcode } from './house-scenarios';

describe('shared snapshot', () => {
  it('keeps only the postcode district and drops the customer details', () => {
    const p = { ...withPostcode(newProject(), 'M14 5AB'), customer: 'Ms Smith', address: '1 High St', number: 'J-7', trace: { images: { 0: 'data:' } } } as any;
    const q = redact(p, 'House in M14');
    expect(q).not.toHaveProperty('customer');
    expect(q).not.toHaveProperty('address');
    expect(q).not.toHaveProperty('number');
    expect(q).not.toHaveProperty('trace');
    expect(q.scenarios.every((s) => s.house.climate.postcode === 'M14' && s.house.name === 'House in M14')).toBe(true);
    expect(JSON.stringify(q)).not.toMatch(/5AB|Smith|High St/);
  });
});
