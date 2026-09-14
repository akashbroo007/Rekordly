import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Database, Film, Plus, X } from 'lucide-react';
import { useState } from 'react';
import type { CreatorDto } from '@rekordly/shared';
import { Badge, Button, Dialog, DialogContent, Input } from '@rekordly/ui';
import { useToastStore } from '../../stores/toast-store';
import { DetailRow } from './dialogs';

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0m';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function CreatorDetailsDialog({
  creator,
  open,
  onOpenChange,
}: {
  creator: CreatorDto;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);

  const { data: stats } = useQuery({
    queryKey: ['creator-stats', creator.id],
    queryFn: () => window.desktop.creators.stats(creator.id),
    enabled: open,
  });

  const { data: allTags } = useQuery({
    queryKey: ['creator-tags'],
    queryFn: () => window.desktop.creators.getTags(),
  });

  const { data: assignments } = useQuery({
    queryKey: ['creator-tag-assignments'],
    queryFn: () => window.desktop.creators.getAllTagAssignments(),
  });

  const assignedTags = assignments?.[creator.id] ?? [];
  const unassignedTags = (allTags ?? []).filter((t) => !assignedTags.some((a) => a.id === t.id));

  const addTag = useMutation({
    mutationFn: (tagId: string) => window.desktop.creators.addTag(creator.id, tagId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['creator-tag-assignments'] });
      void queryClient.invalidateQueries({ queryKey: ['creators'] });
    },
  });

  const removeTag = useMutation({
    mutationFn: (tagId: string) => window.desktop.creators.removeTagFromCreator(creator.id, tagId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['creator-tag-assignments'] });
    },
  });

  const createTag = useMutation({
    mutationFn: (name: string) => window.desktop.creators.createTag(name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['creator-tags'] });
      void queryClient.invalidateQueries({ queryKey: ['creator-tag-assignments'] });
      pushToast({ level: 'info', title: 'Tag created', message: `${newTagName} tag created.` });
    },
  });

  const [newTagName, setNewTagName] = useState('');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={creator.displayName} description={`@${creator.username}`}>
        <div className="space-y-5">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-2">
            <StatTile icon={<Film size={13} />} label="Recordings" value={String(stats?.recordingCount ?? 0)} />
            <StatTile icon={<Database size={13} />} label="Total size" value={formatBytes(stats?.totalSizeBytes ?? 0)} />
            <StatTile icon={<Film size={13} />} label="Total duration" value={formatDuration(stats?.totalDurationSeconds ?? 0)} />
            <StatTile
              icon={<Database size={13} />}
              label="Last recorded"
              value={
                stats?.lastRecordedAt ? new Date(stats.lastRecordedAt).toLocaleDateString() : 'Never'
              }
            />
          </div>

          {/* Tag editor */}
          <div>
            <p className="text-xs font-medium text-foreground-secondary">Tags</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {assignedTags.map((tag) => (
                <Badge key={tag.id} variant="muted" className="gap-1">
                  {tag.color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color }} />}
                  {tag.name}
                  <button
                    type="button"
                    onClick={() => removeTag.mutate(tag.id)}
                    aria-label={`Remove tag ${tag.name}`}
                    className="text-foreground-muted hover:text-error"
                  >
                    <X size={11} />
                  </button>
                </Badge>
              ))}
              {assignedTags.length === 0 && (
                <p className="text-xs text-foreground-muted">No tags assigned.</p>
              )}
            </div>
            {unassignedTags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {unassignedTags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => addTag.mutate(tag.id)}
                    className="inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-foreground-muted transition-colors hover:border-primary/40 hover:text-primary"
                  >
                    <Plus size={10} />
                    {tag.color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color }} />}
                    {tag.name}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-2 flex gap-2">
              <Input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="New tag name…"
                className="h-8 flex-1"
              />
              <Button
                size="sm"
                disabled={!newTagName.trim()}
                loading={createTag.isPending}
                onClick={() => {
                  createTag.mutate(newTagName.trim());
                  setNewTagName('');
                }}
              >
                <Check size={12} />
              </Button>
            </div>
          </div>

          {/* Metadata */}
          <dl className="divide-y divide-border text-sm">
            <DetailRow label="Plugin" value={creator.pluginId} />
            <DetailRow label="External ID" value={creator.externalId} />
            <DetailRow label="Created" value={new Date(creator.createdAt).toLocaleString()} />
            <DetailRow label="Updated" value={new Date(creator.updatedAt).toLocaleString()} />
            <DetailRow label="Favorite" value={creator.isFavorite ? 'Yes' : 'No'} />
            <DetailRow label="Auto-record" value={creator.autoRecord ? `On (${creator.autoRecordQuality})` : 'Off'} />
            {creator.useProxy && <DetailRow label="Secure proxy" value="Enabled" />}
            {creator.notes && <DetailRow label="Notes" value={creator.notes} />}
          </dl>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-sm border border-border bg-elevated px-3 py-2">
      <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-foreground-muted">
        {icon} {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}
