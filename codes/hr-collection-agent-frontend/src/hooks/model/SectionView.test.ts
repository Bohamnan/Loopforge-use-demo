import { describe, expect, it } from 'vitest';
import { sampleFields } from '../../test/ApiMocks';
import type { FieldStatus, ResumeFieldKey, ResumeFields } from '../../types/ResumeModel';
import { RESUME_FIELD_KEYS } from '../../types/ResumeModel';
import { getSection } from './SectionConfig';
import {
  buildSectionUpdate,
  coreReady,
  currentValue,
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

describe('buildSectionUpdate (design §4.4)', () => {
  it('submits every field of the section: buffer value else current value, missing scalar -> null, missing list -> []', () => {
    const fields = sampleFields();
    const { update, errors } = buildSectionUpdate(getSection('intent'), fields, { expected_city: '  上海 ' });
    expect(errors).toEqual({});
    expect(update).toEqual({
      job_title: '供应链经理',
      expected_city: '上海',
      expected_salary: '30-40K',
      available_time: null,
    });
    const list = buildSectionUpdate(getSection('certificates'), fields, {});
    expect(list.update).toEqual({ certificates_honors: [] });
  });

  it('only touches fields of the requested section', () => {
    const { update } = buildSectionUpdate(getSection('skills'), sampleFields(), { job_title: 'x', skills: ['Excel', 'SAP'] });
    expect(Object.keys(update)).toEqual(['skills']);
    expect(update.skills).toEqual(['Excel', 'SAP']);
  });

  it('normalises the phone and trims text for the basic section', () => {
    const { update, errors } = buildSectionUpdate(getSection('basic'), sampleFields(), { phone: '138 0013-8000', name: ' 甲 ' });
    expect(errors).toEqual({});
    expect(update).toMatchObject({ name: '甲', phone: '13800138000', email: 'test.user@example.com', homepage: null });
  });

  it('reports core errors by field and does not drop them from the update', () => {
    const { errors } = buildSectionUpdate(getSection('basic'), sampleFields(), { name: '  ', phone: '123', email: 'x' });
    expect(errors).toEqual({ name: 'required', phone: 'invalid_format', email: 'invalid_format' });
  });

  it('treats a missing core value as required', () => {
    const fields = sampleFields();
    fields.email.value = null;
    fields.email.status = 'missing';
    expect(buildSectionUpdate(getSection('basic'), fields, {}).errors).toEqual({ email: 'required' });
  });

  it('drops blank list entries and trims; blank-only list becomes []', () => {
    const { update } = buildSectionUpdate(getSection('skills'), sampleFields(), { skills: [' Excel ', '  ', ''] });
    expect(update.skills).toEqual(['Excel']);
    expect(buildSectionUpdate(getSection('skills'), sampleFields(), { skills: ['  '] }).update.skills).toEqual([]);
  });

  it('submits the whole experience list, trimming strings and nulling blanks', () => {
    const { update, errors } = buildSectionUpdate(getSection('work'), sampleFields(), {
      work_experiences: [
        { company: ' A公司 ', position: '  ', responsibilities: [' 负责X ', ''] },
        { company: 'B公司' },
      ],
    });
    expect(errors).toEqual({});
    expect(update.work_experiences).toEqual([
      { company: 'A公司', position: null, responsibilities: ['负责X'] },
      { company: 'B公司' },
    ]);
  });

  it('reports limit violations with backend-style paths', () => {
    const long = 'a'.repeat(2001);
    const { errors } = buildSectionUpdate(getSection('work'), sampleFields(), {
      work_experiences: [{}, { company: long }],
    });
    expect(errors).toEqual({ 'work_experiences[1].company': 'too_long' });
    const tooMany = buildSectionUpdate(getSection('skills'), sampleFields(), { skills: Array.from({ length: 51 }, () => 'x') });
    expect(tooMany.errors).toEqual({ skills: 'too_long' });
    const longItem = buildSectionUpdate(getSection('languages'), sampleFields(), { languages: ['ok', 'b'.repeat(1001)] });
    expect(longItem.errors).toEqual({ 'languages[1]': 'too_long' });
  });

  it('allows blank non-core scalars (confirm as empty)', () => {
    const { update, errors } = buildSectionUpdate(getSection('self_evaluation'), sampleFields(), {});
    expect(errors).toEqual({});
    expect(update).toEqual({ self_evaluation: null });
  });
});

describe('currentValue', () => {
  it('prefers an unsubmitted edit, including an explicit null or empty list', () => {
    const fields = sampleFields();
    expect(currentValue(fields, {}, 'job_title')).toBe('供应链经理');
    expect(currentValue(fields, { job_title: '新岗位' }, 'job_title')).toBe('新岗位');
    expect(currentValue(fields, { job_title: null }, 'job_title')).toBeNull();
    expect(currentValue(fields, { skills: [] }, 'skills')).toEqual([]);
  });
});
