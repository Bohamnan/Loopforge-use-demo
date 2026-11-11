import { describe, expect, it } from 'vitest';
import { fieldsToValues, sampleFields } from '../../test/ApiMocks';
import type { FieldStatus, ResumeFieldKey, ResumeFields } from '../../types/ResumeModel';
import { RESUME_FIELD_KEYS } from '../../types/ResumeModel';
import { getSection } from './SectionConfig';
import {
  buildSectionUpdate,
  coreReady,
  canConfirmSection,
  currentValue,
  sectionConfirmBlock,
  sectionConfirmState,
  firstTodoSection,
  hasUnsubmittedEdits,
  orderedFieldKeys,
  valuesAsFields,
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

describe('sectionConfirmBlock', () => {
  it('blocks the basic section while a core value is empty or invalid and says why', () => {
    const fields = sampleFields();
    expect(sectionConfirmBlock(getSection('basic'), fields, {})).toBeNull();
    expect(sectionConfirmBlock(getSection('basic'), fields, { email: '' })).toBe('请先补充并修正姓名、手机号、邮箱');
    expect(sectionConfirmBlock(getSection('basic'), fields, { phone: '123' })).toBe('请先补充并修正姓名、手机号、邮箱');
    fields.email.value = null;
    expect(sectionConfirmBlock(getSection('basic'), fields, {})).toBe('请先补充并修正姓名、手机号、邮箱');
  });

  it('never blocks sections without core fields', () => {
    expect(sectionConfirmBlock(getSection('intent'), sampleFields(), { job_title: '' })).toBeNull();
    expect(sectionConfirmBlock(getSection('skills'), sampleFields(), { skills: [] })).toBeNull();
  });
});

describe('buildSectionUpdate: empty experience items', () => {
  it('drops items with no content from the submitted list', () => {
    const { update } = buildSectionUpdate(getSection('work'), sampleFields(), {
      work_experiences: [{ company: 'A公司' }, {}, { company: '  ', responsibilities: [' '] }, { position: '主管' }],
    });
    expect(update.work_experiences).toEqual([{ company: 'A公司' }, { position: '主管' }]);
  });

  it('can submit an empty list to confirm the section as empty', () => {
    const { update } = buildSectionUpdate(getSection('project'), sampleFields(), { project_experiences: [{}] });
    expect(update.project_experiences).toEqual([]);
  });

  it('reports errors with the indexes the user sees, even when empty items are dropped before them', () => {
    const { errors } = buildSectionUpdate(getSection('education'), sampleFields(), {
      educations: [{}, { school: 'x'.repeat(2001) }],
    });
    expect(errors).toEqual({ 'educations[1].school': 'too_long' });
  });
});

describe('canConfirmSection / sectionConfirmState (single rule for the button and the quick reply)', () => {
  it('allows an unconfirmed section and labels it "确认本区"', () => {
    const state = sectionConfirmState(getSection('intent'), sampleFields(), {});
    expect(state).toMatchObject({ block: null, dirty: false, label: '确认本区' });
    expect(canConfirmSection(getSection('intent'), sampleFields(), {})).toBe(true);
  });

  it('a confirmed section without edits is "已确认" and cannot be confirmed again', () => {
    const fields = sampleFields();
    fields.skills.status = 'confirmed';
    expect(sectionConfirmState(getSection('skills'), fields, {}).label).toBe('已确认');
    expect(canConfirmSection(getSection('skills'), fields, {})).toBe(false);
  });

  it('a confirmed section with an edit is "确认修改" and can be confirmed', () => {
    const fields = sampleFields();
    fields.skills.status = 'confirmed';
    expect(sectionConfirmState(getSection('skills'), fields, { skills: ['x'] })).toMatchObject({ dirty: true, label: '确认修改' });
    expect(canConfirmSection(getSection('skills'), fields, { skills: ['x'] })).toBe(true);
  });

  it('is blocked by invalid core values, and by a running request', () => {
    expect(canConfirmSection(getSection('basic'), sampleFields(), { phone: '123' })).toBe(false);
    expect(sectionConfirmState(getSection('basic'), sampleFields(), { phone: '123' }).block).toBe('请先补充并修正姓名、手机号、邮箱');
    expect(canConfirmSection(getSection('intent'), sampleFields(), {}, true)).toBe(false);
  });
});

describe('buildSectionUpdate: blank text-list rows stay where the user left them', () => {
  it('reports an error at the visible row index although blank rows are not submitted', () => {
    const { update, errors } = buildSectionUpdate(getSection('languages'), sampleFields(), { languages: ['', 'ok', 'b'.repeat(1001)] });
    expect(errors).toEqual({ 'languages[2]': 'too_long' });
    expect(update.languages).toEqual(['ok', 'b'.repeat(1001)]);
  });

  it('counts only filled rows against the limit', () => {
    const rows = [...Array.from({ length: 50 }, (_, i) => `技能${i}`), '', ''];
    expect(buildSectionUpdate(getSection('skills'), sampleFields(), { skills: rows }).errors).toEqual({});
  });

  it('nested lists keep the visible index too', () => {
    const { errors, update } = buildSectionUpdate(getSection('work'), sampleFields(), {
      work_experiences: [{ company: 'A', responsibilities: ['', 'x'.repeat(2001)] }],
    });
    expect(errors).toEqual({ 'work_experiences[0].responsibilities[1]': 'too_long' });
    expect(update.work_experiences).toEqual([{ company: 'A', responsibilities: ['x'.repeat(2001)] }]);
  });
});

describe('valuesAsFields', () => {
  it('produces all 22 keys carrying the saved values (rendering only)', () => {
    const values = fieldsToValues(sampleFields());
    const fields = valuesAsFields(values);
    expect(Object.keys(fields)).toEqual([...RESUME_FIELD_KEYS]);
    expect(fields.name.value).toBe(values.name);
    expect(fields.work_experiences.value).toEqual(values.work_experiences);
    expect('status' in fields.name).toBe(false); // no placeholder status (SUGGEST-3)
    // @ts-expect-error status-less values are not ResumeFields and cannot reach status-based rules
    unconfirmedCount(fields);
  });
});
