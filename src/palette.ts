export type SystemPalette = RGB[];

export const SYSTEM_PALETTE_NTSC: SystemPalette = [
  0x656565, 0x002b9b, 0x110ec0, 0x3f00bc, 0x66008f, 0x7b0045, 0x790100, 0x601c00, 0x363800, 0x084f00, 0x005a00, 0x005702, 0x004555, 0x000000, 0x000000, 0x000000,
  0xaeaeae, 0x0761f5, 0x3e3bff, 0x7c1dff, 0xaf0ee5, 0xcb1383, 0xc82a15, 0xa74d00, 0x6f7200, 0x329100, 0x009f00, 0x009b2a, 0x008498, 0x000000, 0x000000, 0x000000,
  0xffffff, 0x56b1ff, 0x8e8bff, 0xcc6cff, 0xff5dff, 0xff62d4, 0xff7964, 0xf89d06, 0xc0c300, 0x81e200, 0x4df116, 0x30ec7a, 0x34d5ea, 0x4e4e4e, 0x000000, 0x000000,
  0xffffff, 0xbadfff, 0xd1d0ff, 0xebc3ff, 0xffbdff, 0xffbfff, 0xffc8c0, 0xfcd799, 0xe5e784, 0xccf387, 0xb6f9a0, 0xaaf8c9, 0xaceef7, 0xb7b7b7, 0x000000, 0x000000
];

export class Palette {
  static PALETTE_SIZE = 4;

  private systemPalette: SystemPalette;
  private systemPaletteIndexes: Byte[];

  private colors: Color[];

  constructor(systemPalette: SystemPalette, systemPaletteIndexes: Byte[]) {
    this.systemPalette = systemPalette;
    this.systemPaletteIndexes = systemPaletteIndexes;

    const colors = systemPaletteIndexes.map(systemPaletteIndex => new Color(systemPalette[systemPaletteIndex]));
    this.colors = colors;
  }

  getColor(index: Tidbit): Color {
    return this.colors[index];
  }
}

export class Color {
  r: Byte;
  g: Byte;
  b: Byte;

  constructor(rgb: RGB) {
    this.r = (rgb & 0xff0000) >> 16;
    this.g = (rgb & 0x00ff00) >> 8;
    this.b = (rgb & 0x0000ff);
  }
}
