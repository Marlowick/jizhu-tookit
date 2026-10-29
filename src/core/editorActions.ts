export const EDITOR_UNDO_EVENT = 'jizhu:editor-undo'

export function requestEditorUndo(): void {
  window.dispatchEvent(new Event(EDITOR_UNDO_EVENT))
}
