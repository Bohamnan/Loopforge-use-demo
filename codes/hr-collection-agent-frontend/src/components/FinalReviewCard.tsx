import { Alert, Button } from 'antd';
import type { ApiError } from '../api/ApiError';
import { SECTIONS } from '../hooks/model/SectionConfig';
import type { LocalError } from '../hooks/model/SessionReducer';
import type { ResumeFields, ResumeFieldsUpdate } from '../types/ResumeModel';
import ErrorAlert from './ErrorAlert';
import SectionCard from './SectionCard';

interface FinalReviewCardProps {
  fields: ResumeFields;
  buffer: ResumeFieldsUpdate;
  /** Number of fields that are not confirmed yet. */
  unconfirmedCount: number;
  /** name / phone / email are confirmed and valid (D-03). */
  coreReady: boolean;
  /** The confirmation request is in flight. */
  busy: boolean;
  /** Failure of the last confirmation request. */
  error: ApiError | LocalError | null;
  onConfirm: () => void;
  onBack: () => void;
  /** Leads to the section holding name / phone / email. */
  onEditCore: () => void;
}

const TIMEOUT_TEXT = '未收到保存结果，尚未确认保存成功，可直接重试。';

/**
 * The whole result, read-only, with the one explicit "confirm" action. Nothing here says "saved":
 * success is shown only by SavedResultCard after the backend answered (F-03).
 */
export default function FinalReviewCard({
  fields,
  buffer,
  unconfirmedCount,
  coreReady,
  busy,
  error,
  onConfirm,
  onBack,
  onEditCore,
}: FinalReviewCardProps) {
  const outcomeUnknown = error !== null && 'code' in error && ['client_timeout', 'network_error', 'unknown_error'].includes(error.code);
  return (
    <div className="final-card">
      <h2>最终确认</h2>
      <p className="value-empty">请核对下面的全部内容；点击“确认提交”后才会保存。</p>
      {unconfirmedCount > 0 ? <Alert type="warning" showIcon message={`还有 ${unconfirmedCount} 项字段未确认。`} /> : null}
      {SECTIONS.map((section) => (
        <SectionCard key={section.key} section={section} fields={fields} buffer={buffer} active={false} />
      ))}
      {error ? <ErrorAlert error={error} timeoutMessage={TIMEOUT_TEXT} /> : null}
      {outcomeUnknown ? <p className="value-empty">当前不能确认是否已保存。可以再试一次；如果提示草稿不存在，说明可能已经保存，请重新上传核实。</p> : null}
      {!coreReady ? (
        <div className="final-block">
          <span className="field-error">请先确认姓名、手机号、邮箱后再提交。</span>
          <Button size="small" onClick={onEditCore}>
            去确认基本信息
          </Button>
        </div>
      ) : null}
      <div className="final-actions">
        <Button onClick={onBack} disabled={busy}>
          我还要修改
        </Button>
        <Button type="primary" onClick={onConfirm} disabled={!coreReady || busy} loading={busy}>
          确认提交
        </Button>
      </div>
    </div>
  );
}
