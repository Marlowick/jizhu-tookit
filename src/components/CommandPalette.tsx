import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Search } from 'lucide-react'
import type { CommandItem } from '../core/commands'
import { useI18n } from '../core/useI18n'

interface CommandPaletteProps {
  items: CommandItem[]
  onClose: () => void
}

export function CommandPalette({ items, onClose }: CommandPaletteProps) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items
      .map((item) => {
        const title = item.title.toLowerCase()
        const description = (item.description ?? '').toLowerCase()
        const group = item.group.toLowerCase()
        const hint = (item.hint ?? '').toLowerCase()
        const score = title.startsWith(q)
          ? 0
          : title.includes(q)
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

  const indexOf = useMemo(() => new Map(filtered.map((item, index) => [item.id, index])), [filtered])

  const groups = useMemo(() => {
    const result = new Map<string, CommandItem[]>()
    for (const item of filtered) {
      const list = result.get(item.group) ?? []
      list.push(item)
      result.set(item.group, list)
    }
    return [...result.entries()]
  }, [filtered])

  useEffect(() => {
    setActive(0)
  }, [query])

  useEffect(() => {
    const item = listRef.current?.querySelector<HTMLElement>('.palette-item.active')
    item?.scrollIntoView({ block: 'nearest' })
  }, [active, filtered])

  const execute = (item: CommandItem | undefined) => {
    if (!item) return
    item.run()
    onClose()
  }

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
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
      <div className="palette" role="dialog" aria-modal="true" aria-label={t('palette.title')} onKeyDown={onKeyDown}>
        <div className="palette-search">
          <Search size={17} strokeWidth={1.7} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('palette.search')}
            aria-label={t('palette.searchAria')}
          />
          <span className="palette-scope">{t('palette.scope')}</span>
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
                      <span className="item-icon">
                        {Icon ? <Icon size={15} strokeWidth={1.6} /> : null}
                      </span>
                      <span className="item-copy">
                        <span>{item.title}</span>
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
          <span>{t('palette.select')}</span>
          <span>{t('palette.execute')}</span>
          <span>{t('palette.close')}</span>
          <span className="keys">{t('palette.footer')}</span>
        </div>
      </div>
    </div>
  )
}
