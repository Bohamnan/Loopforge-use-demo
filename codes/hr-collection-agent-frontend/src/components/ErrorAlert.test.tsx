import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/ApiError';
import ErrorAlert from './ErrorAlert';

describe('ErrorAlert', () => {
  it('shows only the backend message and the request id for a backend error', () => {
    const error = new ApiError({ code: 'file_too_large', message: '文件超过 10 MB，请压缩后重试。', status: 413, request_id: 'req_42' });
    render(<ErrorAlert error={error} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('文件超过 10 MB，请压缩后重试。');
    expect(alert).toHaveTextContent('req_42');
  });

  it('uses the fixed text for frontend-only codes and shows no request id', () => {
    render(<ErrorAlert error={ApiError.network()} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('网络异常，请检查网络后重试。');
    expect(alert).not.toHaveTextContent('请求编号');
  });

  it('shows a local error message', () => {
    render(<ErrorAlert error={{ kind: 'local', message: '仅支持 PDF、JPG、JPEG、PNG 格式。' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('仅支持 PDF、JPG、JPEG、PNG 格式。');
  });

  it('lets the caller override the text of a client timeout', () => {
    render(<ErrorAlert error={ApiError.timeout()} timeoutMessage="识别时间过长，请重新上传。" />);
    expect(screen.getByRole('alert')).toHaveTextContent('识别时间过长，请重新上传。');
    expect(screen.getByRole('alert')).not.toHaveTextContent('请求超时');
  });

  it('does not override a backend error with the timeout text', () => {
    const error = new ApiError({ code: 'parse_timeout', message: '解析超时，请重新上传。', status: 504, request_id: 'r' });
    render(<ErrorAlert error={error} timeoutMessage="识别时间过长，请重新上传。" />);
    expect(screen.getByRole('alert')).toHaveTextContent('解析超时，请重新上传。');
  });

  it('shows the bad-response text only for a 2xx answer of the wrong shape, not for other unknown errors', () => {
    const text = '上传结果异常，请刷新页面后核对。';
    const { unmount } = render(<ErrorAlert error={ApiError.unknown(201)} badResponseMessage={text} />);
    expect(screen.getByRole('alert')).toHaveTextContent(text);
    unmount();
    const other = render(<ErrorAlert error={ApiError.unknown(502)} badResponseMessage={text} />);
    expect(other.container).not.toHaveTextContent(text);
    expect(other.container).toHaveTextContent('服务暂时不可用');
  });
});
