import { Tag } from 'antd';
import type { ReactNode } from 'react';
import { currentValue, orderedFieldKeys, type StatuslessFields } from '../hooks/model/SectionView';
import type { FieldConfig, ObjectItemConfig, SectionConfig } from '../hooks/model/SectionConfig';
import type { ResumeFields, ResumeFieldsUpdate } from '../types/ResumeModel';
import FieldStatusTag from './FieldStatusTag';

const DEFAULT_EMPTY = '（未提供）';

const emptyNode = (text: string) => <span className="value-empty">{text}</span>;

function textOf(value: unknown, empty: ReactNode): ReactNode {
  return typeof value === 'string' && value.trim() !== '' ? value : empty;
}

function renderStringList(items: unknown, empty: ReactNode): ReactNode {
  const list = Array.isArray(items) ? (items as string[]).filter((i) => i.trim() !== '') : [];
  if (list.length === 0) return empty;
  return (
    <ul className="value-list">
      {list.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

function renderItems(items: unknown, config: ObjectItemConfig, empty: ReactNode): ReactNode {
  const list = Array.isArray(items) ? (items as Record<string, unknown>[]) : [];
  if (list.length === 0) return empty;
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
                <span className="sub-value">{sub.kind === 'stringList' ? renderStringList(raw, empty) : String(raw)}</span>
              </div>
            );
          })}
        </li>
      ))}
    </ol>
  );
}

interface ValueViewProps {
  field: FieldConfig;
  value: unknown;
  /** Text for an empty value. */
  emptyText?: string;
}

/** Read-only rendering of one field value (text, text list or list of experience items). Shared by cards and diffs. */
export function ValueView({ field, value, emptyText = DEFAULT_EMPTY }: ValueViewProps): ReactNode {
  const empty = emptyNode(emptyText);
  switch (field.kind) {
    case 'stringList':
      return renderStringList(value, empty);
    case 'objectList':
      return field.item ? renderItems(value, field.item, empty) : empty;
    default:
      return textOf(value, empty);
  }
}

interface CommonProps {
  section: SectionConfig;
  /** Unsubmitted edits; shown instead of the saved values. */
  buffer: ResumeFieldsUpdate;
  /** Text for an empty value; defaults to "（未提供）". */
  emptyText?: string;
}

/** Reviewed fields with statuses, or (showStatus=false: saved / archived content) values only - no tags, no highlight. */
type ReadOnlySectionProps = CommonProps & ({ fields: ResumeFields; showStatus?: true } | { fields: StatuslessFields; showStatus: false });

/** Read-only rendering of one section: label, value and status for every field, attention fields first. */
export default function ReadOnlySection(props: ReadOnlySectionProps) {
  const { section, fields, buffer, emptyText } = props;
  const statusFields = props.showStatus === false ? null : props.fields;
  const byKey = new Map(section.fields.map((f) => [f.key, f]));
  const singleSameLabel = section.fields.length === 1 && section.fields[0]?.label === section.title;
  return (
    <div className="section-fields">
      {(statusFields ? orderedFieldKeys(section, statusFields) : section.fields.map((f) => f.key)).map((key) => {
        const field = byKey.get(key) as FieldConfig;
        const status = statusFields ? statusFields[key].status : null;
        const attention = status === 'missing' || status === 'uncertain';
        return (
          <div key={key} data-field={key} className={`field-row${attention ? ' field-attention' : ''}`}>
            {singleSameLabel ? null : <span className="field-label">{field.label}</span>}
            <span className="field-value"><ValueView field={field} value={currentValue(fields, buffer, key)} emptyText={emptyText} /></span>
            <span className="field-tags">
              {key in buffer ? <Tag>未提交修改</Tag> : null}
              {status ? <FieldStatusTag status={status} /> : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}
