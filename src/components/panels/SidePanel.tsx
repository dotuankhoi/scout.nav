/**
 * Right side panel: Inspector / Stats / Learn tabs.
 */

import { BarChart3, GraduationCap, Microscope, Sparkles } from 'lucide-react';
import { useAppStore, type PanelTab } from '@/store/useAppStore';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CoachPanel } from './CoachPanel';
import { InspectorPanel } from './InspectorPanel';
import { StatsPanel } from './StatsPanel';
import { EducationPanel } from './EducationPanel';

export function SidePanel() {
  const panelTab = useAppStore((s) => s.panelTab);
  const setPanelTab = useAppStore((s) => s.setPanelTab);

  return (
    <aside className="glass hidden w-80 shrink-0 flex-col overflow-hidden rounded-2xl p-3 lg:flex xl:w-88">
      <Tabs
        value={panelTab}
        onValueChange={(v) => setPanelTab(v as PanelTab)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList>
          <TabsTrigger value="coach">
            <Sparkles className="size-3.5" /> Coach
          </TabsTrigger>
          <TabsTrigger value="inspector">
            <Microscope className="size-3.5" /> Inspect
          </TabsTrigger>
          <TabsTrigger value="stats">
            <BarChart3 className="size-3.5" /> Stats
          </TabsTrigger>
          <TabsTrigger value="learn">
            <GraduationCap className="size-3.5" /> Learn
          </TabsTrigger>
        </TabsList>
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
          <TabsContent value="coach">
            <CoachPanel />
          </TabsContent>
          <TabsContent value="inspector">
            <InspectorPanel />
          </TabsContent>
          <TabsContent value="stats">
            <StatsPanel />
          </TabsContent>
          <TabsContent value="learn">
            <EducationPanel />
          </TabsContent>
        </div>
      </Tabs>
    </aside>
  );
}
