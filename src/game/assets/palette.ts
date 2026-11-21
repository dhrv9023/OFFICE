import type { RoomId } from '@/domain/ids';

/**
 * Office art direction: warm amber walls with navy trim, and each room floored in
 * its own clearly different colour. The office keeps this palette whatever the
 * UI theme is. Department rooms echo their department colour.
 */
export interface FloorStyle {
  readonly light: number;
  readonly dark: number;
  readonly line: number;
  /** `planks` draws wood boards, `checker` alternates light/dark, `carpet` is calm. */
  readonly pattern: 'checker' | 'planks' | 'carpet';
}

export const FLOORS: Readonly<Record<RoomId, FloorStyle>> = {
  room_management: { light: 0xf8e6b8, dark: 0xf2d999, line: 0xd9b56a, pattern: 'checker' },
  room_design: { light: 0xf4def7, dark: 0xeacdf0, line: 0xcfa3da, pattern: 'checker' },
  room_frontend: { light: 0xd8eff9, dark: 0xc6e5f4, line: 0x96c8e0, pattern: 'checker' },
  room_backend: { light: 0xd6f3e6, dark: 0xc2ebd8, line: 0x8fcfb1, pattern: 'checker' },
  room_qa: { light: 0xfbe0e6, dark: 0xf5cdd7, line: 0xdea0b0, pattern: 'checker' },
  room_corridor: { light: 0xdcbb8b, dark: 0xd2ae7d, line: 0xb08655, pattern: 'planks' },
  room_reception: { light: 0xeeebe5, dark: 0xe3ded6, line: 0xc8c0b3, pattern: 'checker' },
  room_meeting: { light: 0x9db4e2, dark: 0x92a9da, line: 0x7790c4, pattern: 'carpet' },
  room_break: { light: 0xf6f2ea, dark: 0x3d4256, line: 0xb9b2a4, pattern: 'checker' },
  room_lounge: { light: 0xccb5e0, dark: 0xc1a8d8, line: 0xa587c2, pattern: 'carpet' },
};

export const WALLS = {
  backFace: 0xf5a800,
  backFaceShade: 0xe09400,
  backCap: 0xffc84a,
  trim: 0x1b2a8a,
  window: 0xbfe6ff,
  windowShine: 0xeaf7ff,
  partitionTop: 0xfff1d6,
  partitionLeft: 0xf2d29a,
  partitionRight: 0xe2bd7c,
  partitionTrim: 0xf5a800,
} as const;

export const BACKDROP = 0x101320;
export const OUTLINE = 0x1a1d2b;
