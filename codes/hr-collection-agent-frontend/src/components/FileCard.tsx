/** Human-readable file size. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

interface FileCardProps {
  name: string;
  sizeBytes?: number;
}

export default function FileCard({ name, sizeBytes }: FileCardProps) {
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toUpperCase() : 'FILE';
  return (
    <div className="file-card">
      <span className="file-card-badge">{ext}</span>
      <span className="file-card-name">{name}</span>
      {sizeBytes !== undefined ? <small className="file-card-size">{formatFileSize(sizeBytes)}</small> : null}
    </div>
  );
}
