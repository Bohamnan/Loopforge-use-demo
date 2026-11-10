import { Button, Input, Tag } from 'antd';
import { useEffect, useRef } from 'react';
import { useStableKeys } from '../hooks/useStableKeys';
import { FIELD_MAX_LENGTH, reasonText } from '../hooks/model/FieldRules';
import type { ErrorReason } from '../types/Errors';
import type { FieldStatus } from '../types/ResumeModel';
import FieldStatusTag from './FieldStatusTag';

interface StringListEditorProps {
  /** Empty hides the label (the section title already says it). */
  label: string;
  /** A resume field key, or an item path such as `work_experiences[0].responsibilities` for a nested list. */
  fieldKey: string;
  status?: FieldStatus;
  value: string[];
  dirty: boolean;
  disabled: boolean;
  /** Field-path -> reason; `skills` for the whole list, `skills[1]` for one item. */
  errors: Record<string, ErrorReason>;
  /** Overrides the contract limit looked up from `fieldKey` (used by nested lists). */
  maxItems?: number;
  /** Nested use: no status tag, no unsubmitted-edit tag, no field wrapper attribute. */
  bare?: boolean;
  /** Always receives the complete new list. */
  onChange: (items: string[]) => void;
}

/** Add / edit / delete for a text list. Blank rows stay on screen (nothing disappears under the pointer) and are simply not submitted. */
export default function StringListEditor({
  label,
  fieldKey,
  status,
  value,
  dirty,
  disabled,
  errors,
  maxItems: maxItemsOverride,
  bare = false,
  onChange,
}: StringListEditorProps) {
  const maxItems = maxItemsOverride ?? (FIELD_MAX_LENGTH as Record<string, { maxItems?: number }>)[fieldKey]?.maxItems;
  const atLimit = maxItems !== undefined && value.length >= maxItems;
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const rows = useStableKeys(value.length);
  const focusLast = useRef(false);

  // After "add", move focus to the new row.
  useEffect(() => {
    if (focusLast.current) {
      focusLast.current = false;
      inputs.current[value.length - 1]?.focus();
    }
  }, [value.length]);

  const change = (index: number, text: string) => onChange(value.map((item, i) => (i === index ? text : item)));
  const remove = (index: number) => {
    rows.remove(index);
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <div className={bare ? 'list-edit' : 'field-row field-edit list-edit'} data-field={bare ? undefined : fieldKey}>
      {label ? <span className="field-label">{label}</span> : null}
      <div className="field-value">
        {value.length === 0 ? <span className="value-empty">（未提供）</span> : null}
        {value.map((item, index) => {
          const itemError = errors[`${fieldKey}[${index}]`];
          return (
            <div className="list-row" key={rows.keys[index] ?? index}>
              <Input
                ref={(node) => {
                  inputs.current[index] = node?.input ?? null;
                }}
                aria-label={`${label || fieldKey}第${index + 1}项`}
                value={item}
                disabled={disabled}
                status={itemError ? 'error' : undefined}
                onChange={(event) => change(index, event.target.value)}
              />
              <Button size="small" type="text" disabled={disabled} aria-label={`删除第${index + 1}项`} onClick={() => remove(index)}>
                删除
              </Button>
              {itemError ? <span className="field-error">{reasonText(itemError)}</span> : null}
            </div>
          );
        })}
        {errors[fieldKey] ? <div className="field-error">{reasonText(errors[fieldKey])}</div> : null}
        <Button
          size="small"
          disabled={disabled || atLimit}
          onClick={() => {
            rows.add();
            onChange([...value, '']);
            focusLast.current = true;
          }}
        >
          ＋ 添加一项
        </Button>
        {atLimit ? <span className="value-empty">（最多 {maxItems} 项）</span> : null}
      </div>
      {bare ? null : (
        <span className="field-tags">
          {dirty ? <Tag>未提交修改</Tag> : null}
          {status ? <FieldStatusTag status={status} /> : null}
        </span>
      )}
    </div>
  );
}
