import { Button, Input, Tag } from 'antd';
import { useStableKeys } from '../hooks/useStableKeys';
import { FIELD_MAX_LENGTH, EXPERIENCE_ITEM_LIMIT, reasonText } from '../hooks/model/FieldRules';
import type { FieldConfig, ItemFieldConfig } from '../hooks/model/SectionConfig';
import type { ErrorReason } from '../types/Errors';
import type { FieldStatus } from '../types/ResumeModel';
import FieldStatusTag from './FieldStatusTag';
import StringListEditor from './StringListEditor';

type Item = Record<string, unknown>;

interface ObjectListEditorProps {
  /** A field of kind objectList (work / project / education experiences). */
  field: FieldConfig;
  status: FieldStatus;
  value: Item[];
  dirty: boolean;
  disabled: boolean;
  /** Field-path -> reason for this list, e.g. `work_experiences[1].start_date`. */
  errors: Record<string, ErrorReason>;
  /** Always receives the complete new list (lists are replaced as a whole, O-11). */
  onChange: (items: Item[]) => void;
}

function itemTitle(item: Item): string {
  const name = [item.company, item.name, item.school].find((v) => typeof v === 'string' && v.trim() !== '');
  return typeof name === 'string' ? ` · ${name.trim()}` : '';
}

/** Add / edit / delete for the items of an experience list. No reordering. */
export default function ObjectListEditor({ field, status, value, dirty, disabled, errors, onChange }: ObjectListEditorProps) {
  const config = field.item;
  const rows = useStableKeys(value.length);
  if (!config) return null;
  const maxItems = FIELD_MAX_LENGTH[field.key].maxItems;
  const atLimit = maxItems !== undefined && value.length >= maxItems;

  const setSub = (index: number, key: string, next: unknown) =>
    onChange(value.map((item, i) => (i === index ? { ...item, [key]: next } : item)));

  const renderSub = (item: Item, index: number, sub: ItemFieldConfig) => {
    const path = `${field.key}[${index}].${sub.key}`;
    const id = `field-${field.key}-${index}-${sub.key}`;
    const error = errors[path];
    if (sub.kind === 'stringList') {
      return (
        <div className="item-sub" key={sub.key}>
          <span className="sub-label">{sub.label}</span>
          <StringListEditor
            bare
            label=""
            fieldKey={path}
            maxItems={EXPERIENCE_ITEM_LIMIT.listMaxItems}
            value={Array.isArray(item[sub.key]) ? (item[sub.key] as string[]) : []}
            dirty={false}
            disabled={disabled}
            errors={errors}
            onChange={(items) => setSub(index, sub.key, items)}
          />
        </div>
      );
    }
    const InputComponent = sub.kind === 'textarea' ? Input.TextArea : Input;
    return (
      <div className="item-sub" key={sub.key}>
        <label className="sub-label" htmlFor={id}>
          {sub.label}
        </label>
        <div className="sub-input">
          <InputComponent
            id={id}
            value={typeof item[sub.key] === 'string' ? (item[sub.key] as string) : ''}
            disabled={disabled}
            status={error ? 'error' : undefined}
            onChange={(event) => setSub(index, sub.key, event.target.value)}
          />
          {error ? <div className="field-error">{reasonText(error)}</div> : null}
        </div>
      </div>
    );
  };

  return (
    <div className="field-row field-edit list-edit" data-field={field.key}>
      <div className="field-value">
        {value.length === 0 ? <span className="value-empty">（未提供）</span> : null}
        {value.map((item, index) => (
          <details className="item-card" open data-item key={rows.keys[index] ?? index}>
            <summary>
              {config.itemLabel} {index + 1}
              {itemTitle(item)}
            </summary>
            <div className="item-body">
              {config.fields.map((sub) => renderSub(item, index, sub))}
              <Button size="small" danger disabled={disabled} aria-label="删除这一条" onClick={() => {
                  rows.remove(index);
                  onChange(value.filter((_, i) => i !== index));
                }}>
                删除
              </Button>
            </div>
          </details>
        ))}
        {errors[field.key] ? <div className="field-error">{reasonText(errors[field.key] as ErrorReason)}</div> : null}
        <Button size="small" disabled={disabled || atLimit} onClick={() => {
            rows.add();
            onChange([...value, {}]);
          }}>
          ＋ 添加一条
        </Button>
        {atLimit ? <span className="value-empty">（最多 {maxItems} 条）</span> : null}
      </div>
      <span className="field-tags">
        {dirty ? <Tag>未提交修改</Tag> : null}
        <FieldStatusTag status={status} />
      </span>
    </div>
  );
}
