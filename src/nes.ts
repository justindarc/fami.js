import { APU } from "./apu";
import { Bus } from "./bus";
import { Cartridge } from "./cartridge";
import { Clock } from "./clock";
import { Controller } from "./controller";
import { CPU } from "./cpu";
import { DebugCallback } from "./debug";
import { EventEmitter } from "./events";
import { DisabledIO } from "./io";
import { PPU } from "./ppu";
import { RAM } from "./ram";
import { ROM } from "./rom";

export class NES extends EventEmitter {
  ram: RAM;
  prg: ROM;

  controller1: Controller;
  controller2: Controller;

  disabledIO: DisabledIO;

  chr: ROM;
  vram: RAM;
  paletteRAM: RAM;

  ppuBus: Bus;

  ppu: PPU;
  apu: APU;

  cpuBus: Bus;

  cartridge: Cartridge;

  cpu: CPU;

  clock: Clock;

  private debugCallbacks: DebugCallback[] = [];
  private isReady = false;

  constructor(canvas: HTMLCanvasElement) {
    super();

    const ram = new RAM(0x0000, 0x07ff, 0x1fff); // 2KB, mirrored up to 0x1fff
    this.ram = ram;

    const prg = new ROM(0x4020, 0xffff);
    this.prg = prg;

    const controller1 = new Controller(0x4016, 0x4016, {});
    this.controller1 = controller1;

    const controller2 = new Controller(0x4017, 0x4017, {});
    this.controller2 = controller2;

    const disabledIO = new DisabledIO();
    this.disabledIO = disabledIO;

    const chr = new ROM(PPU.CHR_START_ADDRESS, PPU.CHR_END_ADDRESS); // 8KB
    this.chr = chr;

    const vram = new RAM(PPU.NAMETABLE_0_START_ADDRESS, PPU.NAMETABLE_3_END_ADDRESS, PPU.NAMETABLE_MIRROR_END_ADDRESS); // 2KB, usually mirrored up to 0x3eff
    this.vram = vram;

    const paletteRAM = new RAM(PPU.PALETTE_START_ADDRESS, PPU.PALETTE_END_ADDRESS, PPU.PALETTE_MIRROR_END_ADDRESS);
    this.paletteRAM = paletteRAM;

    const ppuBus = new Bus([chr, vram, paletteRAM]);
    this.ppuBus = ppuBus;

    const ppu = new PPU(canvas, ppuBus, (log: string) => this.debug(log));
    this.ppu = ppu;

    const apu = new APU();
    this.apu = apu;

    const cpuBus = new Bus([ram, ppu, apu, controller1, controller2, disabledIO, prg]);
    this.cpuBus = cpuBus;

    const cartridge = new Cartridge(ppuBus, cpuBus, chr, prg);
    cartridge.load('smb.nes');
    this.cartridge = cartridge;

    const cpu = new CPU(cpuBus, ppuBus, (log: string) => this.debug(log));
    this.cpu = cpu;

    // const clock = new Clock(2_000, 50); // Yield every 2,000 tick(s) for 50ms
    // const clock = new Clock(10_000, 10); // Yield every 10,000 tick(s) for 10ms
    // const clock = new Clock(50_000, 5); // Yield every 50,000 tick(s) for 5ms
    // const clock = new Clock(100_000, 2.5); // Yield every 100,000 tick(s) for 2.5ms
    const clock = new Clock(200_000, 0); // Yield every 200,000 tick(s) for 0ms
    clock.addTickCallback(() => cpu.tick(), 3); // CPU ticks every 3rd clock cycle
    clock.addTickCallback(() => ppu.tick(), 1, PPU.CLOCK_OFFSET); // PPU ticks every clock cycle
    this.clock = clock;
  }

  reset() {
    this.cpu.reset();
    this.isReady = true;
  }

  start(reset: boolean = true) {
    if (reset) {
      this.cpu.reset();
    }

    this.clock.start();
  }

  stop() {
    this.clock.stop();
  }

  step() {
    if (!this.isReady) {
      this.reset();
    }
  
    this.clock.step();
  }

  debug(log: string) {
    this.emit('debug', log);
  }
}
