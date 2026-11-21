import { employeePortrait, founderPortrait, type Portrait } from '@/art/portrait';
import { cn } from './cn';

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

/**
 * Sizes are whole multiples of the crop (16 px head, 24 px bust), except `sm`,
 * which is 1.5× and renders crisp on 2× displays.
 */
const SIZES: Record<AvatarSize, { box: string; crop: 'head' | 'bust' }> = {
  sm: { box: 'size-6 rounded-md', crop: 'head' },
  md: { box: 'size-8 rounded-md', crop: 'head' },
  lg: { box: 'size-12 rounded-lg', crop: 'head' },
  xl: { box: 'size-[72px] rounded-xl', crop: 'bust' },
};

const FALLBACK = '#f5a524';
const HEX = /^#[0-9a-f]{6}$/i;

interface AvatarProps {
  /**
   * The employee's stable avatar key (`Employee.avatarId`) — not their name, so
   * a renamed employee keeps their face. Ignored for the founder.
   */
  avatarId?: string;
  /** The department colour (`#rrggbb`); it is also the character's shirt. */
  color?: string | undefined;
  size?: AvatarSize;
  /** Draw the founder (you) instead of an employee. */
  founder?: boolean;
  className?: string;
}

/**
 * A person's pixel portrait — the same character that walks the office — on a
 * tile tinted with their department colour. Decorative: the name is always
 * shown or announced next to it.
 */
export function Avatar({
  avatarId = '',
  color,
  size = 'md',
  founder = false,
  className,
}: AvatarProps) {
  const tint = color && HEX.test(color) ? color : FALLBACK;
  const { box, crop } = SIZES[size];
  const portrait = founder ? founderPortrait(crop) : employeePortrait(avatarId, tint, crop);
  return (
    <span
      aria-hidden="true"
      data-avatar={founder ? 'founder' : avatarId}
      className={cn('relative inline-flex shrink-0 overflow-hidden select-none', box, className)}
      style={{
        background: `linear-gradient(180deg, color-mix(in srgb, ${tint} 10%, var(--color-surface-raised)) 0%, color-mix(in srgb, ${tint} 24%, var(--color-surface-raised)) 100%)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${tint} 22%, transparent)`,
      }}
    >
      <PortraitSvg portrait={portrait} />
    </span>
  );
}

export function PortraitSvg({ portrait, className }: { portrait: Portrait; className?: string }) {
  return (
    <svg
      viewBox={portrait.viewBox}
      shapeRendering="crispEdges"
      className={cn('absolute inset-0 size-full', className)}
      focusable="false"
    >
      {portrait.layers.map((layer) => (
        <path key={layer.color} d={layer.d} fill={layer.color} />
      ))}
    </svg>
  );
}
