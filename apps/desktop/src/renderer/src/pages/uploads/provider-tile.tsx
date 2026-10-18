/**
 * ProviderTile — the upload-provider mark used by the picker, row meta
 * chips, info card and filter dots. When a bundled site icon exists (real
 * favicons in assets/providers/) it is rendered on a neutral dark tile so
 * the dropdown/rows show the actual host logo; otherwise it falls back to
 * the brand-tinted tile with the provider's initial from the shared color
 * config — unknown providers never end up blank.
 */
import { providerColor } from '../../components/platform-config';
import catboxLogo from '../../assets/providers/catbox.png';
import gofileLogo from '../../assets/providers/gofile.png';
import googleDriveLogo from '../../assets/providers/google-drive.png';
import mixdropLogo from '../../assets/providers/mixdrop.png';

/** Real site icons — downloaded once into the bundle, no runtime fetching. */
const PROVIDER_LOGOS: Record<string, string> = {
  catbox: catboxLogo,
  'google-drive': googleDriveLogo,
  gofile: gofileLogo,
  mixdrop: mixdropLogo,
};

const TILE_CLASSES = {
  sm: 'h-[18px] w-[18px] rounded-[4px] text-[9px]',
  md: 'h-8 w-8 rounded-sm text-[13px]',
  lg: 'h-10 w-10 rounded-sm text-base',
} as const;

/** The inner icon scales with the tile; the mark keeps its aspect ratio. */
const LOGO_INNER_CLASSES = {
  sm: 'h-2.5 w-2.5',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
} as const;

export function ProviderTile({
  providerId,
  name,
  size = 'md',
  className,
}: {
  providerId: string;
  name: string;
  size?: keyof typeof TILE_CLASSES;
  className?: string;
}) {
  const color = providerColor(providerId);
  const logo = PROVIDER_LOGOS[providerId];

  if (logo !== undefined) {
    return (
      <span
        aria-hidden="true"
        className={`inline-flex shrink-0 select-none items-center justify-center overflow-hidden bg-elevated ring-1 ring-inset ring-border ${TILE_CLASSES[size]} ${className ?? ''}`}
      >
        <img
          src={logo}
          alt=""
          draggable={false}
          className={`object-contain ${LOGO_INNER_CLASSES[size]}`}
        />
      </span>
    );
  }

  const initial = (name ?? '').trim().charAt(0).toUpperCase() || '?';
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 select-none items-center justify-center font-semibold leading-none text-white/90 ${TILE_CLASSES[size]} ${className ?? ''}`}
      style={{
        backgroundImage: `linear-gradient(135deg, color-mix(in srgb, ${color} 60%, #17171c), color-mix(in srgb, ${color} 32%, #0e0e12))`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 30%, transparent)`,
      }}
    >
      {initial}
    </span>
  );
}
