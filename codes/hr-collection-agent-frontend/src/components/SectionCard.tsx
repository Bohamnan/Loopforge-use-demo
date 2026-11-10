import { Button } from 'antd';
import { currentValue, orderedFieldKeys, sectionConfirmBlock, sectionStatus } from '../hooks/model/SectionView';
import type { FieldConfig, SectionConfig } from '../hooks/model/SectionConfig';
import type { ApiError } from '../api/ApiError';
import type { LocalError } from '../hooks/model/SessionReducer';
import type { ErrorReason } from '../types/Errors';
import type { ResumeFields, ResumeFieldsUpdate } from '../types/ResumeModel';
import ErrorAlert from './ErrorAlert';
import FieldRow from './FieldRow';
import FieldStatusTag from './FieldStatusTag';
import ReadOnlySection from './ReadOnlySection';
import StringListEditor from './StringListEditor';

interface SectionCardProps {
  section: SectionConfig;
  fields: ResumeFields;
  buffer: ResumeFieldsUpdate;
  /** The section currently being reviewed. */
  active: boolean;
  /** Makes this section the active one; no entry is shown when omitted (e.g. the final review). */
  onSelect?: () => void;
  /** Editing: the active section is editable only when both callbacks are given. */
  onEdit?: (update: ResumeFieldsUpdate) => void;
  onConfirm?: () => void;
  /** Field-path -> reason from the backend or a failed local check. */
  fieldErrors?: Record<string, ErrorReason>;
  /** A request is in flight: inputs and the confirm button are locked. */
  busy?: boolean;
  /** Failure of the last section confirmation. */
  error?: ApiError | LocalError | null;
}

const NO_ERRORS: Record<string, ErrorReason> = {};

function errorsOf(all: Record<string, ErrorReason>, key: string): Record<string, ErrorReason> {
  const result: Record<string, ErrorReason> = {};
  for (const [path, reason] of Object.entries(all)) {
    if (path === key || path.startsWith(`${key}[`)) result[path] = reason;
  }
  return result;
}

/** One section of the result: title, status, its fields, and (when active) editing plus "confirm section". */
export default function SectionCard({
  section,
  fields,
  buffer,
  active,
  onSelect,
  onEdit,
  onConfirm,
  fieldErrors = NO_ERRORS,
  busy = false,
  error = null,
}: SectionCardProps) {
  const editing = active && onEdit !== undefined && onConfirm !== undefined;
  const status = sectionStatus(section, fields);
  const dirty = section.fields.some((f) => f.key in buffer);
  const block = editing ? sectionConfirmBlock(section, fields, buffer) : null;
  const hasEmptyOptional = section.fields.some((f) => !f.core && fields[f.key].status === 'missing');
  const singleSameLabel = section.fields.length === 1 && section.fields[0]?.label === section.title;

  const confirmLabel = status === 'confirmed' ? (dirty ? '确认修改' : '已确认') : '确认本区';
  const confirmDisabled = busy || block !== null || (status === 'confirmed' && !dirty);

  const byKey = new Map(section.fields.map((f) => [f.key, f]));

  const renderEditor = (field: FieldConfig) => {
    const key = field.key;
    const common = { status: fields[key].status, dirty: key in buffer, disabled: busy };
    if (field.kind === 'stringList') {
      return (
        <StringListEditor
          key={key}
          {...common}
          label={singleSameLabel ? '' : field.label}
          fieldKey={key}
          value={(currentValue(fields, buffer, key) as string[] | undefined) ?? []}
          errors={errorsOf(fieldErrors, key)}
          onChange={(items) => onEdit?.({ [key]: items })}
        />
      );
    }
    if (field.kind === 'objectList') {
      // Item-level editing arrives with task 2.5; until then the list is shown read-only.
      return <ReadOnlySection key={key} section={{ ...section, fields: [field] }} fields={fields} buffer={buffer} />;
    }
    return (
      <FieldRow
        key={key}
        {...common}
        field={field}
        value={(currentValue(fields, buffer, key) as string | null | undefined) ?? null}
        error={fieldErrors[key]}
        onChange={(text) => onEdit?.({ [key]: text })}
      />
    );
  };

  return (
    <section className={`section-card${active ? ' section-active' : ''}`} aria-current={active ? 'true' : undefined}>
      <header className="section-head">
        <h3>{section.title}</h3>
        <span data-testid="section-status">
          <FieldStatusTag status={status} />
        </span>
        {!active && onSelect ? (
          <Button size="small" type="link" onClick={onSelect}>
            修改
          </Button>
        ) : null}
      </header>
      {editing ? (
        <div className="section-fields">
          {orderedFieldKeys(section, fields).map((key) => renderEditor(byKey.get(key) as FieldConfig))}
          <div className="section-actions">
            {block ? <span className="field-error">{block}</span> : hasEmptyOptional ? <span className="value-empty">空项将按留空确认</span> : null}
            {error ? <ErrorAlert error={error} /> : null}
            <Button type="primary" disabled={confirmDisabled} loading={busy} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      ) : (
        <ReadOnlySection section={section} fields={fields} buffer={buffer} />
      )}
    </section>
  );
}
