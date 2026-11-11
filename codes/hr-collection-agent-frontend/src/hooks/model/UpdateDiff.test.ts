import { describe, expect, it } from 'vitest';
import { sampleArchivedResume, sampleSessionDetail } from '../../test/ApiMocks';
import type { UpdateCandidate } from '../../types/Session';
import { buildUpdateDiff } from './UpdateDiff';

const resume = sampleArchivedResume();
const candidate = (patch: Partial<UpdateCandidate['fields']> = {}, file = resume.original_file): UpdateCandidate => ({
  fields: { ...resume.fields, ...patch },
  original_file: file,
});

describe('buildUpdateDiff', () => {
  it('reports nothing for identical content and counts all 22 fields as same', () => {
    const diff = buildUpdateDiff(resume, candidate());
    expect(diff).toMatchObject({ changed: [], sameCount: 22, onlyFileDiffers: false });
  });

  it('treats whitespace, null and missing keys in experience items as the same', () => {
    const diff = buildUpdateDiff(
      resume,
      candidate({
        job_title: `  ${resume.fields.job_title}  `,
        expected_city: '   ',
        work_experiences: [{ company: ' 合成公司 ', position: '主管', start_date: '2018.07', end_date: '至今', department: null }],
      }),
    );
    expect(diff.changed).toEqual([]);
  });

  it('lists a changed field with old and new value, in section order', () => {
    const diff = buildUpdateDiff(resume, candidate({ skills: ['Excel', 'SQL'], job_title: '采购总监' }));
    expect(diff.changed.map((c) => c.field)).toEqual(['job_title', 'skills']);
    expect(diff.changed[0]).toMatchObject({ oldValue: '供应链经理', newValue: '采购总监', clears: false });
    expect(diff.sameCount).toBe(20);
  });

  it('a list with another order is a difference', () => {
    const base = { ...resume, fields: { ...resume.fields, skills: ['A', 'B'] } };
    const diff = buildUpdateDiff(base, candidate({ skills: ['B', 'A'] }));
    expect(diff.changed.map((c) => c.field)).toEqual(['skills']);
  });

  it('always lists a field the candidate clears, scalar or list, marked clears (red line)', () => {
    const diff = buildUpdateDiff(resume, candidate({ job_title: null, skills: [], work_experiences: [] }));
    const byField = Object.fromEntries(diff.changed.map((c) => [c.field, c.clears]));
    expect(byField).toEqual({ job_title: true, skills: true, work_experiences: true });
    // Whitespace-only is also "empty", it must not hide the clearing.
    expect(buildUpdateDiff(resume, candidate({ job_title: '  ' })).changed[0]).toMatchObject({ field: 'job_title', clears: true });
  });

  it('does not mark a change from empty to a value as clearing', () => {
    const empty = { ...resume, fields: { ...resume.fields, homepage: null } };
    const diff = buildUpdateDiff(empty, candidate({ homepage: 'https://example.com' }));
    expect(diff.changed[0]).toMatchObject({ field: 'homepage', clears: false });
  });

  it('reports a file-only difference', () => {
    const file = { ...resume.original_file, filename: '新.pdf', size_bytes: 9 };
    const diff = buildUpdateDiff(resume, candidate({}, file));
    expect(diff).toMatchObject({ changed: [], onlyFileDiffers: true, file: { oldName: '合成简历.pdf', newName: '新.pdf', differs: true } });
  });

  it('works on the pending sample (job_title changed, expected_salary cleared)', () => {
    const detail = sampleSessionDetail('pending');
    const diff = buildUpdateDiff(detail.resume!, detail.update_candidate!);
    expect(diff.changed.map((c) => [c.field, c.clears])).toEqual([
      ['job_title', false],
      ['expected_salary', true],
    ]);
    expect(diff.file.differs).toBe(true);
  });
});
