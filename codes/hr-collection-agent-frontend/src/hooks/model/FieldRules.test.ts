import { describe, expect, it } from 'vitest';
import {
  EMAIL_MAX_LENGTH,
  EMAIL_PATTERN,
  FIELD_MAX_LENGTH,
  PHONE_PATTERN,
  isValidEmail,
  isValidPhone,
  normalizePhone,
  parseFieldPath,
  reasonText,
  toSubmitScalar,
  validateCore,
  validateObjectList,
  validateScalar,
  validateStringList,
} from './FieldRules';

const repeat = (n: number) => 'a'.repeat(n);

describe('phone (G-02, OpenAPI phone.pattern)', () => {
  it('uses the OpenAPI pattern', () => {
    expect(PHONE_PATTERN.source).toBe('^(1\\d{10}|\\+\\d{6,15})$');
  });

  it.each(['13800138000', '+85212345678'])('accepts %s', (v) => {
    expect(isValidPhone(v)).toBe(true);
  });

  it.each(['1380013800', '138001380001', '1380013800a', '+12345', '+1234567890123456', '23800138000', ''])(
    'rejects %s',
    (v) => {
      expect(isValidPhone(v)).toBe(false);
    },
  );

  it('removes spaces and hyphens before validating and submitting', () => {
    expect(normalizePhone('138 0013 8000')).toBe('13800138000');
    expect(normalizePhone('138-0013-8000')).toBe('13800138000');
    expect(normalizePhone(' +852 1234-5678 ')).toBe('+85212345678');
    expect(isValidPhone('138 0013 8000')).toBe(true);
    expect(isValidPhone('138-0013-8000')).toBe(true);
    expect(toSubmitScalar('phone', ' 138 0013-8000 ')).toBe('13800138000');
  });

  it('rejects a value that is longer than 32 characters after normalisation', () => {
    expect(validateScalar('phone', `+${'1'.repeat(40)}`)).toBe('too_long');
  });
});

describe('email (G-01, OpenAPI email.pattern / maxLength 254)', () => {
  it('uses the OpenAPI pattern and limit', () => {
    expect(EMAIL_PATTERN.source).toBe('^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$');
    expect(EMAIL_MAX_LENGTH).toBe(254);
  });

  it.each(['a@b.co', 'test.user@example.com'])('accepts %s', (v) => {
    expect(isValidEmail(v)).toBe(true);
  });

  it.each(['a@b', 'a b@c.d', '@b.c', 'a@@b.c', 'plain', ''])('rejects %s', (v) => {
    expect(isValidEmail(v)).toBe(false);
  });

  it('accepts exactly 254 characters and rejects 255', () => {
    const at254 = `${repeat(254 - '@b.co'.length)}@b.co`;
    expect(at254).toHaveLength(254);
    expect(isValidEmail(at254)).toBe(true);
    expect(validateScalar('email', at254)).toBeNull();
    const at255 = `a${at254}`;
    expect(isValidEmail(at255)).toBe(false);
    expect(validateScalar('email', at255)).toBe('too_long');
  });
});

describe('core field validation', () => {
  it('requires name, phone and email to be non-blank', () => {
    expect(validateCore({ name: '', phone: '13800138000', email: 'a@b.co' })).toEqual({ name: 'required' });
    expect(validateCore({ name: '  ', phone: '', email: ' ' })).toEqual({
      name: 'required',
      phone: 'required',
      email: 'required',
    });
    expect(validateCore({ name: null, phone: null, email: null })).toEqual({
      name: 'required',
      phone: 'required',
      email: 'required',
    });
  });

  it('reports invalid_format for a bad phone or email', () => {
    expect(validateCore({ name: '甲', phone: '123', email: 'x' })).toEqual({
      phone: 'invalid_format',
      email: 'invalid_format',
    });
  });

  it('returns nothing for valid core values', () => {
    expect(validateCore({ name: '测试用户甲', phone: '138 0013 8000', email: 'test.user@example.com' })).toEqual({});
  });
});

describe('FIELD_MAX_LENGTH mirrors OpenAPI 0.1.1', () => {
  it('has the contract numbers', () => {
    expect(FIELD_MAX_LENGTH.name).toEqual({ maxLength: 100 });
    expect(FIELD_MAX_LENGTH.phone).toEqual({ maxLength: 32 });
    expect(FIELD_MAX_LENGTH.email).toEqual({ maxLength: 254 });
    for (const key of [
      'job_title',
      'expected_city',
      'expected_salary',
      'available_time',
      'homepage',
      'gender',
      'birth_month',
      'political_status',
      'current_city',
      'work_years',
      'highest_education',
    ] as const) {
      expect(FIELD_MAX_LENGTH[key]).toEqual({ maxLength: 500 });
    }
    expect(FIELD_MAX_LENGTH.self_evaluation).toEqual({ maxLength: 5000 });
    for (const key of ['strengths', 'skills', 'certificates_honors', 'languages'] as const) {
      expect(FIELD_MAX_LENGTH[key]).toEqual({ maxItems: 50, itemMaxLength: 1000 });
    }
    for (const key of ['work_experiences', 'project_experiences', 'educations'] as const) {
      expect(FIELD_MAX_LENGTH[key]).toEqual({ maxItems: 20 });
    }
  });

  it.each([
    ['name', 100],
    ['job_title', 500],
    ['homepage', 500],
    ['self_evaluation', 5000],
  ] as const)('%s: exactly the limit passes, one more fails', (key, limit) => {
    expect(validateScalar(key, repeat(limit))).toBeNull();
    expect(validateScalar(key, repeat(limit + 1))).toBe('too_long');
  });

  it('text lists: 50 items of 1000 characters pass; 51 items or 1001 characters fail', () => {
    expect(validateStringList('skills', Array.from({ length: 50 }, () => repeat(1000)))).toBeNull();
    expect(validateStringList('skills', Array.from({ length: 51 }, () => 'x'))).toEqual({ reason: 'too_long' });
    expect(validateStringList('skills', ['ok', repeat(1001)])).toEqual({ reason: 'too_long', index: 1 });
  });

  it('experience blocks: 20 items pass, 21 fail', () => {
    expect(validateObjectList('educations', Array.from({ length: 20 }, () => ({})))).toEqual([]);
    expect(validateObjectList('educations', Array.from({ length: 21 }, () => ({})))).toEqual([
      { field: 'educations', reason: 'too_long' },
    ]);
  });

  it('experience sub-fields: 2000 characters pass, 2001 fail, with an indexed path', () => {
    expect(validateObjectList('work_experiences', [{ company: repeat(2000) }])).toEqual([]);
    expect(validateObjectList('work_experiences', [{}, { company: repeat(2001) }])).toEqual([
      { field: 'work_experiences[1].company', reason: 'too_long' },
    ]);
    expect(validateObjectList('project_experiences', [{ outcome: repeat(2001) }])).toEqual([
      { field: 'project_experiences[0].outcome', reason: 'too_long' },
    ]);
    expect(validateObjectList('educations', [{ honors: repeat(2001) }])).toEqual([
      { field: 'educations[0].honors', reason: 'too_long' },
    ]);
  });

  it('work experience lists: 30 items pass, 31 fail; each item up to 2000 characters', () => {
    const at = (n: number) => [{ responsibilities: Array.from({ length: n }, () => 'x') }];
    expect(validateObjectList('work_experiences', at(30))).toEqual([]);
    expect(validateObjectList('work_experiences', at(31))).toEqual([
      { field: 'work_experiences[0].responsibilities', reason: 'too_long' },
    ]);
    expect(validateObjectList('work_experiences', [{ achievements: [repeat(2000)] }])).toEqual([]);
    expect(validateObjectList('work_experiences', [{ achievements: [repeat(2001)] }])).toEqual([
      { field: 'work_experiences[0].achievements[0]', reason: 'too_long' },
    ]);
  });
});

describe('toSubmitScalar', () => {
  it('trims text and turns blank non-core values into null', () => {
    expect(toSubmitScalar('job_title', '  供应链经理 ')).toBe('供应链经理');
    expect(toSubmitScalar('job_title', '   ')).toBeNull();
    expect(toSubmitScalar('job_title', null)).toBeNull();
  });

  it('keeps blank core values as empty strings so validation rejects them', () => {
    expect(toSubmitScalar('name', '  ')).toBe('');
    expect(toSubmitScalar('email', null)).toBe('');
  });
});

describe('reasonText', () => {
  it('maps every reason to non-empty Chinese text', () => {
    expect(reasonText('required')).toBe('必填');
    expect(reasonText('invalid_format')).toBe('格式不正确');
    expect(reasonText('invalid_type')).toBe('类型不符');
    expect(reasonText('too_long')).toBe('内容过长');
    expect(reasonText('unknown_field').length).toBeGreaterThan(0);
  });
});

describe('parseFieldPath', () => {
  it('parses plain, indexed and sub-field paths', () => {
    expect(parseFieldPath('phone')).toEqual({ field: 'phone' });
    expect(parseFieldPath('work_experiences[0].start_date')).toEqual({
      field: 'work_experiences',
      index: 0,
      sub: 'start_date',
    });
    expect(parseFieldPath('educations[12]')).toEqual({ field: 'educations', index: 12 });
    expect(parseFieldPath('work_experiences[2].responsibilities[1]')).toEqual({
      field: 'work_experiences',
      index: 2,
      sub: 'responsibilities',
      subIndex: 1,
    });
    expect(parseFieldPath('skills[3]')).toEqual({ field: 'skills', index: 3 });
  });

  it('returns null for unknown fields or malformed paths', () => {
    expect(parseFieldPath('nope')).toBeNull();
    expect(parseFieldPath('work_experiences[x]')).toBeNull();
    expect(parseFieldPath('')).toBeNull();
  });
});
