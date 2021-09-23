import { Bus } from "./bus";
import { Color, Palette } from "./palette";

export class Tile {
  static TILE_WIDTH = 8;
  static TILE_HEIGHT = 8;

  static TILE_BIT_PLANE_BYTES = 8;
  static TILE_BYTES = 16;

  private ppuBus: Bus;
  private address: Address;
  private palette: Palette;

  constructor(ppuBus: Bus, address: Address, palette: Palette) {
    this.ppuBus = ppuBus;
    this.address = address;
    this.palette = palette;
  }

  getPixel(x: Nibble, y: Nibble): Color {
    const addressLo = this.address + y;
    const addressHi = this.address + y + Tile.TILE_BIT_PLANE_BYTES;

    const valueTidbitLo = !(this.ppuBus.read(addressLo) & 1 << (7 - x)) ? 0 : 1;
    const valueTidbitHi = !(this.ppuBus.read(addressHi) & 1 << (7 - x)) ? 0 : 1 << 1 as Tidbit;
    const index = (valueTidbitLo | valueTidbitHi) as Tidbit;

    return this.palette.getColor(index);
  }
}
