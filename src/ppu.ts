import { Addressable } from './addressable';
import { Bus } from './bus';
import { DebugCallback } from './debug';
import { Color, Palette, SYSTEM_PALETTE_NTSC } from './palette';
import { Tile } from './tile';
import { formatHex, getBit, setBit } from './util';

export class PPU extends Addressable {
  static CLOCK_OFFSET = 0; // 0-3

  static CHR_START_ADDRESS = 0x0000;
  static CHR_END_ADDRESS   = 0x1fff;

  static NAMETABLE_0_START_ADDRESS    = 0x2000;
  static NAMETABLE_0_END_ADDRESS      = 0x23ff;

  static NAMETABLE_1_START_ADDRESS    = 0x2400;
  static NAMETABLE_1_END_ADDRESS      = 0x27ff;

  static NAMETABLE_2_START_ADDRESS    = 0x2800;
  static NAMETABLE_2_END_ADDRESS      = 0x2bff;

  static NAMETABLE_3_START_ADDRESS    = 0x2c00;
  static NAMETABLE_3_END_ADDRESS      = 0x2fff;

  static NAMETABLE_MIRROR_END_ADDRESS = 0x3eff;
  static NAMETABLE_ATTRIBUTE_OFFSET   = 0x03c0; // 64 bytes of attribute memory (palettes) per nametable

  static PALETTE_START_ADDRESS        = 0x3f00;
  static PALETTE_END_ADDRESS          = 0x3f1f;

  static PALETTE_MIRROR_END_ADDRESS   = 0x3fff;

  private static PATTERN_TABLE_WIDTH = 16;
  private static PATTERN_TABLE_HEIGHT = 16;

  private static NAMETABLE_WIDTH = 32;
  private static NAMETABLE_HEIGHT = 30;

  private static ATTRIBUTE_TABLE_WIDTH = 8;
  private static ATTRIBUTE_TABLE_HEIGHT = 8;

  // PPU bus addresses
  private static PATTERN_TABLE_0_START_ADDRESS = 0x0000;
  private static PATTERN_TABLE_0_END_ADDRESS   = 0x0fff; // First bank of 4KB CHR ROM

  private static PATTERN_TABLE_1_START_ADDRESS = 0x1000;
  private static PATTERN_TABLE_1_END_ADDRESS   = 0x1fff; // Second bank of 4KB CHR ROM

  private static NAMETABLE_SELECT_TO_BASE_ADDRESS: Record<number, Address> = {
    0: PPU.NAMETABLE_0_START_ADDRESS,
    1: PPU.NAMETABLE_1_START_ADDRESS,
    2: PPU.NAMETABLE_2_START_ADDRESS,
    3: PPU.NAMETABLE_3_START_ADDRESS
  };

  private static BACKGROUND_COLOR_ADDRESS      = 0x3f00;

  private static BACKGROUND_PALETTE_0_ADDRESS  = 0x3f01;
  private static BACKGROUND_PALETTE_1_ADDRESS  = 0x3f05;
  private static BACKGROUND_PALETTE_2_ADDRESS  = 0x3f09;
  private static BACKGROUND_PALETTE_3_ADDRESS  = 0x3f0d;

  private static SPRITE_PALETTE_0_ADDRESS      = 0x3f11;
  private static SPRITE_PALETTE_1_ADDRESS      = 0x3f15;
  private static SPRITE_PALETTE_2_ADDRESS      = 0x3f19;
  private static SPRITE_PALETTE_3_ADDRESS      = 0x3f1d;

  // CPU bus addresses
  private static REGISTER_START_ADDRESS        = 0x2000;
  private static REGISTER_END_ADDRESS          = 0x2007;
  private static REGISTER_MIRROR_END_ADDRESS   = 0x3fff; // 8 bytes, mirrored up to 0x3fff

  private static REGISTER_PPUCTRL              = 0x2000;
  private static REGISTER_PPUMASK              = 0x2001;
  private static REGISTER_PPUSTATUS            = 0x2002;
  private static REGISTER_OAMADDR              = 0x2003;
  private static REGISTER_OAMDATA              = 0x2004;
  private static REGISTER_PPUSCROLL            = 0x2005;
  private static REGISTER_PPUADDR              = 0x2006;
  private static REGISTER_PPUDATA              = 0x2007;

  private static REGISTER_OAMDMA               = 0x4014; // ???

  private static STATUS_FLAG_BIT_PPUCTRL_NMI_ENABLE             = 7;
  private static STATUS_FLAG_BIT_PPUCTRL_MASTER_SLAVE           = 6;
  private static STATUS_FLAG_BIT_PPUCTRL_SPRITE_HEIGHT          = 5;
  private static STATUS_FLAG_BIT_PPUCTRL_BACKGROUND_TILE_SELECT = 4;
  private static STATUS_FLAG_BIT_PPUCTRL_SPRITE_TILE_SELECT     = 3;
  private static STATUS_FLAG_BIT_PPUCTRL_INCREMENT_MODE         = 2;
  private static STATUS_FLAG_BIT_PPUCTRL_NAMETABLE_Y            = 1;
  private static STATUS_FLAG_BIT_PPUCTRL_NAMETABLE_X            = 0;

  private static STATUS_FLAG_BIT_PPUMASK_COLOR_EMPHASIS_B              = 7;
  private static STATUS_FLAG_BIT_PPUMASK_COLOR_EMPHASIS_G              = 6;
  private static STATUS_FLAG_BIT_PPUMASK_COLOR_EMPHASIS_R              = 5;
  private static STATUS_FLAG_BIT_PPUMASK_SPRITE_ENABLE                 = 4;
  private static STATUS_FLAG_BIT_PPUMASK_BACKGROUND_ENABLE             = 3;
  private static STATUS_FLAG_BIT_PPUMASK_SPRITE_LEFT_COLUMN_ENABLE     = 2;
  private static STATUS_FLAG_BIT_PPUMASK_BACKGROUND_LEFT_COLUMN_ENABLE = 1;
  private static STATUS_FLAG_BIT_PPUMASK_GREYSCALE                     = 0;

  private static STATUS_FLAG_BIT_PPUSTATUS_VBLANK                      = 7;
  private static STATUS_FLAG_BIT_PPUSTATUS_SPRITE_ZERO_HIT             = 6;
  private static STATUS_FLAG_BIT_PPUSTATUS_SPRITE_OVERFLOW             = 5;

  private static REGISTER_MASK_PPUCTRL_NAMETABLE_SELECT              = 0b00000011;

  private static DISPLAY_WIDTH = 256;
  private static DISPLAY_HEIGHT = 240;

  private static NTSC_CYCLES_PER_SCANLINE = 341; // 1 cycle = 1 pixel
  private static NTSC_SCANLINES = 262;

  private static NTSC_PRE_RENDER_SCANLINE = 261;

  private static NTSC_VBLANK_START_SCANLINE = 241;
  private static NTSC_VBLANK_END_SCANLINE = 262; // -1 ???

  private static NTSC_VBLANK_START_CYCLE = 1;
  private static NTSC_VBLANK_END_CYCLE = 1;

  private static NTSC_VISIBLE_START_SCANLINE = 0;
  private static NTSC_VISIBLE_END_SCANLINE = 239;

  private static NTSC_VISIBLE_START_CYCLE = 1;
  private static NTSC_VISIBLE_END_CYCLE = 256;

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private cycle: number = 0;
  private scanline: number = 0;

  private visibleX: number = 0;
  private visibleY: number = 0;

  private imageBytes: Uint8ClampedArray;
  private imageData: ImageData;

  private bytes: Uint8Array;

  private ppuBus: Bus;
  private debugCallback: DebugCallback;

  private nametableStartAddress: Address = PPU.NAMETABLE_0_START_ADDRESS;
  private nametableEndAddress: Address = PPU.NAMETABLE_0_END_ADDRESS;

  private vramAddress: Address = PPU.NAMETABLE_0_START_ADDRESS;
  private vramAddressLatch?: Address = null;

  constructor(canvas: HTMLCanvasElement, ppuBus: Bus, debugCallback: DebugCallback) {
    super(PPU.REGISTER_START_ADDRESS, PPU.REGISTER_END_ADDRESS, PPU.REGISTER_MIRROR_END_ADDRESS);

    canvas.width = PPU.DISPLAY_WIDTH;
    canvas.height = PPU.DISPLAY_HEIGHT;
    this.canvas = canvas;

    const ctx = canvas.getContext('2d');
    this.ctx = ctx;

    const imageBytes = new Uint8ClampedArray(PPU.DISPLAY_WIDTH * PPU.DISPLAY_HEIGHT * 4);
    imageBytes.fill(0xff);
    this.imageBytes = imageBytes;

    const imageData = new ImageData(this.imageBytes, PPU.DISPLAY_WIDTH, PPU.DISPLAY_HEIGHT);
    this.imageData = imageData;

    const bytes = new Uint8Array(this.actualSize);
    this.bytes = bytes;

    this.ppuBus = ppuBus;
    this.debugCallback = debugCallback;
  }

  // Registers
  private get registerPPUCTRL(): Byte {
    return this.getRegister(PPU.REGISTER_PPUCTRL);
  }
  private set registerPPUCTRL(byte: Byte) {
    this.setRegister(PPU.REGISTER_PPUCTRL, byte);
  }

  private get registerPPUMASK(): Byte {
    return this.getRegister(PPU.REGISTER_PPUMASK);
  }
  private set registerPPUMASK(byte: Byte) {
    this.setRegister(PPU.REGISTER_PPUMASK, byte);
  }

  private get registerPPUSTATUS(): Byte {
    return this.getRegister(PPU.REGISTER_PPUSTATUS);
  }
  private set registerPPUSTATUS(byte: Byte) {
    this.setRegister(PPU.REGISTER_PPUSTATUS, byte);
  }

  private get registerOAMADDR(): Byte {
    return this.getRegister(PPU.REGISTER_OAMADDR);
  }
  private set registerOAMADDR(byte: Byte) {
    this.setRegister(PPU.REGISTER_OAMADDR, byte);
  }

  private get registerOAMDATA(): Byte {
    return this.getRegister(PPU.REGISTER_OAMDATA);
  }
  private set registerOAMDATA(byte: Byte) {
    this.setRegister(PPU.REGISTER_OAMDATA, byte);
  }

  private get registerPPUSCROLL(): Byte {
    return this.getRegister(PPU.REGISTER_PPUSCROLL);
  }
  private set registerPPUSCROLL(byte: Byte) {
    this.setRegister(PPU.REGISTER_PPUSCROLL, byte);
  }

  private get registerPPUADDR(): Byte {
    return this.getRegister(PPU.REGISTER_PPUADDR);
  }
  private set registerPPUADDR(byte: Byte) {
    this.setRegister(PPU.REGISTER_PPUADDR, byte);
  }

  private get registerPPUDATA(): Byte {
    return this.getRegister(PPU.REGISTER_PPUDATA);
  }
  private set registerPPUDATA(byte: Byte) {
    this.setRegister(PPU.REGISTER_PPUDATA, byte);
  }

  // PPUCTRL flags
  private get ppuctrlNMIEnable(): Bit {
    return getBit(this.registerPPUCTRL, PPU.STATUS_FLAG_BIT_PPUCTRL_NMI_ENABLE);
  }
  private set ppuctrlNMIEnable(bit: Bit | boolean) {
    this.registerPPUCTRL = setBit(this.registerPPUCTRL, PPU.STATUS_FLAG_BIT_PPUCTRL_NMI_ENABLE, bit);
  }

  private get ppuctrlMasterSlave(): Bit {
    return getBit(this.registerPPUCTRL, PPU.STATUS_FLAG_BIT_PPUCTRL_MASTER_SLAVE);
  }
  private set ppuctrlMasterSlave(bit: Bit | boolean) {
    this.registerPPUCTRL = setBit(this.registerPPUCTRL, PPU.STATUS_FLAG_BIT_PPUCTRL_MASTER_SLAVE, bit);
  }

  private get ppuctrlSpriteHeight(): Bit {
    return getBit(this.registerPPUCTRL, PPU.STATUS_FLAG_BIT_PPUCTRL_SPRITE_HEIGHT);
  }
  private set ppuctrlSpriteHeight(bit: Bit | boolean) {
    this.registerPPUCTRL = setBit(this.registerPPUCTRL, PPU.STATUS_FLAG_BIT_PPUCTRL_SPRITE_HEIGHT, bit);
  }

  private get ppuctrlBackgroundTileSelect(): Bit {
    return getBit(this.registerPPUCTRL, PPU.STATUS_FLAG_BIT_PPUCTRL_BACKGROUND_TILE_SELECT);
  }
  private set ppuctrlBackgroundTileSelect(bit: Bit | boolean) {
    this.registerPPUCTRL = setBit(this.registerPPUCTRL, PPU.STATUS_FLAG_BIT_PPUCTRL_BACKGROUND_TILE_SELECT, bit);
  }

  private get ppuctrlSpriteTileSelect(): Bit {
    return getBit(this.registerPPUCTRL, PPU.STATUS_FLAG_BIT_PPUCTRL_SPRITE_TILE_SELECT);
  }
  private set ppuctrlSpriteTileSelect(bit: Bit | boolean) {
    this.registerPPUCTRL = setBit(this.registerPPUCTRL, PPU.STATUS_FLAG_BIT_PPUCTRL_SPRITE_TILE_SELECT, bit);
  }

  private get ppuctrlIncrementMode(): Bit {
    return getBit(this.registerPPUCTRL, PPU.STATUS_FLAG_BIT_PPUCTRL_INCREMENT_MODE);
  }
  private set ppuctrlIncrementMode(bit: Bit | boolean) {
    this.registerPPUCTRL = setBit(this.registerPPUCTRL, PPU.STATUS_FLAG_BIT_PPUCTRL_INCREMENT_MODE, bit);
  }

  private get ppuctrlNametableY(): Bit {
    return getBit(this.registerPPUCTRL, PPU.STATUS_FLAG_BIT_PPUCTRL_NAMETABLE_Y);
  }
  private set ppuctrlNametableY(bit: Bit | boolean) {
    this.registerPPUCTRL = setBit(this.registerPPUCTRL, PPU.STATUS_FLAG_BIT_PPUCTRL_NAMETABLE_Y, bit);
  }

  private get ppuctrlNametableX(): Bit {
    return getBit(this.registerPPUCTRL, PPU.STATUS_FLAG_BIT_PPUCTRL_NAMETABLE_X);
  }
  private set ppuctrlNametableX(bit: Bit | boolean) {
    this.registerPPUCTRL = setBit(this.registerPPUCTRL, PPU.STATUS_FLAG_BIT_PPUCTRL_NAMETABLE_X, bit);
  }

  private get ppuctrlNametableSelect(): Nibble {
    return this.registerPPUCTRL & PPU.REGISTER_MASK_PPUCTRL_NAMETABLE_SELECT;
  }
  private set ppuctrlNametableSelect(nibble: Nibble) {
    this.registerPPUCTRL = (this.registerPPUCTRL & ~PPU.REGISTER_MASK_PPUCTRL_NAMETABLE_SELECT) | nibble;
  }

  // PPUMASK flags
  private get ppumaskColorEmphasisB(): Bit {
    return getBit(this.registerPPUMASK, PPU.STATUS_FLAG_BIT_PPUMASK_COLOR_EMPHASIS_B);
  }
  private set ppumaskColorEmphasisB(bit: Bit | boolean) {
    this.registerPPUMASK = setBit(this.registerPPUMASK, PPU.STATUS_FLAG_BIT_PPUMASK_COLOR_EMPHASIS_B, bit);
  }

  private get ppumaskColorEmphasisG(): Bit {
    return getBit(this.registerPPUMASK, PPU.STATUS_FLAG_BIT_PPUMASK_COLOR_EMPHASIS_G);
  }
  private set ppumaskColorEmphasisG(bit: Bit | boolean) {
    this.registerPPUMASK = setBit(this.registerPPUMASK, PPU.STATUS_FLAG_BIT_PPUMASK_COLOR_EMPHASIS_G, bit);
  }

  private get ppumaskColorEmphasisR(): Bit {
    return getBit(this.registerPPUMASK, PPU.STATUS_FLAG_BIT_PPUMASK_COLOR_EMPHASIS_R);
  }
  private set ppumaskColorEmphasisR(bit: Bit | boolean) {
    this.registerPPUMASK = setBit(this.registerPPUMASK, PPU.STATUS_FLAG_BIT_PPUMASK_COLOR_EMPHASIS_R, bit);
  }

  private get ppumaskSpriteEnable(): Bit {
    return getBit(this.registerPPUMASK, PPU.STATUS_FLAG_BIT_PPUMASK_SPRITE_ENABLE);
  }
  private set ppumaskSpriteEnable(bit: Bit | boolean) {
    this.registerPPUMASK = setBit(this.registerPPUMASK, PPU.STATUS_FLAG_BIT_PPUMASK_SPRITE_ENABLE, bit);
  }

  private get ppumaskBackgroundEnable(): Bit {
    return getBit(this.registerPPUMASK, PPU.STATUS_FLAG_BIT_PPUMASK_BACKGROUND_ENABLE);
  }
  private set ppumaskBackgroundEnable(bit: Bit | boolean) {
    this.registerPPUMASK = setBit(this.registerPPUMASK, PPU.STATUS_FLAG_BIT_PPUMASK_BACKGROUND_ENABLE, bit);
  }

  private get ppumaskSpriteLeftColumnEnable(): Bit {
    return getBit(this.registerPPUMASK, PPU.STATUS_FLAG_BIT_PPUMASK_SPRITE_LEFT_COLUMN_ENABLE);
  }
  private set ppumaskSpriteLeftColumnEnable(bit: Bit | boolean) {
    this.registerPPUMASK = setBit(this.registerPPUMASK, PPU.STATUS_FLAG_BIT_PPUMASK_SPRITE_LEFT_COLUMN_ENABLE, bit);
  }

  private get ppumaskBackgroundLeftColumnEnable(): Bit {
    return getBit(this.registerPPUMASK, PPU.STATUS_FLAG_BIT_PPUMASK_BACKGROUND_LEFT_COLUMN_ENABLE);
  }
  private set ppumaskBackgroundLeftColumnEnable(bit: Bit | boolean) {
    this.registerPPUMASK = setBit(this.registerPPUMASK, PPU.STATUS_FLAG_BIT_PPUMASK_BACKGROUND_LEFT_COLUMN_ENABLE, bit);
  }

  private get ppumaskGreyscale(): Bit {
    return getBit(this.registerPPUMASK, PPU.STATUS_FLAG_BIT_PPUMASK_GREYSCALE);
  }
  private set ppumaskGreyscale(bit: Bit | boolean) {
    this.registerPPUMASK = setBit(this.registerPPUMASK, PPU.STATUS_FLAG_BIT_PPUMASK_GREYSCALE, bit);
  }

  // PPUSTATUS flags
  private get ppustatusVBlank(): Bit {
    return getBit(this.registerPPUSTATUS, PPU.STATUS_FLAG_BIT_PPUSTATUS_VBLANK);
  }
  private set ppustatusVBlank(bit: Bit | boolean) {
    this.registerPPUSTATUS = setBit(this.registerPPUSTATUS, PPU.STATUS_FLAG_BIT_PPUSTATUS_VBLANK, bit);
  }

  private get ppustatusSpriteZeroHit(): Bit {
    return getBit(this.registerPPUSTATUS, PPU.STATUS_FLAG_BIT_PPUSTATUS_SPRITE_ZERO_HIT);
  }
  private set ppustatusSpriteZeroHit(bit: Bit | boolean) {
    this.registerPPUSTATUS = setBit(this.registerPPUSTATUS, PPU.STATUS_FLAG_BIT_PPUSTATUS_SPRITE_ZERO_HIT, bit);
  }

  private get ppustatusSpriteOverflow(): Bit {
    return getBit(this.registerPPUSTATUS, PPU.STATUS_FLAG_BIT_PPUSTATUS_SPRITE_OVERFLOW);
  }
  private set ppustatusSpriteOverflow(bit: Bit | boolean) {
    this.registerPPUSTATUS = setBit(this.registerPPUSTATUS, PPU.STATUS_FLAG_BIT_PPUSTATUS_SPRITE_OVERFLOW, bit);
  }

  // Internal state
  private get backgroundColorIndex(): Byte {
    return this.ppuBus.read(PPU.BACKGROUND_COLOR_ADDRESS);
  }

  private get isVBlank(): boolean {
    return this.scanline >= PPU.NTSC_VBLANK_START_SCANLINE &&
           this.scanline <= PPU.NTSC_VBLANK_END_SCANLINE;
  }

  private get isVisible(): boolean {
    return this.scanline >= PPU.NTSC_VISIBLE_START_SCANLINE &&
           this.scanline <= PPU.NTSC_VISIBLE_END_SCANLINE &&
           this.cycle >= PPU.NTSC_VISIBLE_START_CYCLE &&
           this.cycle <= PPU.NTSC_VISIBLE_END_CYCLE;
  }

  private lastCycleIsVBlank = false;
  private lastCycleIsVisible = false;

  private getRegister(address: Address): Byte {
    const index = (address - this.startAddress) % this.actualSize;
    return 0xff & this.bytes[index];
  }

  private setRegister(address: Address, byte: Byte) {
    const index = (address - this.startAddress) % this.actualSize;
    this.bytes[index] = byte;
  }

  read(address: Address): Byte {
    let byte: Byte = 0x00;
    const baseAddress = (address % PPU.REGISTER_START_ADDRESS) + PPU.REGISTER_START_ADDRESS;
    switch (baseAddress) {
      case PPU.REGISTER_PPUSTATUS:
        // PPUSTATUS is only the top 3 most-significant bits. Fill in remaining bits with PPUDATA.
        byte = (0b11100000 & this.registerPPUSTATUS) + (0b00011111 & this.registerPPUDATA);

        // Clear VBlank flag after PPUSTATUS read.
        this.ppustatusVBlank = false;
        // Reset the VRAM address latch after PPUSTATUS read.
        this.vramAddressLatch = null;
        break;
      case PPU.REGISTER_PPUDATA:
        byte = this.registerPPUDATA;

        // Load the PPUDATA register with the contents of the specified memory address for the next read.
        this.registerPPUDATA = this.ppuBus.read(this.vramAddress);

        // Palette memory is not delayed by one clock cycle.
        if (address >= PPU.PALETTE_START_ADDRESS) {
          byte = this.registerPPUDATA;
        }

        this.vramAddress += this.ppuctrlIncrementMode ? 32 : 1;
        break;
    }

    return byte;
  }

  write(address: Address, byte: Byte) {
    const baseAddress = (address % PPU.REGISTER_START_ADDRESS) + PPU.REGISTER_START_ADDRESS;
    switch (baseAddress) {
      case PPU.REGISTER_PPUCTRL:
        const previousPPUCTRLNametableSelect = this.ppuctrlNametableSelect;

        this.registerPPUCTRL = byte;

        if (this.ppuctrlNMIEnable && this.ppustatusVBlank) {
          this.generateNMI();
        }

        const baseNametableAddress = PPU.NAMETABLE_SELECT_TO_BASE_ADDRESS[this.ppuctrlNametableSelect];
        if (this.ppuctrlNametableSelect !== previousPPUCTRLNametableSelect) {
          this.vramAddress = baseNametableAddress;
        }
        break;
      case PPU.REGISTER_PPUMASK:
        this.registerPPUMASK = byte;
        break;
      case PPU.REGISTER_PPUADDR:
        this.registerPPUADDR = byte; // ???

        if (this.vramAddressLatch) {
          this.vramAddress = (this.vramAddressLatch << 8) + byte;
          this.vramAddressLatch = null;
        } else {
          this.vramAddressLatch = byte;
        }
        break;
      case PPU.REGISTER_PPUDATA:
        this.registerPPUDATA = byte; // ???
        this.ppuBus.write(this.vramAddress, byte);
        this.vramAddress += this.ppuctrlIncrementMode ? 32 : 1;
        break;
    }
  }

  private generateNMI() {
    console.log('[PPU] Generate NMI');
    this.ppuBus.emit('nmi');
  }

  writePixel(r: Byte, g: Byte, b: Byte) {
    const index = (this.visibleX + (this.visibleY * PPU.DISPLAY_WIDTH)) * 4;
    this.imageBytes[index]     = r;
    this.imageBytes[index + 1] = g;
    this.imageBytes[index + 2] = b;
  }

  getPatternTableImageData(startAddress: Address, paletteAddress: Address): ImageData {
    const imageDataWidth = Tile.TILE_WIDTH * PPU.PATTERN_TABLE_WIDTH;
    const imageDataHeight = Tile.TILE_HEIGHT * PPU.PATTERN_TABLE_HEIGHT;
    const imageBytes = new Uint8ClampedArray(imageDataWidth * imageDataHeight * 4);
    imageBytes.fill(0xff);

    const imageData = new ImageData(imageBytes, imageDataWidth, imageDataHeight);
    // const palette = new Palette(SYSTEM_PALETTE_NTSC, [
    //   this.backgroundColorIndex,
    //   this.ppuBus.read(paletteAddress),
    //   this.ppuBus.read(paletteAddress + 1),
    //   this.ppuBus.read(paletteAddress + 2)
    // ]);
    const palette = new Palette(SYSTEM_PALETTE_NTSC, [0x00, 0x10, 0x2d, 0x0d]);

    for (let y = 0; y < PPU.PATTERN_TABLE_HEIGHT; y++) {
      const imageDataRowOffset = y * Tile.TILE_HEIGHT;

      for (let x = 0; x < PPU.PATTERN_TABLE_WIDTH; x++) {
        const imageDataColumnOffset = x * Tile.TILE_WIDTH;
        const offset = (y * PPU.PATTERN_TABLE_WIDTH * Tile.TILE_BYTES) + (x * Tile.TILE_BYTES);
        const address = startAddress + offset;

        for (let tileY = 0; tileY < 8; tileY++) {
          const tileLo = this.ppuBus.read(address + tileY);
          const tileHi = this.ppuBus.read(address + tileY + Tile.TILE_BIT_PLANE_BYTES);

          for (let tileX = 0; tileX < 8; tileX++) {
            const tilePixel = ((getBit(tileHi, 7 - tileX) << 1) | getBit(tileLo, 7 - tileX)) as Tidbit;
            const color = palette.getColor(tilePixel);
            const imageDataIndex = (((imageDataRowOffset + tileY) * imageDataWidth) + (imageDataColumnOffset + tileX)) * 4;
            imageBytes[imageDataIndex]     = color.r;
            imageBytes[imageDataIndex + 1] = color.g;
            imageBytes[imageDataIndex + 2] = color.b;
          }
        }
      }
    }

    return imageData;
  }

  dumpPatternTable() {
    this.ctx.putImageData(this.getPatternTableImageData(PPU.PATTERN_TABLE_0_START_ADDRESS, PPU.SPRITE_PALETTE_0_ADDRESS), 0, 0);
    this.ctx.putImageData(this.getPatternTableImageData(PPU.PATTERN_TABLE_1_START_ADDRESS, PPU.BACKGROUND_PALETTE_0_ADDRESS), 128, 0);
  }

  getNametableImageData(startAddress: Address): ImageData {
    const imageDataWidth = Tile.TILE_WIDTH * PPU.NAMETABLE_WIDTH;
    const imageDataHeight = Tile.TILE_HEIGHT * PPU.NAMETABLE_HEIGHT;
    const imageBytes = new Uint8ClampedArray(imageDataWidth * imageDataHeight * 4);
    imageBytes.fill(0xff);

    const imageData = new ImageData(imageBytes, imageDataWidth, imageDataHeight);

    for (let y = 0; y < PPU.NAMETABLE_HEIGHT; y++) {
      const imageDataRowOffset = y * Tile.TILE_HEIGHT;

      for (let x = 0; x < PPU.NAMETABLE_WIDTH; x++) {
        const imageDataColumnOffset = x * Tile.TILE_WIDTH;
        const nametableEntryIndex = (y * PPU.NAMETABLE_WIDTH) + x;
        const nametableEntryAddress = startAddress + nametableEntryIndex;
        const nametableEntry = this.ppuBus.read(nametableEntryAddress);
        const tileOffset = nametableEntry * Tile.TILE_BYTES;
        const tileAddress = PPU.PATTERN_TABLE_1_START_ADDRESS + tileOffset;
        const paletteAddress = PPU.BACKGROUND_PALETTE_0_ADDRESS;
        const palette = new Palette(SYSTEM_PALETTE_NTSC, [
          this.backgroundColorIndex,
          this.ppuBus.read(paletteAddress),
          this.ppuBus.read(paletteAddress + 1),
          this.ppuBus.read(paletteAddress + 2)
        ]);
        // const palette = new Palette(SYSTEM_PALETTE_NTSC, [0x00, 0x10, 0x2d, 0x0d]);

        for (let tileY = 0; tileY < 8; tileY++) {
          const tileLo = this.ppuBus.read(tileAddress + tileY);
          const tileHi = this.ppuBus.read(tileAddress + tileY + Tile.TILE_BIT_PLANE_BYTES);

          for (let tileX = 7; tileX >= 0; tileX--) {
            const tilePixel = ((getBit(tileHi, 7 - tileX) << 1) | getBit(tileLo, 7 - tileX)) as Tidbit;
            const color = palette.getColor(tilePixel);
            const imageDataIndex = (((imageDataRowOffset + tileY) * imageDataWidth) + (imageDataColumnOffset + tileX)) * 4;
            imageBytes[imageDataIndex]     = color.r;
            imageBytes[imageDataIndex + 1] = color.g;
            imageBytes[imageDataIndex + 2] = color.b;
          }
        }
      }
    }

    return imageData;
  }

  dumpNametable() {
    const nametableStartAddress = PPU.NAMETABLE_SELECT_TO_BASE_ADDRESS[this.ppuctrlNametableSelect];
    this.ctx.putImageData(this.getNametableImageData(nametableStartAddress), 0, 0);
  }

  reset() {
    this.cycle = 0;
    this.scanline = 0;

    this.visibleX = 0;
    this.visibleY = 0;
  }

  tick() {
    this.execute();

    this.lastCycleIsVBlank = this.isVBlank;
    this.lastCycleIsVisible = this.isVisible;

    this.cycle++;

    if (this.cycle >= PPU.NTSC_CYCLES_PER_SCANLINE) {
      this.cycle = 0;
      this.scanline++;

      if (this.scanline >= PPU.NTSC_SCANLINES) {
        this.scanline = 0;
      }
    }
  }

  private execute() {
    if (this.isVisible) {
      this.visibleX = this.cycle - PPU.NTSC_VISIBLE_START_CYCLE;
      this.visibleY = this.scanline;

      if (this.ppumaskBackgroundEnable) {
        this.drawBackground();
      }
    }

    if (this.scanline === PPU.NTSC_PRE_RENDER_SCANLINE && this.cycle === 0) {
      this.ppustatusSpriteZeroHit = 0;
    }

    if (this.scanline === PPU.NTSC_VISIBLE_START_SCANLINE && this.cycle === PPU.NTSC_VISIBLE_START_CYCLE) {
      this.ppustatusSpriteZeroHit = 1; // TEMP
    }

    if (this.scanline === PPU.NTSC_VBLANK_START_SCANLINE && this.cycle === PPU.NTSC_VBLANK_START_CYCLE) {
      this.ppustatusVBlank = true;

      if (this.ppuctrlNMIEnable) {
        this.generateNMI();
      }

      this.flush();
    }

    if (this.scanline === PPU.NTSC_VBLANK_END_SCANLINE && this.cycle === PPU.NTSC_VBLANK_END_CYCLE) {
      this.ppustatusVBlank = false;
    }
  }

  private drawBackground() {
    const nametableY = this.visibleY >> 3; // Math.floor(this.visibleY / Tile.TILE_HEIGHT)
    const nametableX = this.visibleX >> 3; // Math.floor(this.visibleX / Tile.TILE_WIDTH)
    const nametableEntryIndex = (nametableY * PPU.NAMETABLE_WIDTH) + nametableX; // TODO: Can optimize by storing nametableY/X as 5-bit values concatenated
    const nametableStartAddress = PPU.NAMETABLE_SELECT_TO_BASE_ADDRESS[this.ppuctrlNametableSelect];
    const nametableEntryAddress = nametableStartAddress + nametableEntryIndex;
    const nametableEntry = this.ppuBus.read(nametableEntryAddress);
    const tileOffset = nametableEntry << 4; // nametableEntry * Tile.TILE_BYTES
    const tileAddress = PPU.PATTERN_TABLE_0_START_ADDRESS + tileOffset; // TODO: Use this.ppuctrlBackgroundTileSelect?
    const palette = this.getPalette(nametableY, nametableX, PPU.BACKGROUND_PALETTE_0_ADDRESS);
    const tileY = this.visibleY % Tile.TILE_HEIGHT;
    const tileX = this.visibleX % Tile.TILE_WIDTH;
    const tileLo = this.ppuBus.read(tileAddress + tileY);
    const tileHi = this.ppuBus.read(tileAddress + tileY + Tile.TILE_BIT_PLANE_BYTES);
    const tilePixel = ((getBit(tileHi, 7 - tileX) << 1) | getBit(tileLo, 7 - tileX)) as Tidbit;
    const color = palette.getColor(tilePixel);
    const imageDataRowOffset = this.visibleY << 8; // this.visibleY * PPU.DISPLAY_WIDTH
    const imageDataColumnOffset = this.visibleX;
    const imageDataIndex = (imageDataRowOffset + imageDataColumnOffset) * 4;
    this.imageBytes[imageDataIndex]     = color.r;
    this.imageBytes[imageDataIndex + 1] = color.g;
    this.imageBytes[imageDataIndex + 2] = color.b;
  }

  private flush() {
    this.ctx.putImageData(this.imageData, 0, 0);
  }

  private getPalette(nametableY: Address, nametableX: Address, basePaletteAddress: Address): Palette {
    const nametableStartAddress = PPU.NAMETABLE_SELECT_TO_BASE_ADDRESS[this.ppuctrlNametableSelect];
    const attributeTableY = nametableY >> 2; // Math.floor(nametableY / 4)
    const attributeTableX = nametableX >> 2; // Math.floor(nametableX / 4)
    const attributeTableEntryIndex = (attributeTableY << 3) + attributeTableX; // (attributesY * PPU.ATTRIBUTE_TABLE_WIDTH) + attributesX
    const attributeTableEntryAddress = nametableStartAddress + PPU.NAMETABLE_ATTRIBUTE_OFFSET + attributeTableEntryIndex;
    const attributeTableEntry = this.ppuBus.read(attributeTableEntryAddress);
    const isTopQuadrant = (nametableY % 2) === 0;
    const isLeftQuadrant = (nametableX % 2) === 0;
    let paletteIndexLo: Bit = 0;
    let paletteIndexHi: Bit = 0;
    if (isTopQuadrant) {
      if (isLeftQuadrant) {
        paletteIndexLo = getBit(attributeTableEntry, 0);
        paletteIndexHi = getBit(attributeTableEntry, 1);
      } else {
        paletteIndexLo = getBit(attributeTableEntry, 2);
        paletteIndexHi = getBit(attributeTableEntry, 3);
      }
    } else {
      if (isLeftQuadrant) {
        paletteIndexLo = getBit(attributeTableEntry, 4);
        paletteIndexHi = getBit(attributeTableEntry, 5);
      } else {
        paletteIndexLo = getBit(attributeTableEntry, 6);
        paletteIndexHi = getBit(attributeTableEntry, 7);
      }
    }
    const paletteIndex = ((paletteIndexHi << 1) | paletteIndexLo) as Tidbit;
    const paletteAddress = basePaletteAddress + (paletteIndex << 2); // basePaletteAddress + (paletteIndex * Palette.PALETTE_SIZE);
    const palette = new Palette(SYSTEM_PALETTE_NTSC, [
      this.backgroundColorIndex,
      this.ppuBus.read(paletteAddress),
      this.ppuBus.read(paletteAddress + 1),
      this.ppuBus.read(paletteAddress + 2)
    ]);
    return palette;
  }
}
