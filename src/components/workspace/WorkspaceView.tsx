import { useAppStore } from '../../store/appStore'
import type { Doc, Tab } from '../../core/types'
import { JsonTool } from '../JsonTool'
import { PlainEditor } from './PlainEditor'
import { WorkspacePanels } from './WorkspacePanels'

interface WorkspaceViewProps {
  tab: Tab
  doc: Doc
}

export function WorkspaceView({ tab, doc }: WorkspaceViewProps) {
  const setText = useAppStore((state) => state.setText)
  const setCursor = useAppStore((state) => state.setCursor)
  const setSelectionText = useAppStore((state) => state.setSelectionText)
  const wordWrap = useAppStore((state) => state.settings.wordWrap)
  const workspace = tab.workspace ?? {
    mode: 'plain' as const,
    panels: [],
    activePanelId: null,
    maximizedPanelId: null,
  }

  if (workspace.panels.length) {
    return <WorkspacePanels tab={tab} doc={doc} />
  }

  if (workspace.mode === 'json') {
    return (
      <div className="workspace-editor">
        <JsonTool tab={tab} doc={doc} />
      </div>
    )
  }

  return (
    <div className="workspace-editor plain-workspace">
      <PlainEditor
        text={doc.text}
        wordWrap={wordWrap}
        onChange={(value) => setText(doc.id, value)}
        onCursor={setCursor}
        onSelection={setSelectionText}
      />
    </div>
  )
}
