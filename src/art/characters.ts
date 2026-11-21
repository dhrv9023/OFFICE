import { PixelBuffer } from './pixelBuffer';

/** Size of one character frame, in pixels. Feet stand on the bottom-centre point. */
export const CHARACTER_FRAME = { width: 24, height: 40, footX: 12, footY: 38 } as const;

export interface CharacterLook {
  readonly skin: string;
  readonly hair: string;
  readonly hairStyle: 'short' | 'long' | 'bun' | 'buzz';
  readonly shirt: string;
  readonly shirtShade: string;
  readonly pants: string;
  readonly shoes: string;
  /** Optional jacket over the shirt (the founder's blazer). */
  readonly jacket?: { readonly color: string; readonly shade: string; readonly tie: string };
}

export type CharacterView = 'front' | 'back';

/**
 * Frames per animation. `walk` alternates legs with a body bob; `idle` breathes;
 * `sit` is seated at a desk (legs hidden by the chair), `type` is seated with the
 * arms working.
 */
export type CharacterPose =
  | { readonly kind: 'idle'; readonly frame: 0 | 1 }
  | { readonly kind: 'walk'; readonly frame: 0 | 1 | 2 | 3 }
  | { readonly kind: 'sit' }
  | { readonly kind: 'type'; readonly frame: 0 | 1 };

const OUTLINE = '#1a1d2b';
const EYE = '#1a1d2b';
const MOUTH = '#b5584f';

/**
 * Draws one frame of a character facing right (front = towards the camera,
 * back = away). Left-facing frames are mirrored copies.
 */
export function drawCharacter(
  look: CharacterLook,
  view: CharacterView,
  pose: CharacterPose,
): PixelBuffer {
  const b = new PixelBuffer(CHARACTER_FRAME.width, CHARACTER_FRAME.height);
  const seated = pose.kind === 'sit' || pose.kind === 'type';
  // Body bob: walking frames 1 and 3 lift the body, idle frame 1 breathes.
  const bob =
    (pose.kind === 'walk' && (pose.frame === 1 || pose.frame === 3)) ||
    (pose.kind === 'idle' && pose.frame === 1)
      ? -1
      : 0;
  const sitDrop = seated ? 4 : 0;
  const top = 6 + bob + sitDrop;

  // Legs and shoes (hidden when seated: the chair covers them).
  if (!seated) {
    const stride = pose.kind === 'walk' ? pose.frame : 0;
    // Frame 1: left leg forward (longer, shifted out); frame 3: right leg forward.
    const leftLift = stride === 3 ? 2 : 0;
    const rightLift = stride === 1 ? 2 : 0;
    const leftShift = stride === 1 ? -1 : 0;
    const rightShift = stride === 3 ? 1 : 0;
    b.rect(9 + leftShift, 29 + bob, 3, 8 - leftLift, look.pants);
    b.rect(13 + rightShift, 29 + bob, 3, 8 - rightLift, look.pants);
    b.rect(9 + leftShift, 36 - leftLift, 3, 2, look.shoes);
    b.rect(13 + rightShift, 36 - rightLift, 3, 2, look.shoes);
    if (view === 'front') b.rect(12, 29 + bob, 1, 3, look.pants);
  }

  // Torso.
  const torsoTop = top + 13;
  const torsoHeight = seated ? 8 : 11;
  const body = look.jacket ? look.jacket.color : look.shirt;
  const bodyShade = look.jacket ? look.jacket.shade : look.shirtShade;
  b.rect(8, torsoTop, 9, torsoHeight, body);
  b.rect(8, torsoTop, 1, torsoHeight, bodyShade);
  b.rect(16, torsoTop, 1, torsoHeight, bodyShade);
  if (view === 'front') {
    if (look.jacket) {
      // Open blazer: shirt and tie down the middle.
      b.rect(11, torsoTop, 3, torsoHeight - 1, '#f4f1ea');
      b.rect(12, torsoTop + 1, 1, torsoHeight - 3, look.jacket.tie);
    } else {
      b.rect(11, torsoTop, 3, 1, look.shirtShade);
    }
  }
  if (!seated) b.rect(8, torsoTop + torsoHeight - 1, 9, 1, '#2a2f45');

  // Arms: swing with the stride, work the keyboard when typing.
  let leftArm = 0;
  let rightArm = 0;
  if (pose.kind === 'walk') {
    leftArm = pose.frame === 1 ? 1 : pose.frame === 3 ? -1 : 0;
    rightArm = -leftArm;
  } else if (pose.kind === 'type') {
    leftArm = pose.frame === 0 ? -1 : 0;
    rightArm = pose.frame === 0 ? 0 : -1;
  }
  const armTop = torsoTop + 1;
  const armLength = seated ? 6 : 8;
  b.rect(6, armTop + leftArm, 2, armLength, bodyShade);
  b.rect(17, armTop + rightArm, 2, armLength, bodyShade);
  b.rect(6, armTop + leftArm + armLength, 2, 2, look.skin);
  b.rect(17, armTop + rightArm + armLength, 2, 2, look.skin);

  // Neck and head.
  b.rect(11, top + 11, 3, 2, look.skin);
  b.rect(8, top + 3, 9, 9, look.skin);
  b.rect(8, top + 11, 9, 1, shade(look.skin));

  // Hair.
  const hair = look.hair;
  switch (look.hairStyle) {
    case 'buzz':
      b.rect(8, top + 2, 9, 2, hair);
      break;
    case 'short':
      b.rect(8, top + 1, 9, 3, hair);
      b.rect(7, top + 2, 1, 4, hair);
      b.rect(17, top + 2, 1, 3, hair);
      break;
    case 'long':
      b.rect(8, top + 1, 9, 3, hair);
      b.rect(7, top + 2, 2, 10, hair);
      b.rect(16, top + 2, 2, 10, hair);
      break;
    case 'bun':
      b.rect(8, top + 1, 9, 3, hair);
      b.rect(10, top - 1, 5, 3, hair);
      b.rect(7, top + 2, 1, 4, hair);
      b.rect(17, top + 2, 1, 4, hair);
      break;
  }

  if (view === 'front') {
    // Face turned slightly right: eyes and mouth sit right of centre.
    b.rect(11, top + 6, 1, 2, EYE);
    b.rect(14, top + 6, 1, 2, EYE);
    b.rect(12, top + 9, 2, 1, MOUTH);
    b.set(16, top + 7, shade(look.skin));
  } else {
    // Back of the head is all hair.
    b.rect(8, top + 1, 9, 9, hair);
    if (look.hairStyle === 'long') b.rect(7, top + 2, 11, 11, hair);
  }

  b.outline(OUTLINE);
  return b;
}

/** A slightly darker version of a `#rrggbb` colour. */
export function shade(hex: string, amount = 0.18): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) => Math.round(((value >> shift) & 255) * (1 - amount));
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, '0')).join('')}`;
}

const SKINS = ['#f2c7a5', '#e0a982', '#c68863', '#8d5a3b', '#f5d6bd'];
const HAIRS = ['#2b2118', '#5b3a24', '#c58c42', '#1d1d28', '#8a4b2a', '#d9c39a'];
const STYLES: CharacterLook['hairStyle'][] = ['short', 'long', 'bun', 'buzz'];

/**
 * The text a character's look is drawn from, taken from the employee's stable
 * `avatarId` — never from their (renamable) display name, so renaming someone
 * never changes how they look. Seed avatar keys are `avatar_first_last`, which
 * reads back as "First Last": exactly the seed the original looks were drawn
 * from, so existing characters are unchanged. Any other key is used as is.
 */
export function lookSeed(avatarId: string): string {
  const match = /^avatar_(.+)$/.exec(avatarId);
  if (!match?.[1]) return avatarId;
  return match[1]
    .split('_')
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Deterministic look for an employee: shirt in their department colour, the rest varied by avatar. */
export function employeeLook(avatarId: string, departmentColor: string): CharacterLook {
  let hash = 0;
  for (const char of lookSeed(avatarId)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const pick = <T>(list: readonly T[], salt: number): T => list[(hash >>> salt) % list.length] as T;
  return {
    skin: pick(SKINS, 0),
    hair: pick(HAIRS, 3),
    hairStyle: pick(STYLES, 7),
    shirt: departmentColor,
    shirtShade: shade(departmentColor, 0.22),
    pants: '#2f3550',
    shoes: '#1f2233',
  };
}

/** The founder: amber blazer over a white shirt — the office's accent colour. */
export const FOUNDER_LOOK: CharacterLook = {
  skin: '#e8b48f',
  hair: '#2b2118',
  hairStyle: 'short',
  shirt: '#f4f1ea',
  shirtShade: '#d8d2c4',
  pants: '#253057',
  shoes: '#14161f',
  jacket: { color: '#f5a524', shade: '#c47f10', tie: '#1b2a8a' },
};
