import { describe, expect, it } from 'vitest';
import { sampleFields } from '../../test/ApiMocks';
import type { FieldStatus, ResumeFieldKey, ResumeFields } from '../../types/ResumeModel';
import { RESUME_FIELD_KEYS } from '../../types/ResumeModel';
import { getSection } from './SectionConfig';
import {
  coreReady,
  firstTodoSection,
  hasUnsubmittedEdits,
  orderedFieldKeys,
  sectionStatus,
  statusCounts,
  unconfirmedCount,
} from './SectionView';

function withStatuses(status: FieldStatus, overrides: Partial<Record<ResumeFieldKey, FieldStatus>> = {}): ResumeFields {
  const fields = sampleFields();
  for (const key of RESUME_FIELD_KEYS) {
    fields[key].status = overrides[key] ?? status;
  }
  return fields;
}

describe('sectionStatus priority: missing > uncertain > recognized > confirmed', () => {
  it('picks the highest-priority status in the section', () => {
    const personal = getSection('personal');
    expect(sectionStatus(personal, withStatuses('confirmed', { gender: 'recognized' }))).toBe('recognized');
    expect(sectionStatus(personal, withStatuses('confirmed', { gender: 'recognized', work_years: 'uncertain' }))).toBe('uncertain');
    expect(
      sectionStatus(personal, withStatuses('confirmed', { gender: 'recognized', work_years: 'uncertain', current_city: 'missing' })),
    ).toBe('missing');
    expect(sectionStatus(personal, withStatuses('confirmed'))).toBe('confirmed');
  });
});

describe('firstTodoSection', () => {
  it('prefers the first section containing missing or uncertain fields', () => {
    const fields = withStatuses('recognized', { expected_salary: 'uncertain', homepage: 'recognized' });
    expect(firstTodoSection(fields)).toBe('intent');
    const withMissing = withStatuses('recognized', { skills: 'missing', expected_salary: 'uncertain' });
    expect(firstTodoSection(withMissing)).toBe('intent');
    expect(firstTodoSection(withStatuses('recognized', { skills: 'missing' }))).toBe('skills');
  });

  it('falls back to the first section with recognized fields', () => {
    expect(firstTodoSection(withStatuses('confirmed', { gender: 'recognized' }))).toBe('personal');
  });

  it('returns null when everything is confirmed', () => {
    expect(firstTodoSection(withStatuses('confirmed'))).toBeNull();
  });
});

describe('coreReady', () => {
  it('is true when name, phone and email are confirmed and valid', () => {
    const fields = withStatuses('recognized', { name: 'confirmed', phone: 'confirmed', email: 'confirmed' });
    expect(coreReady(fields, {})).toBe(true);
  });

  it('is false when any core field is not confirmed', () => {
    const fields = withStatuses('recognized', { name: 'confirmed', phone: 'confirmed', email: 'recognized' });
    expect(coreReady(fields, {})).toBe(false);
  });

  it('is false when a confirmed core value is invalid', () => {
    const fields = withStatuses('recognized', { name: 'confirmed', phone: 'confirmed', email: 'confirmed' });
    fields.phone.value = '123';
    expect(coreReady(fields, {})).toBe(false);
    fields.phone.value = null;
    expect(coreReady(fields, {})).toBe(false);
  });

  it('is false while a core field has an unsubmitted edit', () => {
    const fields = withStatuses('recognized', { name: 'confirmed', phone: 'confirmed', email: 'confirmed' });
    expect(coreReady(fields, { email: 'other@example.com' })).toBe(false);
    expect(coreReady(fields, { job_title: 'x' })).toBe(true);
  });
});

describe('counts', () => {
  it('counts statuses over the 22 fields', () => {
    const fields = withStatuses('confirmed', { gender: 'missing', work_years: 'uncertain', homepage: 'uncertain', skills: 'recognized' });
    expect(statusCounts(fields)).toEqual({ recognized: 1, uncertain: 2, missing: 1, confirmed: 18 });
    expect(unconfirmedCount(fields)).toBe(4);
  });

  it('counts 0 unconfirmed when all are confirmed', () => {
    expect(unconfirmedCount(withStatuses('confirmed'))).toBe(0);
  });

  it('counts all 22 when nothing is confirmed', () => {
    expect(unconfirmedCount(withStatuses('recognized'))).toBe(22);
  });
});

describe('hasUnsubmittedEdits', () => {
  it('is true only when the buffer has entries', () => {
    expect(hasUnsubmittedEdits({})).toBe(false);
    expect(hasUnsubmittedEdits({ skills: [] })).toBe(true);
    expect(hasUnsubmittedEdits({ job_title: null })).toBe(true);
  });
});

describe('orderedFieldKeys (highlight missing / uncertain first, stable otherwise)', () => {
  it('moves missing and uncertain fields to the front', () => {
    const fields = withStatuses('recognized', { homepage: 'missing', email: 'uncertain' });
    expect(orderedFieldKeys(getSection('basic'), fields)).toEqual(['email', 'homepage', 'name', 'phone']);
  });

  it('keeps the configured order when nothing needs attention', () => {
    expect(orderedFieldKeys(getSection('basic'), withStatuses('confirmed'))).toEqual(['name', 'phone', 'email', 'homepage']);
  });
});
