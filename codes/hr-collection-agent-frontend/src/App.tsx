import { ConfigProvider, type ThemeConfig } from 'antd';
import ErrorBoundary from './components/ErrorBoundary';
import ResumeCollectionPage from './pages/ResumeCollectionPage';

/** Ant Design theme tokens taken from the prototype palette (global-info/prototype/style.css, TD-14). */
export const appTheme: ThemeConfig = {
  token: {
    colorPrimary: '#126af3',
    colorInfo: '#126af3',
    colorSuccess: '#1a7f4b',
    colorWarning: '#b26a00',
    colorError: '#dd0028',
    colorText: '#0c1217',
    colorTextSecondary: '#65717b',
    colorBorder: '#d5dce2',
    colorBgLayout: '#f3f5f7',
    borderRadius: 8,
    fontFamily: 'Grundfos, "PingFang SC", "Microsoft YaHei", "Lucida Grande", Tahoma, sans-serif',
  },
};

export default function App() {
  return (
    <ConfigProvider theme={appTheme} button={{ autoInsertSpace: false }}>
      <ErrorBoundary>
        <ResumeCollectionPage />
      </ErrorBoundary>
    </ConfigProvider>
  );
}
