import { Button } from 'antd';

interface NewChatButtonProps {
  onClick?: () => void;
  disabled?: boolean;
}

export default function NewChatButton({ onClick, disabled }: NewChatButtonProps) {
  return (
    <Button type="primary" shape="round" block onClick={onClick} disabled={disabled}>
      ＋ 新对话
    </Button>
  );
}
