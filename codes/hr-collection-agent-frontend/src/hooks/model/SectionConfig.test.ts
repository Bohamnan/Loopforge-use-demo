import { describe, expect, it } from 'vitest';
import { RESUME_FIELD_KEYS } from '../../types/ResumeModel';
import { SECTIONS, SECTION_KEYS, getSection, sectionKeyOfField } from './SectionConfig';

describe('SectionConfig', () => {
  it('has 11 sections in the designed order', () => {
    expect(SECTIONS.map((s) => s.key)).toEqual([
      'basic',
      'intent',
      'personal',
      'strengths',
      'work',
      'project',
      'education',
      'skills',
      'certificates',
      'languages',
      'self_evaluation',
    ]);
    expect([...SECTION_KEYS]).toEqual(SECTIONS.map((s) => s.key));
  });

  it('maps every one of the 22 resume fields to exactly one section', () => {
    const all = SECTIONS.flatMap((s) => s.fields.map((f) => f.key));
    expect(all).toHaveLength(22);
    expect(new Set(all).size).toBe(22);
    expect([...all].sort()).toEqual([...RESUME_FIELD_KEYS].sort());
  });

  it('has the designed field counts per section', () => {
    expect(SECTIONS.map((s) => s.fields.length)).toEqual([4, 4, 6, 1, 1, 1, 1, 1, 1, 1, 1]);
  });

  it('puts the three core fields in the first section only', () => {
    const core = SECTIONS.flatMap((s) => s.fields.filter((f) => f.core).map((f) => f.key));
    expect(core).toEqual(['name', 'phone', 'email']);
    expect(SECTIONS.filter((s) => s.hasCore).map((s) => s.key)).toEqual(['basic']);
  });

  it('keeps languages as its own section (C-14)', () => {
    expect(getSection('languages').fields.map((f) => f.key)).toEqual(['languages']);
    expect(getSection('certificates').fields.map((f) => f.key)).toEqual(['certificates_honors']);
  });

  it('assigns a control kind to every field', () => {
    const kinds = Object.fromEntries(SECTIONS.flatMap((s) => s.fields.map((f) => [f.key, f.kind])));
    expect(kinds.name).toBe('text');
    expect(kinds.self_evaluation).toBe('textarea');
    expect(kinds.strengths).toBe('stringList');
    expect(kinds.languages).toBe('stringList');
    expect(kinds.work_experiences).toBe('objectList');
    expect(kinds.educations).toBe('objectList');
  });

  it('gives every field a Chinese label', () => {
    for (const field of SECTIONS.flatMap((s) => s.fields)) {
      expect(field.label.length).toBeGreaterThan(0);
    }
  });

  it('describes experience item sub-fields matching the OpenAPI schemas', () => {
    const itemKeys = (key: 'work_experiences' | 'project_experiences' | 'educations') =>
      SECTIONS.flatMap((s) => s.fields).find((f) => f.key === key)?.item?.fields.map((f) => f.key);
    expect(itemKeys('work_experiences')).toEqual([
      'company',
      'position',
      'start_date',
      'end_date',
      'department',
      'reports_to',
      'team_size',
      'responsibilities',
      'achievements',
    ]);
    expect(itemKeys('project_experiences')).toEqual([
      'name',
      'start_date',
      'end_date',
      'background',
      'role',
      'tech',
      'outcome',
    ]);
    expect(itemKeys('educations')).toEqual(['start_date', 'end_date', 'school', 'major', 'degree', 'honors']);
  });

  it('looks up the section of a field', () => {
    expect(sectionKeyOfField('phone')).toBe('basic');
    expect(sectionKeyOfField('current_city')).toBe('personal');
    expect(sectionKeyOfField('educations')).toBe('education');
  });
});
