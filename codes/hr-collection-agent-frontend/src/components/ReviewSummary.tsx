import { Button } from 'antd';
import { SECTIONS, type SectionKey } from '../hooks/model/SectionConfig';
import { sectionStatus, statusCounts } from '../hooks/model/SectionView';
import type { ResumeFields } from '../types/ResumeModel';

interface ReviewSummaryProps {
  fields: ResumeFields;
  onJump: (section: SectionKey) => void;
}

/** Overview shown above the sections: field counts per status and jump chips to the sections that need attention. */
export default function ReviewSummary({ fields, onJump }: ReviewSummaryProps) {
  const counts = statusCounts(fields);
  const total = counts.recognized + counts.uncertain + counts.missing + counts.confirmed;
  const attention = SECTIONS.filter((s) => {
    const status = sectionStatus(s, fields);
    return status === 'missing' || status === 'uncertain';
  });
  return (
    <div className="review-summary">
      <p data-testid="review-summary-counts">
        共 {total} 项：待确认 {counts.recognized} / 不确定 {counts.uncertain} / 待补充 {counts.missing} / 已确认 {counts.confirmed}
      </p>
      {attention.length > 0 ? (
        <div className="review-chips">
          <span>需要处理：</span>
          {attention.map((s) => (
            <Button key={s.key} size="small" shape="round" onClick={() => onJump(s.key)}>
              {s.title}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
