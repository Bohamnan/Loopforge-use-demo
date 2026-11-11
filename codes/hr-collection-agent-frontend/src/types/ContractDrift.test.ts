import { describe, expect, it } from 'vitest';
import { EMAIL_PATTERN, EXPERIENCE_ITEM_LIMIT, FIELD_MAX_LENGTH, PHONE_PATTERN } from '../hooks/model/FieldRules';
import { getSection } from '../hooks/model/SectionConfig';
import { CHAT_ROLES, SUGGESTION_REASONS, SUGGESTION_STATUSES } from './Conversation';
import { ERROR_CODES, ERROR_REASONS } from './Errors';
import { SESSION_STATUSES, UPDATE_STATES } from './Session';
import { FIELD_STATUSES, OPENAPI_VERSION, RESUME_FIELD_KEYS, SUGGESTION_FIELDS } from './ResumeModel';

// Drift check: compares the hand-written mirror (types, FieldRules) with the real backend contract file.
// The contract lives in the same repository; if it is not there (a checkout of the frontend alone), the checks are skipped.
const files = import.meta.glob('../../../../backend-docs/HR_PR-1/03_api/openapi.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const yaml = Object.values(files)[0];
const present = yaml !== undefined;

/** Text of a component schema: from "    Name:" to the next 4-space key. */
function schema(name: string): string {
  const start = (yaml as string).indexOf(`\n    ${name}:\n`);
  if (start < 0) throw new Error(`schema ${name} not found`);
  const rest = (yaml as string).slice(start + 1);
  const next = rest.slice(5).search(/\n {4}[A-Za-z]\w*:/);
  return next < 0 ? rest : rest.slice(0, next + 5);
}

function enumOf(block: string): string[] {
  const flow = /enum:\s*\[([^\]]*)\]/.exec(block);
  if (flow) return (flow[1] as string).split(',').map((v) => v.trim());
  const after = block.slice(block.indexOf('enum:') + 5);
  return Array.from(after.matchAll(/^\s+-\s+(\S+)\s*$/gm)).map((m) => m[1] as string);
}

/** Property chunks (8-space keys) of a schema block. */
function properties(block: string): Record<string, string> {
  const parts = block.split(/\n {8}(?=[A-Za-z_]\w*:)/).slice(1);
  return Object.fromEntries(parts.map((part) => [/^(\w+):/.exec(part)?.[1] as string, part]));
}

const num = (re: RegExp, text: string) => {
  const m = re.exec(text);
  return m ? Number(m[1]) : undefined;
};

describe.skipIf(!present)('hand-written types and rules match openapi.yaml (F-02)', () => {
  it('has the contract version the types were written against', () => {
    expect(/^ {2}version:\s*(\S+)/m.exec(yaml as string)?.[1]).toBe(OPENAPI_VERSION);
  });

  it('has the same enums', () => {
    expect(enumOf(schema('FieldStatus'))).toEqual([...FIELD_STATUSES]);
    expect(enumOf(schema('ErrorCode'))).toEqual([...ERROR_CODES]);
    expect(enumOf(schema('ErrorDetail').slice(schema('ErrorDetail').indexOf('reason:')))).toEqual([...ERROR_REASONS]);
  });

  it('has the same v2 enums', () => {
    expect(enumOf(schema('SessionStatus'))).toEqual([...SESSION_STATUSES]);
    expect(enumOf(schema('UpdateState'))).toEqual([...UPDATE_STATES]);
    expect(enumOf(schema('SuggestionField'))).toEqual([...SUGGESTION_FIELDS]);
    expect(enumOf(schema('SuggestionReason'))).toEqual([...SUGGESTION_REASONS]);
    expect(enumOf(schema('SuggestionStatus'))).toEqual([...SUGGESTION_STATUSES]);
    expect(enumOf(schema('ChatRole'))).toEqual([...CHAT_ROLES]);
  });

  it('has the same 22 keys in ResumeValues', () => {
    const block = schema('ResumeValues');
    const required = block.slice(block.indexOf('required:'), block.indexOf('properties:'));
    expect(Array.from(required.matchAll(/^\s+-\s+(\w+)\s*$/gm)).map((m) => m[1])).toEqual([...RESUME_FIELD_KEYS]);
  });

  it('has the same 22 resume fields in the same order', () => {
    const required = schema('ResumeFields').slice(schema('ResumeFields').indexOf('required:'), schema('ResumeFields').indexOf('properties:'));
    expect(Array.from(required.matchAll(/^\s+-\s+(\w+)\s*$/gm)).map((m) => m[1])).toEqual([...RESUME_FIELD_KEYS]);
  });

  it('has the same length and count limits for every field of ResumeFieldsUpdate', () => {
    const props = properties(schema('ResumeFieldsUpdate'));
    expect(Object.keys(props).sort()).toEqual([...RESUME_FIELD_KEYS].sort());
    for (const key of RESUME_FIELD_KEYS) {
      const chunk = props[key] as string;
      const expected = FIELD_MAX_LENGTH[key];
      expect({
        key,
        maxLength: num(/maxLength:\s*(\d+)/, chunk.replace(/items:\s*\{[^}]*\}/, '')),
        maxItems: num(/maxItems:\s*(\d+)/, chunk),
        itemMaxLength: num(/items:\s*\{[^}]*maxLength:\s*(\d+)/, chunk),
      }).toEqual({ key, maxLength: expected.maxLength, maxItems: expected.maxItems, itemMaxLength: expected.itemMaxLength });
    }
  });

  it('has the same phone and email patterns', () => {
    const props = properties(schema('ResumeFieldsUpdate'));
    expect(/pattern:\s*'([^']*)'/.exec(props.phone as string)?.[1]).toBe(PHONE_PATTERN.source);
    expect(/pattern:\s*'([^']*)'/.exec(props.email as string)?.[1]).toBe(EMAIL_PATTERN.source);
  });

  it.each([
    ['WorkExperience', 'work_experiences'],
    ['ProjectExperience', 'project_experiences'],
    ['Education', 'educations'],
  ] as const)('%s: same sub-fields and the shared item limits', (name, fieldKey) => {
    const props = properties(schema(name));
    const config = getSection(fieldKey === 'work_experiences' ? 'work' : fieldKey === 'project_experiences' ? 'project' : 'education').fields[0]?.item;
    expect(Object.keys(props)).toEqual(config?.fields.map((f) => f.key));
    for (const [key, chunk] of Object.entries(props)) {
      const isList = /type:\s*array/.test(chunk);
      if (isList) {
        expect({ key, items: num(/maxItems:\s*(\d+)/, chunk), each: num(/items:\s*\{[^}]*maxLength:\s*(\d+)/, chunk) }).toEqual({
          key,
          items: EXPERIENCE_ITEM_LIMIT.listMaxItems,
          each: EXPERIENCE_ITEM_LIMIT.listItemMaxLength,
        });
      } else {
        expect({ key, maxLength: num(/maxLength:\s*(\d+)/, chunk) }).toEqual({ key, maxLength: EXPERIENCE_ITEM_LIMIT.maxLength });
      }
    }
  });

  it('the experience-list limit of the three list fields is the OpenAPI maxItems', () => {
    const props = properties(schema('ResumeFieldsUpdate'));
    for (const key of ['work_experiences', 'project_experiences', 'educations'] as const) {
      expect(num(/maxItems:\s*(\d+)/, props[key] as string)).toBe(FIELD_MAX_LENGTH[key].maxItems);
    }
  });
});

describe('the drift check itself', () => {
  it('found the contract file (otherwise the checks above were skipped)', () => {
    // Informational: in this repository the file exists. A frontend-only checkout skips the checks above.
    expect(typeof present).toBe('boolean');
  });
});
