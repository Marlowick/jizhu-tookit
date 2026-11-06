import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Search } from 'lucide-react'
import type { CommandItem } from '../core/commands'
import { useI18n } from '../core/useI18n'

interface CommandPaletteProps {
  items: CommandItem[]
  onClose: () => void
}

type PaletteMode = 'quick' | 'search'

export function CommandPalette({ items, onClose }: CommandPaletteProps) {
  const { t } = useI18n()
  const [mode, setMode] = useState<PaletteMode>('quick')
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const quickItems = useMemo(() => items.filter((item) => Boolean(item.quickKey)), [items])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items
      .map((item) => {
        const title = item.title.toLowerCase()
        const english = item.english.toLowerCase()
        const keywords = (item.keywords ?? []).join(' ').toLowerCase()
        const description = (item.description ?? '').toLowerCase()
        const group = item.group.toLowerCase()
        const hint = (item.hint ?? '').toLowerCase()
        const score = title.startsWith(q) || english.startsWith(q)
          ? 0
          : title.includes(q) || english.includes(q) || keywords.includes(q)
            ? 1
            : group.includes(q)
              ? 2
              : description.includes(q)
                ? 3
                : hint.includes(q)
                  ? 4
                  : -1
        return { item, score }
      })
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => a.score - b.score)
      .map((entry) => entry.item)
  }, [items, query])

  const displayed = mode === 'quick' ? quickItems : filtered
  const indexOf = useMemo(() => new Map(displayed.map((item, index) => [item.id, index])), [displayed])

  const groups = useMemo(() => {
    const result = new Map<string, CommandItem[]>()
    for (const item of displayed) {
      const list = result.get(item.group) ?? []
      list.push(item)
      result.set(item.group, list)
    }
    return [...result.entries()]
  }, [displayed])

  useEffect(() => {
    // Quick mode deliberately does NOT focus an input: this avoids activating
    // the Chinese IME until the user explicitly asks for search.
    if (mode === 'quick') panelRef.current?.focus()
    else inputRef.current?.focus()
  }, [mode])

  useEffect(() => {
    setActive(0)
  }, [displayed.length, mode, query])

  useEffect(() => {
    const item = listRef.current?.querySelector<HTMLElement>('.palette-item.active')
    item?.scrollIntoView({ block: 'nearest' })
  }, [active, displayed])

  const execute = (item: CommandItem | undefined) => {
    if (!item) return
    item.run()
    onClose()
  }

  const startSearch = () => {
    setMode('search')
    setQuery('')
  }

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }

    // Modifier chords stay with the global shortcut handler; never treat them
    // as quick-command letters (e.g. ⌘W while the palette is open).
    if (event.metaKey || event.ctrlKey || event.altKey) return

    if (mode === 'quick') {
      if (event.key === '/') {
        event.preventDefault()
        startSearch()
        return
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActive((value) => (quickItems.length ? (value + 1) % quickItems.length : 0))
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActive((value) => (quickItems.length ? (value - 1 + quickItems.length) % quickItems.length : 0))
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        execute(quickItems[active])
        return
      }
      if (event.key.length === 1) {
        const match = quickItems.find((item) => item.quickKey?.toLowerCase() === event.key.toLowerCase())
        if (match) {
          event.preventDefault()
          execute(match)
        }
      }
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((value) => (filtered.length ? (value + 1) % filtered.length : 0))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((value) => (filtered.length ? (value - 1 + filtered.length) % filtered.length : 0))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      execute(filtered[active])
    }
  }

  return (
    <div
      className="palette-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        className={`palette ${mode === 'quick' ? 'palette-quick' : 'palette-mode-search'}`}
        role="dialog"
        aria-modal="true"
        aria-label={t('palette.title')}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <div className="palette-search">
          <Search size={17} strokeWidth={1.7} />
          {mode === 'quick' ? (
            <button className="palette-quick-trigger" onClick={startSearch}>
              {t('palette.quickHint')}
              <small>{t('palette.quickSearch')}</small>
            </button>
          ) : (
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('palette.search')}
              aria-label={t('palette.searchAria')}
            />
          )}
          <span className="palette-scope">{mode === 'quick' ? 'A–Z' : t('palette.scope')}</span>
        </div>

        <div className="palette-list" role="listbox" ref={listRef}>
          {groups.length === 0 ? (
            <div className="palette-empty">{t('palette.empty')}</div>
          ) : (
            groups.map(([group, groupItems]) => (
              <div key={group}>
                <div className="palette-group">{group}</div>
                {groupItems.map((item) => {
                  const index = indexOf.get(item.id) ?? 0
                  const Icon = item.icon
                  return (
                    <div
                      key={item.id}
                      className={`palette-item ${index === active ? 'active' : ''}`}
                      role="option"
                      aria-selected={index === active}
                      onMouseMove={() => setActive(index)}
                      onClick={() => execute(item)}
                    >
                      {mode === 'quick' && item.quickKey ? (
                        <kbd className="quick-key">{item.quickKey.toUpperCase()}</kbd>
                      ) : null}
                      <span className="item-icon">
                        {Icon ? <Icon size={15} strokeWidth={1.6} /> : null}
                      </span>
                      <span className="item-copy">
                        <span className="palette-item-title">
                          {item.title}
                          <em className="item-english">{item.english}</em>
                        </span>
                        {item.description ? (
                          <span className="item-description">{item.description}</span>
                        ) : null}
                      </span>
                      {item.hint ? <span className="hint">{item.hint}</span> : null}
                    </div>
                  )
                })}
              </div>
            ))
          )}
        </div>

        <div className="palette-footer">
          {mode === 'quick' ? (
            <>
              <span>{t('palette.quickExecute')}</span>
              <span>{t('palette.quickSearch')}</span>
              <span>{t('palette.close')}</span>
            </>
          ) : (
            <>
              <span>{t('palette.select')}</span>
              <span>{t('palette.execute')}</span>
              <span>{t('palette.close')}</span>
            </>
          )}
          <span className="keys">{t('palette.footer')}</span>
        </div>
      </div>
    </div>
  )
}
