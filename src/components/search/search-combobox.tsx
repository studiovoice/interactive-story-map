"use client"

import { Loader2Icon, SearchIcon, XIcon } from "lucide-react"
import { useId, useRef, useState, type ReactNode } from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export type SearchItem = {
  id: string
  title: string
  subtitle?: string
  icon?: ReactNode
  onSelect: () => void
}

export type SearchGroup = {
  label: string
  items: SearchItem[]
  /** Shown under the label when there are no items (e.g. "Searching…", "No places found"). */
  empty?: ReactNode
  loading?: boolean
}

/**
 * A search input with a grouped results dropdown (ARIA combobox).
 * ↑/↓ to move, Enter to pick, Esc to close. Typing still updates `value` live,
 * so callers can also use it as a filter.
 */
export function SearchCombobox({
  value,
  onValueChange,
  groups,
  placeholder,
  ariaLabel,
  className,
  inputClassName,
  footer,
}: {
  value: string
  onValueChange: (v: string) => void
  groups: SearchGroup[]
  placeholder?: string
  ariaLabel: string
  className?: string
  inputClassName?: string
  footer?: ReactNode
}) {
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const items = groups.flatMap((g) => g.items)
  const open = focused && value.trim().length > 0 && groups.some((g) => g.items.length || g.empty || g.loading)
  const loading = groups.some((g) => g.loading)

  function pick(item: SearchItem) {
    item.onSelect()
    setActiveIndex(-1)
    inputRef.current?.blur()
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && items.length) {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % items.length)
    } else if (e.key === "ArrowUp" && items.length) {
      e.preventDefault()
      setActiveIndex((i) => (i <= 0 ? items.length - 1 : i - 1))
    } else if (e.key === "Enter") {
      const item = items[activeIndex] ?? (items.length === 1 ? items[0] : undefined)
      if (item) {
        e.preventDefault()
        pick(item)
      }
    } else if (e.key === "Escape") {
      if (value) onValueChange("")
      else inputRef.current?.blur()
      setActiveIndex(-1)
    }
  }

  let n = -1
  return (
    <div className={cn("relative", className)}>
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 z-[1] size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        value={value}
        onChange={(e) => {
          onValueChange(e.target.value)
          setActiveIndex(-1)
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={cn("pr-8 pl-8", inputClassName)}
      />
      {loading ? (
        <Loader2Icon className="absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
      ) : (
        value && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onValueChange("")}
            className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <XIcon className="size-3.5" />
          </button>
        )
      )}

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          // Keep focus in the input while clicking results.
          onMouseDown={(e) => e.preventDefault()}
          className="absolute top-[calc(100%+4px)] right-0 left-0 z-30 max-h-[min(60vh,26rem)] overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {groups.map((g) =>
            !g.items.length && !g.empty && !g.loading ? null : (
              <div key={g.label} role="group" aria-label={g.label} className="py-0.5">
                <div className="px-2 pt-1 pb-0.5 text-[11px] font-medium text-muted-foreground">{g.label}</div>
                {!g.items.length && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">{g.loading ? "Searching…" : g.empty}</div>
                )}
                {g.items.map((item) => {
                  n++
                  const i = n
                  return (
                    <div
                      key={item.id}
                      id={`${listId}-${i}`}
                      role="option"
                      aria-selected={i === activeIndex}
                      onMouseEnter={() => setActiveIndex(i)}
                      onClick={() => pick(item)}
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5",
                        i === activeIndex && "bg-muted",
                      )}
                    >
                      {item.icon && (
                        <span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-md bg-muted text-muted-foreground [&_svg]:size-3.5">
                          {item.icon}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{item.title}</span>
                        {item.subtitle && (
                          <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span>
                        )}
                      </span>
                    </div>
                  )
                })}
              </div>
            ),
          )}
          {footer && <div className="border-t px-2 pt-1.5 pb-1 text-[10.5px] text-muted-foreground">{footer}</div>}
        </div>
      )}
    </div>
  )
}
