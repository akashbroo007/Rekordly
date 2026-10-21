/**
 * BeamsBackground — static ambient hero background.
 *
 * ponytail: the previous implementation animated 3D light beams in a WebGL
 * canvas (three.js + @react-three/fiber). The user asked for every looping,
 * glowing decorative animation to be removed — the beams are gone and a
 * static radial gradient carries the ambience instead. The `beam*`/`speed`
 * props remain accepted (unused) so call sites don't need touching.
 */
export interface BeamsBackgroundProps {
  className?: string;
  /** Unused — kept for call-site compat. */
  beamWidth?: number;
  /** Unused — kept for call-site compat. */
  beamHeight?: number;
  /** Unused — kept for call-site compat. */
  beamNumber?: number;
  /** Unused — kept for call-site compat. */
  speed?: number;
  /** Unused — kept for call-site compat. */
  noiseIntensity?: number;
  /** Unused — kept for call-site compat. */
  rotation?: number;
}

export function BeamsBackground({ className = "" }: BeamsBackgroundProps) {
  return (
    <div
      className={`bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,255,255,0.10),transparent_60%)] ${className}`}
      aria-hidden="true"
    />
  );
}
