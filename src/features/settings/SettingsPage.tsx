import { useSearchParams } from 'react-router';
import { Page } from '@/components/Page';
import { Tabs } from '@/components/Tabs';
import { AppearanceSettings } from './AppearanceSettings';
import { StorageSettings } from './StorageSettings';
import { WorkspaceDataSettings } from './WorkspaceDataSettings';

const TAB_IDS = ['appearance', 'data', 'storage'] as const;
type SettingsTab = (typeof TAB_IDS)[number];

export function SettingsPage() {
  // The tab lives in the URL so it survives reloads and can be linked to.
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab: SettingsTab = TAB_IDS.find((id) => id === requested) ?? 'appearance';

  return (
    <Page title="Settings" description="Appearance, your workspace data and how it is stored.">
      <div className="max-w-4xl">
        <Tabs
          label="Settings sections"
          value={tab}
          onChange={(next) => {
            setParams(next === 'appearance' ? {} : { tab: next }, { replace: true });
          }}
          tabs={[
            { id: 'appearance', label: 'Appearance', content: <AppearanceSettings /> },
            { id: 'data', label: 'Workspace data', content: <WorkspaceDataSettings /> },
            { id: 'storage', label: 'Storage', content: <StorageSettings /> },
          ]}
        />
      </div>
    </Page>
  );
}
