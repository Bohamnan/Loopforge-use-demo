import { Button } from 'antd';

export interface QuickReplyChip {
  label: string;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}

interface QuickReplyChipsProps {
  chips: readonly QuickReplyChip[];
}

/**
 * Predefined quick actions. They trigger the same actions as the on-card buttons and never accept
 * or parse free text (ADR-006).
 */
export default function QuickReplyChips({ chips }: QuickReplyChipsProps) {
  if (chips.length === 0) return null;
  return (
    <div className="quick-replies">
      {chips.map((chip) => (
        <Button key={chip.label} shape="round" type={chip.primary ? 'primary' : 'default'} disabled={chip.disabled} onClick={chip.onClick}>
          {chip.label}
        </Button>
      ))}
    </div>
  );
}
