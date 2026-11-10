import { Tag } from 'antd';
import type { FieldStatus } from '../types/ResumeModel';

const STATUS_VIEW: Record<FieldStatus, { text: string; color: string }> = {
  recognized: { text: '待确认', color: 'blue' },
  uncertain: { text: '不确定、请确认', color: 'warning' },
  missing: { text: '待补充', color: 'error' },
  confirmed: { text: '已确认', color: 'success' },
};

interface FieldStatusTagProps {
  status: FieldStatus;
}

/** Field status badge. The text carries the meaning; colour only reinforces it (TD-13). */
export default function FieldStatusTag({ status }: FieldStatusTagProps) {
  const { text, color } = STATUS_VIEW[status];
  return (
    <Tag color={color} data-status={status} style={{ marginInlineEnd: 0 }}>
      {text}
    </Tag>
  );
}
