import type { UpdateCandidate } from '../../types/Session';
import type { ArchivedResume } from '../../types/Archive';
import type { ResumeFieldKey, ResumeValues } from '../../types/ResumeModel';
import { SECTIONS, type FieldConfig } from './SectionConfig';

// Difference between the saved record and the frozen update candidate (design TD-23, Y-02). Pure functions.
// The card built from this must list every field that would be cleared (red line).

export type DiffValue = string | null | string[] | Record<string, string | string[] | null>[];

export interface DiffItem {
  field: ResumeFieldKey;
  oldValue: DiffValue;
  newValue: DiffValue;
  /** The candidate is empty while the saved record has a value: applying it clears the field. */
  clears: boolean;
}

export interface UpdateDiff {
  /** Fields that differ, in section order. */
  changed: DiffItem[];
  /** Number of the 22 fields without any difference. */
  sameCount: number;
  file: { oldName: string; newName: string; differs: boolean };
  /** No field differs, only the original file does. */
  onlyFileDiffers: boolean;
}

const FIELD_CONFIGS: readonly FieldConfig[] = SECTIONS.flatMap((s) => s.fields);

const trimOrNull = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

/** Trims every item and drops empty ones; the order is kept because it carries meaning. */
const normalizeList = (value: unknown): string[] =>
  (Array.isArray(value) ? value : []).map(trimOrNull).filter((item): item is string => item !== null);

/** A missing key and null are the same; the key set comes from SectionConfig, so extra keys cannot cause a difference. */
function normalizeItem(item: unknown, config: FieldConfig): Record<string, string | string[] | null> {
  const source = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
  const result: Record<string, string | string[] | null> = {};
  for (const sub of config.item?.fields ?? []) {
    result[sub.key] = sub.kind === 'stringList' ? normalizeList(source[sub.key]) : trimOrNull(source[sub.key]);
  }
  return result;
}

function normalize(config: FieldConfig, value: unknown): DiffValue {
  switch (config.kind) {
    case 'stringList':
      return normalizeList(value);
    case 'objectList':
      return (Array.isArray(value) ? value : []).map((item) => normalizeItem(item, config));
    default:
      return trimOrNull(value);
  }
}

const isEmpty = (value: DiffValue): boolean => value === null || (Array.isArray(value) && value.length === 0);

export function buildUpdateDiff(resume: ArchivedResume, candidate: UpdateCandidate): UpdateDiff {
  const changed: DiffItem[] = [];
  let sameCount = 0;
  for (const config of FIELD_CONFIGS) {
    const oldValue = normalize(config, (resume.fields as ResumeValues)[config.key]);
    const newValue = normalize(config, (candidate.fields as ResumeValues)[config.key]);
    if (JSON.stringify(oldValue) === JSON.stringify(newValue)) {
      sameCount += 1;
    } else {
      changed.push({ field: config.key, oldValue, newValue, clears: isEmpty(newValue) && !isEmpty(oldValue) });
    }
  }
  const before = resume.original_file;
  const after = candidate.original_file;
  const differs = before.filename !== after.filename || before.size_bytes !== after.size_bytes || before.content_type !== after.content_type;
  return {
    changed,
    sameCount,
    file: { oldName: before.filename, newName: after.filename, differs },
    onlyFileDiffers: changed.length === 0 && differs,
  };
}
