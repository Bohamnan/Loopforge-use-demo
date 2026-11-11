import { Table } from 'antd';
import { formatDateTime } from '../hooks/model/FormatTime';
import type { ResumeSummary } from '../types/Archive';

interface ArchiveListProps {
  items: ResumeSummary[];
  loading: boolean;
  onOpen: (id: string) => void;
}

const orEmpty = (value: string | null) => (value && value.trim() !== '' ? value : '未填写');

/** Archived resumes as a table. The record id is used as row key only and never shown (P-09). */
export default function ArchiveList({ items, loading, onOpen }: ArchiveListProps) {
  return (
    <Table<ResumeSummary>
      rowKey="resume_id"
      loading={loading}
      dataSource={items}
      pagination={false}
      locale={{ emptyText: '暂无记录' }}
      onRow={(record) => ({ onClick: () => onOpen(record.resume_id) })}
      columns={[
        {
          title: '姓名',
          dataIndex: 'name',
          render: (name: string, record) => (
            <button type="button" className="link-button" onClick={() => onOpen(record.resume_id)}>
              {orEmpty(name)}
            </button>
          ),
        },
        { title: '手机号', dataIndex: 'phone', render: orEmpty },
        { title: '邮箱', dataIndex: 'email', render: orEmpty },
        { title: '求职意向', dataIndex: 'job_title', render: orEmpty },
        { title: '保存时间', dataIndex: 'saved_at', render: (at: string) => formatDateTime(at) ?? '' },
      ]}
    />
  );
}
