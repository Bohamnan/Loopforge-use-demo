import { Alert } from 'antd';
import { ApiError } from '../api/ApiError';
import type { LocalError } from '../hooks/model/SessionReducer';

interface ErrorAlertProps {
  error: ApiError | LocalError;
  /** Replaces the fixed text of a client_timeout only (e.g. the upload-specific wording). */
  timeoutMessage?: string;
  /** Replaces the text of a 2xx answer that had the wrong shape (the result of the request is unknown). */
  badResponseMessage?: string;
}

/**
 * Shows a failure to the user. Backend errors show only the backend `message` (DD-09);
 * frontend-only codes already carry fixed texts in ApiError. The request id helps support find the log line.
 */
export default function ErrorAlert({ error, timeoutMessage, badResponseMessage }: ErrorAlertProps) {
  if (!(error instanceof ApiError)) {
    return <Alert type="error" showIcon role="alert" message={error.message} />;
  }
  const badResponse = error.code === 'unknown_error' && error.status !== undefined && error.status >= 200 && error.status < 300;
  const text =
    error.code === 'client_timeout' && timeoutMessage
      ? timeoutMessage
      : badResponse && badResponseMessage
        ? badResponseMessage
        : error.message;
  return (
    <Alert
      type="error"
      showIcon
      role="alert"
      message={text}
      description={error.request_id ? `请求编号：${error.request_id}` : undefined}
    />
  );
}
