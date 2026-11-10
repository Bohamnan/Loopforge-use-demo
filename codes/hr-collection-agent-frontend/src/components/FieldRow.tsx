import { Input, Tag } from 'antd';
import { useState } from 'react';
import { reasonText, validateScalar } from '../hooks/model/FieldRules';
import type { FieldConfig } from '../hooks/model/SectionConfig';
import type { ErrorReason } from '../types/Errors';
import type { FieldStatus } from '../types/ResumeModel';
import FieldStatusTag from './FieldStatusTag';

interface FieldRowProps {
  field: FieldConfig;
  /** Status reported by the backend; never changed by local edits. */
  status: FieldStatus;
  /** Displayed text: the unsubmitted edit if any, else the saved value. */
  value: string | null;
  /** True when the value comes from the unsubmitted edit buffer. */
  dirty: boolean;
  disabled: boolean;
  onChange: (text: string) => void;
  /** Error from the backend (422 details) or from a failed local check at confirm time. */
  error?: ErrorReason;
}

/** One editable scalar field. Rules come from FieldRules; this component only shows their result. */
export default function FieldRow({ field, status, value, dirty, disabled, onChange, error }: FieldRowProps) {
  const [touched, setTouched] = useState(false);
  const id = `field-${field.key}`;
  const local = validateScalar(field.key, value);
  // A missing required value is flagged at once; format / length problems only after the user left the field.
  const localShown = local !== null && (touched || local === 'required') ? local : null;
  const shown = error ?? localShown;
  const InputComponent = field.kind === 'textarea' ? Input.TextArea : Input;
  return (
    <div className="field-row field-edit" data-field={field.key}>
      <label className="field-label" htmlFor={id}>
        {field.label}
      </label>
      <div className="field-value">
        <InputComponent
          id={id}
          value={value ?? ''}
          disabled={disabled}
          status={shown ? 'error' : undefined}
          aria-invalid={shown ? true : undefined}
          aria-describedby={shown ? `${id}-error` : undefined}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => setTouched(true)}
        />
        {shown ? (
          <div className="field-error" id={`${id}-error`}>
            {reasonText(shown)}
          </div>
        ) : null}
      </div>
      <span className="field-tags">
        {dirty ? <Tag>未提交修改</Tag> : null}
        <FieldStatusTag status={status} />
      </span>
    </div>
  );
}
