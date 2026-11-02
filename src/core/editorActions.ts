export const EDITOR_UNDO_EVENT = 'jizhu:editor-undo'
export const EDITOR_SEARCH_EVENT = 'jizhu:editor-search'

export function requestEditorUndo(): void {
  window.dispatchEvent(new Event(EDITOR_UNDO_EVENT))
}

export function requestEditorSearch(): void {
  window.dispatchEvent(new Event(EDITOR_SEARCH_EVENT))
}
