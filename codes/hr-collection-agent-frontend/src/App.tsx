import { ConfigProvider, Segmented, type ThemeConfig } from 'antd';
import { useState } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import ArchivePage from './pages/ArchivePage';
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

type View = 'chat' | 'archive';

/** Both pages stay mounted; the hidden one keeps its state (current session, edits, typed text) - TD-25, no router. */
export default function App() {
  const [view, setView] = useState<View>('chat');
  const nav = (
    <Segmented<View>
      value={view}
      onChange={setView}
      options={[
        { label: '对话', value: 'chat' },
        { label: '已归档简历', value: 'archive' },
      ]}
    />
  );
  return (
    <ConfigProvider theme={appTheme} button={{ autoInsertSpace: false }}>
      <ErrorBoundary>
        <div hidden={view !== 'chat'}>
          <ResumeCollectionPage visible={view === 'chat'} nav={nav} />
        </div>
        <div hidden={view !== 'archive'}>
          <ArchivePage active={view === 'archive'} nav={nav} />
        </div>
      </ErrorBoundary>
    </ConfigProvider>
  );
}
