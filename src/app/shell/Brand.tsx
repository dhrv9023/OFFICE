import { cn } from '@/components/cn';

/**
 * The Project HQ mark: the office itself — an isometric floor tile in the
 * office's amber, raised like a building, drawn on a pixel grid.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      shapeRendering="crispEdges"
      className={cn('shrink-0', className)}
    >
      <rect width="32" height="32" rx="8" fill="#1d1d21" />
      <path d="M16 6 27 12 16 18 5 12Z" fill="#f5a524" />
      <path d="M5 12v7l11 6v-7Z" fill="#c27c0e" />
      <path d="M27 12v7l-11 6v-7Z" fill="#8f5a08" />
      <path d="M13 13.6 16 12l3 1.6-3 1.6Z" fill="#1d1d21" fillOpacity=".35" />
    </svg>
  );
}
