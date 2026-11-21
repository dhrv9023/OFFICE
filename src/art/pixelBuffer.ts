/**
 * A tiny pixel canvas for authoring pixel art in code. Colours are CSS strings;
 * `null` is transparent. Pure (no DOM) until `paint` is called, so sprite logic
 * can be unit-tested.
 */
export class PixelBuffer {
  readonly width: number;
  readonly height: number;
  private readonly pixels: (string | null)[];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.pixels = new Array<string | null>(width * height).fill(null);
  }

  get(x: number, y: number): string | null {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null;
    return this.pixels[y * this.width + x] ?? null;
  }

  set(x: number, y: number, color: string | null): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.pixels[y * this.width + x] = color;
  }

  rect(x: number, y: number, width: number, height: number, color: string): void {
    for (let row = y; row < y + height; row++) {
      for (let col = x; col < x + width; col++) this.set(col, row, color);
    }
  }

  /**
   * Adds a 1-pixel outline around everything drawn so far (4-neighbourhood), the
   * classic crisp pixel-art silhouette.
   */
  outline(color: string): void {
    const edge: number[] = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.get(x, y) !== null) continue;
        if (
          this.get(x - 1, y) !== null ||
          this.get(x + 1, y) !== null ||
          this.get(x, y - 1) !== null ||
          this.get(x, y + 1) !== null
        ) {
          edge.push(y * this.width + x);
        }
      }
    }
    for (const index of edge) this.pixels[index] = color;
  }

  /** Mirrors the buffer left-to-right. */
  flipped(): PixelBuffer {
    const copy = new PixelBuffer(this.width, this.height);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) copy.set(this.width - 1 - x, y, this.get(x, y));
    }
    return copy;
  }

  /** Number of opaque pixels (used by tests). */
  get opaque(): number {
    return this.pixels.filter((pixel) => pixel !== null).length;
  }

  paint(context: CanvasRenderingContext2D, offsetX: number, offsetY: number): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const color = this.pixels[y * this.width + x];
        if (!color) continue;
        context.fillStyle = color;
        context.fillRect(offsetX + x, offsetY + y, 1, 1);
      }
    }
  }
}
