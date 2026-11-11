import type { ReactNode } from 'react';
import { SECTIONS, type FieldConfig } from '../hooks/model/SectionConfig';
import type { ResumeFieldKey } from '../types/ResumeModel';
import { ValueView } from './ReadOnlySection';

export interface ChangeRow {
  key: string;
  field: ResumeFieldKey;
  label: string;
  /** Omitted: only the new value is shown (applied / cancelled suggestions carry no old value). */
  oldValue?: unknown;
  newValue: unknown;
  /** Short remark after the row, e.g. "将被清空" or the reason a suggestion cannot be applied. */
  note?: ReactNode;
  highlight?: boolean;
}

const CONFIGS = new Map<string, FieldConfig>(SECTIONS.flatMap((s) => s.fields).map((f) => [f.key, f]));
const EMPTY = '（空）';

/** Shared rows of "field / old value / new value" for suggestion cards and the update diff card (TD-21, TD-23). */
export default function ChangeRows({ rows }: { rows: readonly ChangeRow[] }) {
  return (
    <dl className="change-rows">
      {rows.map((row) => {
        const config = CONFIGS.get(row.field) as FieldConfig;
        return (
          <div key={row.key} className={`change-row${row.highlight ? ' change-row-highlight' : ''}`} data-field={row.field}>
            <dt>{row.label}</dt>
            <dd>
              {'oldValue' in row ? (
                <>
                  <span className="change-old">
                    <ValueView field={config} value={row.oldValue} emptyText={EMPTY} />
                  </span>
                  <span aria-hidden="true"> → </span>
                  <span className="visually-hidden">改为</span>
                </>
              ) : null}
              <span className="change-new">
                <ValueView field={config} value={row.newValue} emptyText={EMPTY} />
              </span>
              {row.note ? <span className="change-note">{row.note}</span> : null}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
