"use client"

import { useMemo, useState } from "react"
import CodeMirror from "@uiw/react-codemirror"
import { json } from "@codemirror/lang-json"
import { search } from "@codemirror/search"
import { foldGutter, foldKeymap, syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language"
import { keymap, EditorView } from "@codemirror/view"
import { oneDark } from "@codemirror/theme-one-dark"
import { CopyIcon, MaximizeIcon, MinimizeIcon } from "lucide-react"
import { toast } from "sonner"

interface JsonViewerProps {
  value: unknown
  ariaLabel?: string
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function JsonViewer({ value, ariaLabel }: JsonViewerProps) {
  const text = useMemo(() => {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }, [value])

  const [collapsed, setCollapsed] = useState(false)
  const byteCount = useMemo(
    () => new TextEncoder().encode(text).length,
    [text],
  )

  const extensions = useMemo(
    () => [
      json(),
      foldGutter(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      search(),
      keymap.of(foldKeymap),
      EditorView.lineWrapping,
      EditorView.theme({
        "&": {
          fontSize: "11px",
          backgroundColor: "transparent",
        },
        ".cm-gutters": {
          backgroundColor: "transparent",
          border: "none",
        },
        ".cm-content": {
          fontFamily: "'Geist Mono Variable', monospace",
        },
      }),
    ],
    [],
  )

  const copyAll = () => {
    navigator.clipboard.writeText(text).then(
      () => toast.success("copied"),
      () => toast.error("copy failed"),
    )
  }

  return (
    <div className="bg-muted/20 rounded-sm border" aria-label={ariaLabel}>
      <div className="flex items-center justify-between border-b px-2 py-1 font-sans text-[10px] uppercase tracking-wide text-muted-foreground">
        <span>{formatBytes(byteCount)}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="hover:text-foreground transition-colors"
            aria-label={collapsed ? "expand" : "collapse"}
          >
            {collapsed ? (
              <MaximizeIcon className="size-3" />
            ) : (
              <MinimizeIcon className="size-3" />
            )}
          </button>
          <button
            type="button"
            onClick={copyAll}
            className="hover:text-foreground transition-colors"
            aria-label="copy all"
          >
            <CopyIcon className="size-3" />
          </button>
        </div>
      </div>
      {!collapsed && (
        <CodeMirror
          value={text}
          editable={false}
          basicSetup={{
            lineNumbers: false,
            highlightActiveLine: false,
            foldGutter: false,
            highlightSelectionMatches: true,
          }}
          extensions={extensions}
          theme={oneDark}
          maxHeight="60vh"
        />
      )}
    </div>
  )
}
