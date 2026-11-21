# Project HQ — Asset Sources

All office art is **original** and generated in code at start-up. There are no image, sprite-sheet, tileset or font files in the repository, and no third-party or licensed art.

| Asset                                                              | Source                                                                                                                                                  | Where                                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Characters (founder, employees)                                    | Hand-authored pixel art drawn with `PixelBuffer` (24×40 frames, 1-px outline); front/back views mirrored for left/right; idle, walk, sit and type poses | `src/game/assets/characters.ts`, `pixelBuffer.ts`, `textures.ts` |
| Furniture (18 kinds)                                               | Procedural isometric boxes and details drawn with Phaser Graphics, rendered once to textures                                                            | `src/game/assets/furnitureArt.ts`, `isoDraw.ts`                  |
| Floors, back walls, windows                                        | Procedural, baked into one static texture                                                                                                               | `src/game/assets/textures.ts`, `palette.ts`                      |
| Status bubbles, prompt key, founder marker, shadow, selection ring | Hand-authored pixel art / procedural                                                                                                                    | `src/game/assets/textures.ts`                                    |
| UI icons                                                           | [Lucide](https://lucide.dev) (ISC licence), already a project dependency                                                                                | React UI only                                                    |

The palette is our own (`src/game/assets/palette.ts`). The art direction follows the approved isometric social-sim reference; no reference assets were copied.

Texture keys (`furniture.<kind>.<cols>x<rows>.<facing>`, `character.<id>`, `office.base`, `wall.col|row`) are the seam for replacing generated art with sprite sheets later without changing scenes.
