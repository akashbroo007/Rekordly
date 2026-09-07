import { useQuery } from '@tanstack/react-query';
import { ScrollText, Search, Filter, Copy, Download, Trash2, AlertTriangle, Info, Bug, AlertCircle } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Button, EmptyState, Input, PageContainer, SectionHeader, Skeleton } from '@rekordly/ui';
import type { LogEntry, LogLevel } from '@rekordly/shared/contracts';

const LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error', 'fatal'];

const LEVEL_ICONS: Record<LogLevel, typeof Bug> = {
  debug: Bug,
  info: Info,
  warn: AlertTriangle,
  error: AlertCircle,
  fatal: AlertCircle,
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: 'text-foreground-muted',
  info: 'text-info',
  warn: 'text-warning',
  error: 'text-error',
  fatal: 'text-error',
};

const MAX_LOGS = 500;

export function LogsPage() {
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<Set<LogLevel>>(new Set());
  const [scopeFilter, setScopeFilter] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: logs, isLoading, refetch } = useQuery({
    queryKey: ['logs', MAX_LOGS],
    queryFn: () => window.desktop.logs.list(MAX_LOGS),
    refetchInterval: 5000,
  });

  const filtered = useMemo(() => {
    if (!logs) return [];
    return logs.filter((entry) => {
      if (levelFilter.size > 0 && !levelFilter.has(entry.level)) return false;
      if (search && !entry.message.toLowerCase().includes(search.toLowerCase()) && !entry.scope.toLowerCase().includes(search.toLowerCase())) return false;
      if (scopeFilter && !entry.scope.toLowerCase().includes(scopeFilter.toLowerCase())) return false;
      return true;
    });
  }, [logs, search, levelFilter, scopeFilter]);

  const toggleLevel = useCallback((level: LogLevel) => {
    setLevelFilter((prev) => {
      const next = new Set(prev);
      if (next.has(level)) {
        next.delete(level);
      } else {
        next.add(level);
      }
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setSearch('');
    setLevelFilter(new Set());
    setScopeFilter('');
  }, []);

  const hasFilters = search || levelFilter.size > 0 || scopeFilter;

  return (
    <PageContainer>
      <SectionHeader
        title="Logs"
        description="Application events, errors and recording history."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => refetch()}>
              <Download size={14} />
              Refresh
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const text = filtered.map((e) => `[${new Date(e.time).toISOString()}] [${e.level.toUpperCase()}] [${e.scope}] ${e.message}`).join('\n');
                void navigator.clipboard.writeText(text);
              }}
            >
              <Copy size={14} />
              Copy All
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted" />
            <input
              type="text"
              placeholder="Search logs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full rounded-sm border border-border bg-elevated pl-9 pr-3 text-sm text-foreground transition-colors duration-150 focus:border-primary focus:outline-none"
            />
          </div>
          <Input
            placeholder="Scope filter..."
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value)}
            className="w-40"
          />
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <Trash2 size={14} />
              Clear
            </Button>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Filter size={12} className="text-foreground-muted" />
          {LEVELS.map((level) => {
            const Icon = LEVEL_ICONS[level];
            const active = levelFilter.size === 0 || levelFilter.has(level);
            return (
              <button
                key={level}
                onClick={() => toggleLevel(level)}
                className={`flex items-center gap-1 rounded-sm px-2 py-1 text-xs transition-colors duration-150 ${
                  active
                    ? 'bg-elevated text-foreground'
                    : 'text-foreground-muted opacity-40 hover:opacity-70'
                }`}
              >
                <Icon size={10} />
                {level}
              </button>
            );
          })}
          <span className="ml-auto text-[10px] font-medium uppercase tracking-[0.12em] tabular-nums text-foreground-muted">
            {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>
      </div>

      {/* Log entries */}
      {isLoading && (
        <div className="space-y-1">
          {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-8" />)}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <EmptyState
          icon={ScrollText}
          title="No logs"
          description={hasFilters ? 'No logs match the current filters.' : 'No logs recorded yet.'}
          action={hasFilters ? <Button onClick={clearFilters}>Clear Filters</Button> : undefined}
        />
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="min-h-0 flex-1 divide-y divide-border/60 overflow-y-auto rounded-sm border border-border bg-surface">
          {filtered.map((entry, index) => (
            <LogRow
              key={`${entry.time}-${index}`}
              entry={entry}
              expanded={expandedId === index}
              onToggle={() => setExpandedId(expandedId === index ? null : index)}
            />
          ))}
        </div>
      )}
    </PageContainer>
  );
}

function LogRow({ entry, expanded, onToggle }: { entry: LogEntry; expanded: boolean; onToggle: () => void }) {
  const Icon = LEVEL_ICONS[entry.level];
  const color = LEVEL_COLORS[entry.level];
  const time = useMemo(() => new Date(entry.time), [entry.time]);
  const hasData = entry.data && Object.keys(entry.data).length > 0;

  const copyEntry = useCallback(() => {
    const text = `[${time.toISOString()}] [${entry.level.toUpperCase()}] [${entry.scope}] ${entry.message}`;
    void navigator.clipboard.writeText(text);
  }, [entry, time]);

  return (
    <div
      className={`group cursor-pointer transition-colors duration-150 hover:bg-elevated ${expanded ? 'bg-elevated' : ''}`}
      onClick={onToggle}
    >
      <div className="flex items-center gap-2.5 px-3 py-1.5">
        <Icon size={12} className={`shrink-0 ${color}`} />
        <span className="w-16 shrink-0 text-[10px] tabular-nums text-foreground-muted">
          {time.toLocaleTimeString(undefined, { hour12: false })}
        </span>
        <span className={`w-14 shrink-0 text-[9px] font-semibold uppercase tracking-wider ${color}`}>
          {entry.level}
        </span>
        <span className="w-24 shrink-0 truncate text-[10px] uppercase tracking-wide text-foreground-muted">
          {entry.scope}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-foreground">
          {entry.message}
        </span>
        {hasData && (
          <span className="shrink-0 rounded-sm border border-border px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-foreground-muted">
            data
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); copyEntry(); }}
          className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          aria-label="Copy log entry"
        >
          <Copy size={12} className="text-foreground-muted hover:text-foreground" />
        </button>
      </div>

      {expanded && entry.data && (
        <div className="border-l-2 border-primary/40 bg-elevated py-2 pl-4 pr-3 ml-3 rounded-r-sm">
          <pre className="max-h-48 overflow-auto font-mono text-[11px] leading-relaxed text-foreground-secondary">
            {JSON.stringify(entry.data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
