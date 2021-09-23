import { Bus } from "./bus";
import { PPU } from "./ppu";
import { ROM } from "./rom";
import { compareBytes, stringToBytes } from "./util";

type INESHeaderMirroring = 'vertical' | 'horizontal' | 'four';
type INESHeaderTVSystem = 'ntsc' | 'pal' | 'dual';

interface INESHeader {
  prgSize: number;
  chrSize: number;
  battery: boolean;
  trainer: boolean;
  vsUnisystem: boolean;
  pc10: boolean;
  ines2: boolean;
  prgRamSize: number;
  prgRam: boolean;
  busConflicts: boolean;
  mapper: number;
  mirror: INESHeaderMirroring;
  tvSystem: INESHeaderTVSystem;
}

export class Cartridge {
  private static PRG_START_ADDRESS = 0x8000; // TODO: Get this from the mapper?
  private static PRG_END_ADDRESS   = 0xffff; // TODO: Get this from the mapper?

  private static HEADER_INES_DECLARATION = stringToBytes('NES\u001a');

  private static HEADER_PRG_ROM_UNITS = 16 * 1024;
  private static HEADER_CHR_ROM_UNITS = 8 * 1024;

  private static HEADER_FLAGS_6_MASK_MIRROR_VERTICAL    = 0b00000001;
  private static HEADER_FLAGS_6_MASK_BATTERY            = 0b00000010;
  private static HEADER_FLAGS_6_MASK_TRAINER            = 0b00000100;
  private static HEADER_FLAGS_6_MASK_MIRROR_FOUR_SCREEN = 0b00001000;
  private static HEADER_FLAGS_6_MASK_MAPPER_LO          = 0b11110000;

  private static HEADER_FLAGS_7_MASK_VS_UNISYSTEM       = 0b00000001;
  private static HEADER_FLAGS_7_MASK_PC_10              = 0b00000010;
  private static HEADER_FLAGS_7_MASK_INES2              = 0b00001100;
  private static HEADER_FLAGS_7_MASK_MAPPER_HI          = 0b11110000;

  private static HEADER_FLAGS_8_MASK_PRG_RAM_SIZE       = 0b11111111;

  private static HEADER_FLAGS_9_MASK_TV_SYSTEM_PAL      = 0b00000001;

  private static HEADER_FLAGS_10_MASK_TV_SYSTEM_PAL     = 0b00000010;
  private static HEADER_FLAGS_10_MASK_TV_SYSTEM_DUAL    = 0b00000001;
  private static HEADER_FLAGS_10_MASK_PRG_RAM           = 0b00010000;
  private static HEADER_FLAGS_10_MASK_BUS_CONFLICTS     = 0b00100000;

  private ppuBus: Bus;
  private cpuBus: Bus;
  private chr: ROM;
  private prg: ROM;

  private header?: INESHeader;

  constructor(ppuBus: Bus, cpuBus: Bus, chr: ROM, prg: ROM) {
    this.ppuBus = ppuBus;
    this.cpuBus = cpuBus;
    this.chr = chr;
    this.prg = prg;
  }

  load(url: string) {
    fetch(url).then(res => res.arrayBuffer()).then((buffer) => {
      const header = this.parseHeader(buffer.slice(0, 16));
      this.header = header;

      console.log(header);

      const prgStartByte = 16 + (header.trainer ? 512 : 0);
      const prgEndByte = prgStartByte + header.prgSize;
      const prgBytes = new Uint8Array(buffer.slice(prgStartByte, prgEndByte));

      const chrStartByte = prgEndByte;
      const chrEndByte = prgEndByte + header.chrSize;
      const chrBytes = new Uint8Array(buffer.slice(chrStartByte, chrEndByte));

      this.prg.load(Cartridge.PRG_START_ADDRESS, prgBytes);
      this.chr.load(PPU.CHR_START_ADDRESS, chrBytes);

      this.ppuBus.reset();
      this.cpuBus.reset();
    });
  }

  private parseHeader(buffer: ArrayBuffer): INESHeader {
    const bytes = new Uint8Array(buffer);
    if (!compareBytes(bytes.slice(0, 4), Cartridge.HEADER_INES_DECLARATION)) {
      throw new Error('Invalid iNES header');
    }

    const prgSize          = bytes[4] * Cartridge.HEADER_PRG_ROM_UNITS;
    const chrSize          = bytes[5] * Cartridge.HEADER_CHR_ROM_UNITS;
    const mirrorVertical   = !!(bytes[6] & Cartridge.HEADER_FLAGS_6_MASK_MIRROR_VERTICAL);
    const battery          = !!(bytes[6] & Cartridge.HEADER_FLAGS_6_MASK_BATTERY);
    const trainer          = !!(bytes[6] & Cartridge.HEADER_FLAGS_6_MASK_TRAINER);
    const mirrorFourScreen = !!(bytes[6] & Cartridge.HEADER_FLAGS_6_MASK_MIRROR_FOUR_SCREEN);
    const mapperLo         = (bytes[6] & Cartridge.HEADER_FLAGS_6_MASK_MAPPER_LO) << 0;
    const vsUnisystem      = !!(bytes[7] & Cartridge.HEADER_FLAGS_7_MASK_VS_UNISYSTEM);
    const pc10             = !!(bytes[7] & Cartridge.HEADER_FLAGS_7_MASK_PC_10);
    const ines2            = !!(bytes[7] & Cartridge.HEADER_FLAGS_7_MASK_INES2);
    const mapperHi         = (bytes[7] & Cartridge.HEADER_FLAGS_7_MASK_MAPPER_HI) << 4;
    const prgRamSize       = (bytes[8] & Cartridge.HEADER_FLAGS_8_MASK_PRG_RAM_SIZE) << 0;
    const tvSystemPal      = !!(bytes[9] & Cartridge.HEADER_FLAGS_9_MASK_TV_SYSTEM_PAL);
    const tvSystemDual     = !!(bytes[10] & Cartridge.HEADER_FLAGS_10_MASK_TV_SYSTEM_DUAL);
    const prgRam           = !!(bytes[10] & Cartridge.HEADER_FLAGS_10_MASK_PRG_RAM);
    const busConflicts     = !!(bytes[10] & Cartridge.HEADER_FLAGS_10_MASK_BUS_CONFLICTS);

    const mapper = mapperLo | mapperHi;
    const mirror: INESHeaderMirroring = mirrorFourScreen ? 'four' : mirrorVertical ? 'vertical' : 'horizontal';
    const tvSystem: INESHeaderTVSystem = tvSystemDual ? 'dual' : tvSystemPal ? 'pal' : 'ntsc';

    const header = { prgSize, chrSize, battery, trainer, vsUnisystem, pc10, ines2, prgRamSize, prgRam, busConflicts, mapper, mirror, tvSystem };
    return header;
  }
}
