import { Button } from 'antd';
import type { SectionConfig } from '../hooks/model/SectionConfig';
import { sectionStatus } from '../hooks/model/SectionView';
import type { ResumeFields, ResumeFieldsUpdate } from '../types/ResumeModel';
import FieldStatusTag from './FieldStatusTag';
import ReadOnlySection from './ReadOnlySection';

interface SectionCardProps {
  section: SectionConfig;
  fields: ResumeFields;
  buffer: ResumeFieldsUpdate;
  /** The section currently being reviewed. */
  active: boolean;
  /** Makes this section the active one; no entry is shown when omitted (e.g. the final review). */
  onSelect?: () => void;
}

/** One section of the result: title, section status and its fields. Editing is added in task 2.4. */
export default function SectionCard({ section, fields, buffer, active, onSelect }: SectionCardProps) {
  return (
    <section className={`section-card${active ? ' section-active' : ''}`} aria-current={active ? 'true' : undefined}>
      <header className="section-head">
        <h3>{section.title}</h3>
        <span data-testid="section-status">
          <FieldStatusTag status={sectionStatus(section, fields)} />
        </span>
        {!active && onSelect ? (
          <Button size="small" type="link" onClick={onSelect}>
            修改
          </Button>
        ) : null}
      </header>
      <ReadOnlySection section={section} fields={fields} buffer={buffer} />
    </section>
  );
}
