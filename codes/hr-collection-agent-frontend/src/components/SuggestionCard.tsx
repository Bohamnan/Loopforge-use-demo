import { Button, Tag } from 'antd';
import type { ApiError } from '../api/ApiError';
import { labelOfField, sectionKeyOfField, getSection, type SectionKey } from '../hooks/model/SectionConfig';
import type { LocalError } from '../hooks/model/SessionReducer';
import { cardStatus } from '../hooks/model/Verify';
import type { Suggestion, SuggestionReason } from '../types/Conversation';
import ChangeRows, { type ChangeRow } from './ChangeRows';
import ErrorAlert from './ErrorAlert';

const REASON_TEXT: Record<SuggestionReason, string> = {
  required: '必填',
  invalid_format: '格式不正确',
  invalid_type: '类型不符',
  too_long: '内容过长',
};

interface SuggestionCardProps {
  suggestions: readonly Suggestion[];
  /** Buttons are offered only while the session is being reviewed and nothing else is running. */
  actionable: boolean;
  /** The last request of this card failed. */
  error?: ApiError | LocalError | null;
  onApply?: () => void;
  onCancel?: () => void;
  onJump?: (section: SectionKey) => void;
}

/** One card per assistant message: the suggested changes, applied or cancelled as a whole (REQ-FE-07.4-07.6). */
export default function SuggestionCard({ suggestions, actionable, error = null, onApply, onCancel, onJump }: SuggestionCardProps) {
  if (suggestions.length === 0) return null;
  const status = cardStatus(suggestions);
  const rows: ChangeRow[] = suggestions.map((s) => {
    const showOld = status === 'pending' && actionable && s.status === 'pending';
    return {
      key: s.suggestion_id,
      field: s.field,
      label: labelOfField(s.field),
      ...(showOld ? { oldValue: s.old_value } : {}),
      newValue: s.new_value,
      note: !s.applicable && s.reason ? `无法应用：${REASON_TEXT[s.reason]}` : undefined,
    };
  });
  const appliedSections = [...new Set(suggestions.filter((s) => s.status === 'applied').map((s) => sectionKeyOfField(s.field)))];
  return (
    <div className="suggestion-card" aria-label="修改建议">
      <div className="suggestion-title">修改建议</div>
      <ChangeRows rows={rows} />
      {status === 'pending' && actionable ? (
        <div className="suggestion-actions">
          <Button type="primary" size="small" onClick={onApply}>
            应用
          </Button>
          <Button size="small" onClick={onCancel}>
            取消
          </Button>
        </div>
      ) : null}
      {status === 'applied' ? (
        <div className="suggestion-actions">
          <Tag color="green">已应用 ✓</Tag>
          {onJump && appliedSections.map((key) => (
            <Button key={key} size="small" type="link" onClick={() => onJump(key)}>
              查看{getSection(key).title}分区
            </Button>
          ))}
        </div>
      ) : null}
      {status === 'cancelled' ? <Tag>已取消</Tag> : null}
      {error ? <ErrorAlert error={error} /> : null}
    </div>
  );
}
