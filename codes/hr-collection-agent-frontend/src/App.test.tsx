import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App, { appTheme } from './App';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('renders the page shell inside the error boundary', async () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'HR 简历信息收集' })).toBeInTheDocument();
    expect(await screen.findByText(/上传简历文件/)).toBeInTheDocument();
  });

  it('uses the prototype palette as Ant Design theme tokens (TD-14)', () => {
    expect(appTheme.token).toMatchObject({
      colorPrimary: '#126af3',
      colorSuccess: '#1a7f4b',
      colorWarning: '#b26a00',
      colorError: '#dd0028',
      colorText: '#0c1217',
      colorBgLayout: '#f3f5f7',
    });
  });
});
