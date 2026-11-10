import { Tag } from 'antd';
import type { ReactNode } from 'react';
import { currentValue, orderedFieldKeys } from '../hooks/model/SectionView';
import type { FieldConfig, ObjectItemConfig, SectionConfig } from '../hooks/model/SectionConfig';
import type { ResumeFields, ResumeFieldsUpdate } from '../types/ResumeModel';
import FieldStatusTag from './FieldStatusTag';

const EMPTY = <span className="value-empty">（未提供）</span>;

function textOf(value: unknown): ReactNode {
  return typeof value === 'string' && value.trim() !== '' ? value : EMPTY;
}

function renderStringList(items: unknown): ReactNode {
  const list = Array.isArray(items) ? (items as string[]).filter((i) => i.trim() !== '') : [];
  if (list.length === 0) return EMPTY;
  return (
    <ul className="value-list">
      {list.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

function renderItems(items: unknown, config: ObjectItemConfig): ReactNode {
  const list = Array.isArray(items) ? (items as Record<string, unknown>[]) : [];
  if (list.length === 0) return EMPTY;
  return (
    <ol className="value-items">
      {list.map((item, index) => (
        <li key={index}>
          {config.fields.map((sub) => {
            const raw = item[sub.key];
            const isEmpty =
              raw === undefined || raw === null || raw === '' || (Array.isArray(raw) && raw.length === 0);
            if (isEmpty) return null;
            return (
              <div className="sub-row" key={sub.key}>
                <span className="sub-label">{sub.label}</span>
                <span className="sub-value">{sub.kind === 'stringList' ? renderStringList(raw) : String(raw)}</span>
              </div>
            );
          })}
        </li>
      ))}
    </ol>
  );
}

function renderValue(field: FieldConfig, value: unknown): ReactNode {
  switch (field.kind) {
    case 'stringList':
      return renderStringList(value);
    case 'objectList':
      return field.item ? renderItems(value, field.item) : EMPTY;
    default:
      return textOf(value);
  }
}

interface ReadOnlySectionProps {
  section: SectionConfig;
  fields: ResumeFields;
  /** Unsubmitted edits; shown instead of the saved values. */
  buffer: ResumeFieldsUpdate;
}

/** Read-only rendering of one section: label, value and status for every field, attention fields first. */
export default function ReadOnlySection({ section, fields, buffer }: ReadOnlySectionProps) {
  const byKey = new Map(section.fields.map((f) => [f.key, f]));
  const singleSameLabel = section.fields.length === 1 && section.fields[0]?.label === section.title;
  return (
    <div className="section-fields">
      {orderedFieldKeys(section, fields).map((key) => {
        const field = byKey.get(key) as FieldConfig;
        const status = fields[key].status;
        const attention = status === 'missing' || status === 'uncertain';
        return (
          <div key={key} data-field={key} className={`field-row${attention ? ' field-attention' : ''}`}>
            {singleSameLabel ? null : <span className="field-label">{field.label}</span>}
            <span className="field-value">{renderValue(field, currentValue(fields, buffer, key))}</span>
            <span className="field-tags">
              {key in buffer ? <Tag>未提交修改</Tag> : null}
              <FieldStatusTag status={status} />
            </span>
          </div>
        );
      })}
    </div>
  );
}
