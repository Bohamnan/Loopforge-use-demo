import { Button, Input, Tag } from 'antd';
import { useEffect, useRef } from 'react';
import { FIELD_MAX_LENGTH, reasonText } from '../hooks/model/FieldRules';
import type { ErrorReason } from '../types/Errors';
import type { FieldStatus, ResumeFieldKey } from '../types/ResumeModel';
import FieldStatusTag from './FieldStatusTag';

interface StringListEditorProps {
  /** Empty hides the label (the section title already says it). */
  label: string;
  fieldKey: ResumeFieldKey;
  status: FieldStatus;
  value: string[];
  dirty: boolean;
  disabled: boolean;
  /** Field-path -> reason; `skills` for the whole list, `skills[1]` for one item. */
  errors: Record<string, ErrorReason>;
  /** Always receives the complete new list. */
  onChange: (items: string[]) => void;
}

/** Add / edit / delete for a text list; blank rows are dropped when their input loses focus. */
export default function StringListEditor({ label, fieldKey, status, value, dirty, disabled, errors, onChange }: StringListEditorProps) {
  const maxItems = FIELD_MAX_LENGTH[fieldKey].maxItems;
  const atLimit = maxItems !== undefined && value.length >= maxItems;
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const focusLast = useRef(false);

  // After "add", move focus to the new row.
  useEffect(() => {
    if (focusLast.current) {
      focusLast.current = false;
      inputs.current[value.length - 1]?.focus();
    }
  }, [value.length]);

  const change = (index: number, text: string) => onChange(value.map((item, i) => (i === index ? text : item)));
  const remove = (index: number) => onChange(value.filter((_, i) => i !== index));

  return (
    <div className="field-row field-edit list-edit" data-field={fieldKey}>
      {label ? <span className="field-label">{label}</span> : null}
      <div className="field-value">
        {value.length === 0 ? <span className="value-empty">（未提供）</span> : null}
        {value.map((item, index) => {
          const itemError = errors[`${fieldKey}[${index}]`];
          return (
            <div className="list-row" key={index}>
              <Input
                ref={(node) => {
                  inputs.current[index] = node?.input ?? null;
                }}
                aria-label={`${label || fieldKey}第${index + 1}项`}
                value={item}
                disabled={disabled}
                status={itemError ? 'error' : undefined}
                onChange={(event) => change(index, event.target.value)}
                onBlur={() => {
                  if (item.trim() === '') remove(index);
                }}
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
            onChange([...value, '']);
            focusLast.current = true;
          }}
        >
          ＋ 添加一项
        </Button>
        {atLimit ? <span className="value-empty">（最多 {maxItems} 项）</span> : null}
      </div>
      <span className="field-tags">
        {dirty ? <Tag>未提交修改</Tag> : null}
        <FieldStatusTag status={status} />
      </span>
    </div>
  );
}
