import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { type AiLogEntry, aiLogApi } from '@/api/ai-log'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { dateLocale } from '@/lib/date-locale'

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(dateLocale(), { month: 'short', day: 'numeric' })
}

function LogEntry({ entry }: { entry: AiLogEntry }) {
  const { t } = useTranslation('ailog')
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border-border border-b last:border-0">
      <button
        className="hover:bg-muted/30 flex w-full items-start gap-3 px-4 py-3 text-left transition-colors"
        type="button"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="text-muted-foreground mt-0.5 flex-shrink-0">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Badge className="text-[10px]" variant={entry.type === 'progression' ? 'default' : 'secondary'}>
              {entry.type}
            </Badge>
            <span className="text-muted-foreground text-xs">
              {formatDate(entry.createdAt)}, {formatTime(entry.createdAt)}
            </span>
            <span className="text-muted-foreground text-xs">{t('durationMs', { ms: entry.durationMs })}</span>
          </div>
          <p className="text-muted-foreground mt-1 truncate text-xs">{entry.prompt.slice(0, 120)}…</p>
        </div>
      </button>

      {expanded && (
        <div className="border-border bg-muted/20 space-y-3 border-t px-4 py-3">
          <div>
            <p className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-widest uppercase">
              {t('prompt')}
            </p>
            <pre className="bg-card border-border overflow-auto rounded-lg border p-3 text-xs break-words whitespace-pre-wrap">
              {entry.prompt}
            </pre>
          </div>
          <div>
            <p className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-widest uppercase">
              {t('response')}
            </p>
            <pre className="bg-card border-border overflow-auto rounded-lg border p-3 text-xs break-words whitespace-pre-wrap">
              {(() => {
                try {
                  return JSON.stringify(JSON.parse(entry.response), null, 2)
                } catch {
                  return entry.response
                }
              })()}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

export function AiLogPage() {
  const { t } = useTranslation('ailog')
  const {
    data: logs = [],
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['ai-log'],
    queryFn: aiLogApi.getAll,
    refetchInterval: 5000,
  })

  return (
    <div className="min-h-screen">
      <div className="border-border border-b px-4 pt-8 pb-4">
        <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">{t('eyebrow')}</p>
        <div className="flex items-end justify-between">
          <h1 className="font-display text-3xl font-bold tracking-wide">{t('title')}</h1>
          <div className="flex items-center gap-2">
            {isFetching && <span className="text-muted-foreground text-xs">{t('refreshing')}</span>}
            <Button aria-label={t('refresh')} size="sm" variant="ghost" onClick={() => refetch()}>
              <RefreshCw size={14} />
            </Button>
          </div>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">{t('summary', { count: logs.length })}</p>
      </div>

      {logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-24">
          <p className="text-muted-foreground text-sm">{t('emptyTitle')}</p>
          <p className="text-muted-foreground text-xs">{t('emptyHint')}</p>
        </div>
      ) : (
        <div className="divide-border divide-y">
          {logs.map(entry => (
            <LogEntry key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  )
}
