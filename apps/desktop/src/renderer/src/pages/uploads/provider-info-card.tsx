/**
 * ProviderInfoCard — replaces the old one-line info strip under the picker.
 * Four labeled items, each with a tooltip, built ONLY from the provider's
 * existing metadata (UploadProviderMetaDto); any item whose data is unknown
 * is hidden rather than guessed:
 *
 *   Retention          (first, e.g. "Deleted after 10 days of inactivity")
 *   Max file size      ("5 GB" / "Unlimited")
 *   Speed              (Normal / Throttled)
 *   Ads on download page (Yes / No)
 *
 * Neutral styling; amber only on the downsides (Throttled · Yes). Purely
 * presentational.
 */
import type { UploadProviderMetaDto } from '@rekordly/shared/contracts';
import { Tooltip } from '@rekordly/ui';
import { formatMaxSize, retentionInfo, speedLabel } from './uploads-format';

interface InfoItemProps {
  label: string;
  value: string;
  /** Amber-downsides only; everything else stays neutral. */
  downside?: boolean;
  tooltip: string;
}

function InfoItem({ label, value, downside = false, tooltip }: InfoItemProps) {
  return (
    <Tooltip content={tooltip}>
      <div tabIndex={0} className="min-w-0 cursor-default rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-primary">
        <span className="block text-xs text-foreground-muted">{label}</span>
        <span
          className={`mt-0.5 block text-xs font-semibold ${
            downside ? 'text-warning' : 'text-foreground'
          }`}
        >
          {value}
        </span>
      </div>
    </Tooltip>
  );
}

export function ProviderInfoCard({
  meta,
  className,
}: {
  meta: UploadProviderMetaDto | null | undefined;
  className?: string;
}) {
  if (meta === null || meta === undefined) return null;

  const retention = retentionInfo(meta.fileExpiry);
  const items: InfoItemProps[] = [];

  if (retention !== null) {
    items.push({
      label: 'Retention',
      value: retention.card,
      downside: !retention.permanent,
      tooltip: retention.permanent
        ? `${meta.name} keeps files until they are deleted — links do not expire.`
        : `${meta.name} deletes files after this period of inactivity — links you shared stop working then. Re-upload to refresh.`,
    });
  }

  items.push({
    label: 'Max file size',
    value:
      meta.maxFileSize === null || !Number.isFinite(meta.maxFileSize)
        ? 'Unlimited'
        : formatMaxSize(meta.maxFileSize),
    downside: meta.maxFileSize !== null && Number.isFinite(meta.maxFileSize),
    tooltip:
      meta.maxFileSize === null
        ? `${meta.name} accepts files of any size.`
        : `Largest single file ${meta.name} accepts. Larger recordings must be split or compressed first.`,
  });

  items.push({
    label: 'Speed',
    value: speedLabel(meta.downloadSpeed),
    downside: meta.downloadSpeed === 'throttled',
    tooltip:
      meta.downloadSpeed === 'throttled'
        ? 'Free users on this host get throttled download speeds.'
        : 'Unthrottled — viewers can download files at full speed.',
  });

  items.push({
    label: 'Ads on download page',
    value: meta.adsOnDownload ? 'Yes' : 'No',
    downside: meta.adsOnDownload,
    tooltip: meta.adsOnDownload
      ? 'The host shows advertisements on every download page — visitors see ads before the video.'
      : 'The download page is clean — no ads before the video.',
  });

  return (
    <div
      aria-label={`${meta.name} details`}
      className={`inline-flex flex-wrap items-stretch gap-x-6 gap-y-2.5 rounded-md border border-border bg-surface px-3.5 py-2.5 ${className ?? ''}`}
    >
      {/* Retention is rendered first per the design contract; the items above
          are already in that order — the map below mirrors them 1:1. */}
      {items.map((item) => (
        <InfoItem key={item.label} {...item} />
      ))}
    </div>
  );
}
