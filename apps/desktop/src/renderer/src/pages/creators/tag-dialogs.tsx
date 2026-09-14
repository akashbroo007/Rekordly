import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Dialog, DialogContent, Input } from '@rekordly/ui';
import { useToastStore } from '../../stores/toast-store';

export function TagsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);

  const { data: tags } = useQuery({
    queryKey: ['creator-tags'],
    queryFn: () => window.desktop.creators.getTags(),
  });

  const { data: assignments } = useQuery({
    queryKey: ['creator-tag-assignments'],
    queryFn: () => window.desktop.creators.getAllTagAssignments(),
  });

  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const createTag = useMutation({
    mutationFn: () => window.desktop.creators.createTag(newTagName, newTagColor || undefined),
    onSuccess: () => {
      pushToast({ level: 'info', title: 'Tag created', message: `${newTagName} tag created.` });
      void queryClient.invalidateQueries({ queryKey: ['creator-tags'] });
      setNewTagName('');
      setNewTagColor('');
    },
  });

  const removeTag = useMutation({
    mutationFn: (id: string) => window.desktop.creators.removeTag(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['creator-tags'] });
      void queryClient.invalidateQueries({ queryKey: ['creator-tag-assignments'] });
    },
  });

  const renameTag = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => window.desktop.creators.renameTag(id, name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['creator-tags'] });
      setRenamingId(null);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Manage Tags" description="Create, rename and manage creator tags.">
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              placeholder="Tag name"
              className="flex-1"
            />
            <Input
              value={newTagColor}
              onChange={(e) => setNewTagColor(e.target.value)}
              placeholder="Color (hex)"
              className="w-24"
            />
            <Button
              size="sm"
              disabled={!newTagName.trim()}
              loading={createTag.isPending}
              onClick={() => createTag.mutate()}
            >
              <Plus size={14} />
            </Button>
          </div>
          <div className="space-y-1.5">
            {(tags ?? []).map((tag) => {
              const usage = Object.values(assignments ?? {}).filter((list) =>
                list.some((t) => t.id === tag.id),
              ).length;
              if (renamingId === tag.id) {
                return (
                  <div key={tag.id} className="flex items-center gap-2">
                    <Input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      className="h-8 flex-1"
                      autoFocus
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Save tag name"
                      onClick={() => {
                        const name = renameValue.trim();
                        if (name) renameTag.mutate({ id: tag.id, name });
                        else setRenamingId(null);
                      }}
                    >
                      <Check size={13} />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Cancel rename"
                      onClick={() => setRenamingId(null)}
                    >
                      <X size={13} />
                    </Button>
                  </div>
                );
              }
              return (
                <div
                  key={tag.id}
                  className="flex items-center justify-between rounded-sm border border-border bg-elevated px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    {tag.color && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color }} />}
                    <p className="text-sm font-medium text-foreground">{tag.name}</p>
                    <Badge variant="muted">{usage} {usage === 1 ? 'creator' : 'creators'}</Badge>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Rename ${tag.name}`}
                      onClick={() => {
                        setRenamingId(tag.id);
                        setRenameValue(tag.name);
                      }}
                    >
                      <Pencil size={13} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${tag.name}`}
                      className="text-foreground-muted hover:bg-error/10 hover:text-error"
                      onClick={() => removeTag.mutate(tag.id)}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>
              );
            })}
            {(tags ?? []).length === 0 && (
              <p className="text-sm text-foreground-muted">No tags yet.</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CollectionsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);

  const { data: collections } = useQuery({
    queryKey: ['creator-collections'],
    queryFn: () => window.desktop.creators.getCollections(),
  });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const createCollection = useMutation({
    mutationFn: () => window.desktop.creators.createCollection(name, description || undefined),
    onSuccess: () => {
      pushToast({ level: 'info', title: 'Collection created', message: `${name} collection created.` });
      void queryClient.invalidateQueries({ queryKey: ['creator-collections'] });
      setName('');
      setDescription('');
    },
  });

  const removeCollection = useMutation({
    mutationFn: (id: string) => window.desktop.creators.removeCollection(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['creator-collections'] }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Manage Collections" description="Organize creators into collections.">
        <div className="space-y-4">
          <div className="space-y-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Collection name"
            />
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
            />
            <Button
              size="sm"
              disabled={!name.trim()}
              loading={createCollection.isPending}
              onClick={() => createCollection.mutate()}
            >
              Create
            </Button>
          </div>
          <div className="space-y-2">
            {(collections ?? []).map((col) => (
              <div key={col.id} className="flex items-center justify-between rounded-sm border border-border bg-elevated px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-foreground">{col.name}</p>
                  {col.description && <p className="text-xs text-foreground-muted">{col.description}</p>}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeCollection.mutate(col.id)}
                  aria-label={`Delete ${col.name}`}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
            {(collections ?? []).length === 0 && (
              <p className="text-sm text-foreground-muted">No collections yet.</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function BulkTagDialog({
  open,
  onOpenChange,
  ids,
  count,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ids: string[];
  count: number;
}) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);
  const { data: tags } = useQuery({
    queryKey: ['creator-tags'],
    queryFn: () => window.desktop.creators.getTags(),
  });

  const bulkAddTag = useMutation({
    mutationFn: (tagId: string) => window.desktop.creators.bulkAddTag(ids, tagId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['creator-tag-assignments'] });
      pushToast({ level: 'info', title: 'Tag applied', message: `Tag applied to ${count} creators.` });
      onOpenChange(false);
    },
  });

  const [newTagName, setNewTagName] = useState('');
  const createAndApply = useMutation({
    mutationFn: async (name: string) => {
      await window.desktop.creators.createTag(name);
      const created = await window.desktop.creators.getTags();
      const match = created.find((t) => t.name.toLowerCase() === name.toLowerCase());
      if (match) await window.desktop.creators.bulkAddTag(ids, match.id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['creator-tags'] });
      void queryClient.invalidateQueries({ queryKey: ['creator-tag-assignments'] });
      pushToast({ level: 'info', title: 'Tag applied', message: `Tag applied to ${count} creators.` });
      onOpenChange(false);
      setNewTagName('');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Tag creators" description={`Apply a tag to ${count} selected creators.`}>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {(tags ?? []).map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => bulkAddTag.mutate(tag.id)}
                className="inline-flex items-center gap-1.5 rounded-sm border border-border px-2 py-1 text-xs text-foreground-secondary transition-colors hover:border-primary/40 hover:text-primary"
              >
                {tag.color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color }} />}
                {tag.name}
              </button>
            ))}
            {(tags ?? []).length === 0 && <p className="text-xs text-foreground-muted">No tags yet.</p>}
          </div>
          <div className="flex gap-2 border-t border-border pt-3">
            <Input
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              placeholder="Create a new tag…"
              className="h-8 flex-1"
            />
            <Button
              size="sm"
              disabled={!newTagName.trim()}
              loading={createAndApply.isPending}
              onClick={() => createAndApply.mutate(newTagName.trim())}
            >
              <Plus size={12} /> Create & apply
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
