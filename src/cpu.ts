import { Bus } from './bus';
import { DebugCallback } from './debug';
import { formatBinary, formatHex, getBit, isSamePage, padStringRight, setBit, unsignedByteToSignedByte } from './util';

type OpcodeFunction = () => void;

export class CPU {
  static CLOCK_SPEED = 1.789773 * 1_000_000;

  private static NMI_VECTOR = 0xfffa;
  private static RESET_VECTOR = 0xfffc;
  private static IRQ_VECTOR = 0xfffe;

  private static STACK_PAGE = 0x01;

  private static STATUS_FLAG_BIT_NEGATIVE          = 7;
  private static STATUS_FLAG_BIT_OVERFLOW          = 6;
  private static STATUS_FLAG_BIT_UNUSED            = 5;
  private static STATUS_FLAG_BIT_BREAK             = 4;
  private static STATUS_FLAG_BIT_DECIMAL           = 3;
  private static STATUS_FLAG_BIT_INTERRUPT_DISABLE = 2;
  private static STATUS_FLAG_BIT_ZERO              = 1;
  private static STATUS_FLAG_BIT_CARRY             = 0;

  private static OPCODE_NAME_MAP: Record<Byte, string> = {
    0x00: 'brk',     0x01: 'ora_x_ind',                                     0x05: 'ora_zpg',   0x06: 'asl_zpg',   0x08: 'php', 0x09: 'ora_imm',   0x0a: 'asl_a',                    0x0d: 'ora_abs',   0x0e: 'asl_abs',
    0x10: 'bpl',     0x11: 'ora_ind_y',                                     0x15: 'ora_zpg_x', 0x16: 'asl_zpg_x', 0x18: 'clc', 0x19: 'ora_abs_y',                                   0x1d: 'ora_abs_x', 0x1e: 'asl_abs_x',
    0x20: 'jsr',     0x21: 'and_x_ind',                  0x24: 'bit_zpg',   0x25: 'and_zpg',   0x26: 'rol_zpg',   0x28: 'plp', 0x29: 'and_imm',   0x2a: 'rol_a', 0x2c: 'bit_abs',   0x2d: 'and_abs',   0x2e: 'rol_abs',
    0x30: 'bmi',     0x31: 'and_ind_y',                                     0x35: 'and_zpg_x', 0x36: 'rol_zpg_x', 0x38: 'sec', 0x39: 'and_abs_y',                                   0x3d: 'and_abs_x', 0x3e: 'rol_abs_x',
    0x40: 'rti',     0x41: 'eor_x_ind',                                     0x45: 'eor_zpg',   0x46: 'lsr_zpg',   0x48: 'pha', 0x49: 'eor_imm',   0x4a: 'lsr_a', 0x4c: 'jmp_abs',   0x4d: 'eor_abs',   0x4e: 'lsr_abs',
    0x50: 'bvc',     0x51: 'eor_ind_y',                                     0x55: 'eor_zpg_x', 0x56: 'lsr_zpg_x', 0x58: 'cli', 0x59: 'eor_abs_y',                                   0x5d: 'eor_abs_x', 0x5e: 'lsr_abs_x',
    0x60: 'rts',     0x61: 'adc_x_ind',                                     0x65: 'adc_zpg',   0x66: 'ror_zpg',   0x68: 'pla', 0x69: 'adc_imm',   0x6a: 'ror_a', 0x6c: 'jmp_ind',   0x6d: 'adc_abs',   0x6e: 'ror_abs',
    0x70: 'bvs',     0x71: 'adc_ind_y',                                     0x75: 'adc_zpg_x', 0x76: 'ror_zpg_x', 0x78: 'sei', 0x79: 'adc_abs_y',                                   0x7d: 'adc_abs_x', 0x7e: 'ror_abs_x',
                     0x81: 'sta_x_ind',                  0x84: 'sty_zpg',   0x85: 'sta_zpg',   0x86: 'stx_zpg',   0x88: 'dey',                    0x8a: 'txa',   0x8c: 'sty_abs',   0x8d: 'sta_abs',   0x8e: 'stx_abs',
    0x90: 'bcc',     0x91: 'sta_ind_y',                  0x94: 'sty_zpg_x', 0x95: 'sta_zpg_x', 0x96: 'stx_zpg_y', 0x98: 'tya', 0x99: 'sta_abs_y', 0x9a: 'txs',                      0x9d: 'sta_abs_x',
    0xa0: 'ldy_imm', 0xa1: 'lda_x_ind', 0xa2: 'ldx_imm', 0xa4: 'ldy_zpg',   0xa5: 'lda_zpg',   0xa6: 'ldx_zpg',   0xa8: 'tay', 0xa9: 'lda_imm',   0xaa: 'tax',   0xac: 'ldy_abs',   0xad: 'lda_abs',   0xae: 'ldx_abs',
    0xb0: 'bcs',     0xb1: 'lda_ind_y',                  0xb4: 'ldy_zpg_x', 0xb5: 'lda_zpg_x', 0xb6: 'ldx_zpg_y', 0xb8: 'clv', 0xb9: 'lda_abs_y', 0xba: 'tsx',   0xbc: 'ldy_abs_x', 0xbd: 'lda_abs_x', 0xbe: 'ldx_abs_y',
    0xc0: 'cpy_imm', 0xc1: 'cmp_x_ind',                  0xc4: 'cpy_zpg',   0xc5: 'cmp_zpg',   0xc6: 'dec_zpg',   0xc8: 'iny', 0xc9: 'cmp_imm',   0xca: 'dex',   0xcc: 'cpy_abs',   0xcd: 'cmp_abs',   0xce: 'dec_abs',
    0xd0: 'bne',     0xd1: 'cmp_ind_y',                                     0xd5: 'cmp_zpg_x', 0xd6: 'dec_zpg_x', 0xd8: 'cld', 0xd9: 'cmp_abs_y',                                   0xdd: 'cmp_abs_x', 0xde: 'dec_abs_x',
    0xe0: 'cpx_imm', 0xe1: 'sbc_x_ind',                  0xe4: 'cpx_zpg',   0xe5: 'sbc_zpg',   0xe6: 'inc_zpg',   0xe8: 'inx', 0xe9: 'sbc_imm',   0xea: 'nop',   0xec: 'cpx_abs',   0xed: 'sbc_abs',   0xee: 'inc_abs',
    0xf0: 'beq',     0xf1: 'sbc_ind_y',                                     0xf5: 'sbc_zpg_x', 0xf6: 'inc_zpg_x', 0xf8: 'sed', 0xf9: 'sbc_abs_y',                                   0xfd: 'sbc_abs_x', 0xfe: 'inc_abs_x'
  };

  private cpuBus: Bus;
  private ppuBus: Bus;
  private debugCallback: DebugCallback;

  private cyclesRemaining = 0;
  private additionalCycles = 0;

  private pendingIRQ = false;
  private pendingNMI = false;

  private a = 0x00;  // Accumulator register, 1 byte

  private x = 0x00;  // Index X register, 1 byte
  private y = 0x00;  // Index Y register, 1 byte

  private p = 0x34;  // Status register, 1 byte

  private sp = 0xfd;  // Stack Pointer register, 1 byte

  private _pc = 0x00; // Program Counter register, 2 bytes

  private opcodes: Record<Byte, OpcodeFunction> = {
    0x00: this.brk,     0x01: this.ora_x_ind,                                           0x05: this.ora_zpg,   0x06: this.asl_zpg,   0x08: this.php, 0x09: this.ora_imm,   0x0a: this.asl_a,                       0x0d: this.ora_abs,   0x0e: this.asl_abs,
    0x10: this.bpl,     0x11: this.ora_ind_y,                                           0x15: this.ora_zpg_x, 0x16: this.asl_zpg_x, 0x18: this.clc, 0x19: this.ora_abs_y,                                         0x1d: this.ora_abs_x, 0x1e: this.asl_abs_x,
    0x20: this.jsr,     0x21: this.and_x_ind,                     0x24: this.bit_zpg,   0x25: this.and_zpg,   0x26: this.rol_zpg,   0x28: this.plp, 0x29: this.and_imm,   0x2a: this.rol_a, 0x2c: this.bit_abs,   0x2d: this.and_abs,   0x2e: this.rol_abs,
    0x30: this.bmi,     0x31: this.and_ind_y,                                           0x35: this.and_zpg_x, 0x36: this.rol_zpg_x, 0x38: this.sec, 0x39: this.and_abs_y,                                         0x3d: this.and_abs_x, 0x3e: this.rol_abs_x,
    0x40: this.rti,     0x41: this.eor_x_ind,                                           0x45: this.eor_zpg,   0x46: this.lsr_zpg,   0x48: this.pha, 0x49: this.eor_imm,   0x4a: this.lsr_a, 0x4c: this.jmp_abs,   0x4d: this.eor_abs,   0x4e: this.lsr_abs,
    0x50: this.bvc,     0x51: this.eor_ind_y,                                           0x55: this.eor_zpg_x, 0x56: this.lsr_zpg_x, 0x58: this.cli, 0x59: this.eor_abs_y,                                         0x5d: this.eor_abs_x, 0x5e: this.lsr_abs_x,
    0x60: this.rts,     0x61: this.adc_x_ind,                                           0x65: this.adc_zpg,   0x66: this.ror_zpg,   0x68: this.pla, 0x69: this.adc_imm,   0x6a: this.ror_a, 0x6c: this.jmp_ind,   0x6d: this.adc_abs,   0x6e: this.ror_abs,
    0x70: this.bvs,     0x71: this.adc_ind_y,                                           0x75: this.adc_zpg_x, 0x76: this.ror_zpg_x, 0x78: this.sei, 0x79: this.adc_abs_y,                                         0x7d: this.adc_abs_x, 0x7e: this.ror_abs_x,
                        0x81: this.sta_x_ind,                     0x84: this.sty_zpg,   0x85: this.sta_zpg,   0x86: this.stx_zpg,   0x88: this.dey,                       0x8a: this.txa,   0x8c: this.sty_abs,   0x8d: this.sta_abs,   0x8e: this.stx_abs,
    0x90: this.bcc,     0x91: this.sta_ind_y,                     0x94: this.sty_zpg_x, 0x95: this.sta_zpg_x, 0x96: this.stx_zpg_y, 0x98: this.tya, 0x99: this.sta_abs_y, 0x9a: this.txs,                         0x9d: this.sta_abs_x,
    0xa0: this.ldy_imm, 0xa1: this.lda_x_ind, 0xa2: this.ldx_imm, 0xa4: this.ldy_zpg,   0xa5: this.lda_zpg,   0xa6: this.ldx_zpg,   0xa8: this.tay, 0xa9: this.lda_imm,   0xaa: this.tax,   0xac: this.ldy_abs,   0xad: this.lda_abs,   0xae: this.ldx_abs,
    0xb0: this.bcs,     0xb1: this.lda_ind_y,                     0xb4: this.ldy_zpg_x, 0xb5: this.lda_zpg_x, 0xb6: this.ldx_zpg_y, 0xb8: this.clv, 0xb9: this.lda_abs_y, 0xba: this.tsx,   0xbc: this.ldy_abs_x, 0xbd: this.lda_abs_x, 0xbe: this.ldx_abs_y,
    0xc0: this.cpy_imm, 0xc1: this.cmp_x_ind,                     0xc4: this.cpy_zpg,   0xc5: this.cmp_zpg,   0xc6: this.dec_zpg,   0xc8: this.iny, 0xc9: this.cmp_imm,   0xca: this.dex,   0xcc: this.cpy_abs,   0xcd: this.cmp_abs,   0xce: this.dec_abs,
    0xd0: this.bne,     0xd1: this.cmp_ind_y,                                           0xd5: this.cmp_zpg_x, 0xd6: this.dec_zpg_x, 0xd8: this.cld, 0xd9: this.cmp_abs_y,                                         0xdd: this.cmp_abs_x, 0xde: this.dec_abs_x,
    0xe0: this.cpx_imm, 0xe1: this.sbc_x_ind,                     0xe4: this.cpx_zpg,   0xe5: this.sbc_zpg,   0xe6: this.inc_zpg,   0xe8: this.inx, 0xe9: this.sbc_imm,   0xea: this.nop,   0xec: this.cpx_abs,   0xed: this.sbc_abs,   0xee: this.inc_abs,
    0xf0: this.beq,     0xf1: this.sbc_ind_y,                                           0xf5: this.sbc_zpg_x, 0xf6: this.inc_zpg_x, 0xf8: this.sed, 0xf9: this.sbc_abs_y,                                         0xfd: this.sbc_abs_x, 0xfe: this.inc_abs_x
  };

  public opcodeCounts: Record<string, number> = {};

  constructor(cpuBus: Bus, ppuBus: Bus, debugCallback: DebugCallback) {
    this.cpuBus = cpuBus;
    this.ppuBus = ppuBus;
    this.debugCallback = debugCallback;

    this.ppuBus.on('nmi', () => this.generateNMI());
  }

  get pc() {
    return this._pc;
  }

  private set pc(value) {
    const pcValue = this.cpuBus.read(this._pc);
    const opcodeFn = this.opcodes[pcValue] || this.invalidOpcode;

    this.debug(opcodeFn);

    this._pc = value;
  }

  private get statusNegative(): Bit {
    return this.getStatusFlag(CPU.STATUS_FLAG_BIT_NEGATIVE);
  }

  private set statusNegative(bit: Bit | boolean) {
    this.setStatusFlag(CPU.STATUS_FLAG_BIT_NEGATIVE, bit);
  }

  private get statusOverflow(): Bit {
    return this.getStatusFlag(CPU.STATUS_FLAG_BIT_OVERFLOW);
  }

  private set statusOverflow(bit: Bit | boolean) {
    this.setStatusFlag(CPU.STATUS_FLAG_BIT_OVERFLOW, bit);
  }

  private get statusUnused(): Bit {
    return this.getStatusFlag(CPU.STATUS_FLAG_BIT_UNUSED);
  }

  private set statusUnused(bit: Bit | boolean) {
    this.setStatusFlag(CPU.STATUS_FLAG_BIT_UNUSED, bit);
  }

  private get statusBreak(): Bit {
    return this.getStatusFlag(CPU.STATUS_FLAG_BIT_BREAK);
  }

  private set statusBreak(bit: Bit | boolean) {
    this.setStatusFlag(CPU.STATUS_FLAG_BIT_BREAK, bit);
  }

  private get statusDecimal(): Bit {
    return this.getStatusFlag(CPU.STATUS_FLAG_BIT_DECIMAL);
  }

  private set statusDecimal(bit: Bit | boolean) {
    this.setStatusFlag(CPU.STATUS_FLAG_BIT_DECIMAL, bit);
  }

  private get statusInterruptDisable(): Bit {
    return this.getStatusFlag(CPU.STATUS_FLAG_BIT_INTERRUPT_DISABLE);
  }

  private set statusInterruptDisable(bit: Bit | boolean) {
    this.setStatusFlag(CPU.STATUS_FLAG_BIT_INTERRUPT_DISABLE, bit);
  }

  private get statusZero(): Bit {
    return this.getStatusFlag(CPU.STATUS_FLAG_BIT_ZERO);
  }

  private set statusZero(bit: Bit | boolean) {
    this.setStatusFlag(CPU.STATUS_FLAG_BIT_ZERO, bit);
  }

  private get statusCarry(): Bit {
    return this.getStatusFlag(CPU.STATUS_FLAG_BIT_CARRY);
  }

  private set statusCarry(bit: Bit | boolean) {
    this.setStatusFlag(CPU.STATUS_FLAG_BIT_CARRY, bit);
  }

  reset() {
    this.a = 0x00;
    this.x = 0x00;
    this.y = 0x00;

    this.p = 0b00110100;

    this.sp = 0xfd;

    const addressLo = this.cpuBus.read(CPU.RESET_VECTOR);
    const addressHi = this.cpuBus.read(CPU.RESET_VECTOR + 1) << 8;
    const address = addressHi | addressLo;

    this.pc = address;
  }

  debug(opcodeFn: OpcodeFunction) {
    const opcodeByte = this.cpuBus.read(this.pc);
    const opcodeName = CPU.OPCODE_NAME_MAP[opcodeByte] || '(unk)';
    const opcodeHex = formatHex(opcodeByte, 2);
    const operandLoHex = formatHex(this.cpuBus.read(this.pc + 1), 2);
    const operandHiHex = formatHex(this.cpuBus.read(this.pc + 2), 2);
    const opcode = `${opcodeHex} ${padStringRight(opcodeName, 10)} [${operandLoHex} ${operandHiHex}]`;

    const registers = [];
    registers.push('A ' + formatHex(this.a, 2));
    registers.push('X ' + formatHex(this.x, 2));
    registers.push('Y ' + formatHex(this.y, 2));
    registers.push('PC ' + formatHex(this.pc, 4));
    registers.push('SP ' + formatHex(this.sp, 2));
    registers.push('P ' + formatBinary(this.p, 8) + ' [' + formatHex(this.p, 2) + ']');

    this.opcodeCounts[opcodeName] = (this.opcodeCounts[opcodeName] ?? 0) + 1;

    this.debugCallback(`[CPU] Opcode: ${opcode} Registers: ${registers.join(', ')} Neg: ${this.statusNegative} Zero: ${this.statusZero} Carry: ${this.statusCarry}`);
  }

  tick() {
    if (this.cyclesRemaining <= 0) {
      this.execute();
    }

    this.cyclesRemaining--;
  }

  generateIRQ() {
    this.pendingIRQ = true;
  }

  generateNMI() {
    this.pendingNMI = true;
  }

  private execute() {
    if (this.pendingIRQ && !this.statusInterruptDisable) {
      this.pendingIRQ = false;
      this.irq();
      return;
    }

    if (this.pendingNMI) {
      this.pendingNMI = false;
      this.nmi();
      return;
    }

    const pcValue = this.cpuBus.read(this.pc);
    const opcodeFn = this.opcodes[pcValue] || this.invalidOpcode;

    opcodeFn.call(this);

    this.additionalCycles = 0;
  }

  private getStatusFlag(index: number): Bit {
    return getBit(this.p, index);
  }

  private setStatusFlag(index: number, bit: Bit | boolean) {
    this.p = setBit(this.p, index, bit);
  }

  private updateStatusNegative(value: Byte) {
    this.statusNegative = !!(value & (1 << 7));
  }

  private updateStatusZero(value: Byte) {
    this.statusZero = value === 0x00;
  }

  private pushStack(byte: Byte) {
    const addressLo = this.sp;
    const addressHi = CPU.STACK_PAGE << 8;
    const address = addressHi | addressLo;
    this.cpuBus.write(address, byte);
    this.sp = 0xff & (this.sp - 1);
  }

  private pullStack(): Byte {
    this.sp = 0xff & (this.sp + 1);
    const addressLo = this.sp;
    const addressHi = CPU.STACK_PAGE << 8;
    const address = addressHi | addressLo;
    return this.cpuBus.read(address);
  }

  private getAddressAbs(): Address {
    const addressLo = this.cpuBus.read(this.pc + 1);
    const addressHi = this.cpuBus.read(this.pc + 2) << 8;
    return addressHi | addressLo; // LO and HI bytes
  }

  private getAddressAbsX(): Address {
    const baseAddressLo = this.cpuBus.read(this.pc + 1);
    const baseAddressHi = this.cpuBus.read(this.pc + 2) << 8;
    const baseAddress = baseAddressHi | baseAddressLo;
    const address = 0xffff & (baseAddress + this.x);
    if ((baseAddress & 0xff) !== (address & 0xff)) {
      this.additionalCycles = 1;
    }
    return address; // LO and HI bytes, X-indexed
  }

  private getAddressAbsY(): Address {
    const baseAddressLo = this.cpuBus.read(this.pc + 1);
    const baseAddressHi = this.cpuBus.read(this.pc + 2) << 8;
    const baseAddress = baseAddressHi | baseAddressLo;
    const address = 0xffff & (baseAddress + this.y);
    if ((baseAddress & 0xff) !== (address & 0xff)) {
      this.additionalCycles = 1;
    }
    return address; // LO and HI bytes, Y-indexed
  }

  private getAddressImm(): Address {
    return 0xffff & (this.pc + 1); // Next byte after PC
  }

  private getAddressInd(): Address {
    const absLo = this.cpuBus.read(this.pc + 1);
    const absHi = this.cpuBus.read(this.pc + 2) << 8;
    const abs = absHi | absLo;
    if (absLo === 0xff) { // Known CPU bug
      const addressLo = this.cpuBus.read(abs);
      const addressHi = this.cpuBus.read(abs & 0xff00) << 8;
      return addressHi | addressLo; // LO and HI bytes at abs address
    }
    const addressLo = this.cpuBus.read(abs);
    const addressHi = this.cpuBus.read(abs + 1) << 8;
    return addressHi | addressLo; // LO and HI bytes at abs address
  }

  private getAddressXInd(): Address { // ???
    const indirectAddress = this.getAddressZpg();
    const addressLo = this.cpuBus.read(0xff & (indirectAddress + this.x));
    const addressHi = this.cpuBus.read(0xff & (indirectAddress + this.x + 1)) << 8;
    const address = addressHi | addressLo;
    return address;
  }

  private getAddressIndY(): Address { // ???
    const indirectAddress = this.getAddressZpg();
    const baseAddressLo = (this.cpuBus.read(indirectAddress));
    const baseAddressHi = (this.cpuBus.read((indirectAddress + 1) & 0xff)) << 8;
    const baseAddress = baseAddressHi | baseAddressLo;
    const address = 0xffff & (baseAddress + this.y);
    if ((baseAddress & 0xff) !== (address & 0xff)) {
      this.additionalCycles = 1;
    }
    return address;
  }

  private getAddressRel(): Address {
    return 0xffff & (unsignedByteToSignedByte(this.cpuBus.read(this.pc + 1)) + this.pc + 2); // Signed offset from PC after 2-byte instruction
  }

  private getAddressZpg(): Address {
    return this.cpuBus.read(this.pc + 1); // LO byte only
  }

  private getAddressZpgX(): Address {
    return 0xff & (this.getAddressZpg() + this.x); // LO byte only, X-indexed, no carry
  }

  private getAddressZpgY(): Address {
    return 0xff & (this.getAddressZpg() + this.y); // LO byte only, Y-indexed, no carry
  }

  private invalidOpcode() {
    console.error(`Invalid opcode: ${formatHex(this.cpuBus.read(this.pc), 2)}`);

    this.pc = 0xffff & (this.pc + 1);
  }

  //
  // Internal instructions not mapped to opcodes
  //

  private irq() {
    const returnAddressHi = ((this.pc) & 0xff00) >> 8;
    const returnAddressLo = ((this.pc) & 0x00ff);
    this.pushStack(returnAddressHi);
    this.pushStack(returnAddressLo);
    // this.statusBreak = false;
    this.statusInterruptDisable = true;
    this.pushStack(this.p);
    const addressLo = this.cpuBus.read(CPU.IRQ_VECTOR);
    const addressHi = this.cpuBus.read(CPU.IRQ_VECTOR + 1) << 8;
    const address = addressHi | addressLo;
    // console.log('[IRQ] Interrupting to address: ' + formatHex(address, 4) + ', return address: ' + formatHex(this.pc, 4));
    this.pc = address;
    this.cyclesRemaining = 7;
  }

  private nmi() {
    const returnAddressHi = ((this.pc) & 0xff00) >> 8;
    const returnAddressLo = ((this.pc) & 0x00ff);
    this.pushStack(returnAddressHi);
    this.pushStack(returnAddressLo);
    // this.statusBreak = false;
    this.statusInterruptDisable = true;
    this.pushStack(this.p);
    const addressLo = this.cpuBus.read(CPU.NMI_VECTOR);
    const addressHi = this.cpuBus.read(CPU.NMI_VECTOR + 1) << 8;
    const address = addressHi | addressLo;
    // console.log('[NMI] Interrupting to address: ' + formatHex(address, 4) + ', return address: ' + formatHex(this.pc, 4));
    this.pc = address;
    this.cyclesRemaining = 7;
  }

  //
  // Instructions mapped to opcodes
  //

  private adc_imm() { // Add Memory to Accumulator with Carry (immediate)
    const memory = this.cpuBus.read(this.getAddressImm());
    const oldA = this.a;
    const intermediateA = oldA + memory + this.statusCarry;
    const newA = 0xff & intermediateA;
    this.a = newA;
    this.statusCarry = intermediateA > 0xff;
    this.statusOverflow = !!((~(oldA ^ memory) & (oldA ^ intermediateA)) & (1 << 7));
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 2;
  }

  private adc_zpg() { // Add Memory to Accumulator with Carry (zeropage)
    const memory = this.cpuBus.read(this.getAddressZpg());
    const oldA = this.a;
    const intermediateA = oldA + memory + this.statusCarry;
    const newA = 0xff & intermediateA;
    this.a = newA;
    this.statusCarry = intermediateA > 0xff;
    this.statusOverflow = !!((~(oldA ^ memory) & (oldA ^ intermediateA)) & (1 << 7));
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 3;
  }

  private adc_zpg_x() { // Add Memory to Accumulator with Carry (zeropage,X)
    const memory = this.cpuBus.read(this.getAddressZpgX());
    const oldA = this.a;
    const intermediateA = oldA + memory + this.statusCarry;
    const newA = 0xff & intermediateA;
    this.a = newA;
    this.statusCarry = intermediateA > 0xff;
    this.statusOverflow = !!((~(oldA ^ memory) & (oldA ^ intermediateA)) & (1 << 7));
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 4;
  }

  private adc_abs() { // Add Memory to Accumulator with Carry (absolute)
    const memory = this.cpuBus.read(this.getAddressAbs());
    const oldA = this.a;
    const intermediateA = oldA + memory + this.statusCarry;
    const newA = 0xff & intermediateA;
    this.a = newA;
    this.statusCarry = intermediateA > 0xff;
    this.statusOverflow = !!((~(oldA ^ memory) & (oldA ^ intermediateA)) & (1 << 7));
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 3);
    this.cyclesRemaining = 4;
  }

  private adc_abs_x() { // Add Memory to Accumulator with Carry (absolute,X)
    const memory = this.cpuBus.read(this.getAddressAbsX());
    const oldA = this.a;
    const intermediateA = oldA + memory + this.statusCarry;
    const newA = 0xff & intermediateA;
    this.a = newA;
    this.statusCarry = intermediateA > 0xff;
    this.statusOverflow = !!((~(oldA ^ memory) & (oldA ^ intermediateA)) & (1 << 7));
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 3);
    this.cyclesRemaining = 4 + this.additionalCycles;
  }

  private adc_abs_y() { // Add Memory to Accumulator with Carry (absolute,Y)
    const memory = this.cpuBus.read(this.getAddressAbsY());
    const oldA = this.a;
    const intermediateA = oldA + memory + this.statusCarry;
    const newA = 0xff & intermediateA;
    this.a = newA;
    this.statusCarry = intermediateA > 0xff;
    this.statusOverflow = !!((~(oldA ^ memory) & (oldA ^ intermediateA)) & (1 << 7));
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 3);
    this.cyclesRemaining = 4 + this.additionalCycles;
  }

  private adc_x_ind() { // Add Memory to Accumulator with Carry (X,indirect)
    const memory = this.cpuBus.read(this.getAddressXInd());
    const oldA = this.a;
    const intermediateA = oldA + memory + this.statusCarry;
    const newA = 0xff & intermediateA;
    this.a = newA;
    this.statusCarry = intermediateA > 0xff;
    this.statusOverflow = !!((~(oldA ^ memory) & (oldA ^ intermediateA)) & (1 << 7));
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 6;
  }

  private adc_ind_y() { // Add Memory to Accumulator with Carry (indirect,Y)
    const memory = this.cpuBus.read(this.getAddressIndY());
    const oldA = this.a;
    const intermediateA = oldA + memory + this.statusCarry;
    const newA = 0xff & intermediateA;
    this.a = newA;
    this.statusCarry = intermediateA > 0xff;
    this.statusOverflow = !!((~(oldA ^ memory) & (oldA ^ intermediateA)) & (1 << 7));
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 5 + this.additionalCycles;
  }

  private and_imm() { // AND Memory with Accumulator (immediate)
    const memory = this.cpuBus.read(this.getAddressImm());
    const newA = this.a & memory;
    this.a = newA;
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 2;
  }

  private and_zpg() { // AND Memory with Accumulator (zeropage)
    const memory = this.cpuBus.read(this.getAddressZpg());
    const newA = this.a & memory;
    this.a = newA;
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 3;
  }

  private and_zpg_x() { // AND Memory with Accumulator (zeropage,X)
    const memory = this.cpuBus.read(this.getAddressZpgX());
    const newA = this.a & memory;
    this.a = newA;
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 4;
  }

  private and_abs() { // AND Memory with Accumulator (absolute)
    const memory = this.cpuBus.read(this.getAddressAbs());
    const newA = this.a & memory;
    this.a = newA;
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 3);
    this.cyclesRemaining = 4;
  }

  private and_abs_x() { // AND Memory with Accumulator (absolute,X)
    const memory = this.cpuBus.read(this.getAddressAbsX());
    const newA = this.a & memory;
    this.a = newA;
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 3);
    this.cyclesRemaining = 4 + this.additionalCycles;
  }

  private and_abs_y() { // AND Memory with Accumulator (absolute,Y)
    const memory = this.cpuBus.read(this.getAddressAbsY());
    const newA = this.a & memory;
    this.a = newA;
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 3);
    this.cyclesRemaining = 4 + this.additionalCycles;
  }

  private and_x_ind() { // AND Memory with Accumulator (X,indirect)
    const memory = this.cpuBus.read(this.getAddressXInd());
    const newA = this.a & memory;
    this.a = newA;
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 6;
  }

  private and_ind_y() { // AND Memory with Accumulator (indirect,Y)
    const memory = this.cpuBus.read(this.getAddressIndY());
    const newA = this.a & memory;
    this.a = newA;
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 5 + this.additionalCycles;
  }

  private asl_a() { // Shift Left One Bit (accumulator)
    const oldA = this.a;
    const intermediateA = oldA << 1;
    const newA = 0xff & intermediateA;
    this.a = newA;
    this.statusCarry = !!(oldA & (1 << 7));
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 1);
    this.cyclesRemaining = 2;
  }

  private asl_zpg() { // Shift Left One Bit (zeropage)
    const address = this.getAddressZpg();
    const oldMemory = this.cpuBus.read(address);
    const intermediateMemory = oldMemory << 1;
    const newMemory = 0xff & intermediateMemory;
    this.cpuBus.write(address, newMemory);
    this.statusCarry = !!(oldMemory & (1 << 7));
    this.updateStatusNegative(newMemory);
    this.updateStatusZero(newMemory);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 5;
  }

  private asl_zpg_x() { // Shift Left One Bit (zeropage,X)
    const address = this.getAddressZpgX();
    const oldMemory = this.cpuBus.read(address);
    const intermediateMemory = oldMemory << 1;
    const newMemory = 0xff & intermediateMemory;
    this.cpuBus.write(address, newMemory);
    this.statusCarry = !!(oldMemory & (1 << 7));
    this.updateStatusNegative(newMemory);
    this.updateStatusZero(newMemory);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 6;
  }

  private asl_abs() { // Shift Left One Bit (absolute)
    const address = this.getAddressAbs();
    const oldMemory = this.cpuBus.read(address);
    const intermediateMemory = oldMemory << 1;
    const newMemory = 0xff & intermediateMemory;
    this.cpuBus.write(address, newMemory);
    this.statusCarry = !!(oldMemory & (1 << 7));
    this.updateStatusNegative(newMemory);
    this.updateStatusZero(newMemory);
    this.pc = 0xffff & (this.pc + 3);
    this.cyclesRemaining = 6;
  }

  private asl_abs_x() { // Shift Left One Bit (absolute,X)
    const address = this.getAddressAbsX();
    const oldMemory = this.cpuBus.read(address);
    const intermediateMemory = oldMemory << 1;
    const newMemory = 0xff & intermediateMemory;
    this.cpuBus.write(address, newMemory);
    this.statusCarry = !!(oldMemory & (1 << 7));
    this.updateStatusNegative(newMemory);
    this.updateStatusZero(newMemory);
    this.pc = 0xffff & (this.pc + 3);
    this.cyclesRemaining = 7;
  }

  private bcc() { // Branch on Carry Clear
    this.cyclesRemaining = 2;
    if (!this.statusCarry) {
      const address = this.getAddressRel();
      this.cyclesRemaining += isSamePage(this.pc, address) ? 1 : 2;
      this.pc = address;
    } else {
      this.pc = 0xffff & (this.pc + 2);
    }
  }

  private bcs() { // Branch on Carry Set
    this.cyclesRemaining = 2;
    if (this.statusCarry) {
      const address = this.getAddressRel();
      this.cyclesRemaining += isSamePage(this.pc, address) ? 1 : 2;
      this.pc = address;
    } else {
      this.pc = 0xffff & (this.pc + 2);
    }
  }

  private beq() { // Branch on Result Zero
    this.cyclesRemaining = 2;
    if (this.statusZero) {
      const address = this.getAddressRel();
      this.cyclesRemaining += isSamePage(this.pc, address) ? 1 : 2;
      this.pc = address;
    } else {
      this.pc = 0xffff & (this.pc + 2);
    }
  }

  private bit_zpg() { // Test Bits in Memory with Accumulator (zeropage)
    const memory = this.cpuBus.read(this.getAddressZpg());
    this.statusNegative = !!(memory & (1 << 7));
    this.statusOverflow = !!(memory & (1 << 6));
    this.statusZero = (memory & this.a) === 0;
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 3;
  }

  private bit_abs() { // Test Bits in Memory with Accumulator (absolute)
    const memory = this.cpuBus.read(this.getAddressAbs());
    this.statusNegative = !!(memory & (1 << 7));
    this.statusOverflow = !!(memory & (1 << 6));
    this.statusZero = (memory & this.a) === 0;
    this.pc = 0xffff & (this.pc + 3);
    this.cyclesRemaining = 4;
  }

  private bmi() { // Branch on Result Minus
    this.cyclesRemaining = 2;
    if (this.statusNegative) {
      const address = this.getAddressRel();
      this.cyclesRemaining += isSamePage(this.pc, address) ? 1 : 2;
      this.pc = address;
    } else {
      this.pc = 0xffff & (this.pc + 2);
    }
  }

  private bne() { // Branch on Result not Zero
    this.cyclesRemaining = 2;
    if (!this.statusZero) {
      const address = this.getAddressRel();
      this.cyclesRemaining += isSamePage(this.pc, address) ? 1 : 2;
      this.pc = address;
    } else {
      this.pc = 0xffff & (this.pc + 2);
    }
  }

  private bpl() { // Branch on Result Plus
    this.cyclesRemaining = 2;
    if (!this.statusNegative) {
      const address = this.getAddressRel();
      this.cyclesRemaining += isSamePage(this.pc, address) ? 1 : 2;
      this.pc = address;
    } else {
      this.pc = 0xffff & (this.pc + 2);
    }
  }

  private brk() { // Force Break
    const returnAddressHi = ((this.pc + 2) & 0xff00) >> 8;
    const returnAddressLo = ((this.pc + 2) & 0x00ff);
    this.pushStack(returnAddressHi);
    this.pushStack(returnAddressLo);
    this.statusInterruptDisable = true;
    this.statusBreak = true;
    this.pushStack(this.p);
    this.statusBreak = false;
    console.log('[BRK] Return address: ' + formatHex(this.pc + 3, 4));
    this.pc = CPU.IRQ_VECTOR;
    this.cyclesRemaining = 7;
  }

  private bvc() { // Branch on Overflow Clear
    this.cyclesRemaining = 2;
    if (!this.statusOverflow) {
      const address = this.getAddressRel();
      this.cyclesRemaining += isSamePage(this.pc, address) ? 1 : 2;
      this.pc = address;
    } else {
      this.pc = 0xffff & (this.pc + 2);
    }
  }

  private bvs() { // Branch on Overflow Set
    this.cyclesRemaining = 2;
    if (this.statusOverflow) {
      const address = this.getAddressRel();
      this.cyclesRemaining += isSamePage(this.pc, address) ? 1 : 2;
      this.pc = address;
    } else {
      this.pc = 0xffff & (this.pc + 2);
    }
  }

  private clc() { // Clear Carry Flag
    this.statusCarry = 0;
    this.pc = 0xffff & (this.pc + 1);
    this.cyclesRemaining = 2;
  }

  private cld() { // Clear Decimal Mode
    this.statusDecimal = 0;
    this.pc = 0xffff & (this.pc + 1);
    this.cyclesRemaining = 2;
  }

  private cli() { // Clear Interrupt Disable Bit
    this.statusInterruptDisable = 0;
    this.pc = 0xffff & (this.pc + 1);
    this.cyclesRemaining = 2;
  }

  private clv() { // Clear Overflow Flag
    this.statusOverflow = 0;
    this.pc = 0xffff & (this.pc + 1);
    this.cyclesRemaining = 2;
  }

  private cmp_imm() { // Compare Memory with Accumulator (immediate)
    const memory = this.cpuBus.read(this.getAddressImm());
    const result = this.a - memory;
    this.statusCarry = memory <= this.a;
    this.updateStatusNegative(result);
    this.updateStatusZero(result);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 2;
  }

  private cmp_zpg() { // Compare Memory with Accumulator (zeropage)
    const memory = this.cpuBus.read(this.getAddressZpg());
    const result = this.a - memory;
    this.statusCarry = memory <= this.a;
    this.updateStatusNegative(result);
    this.updateStatusZero(result);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 3;
  }

  private cmp_zpg_x() { // Compare Memory with Accumulator (zeropage,X)
    const memory = this.cpuBus.read(this.getAddressZpgX());
    const result = this.a - memory;
    this.statusCarry = memory <= this.a;
    this.updateStatusNegative(result);
    this.updateStatusZero(result);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 4;
  }

  private cmp_abs() { // Compare Memory with Accumulator (absolute)
    const memory = this.cpuBus.read(this.getAddressAbs());
    const result = this.a - memory;
    this.statusCarry = memory <= this.a;
    this.updateStatusNegative(result);
    this.updateStatusZero(result);
    this.pc = 0xffff & (this.pc + 3);
    this.cyclesRemaining = 4;
  }

  private cmp_abs_x() { // Compare Memory with Accumulator (absolute,X)
    const memory = this.cpuBus.read(this.getAddressAbsX());
    const result = this.a - memory;
    this.statusCarry = memory <= this.a;
    this.updateStatusNegative(result);
    this.updateStatusZero(result);
    this.pc = 0xffff & (this.pc + 3);
    this.cyclesRemaining = 4 + this.additionalCycles;
  }

  private cmp_abs_y() { // Compare Memory with Accumulator (absolute,Y)
    const memory = this.cpuBus.read(this.getAddressAbsY());
    const result = this.a - memory;
    this.statusCarry = memory <= this.a;
    this.updateStatusNegative(result);
    this.updateStatusZero(result);
    this.pc = 0xffff & (this.pc + 3);
    this.cyclesRemaining = 4 + this.additionalCycles;
  }

  private cmp_x_ind() { // Compare Memory with Accumulator (X,indirect)
    const memory = this.cpuBus.read(this.getAddressXInd());
    const result = this.a - memory;
    this.statusCarry = memory <= this.a;
    this.updateStatusNegative(result);
    this.updateStatusZero(result);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 6;
  }

  private cmp_ind_y() { // Compare Memory with Accumulator (indirect,Y)
    const memory = this.cpuBus.read(this.getAddressIndY());
    const result = this.a - memory;
    this.statusCarry = memory <= this.a;
    this.updateStatusNegative(result);
    this.updateStatusZero(result);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 5 + this.additionalCycles;
  }

  private cpx_imm() { // Compare Memory and Index X (immediate)
    const memory = this.cpuBus.read(this.getAddressImm());
    const result = this.x - memory;
    this.statusCarry = memory <= this.x;
    this.updateStatusNegative(result);
    this.updateStatusZero(result);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 2;
  }

  private cpx_zpg() { // Compare Memory and Index X (zeropage)
    const memory = this.cpuBus.read(this.getAddressZpg());
    const result = this.x - memory;
    this.statusCarry = memory <= this.x;
    this.updateStatusNegative(result);
    this.updateStatusZero(result);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 3;
  }

  private cpx_abs() { // Compare Memory and Index X (absolute)
    const memory = this.cpuBus.read(this.getAddressAbs());
    const result = this.x - memory;
    this.statusCarry = memory <= this.x;
    this.updateStatusNegative(result);
    this.updateStatusZero(result);
    this.pc = 0xffff & (this.pc + 3);
    this.cyclesRemaining = 4;
  }

  private cpy_imm() { // Compare Memory and Index Y (immediate)
    const memory = this.cpuBus.read(this.getAddressImm());
    const result = this.y - memory;
    this.statusCarry = memory <= this.y;
    this.updateStatusNegative(result);
    this.updateStatusZero(result);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 2;
  }

  private cpy_zpg() { // Compare Memory and Index Y (zeropage)
    const memory = this.cpuBus.read(this.getAddressZpg());
    const result = this.y - memory;
    this.statusCarry = memory <= this.y;
    this.updateStatusNegative(result);
    this.updateStatusZero(result);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 3;
  }

  private cpy_abs() { // Compare Memory and Index Y (absolute)
    const memory = this.cpuBus.read(this.getAddressAbs());
    const result = this.y - memory;
    this.statusCarry = memory <= this.y;
    this.updateStatusNegative(result);
    this.updateStatusZero(result);
    this.pc = 0xffff & (this.pc + 3);
    this.cyclesRemaining = 4;
  }

  private dec_zpg() { // Decrement Memory by One (zeropage)
    const address = this.getAddressZpg();
    const oldMemory = this.cpuBus.read(address);
    const newMemory = 0xff & (oldMemory - 1);
    this.cpuBus.write(address, newMemory);
    this.updateStatusNegative(newMemory);
    this.updateStatusZero(newMemory);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 5;
  }

  private dec_zpg_x() { // Decrement Memory by One (zeropage,X)
    const address = this.getAddressZpgX();
    const oldMemory = this.cpuBus.read(address);
    const newMemory = 0xff & (oldMemory - 1);
    this.cpuBus.write(address, newMemory);
    this.updateStatusNegative(newMemory);
    this.updateStatusZero(newMemory);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 6;
  }

  private dec_abs() { // Decrement Memory by One (absolute)
    const address = this.getAddressAbs();
    const oldMemory = this.cpuBus.read(address);
    const newMemory = 0xff & (oldMemory - 1);
    this.cpuBus.write(address, newMemory);
    this.updateStatusNegative(newMemory);
    this.updateStatusZero(newMemory);
    this.pc = 0xffff & (this.pc + 3);
    this.cyclesRemaining = 3;
  }

  private dec_abs_x() { // Decrement Memory by One (absolute,X)
    const address = this.getAddressAbsX();
    const oldMemory = this.cpuBus.read(address);
    const newMemory = 0xff & (oldMemory - 1);
    this.cpuBus.write(address, newMemory);
    this.updateStatusNegative(newMemory);
    this.updateStatusZero(newMemory);
    this.pc = 0xffff & (this.pc + 3);
    this.cyclesRemaining = 7;
  }

  private dex() { // Decrement Index X by One
    const newX = 0xff & (this.x - 1);
    this.x = newX;
    this.updateStatusNegative(newX);
    this.updateStatusZero(newX);
    this.pc = 0xffff & (this.pc + 1);
    this.cyclesRemaining = 2;
  }

  private dey() { // Decrement Index Y by One
    const newY = 0xff & (this.y - 1);
    this.y = newY;
    this.updateStatusNegative(newY);
    this.updateStatusZero(newY);
    this.pc = 0xffff & (this.pc + 1);
    this.cyclesRemaining = 2;
  }

  private eor_imm() { // Exclusive-OR Memory with Accumulator (immediate)
    const memory = this.cpuBus.read(this.getAddressImm());
    const newA = this.a ^ memory;
    this.a = newA;
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 2;
  }

  private eor_zpg() { // Exclusive-OR Memory with Accumulator (zeropage)
    const memory = this.cpuBus.read(this.getAddressZpg());
    const newA = this.a ^ memory;
    this.a = newA;
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 3;
  }

  private eor_zpg_x() { // Exclusive-OR Memory with Accumulator (zeropage,X)
    const memory = this.cpuBus.read(this.getAddressZpgX());
    const newA = this.a ^ memory;
    this.a = newA;
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 4;
  }

  private eor_abs() { // Exclusive-OR Memory with Accumulator (absolute)
    const memory = this.cpuBus.read(this.getAddressAbs());
    const newA = this.a ^ memory;
    this.a = newA;
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 3);
    this.cyclesRemaining = 4;
  }

  private eor_abs_x() { // Exclusive-OR Memory with Accumulator (absolute,X)
    const memory = this.cpuBus.read(this.getAddressAbsX());
    const newA = this.a ^ memory;
    this.a = newA;
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 3);
    this.cyclesRemaining = 4 + this.additionalCycles;
  }

  private eor_abs_y() { // Exclusive-OR Memory with Accumulator (absolute,Y)
    const memory = this.cpuBus.read(this.getAddressAbsY());
    const newA = this.a ^ memory;
    this.a = newA;
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 3);
    this.cyclesRemaining = 4 + this.additionalCycles;
  }

  private eor_x_ind() { // Exclusive-OR Memory with Accumulator (X,indirect)
    const memory = this.cpuBus.read(this.getAddressXInd());
    const newA = this.a ^ memory;
    this.a = newA;
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 6;
  }

  private eor_ind_y() { // Exclusive-OR Memory with Accumulator (indirect,Y)
    const memory = this.cpuBus.read(this.getAddressIndY());
    const newA = this.a ^ memory;
    this.a = newA;
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 5 + this.additionalCycles;
  }

  private inc_zpg() { // Increment Memory by One (zeropage)
    const address = this.getAddressZpg();
    const oldMemory = this.cpuBus.read(address);
    const newMemory = 0xff & (oldMemory + 1);
    this.cpuBus.write(address, newMemory);
    this.updateStatusNegative(newMemory);
    this.updateStatusZero(newMemory);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 5;
  }

  private inc_zpg_x() { // Increment Memory by One (zeropage,X)
    const address = this.getAddressZpgX();
    const oldMemory = this.cpuBus.read(address);
    const newMemory = 0xff & (oldMemory + 1);
    this.cpuBus.write(address, newMemory);
    this.updateStatusNegative(newMemory);
    this.updateStatusZero(newMemory);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 6;
  }

  private inc_abs() { // Increment Memory by One (absolute)
    const address = this.getAddressAbs();
    const oldMemory = this.cpuBus.read(address);
    const newMemory = 0xff & (oldMemory + 1);
    this.cpuBus.write(address, newMemory);
    this.updateStatusNegative(newMemory);
    this.updateStatusZero(newMemory);
    this.pc = 0xffff & (this.pc + 3);
    this.cyclesRemaining = 6;
  }

  private inc_abs_x() { // Increment Memory by One (absolute,X)
    const address = this.getAddressAbsX();
    const oldMemory = this.cpuBus.read(address);
    const newMemory = 0xff & (oldMemory + 1);
    this.cpuBus.write(address, newMemory);
    this.updateStatusNegative(newMemory);
    this.updateStatusZero(newMemory);
    this.pc = 0xffff & (this.pc + 3);
    this.cyclesRemaining = 7;
  }

  private inx() { // Increment Index X by One
    const newX = 0xff & (this.x + 1);
    this.x = newX;
    this.updateStatusNegative(newX);
    this.updateStatusZero(newX);
    this.pc = 0xffff & (this.pc + 1);
    this.cyclesRemaining = 2;
  }

  private iny() { // Increment Index Y by One
    const newY = 0xff & (this.y + 1);
    this.y = newY;
    this.updateStatusNegative(newY);
    this.updateStatusZero(newY);
    this.pc = 0xffff & (this.pc + 1);
    this.cyclesRemaining = 2;
  }

  private jmp_abs() { // Jump to New Location (absolute)
    const address = this.getAddressAbs();
    // console.log('[JMP(ABS)] Jumping to absolute: ' + formatHex(address, 4));
    this.pc = address;
    this.cyclesRemaining = 3;
  }

  private jmp_ind() { // Jump to New Location (indirect)
    const address = this.getAddressInd();
    // console.log('[JMP(IND)] Jumping to indirect: ' + formatHex(address, 4));
    this.pc = address;
    this.cyclesRemaining = 5;
  }

  private jsr() { // Jump to New Location Saving Return Address
    const returnAddress = this.pc + 2;
    const returnAddressHi = (returnAddress & 0xff00) >> 8; // ???
    const returnAddressLo = (returnAddress & 0x00ff);
    this.pushStack(returnAddressHi);
    this.pushStack(returnAddressLo);
    // console.log('[JSR] Jumping to: ' + formatHex(this.getAddressAbs(), 4) + ', return address: ' + formatHex(this.pc + 3, 4));
    this.pc = this.getAddressAbs();
    this.cyclesRemaining = 6;
  }

  private lda_imm() { // Load Accumulator with Memory (immediate)
    const newA = this.cpuBus.read(this.getAddressImm());
    this.a = newA;
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 2;
  }

  private lda_zpg() { // Load Accumulator with Memory (zeropage)
    const newA = this.cpuBus.read(this.getAddressZpg());
    this.a = newA;
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 3;
  }

  private lda_zpg_x() { // Load Accumulator with Memory (zeropage,X)
    const newA = this.cpuBus.read(this.getAddressZpgX());
    this.a = newA;
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 4;
  }

  private lda_abs() { // Load Accumulator with Memory (absolute)
    const newA = this.cpuBus.read(this.getAddressAbs());
    this.a = newA;
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 3);
    this.cyclesRemaining = 4;
  }

  private lda_abs_x() { // Load Accumulator with Memory (absolute,X)
    const newA = this.cpuBus.read(this.getAddressAbsX());
    this.a = newA;
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 3);
    this.cyclesRemaining = 4 + this.additionalCycles;
  }

  private lda_abs_y() { // Load Accumulator with Memory (absolute,Y)
    const newA = this.cpuBus.read(this.getAddressAbsY());
    this.a = newA;
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 3);
    this.cyclesRemaining = 4 + this.additionalCycles;
  }

  private lda_x_ind() { // Load Accumulator with Memory (X,indirect)
    const newA = this.cpuBus.read(this.getAddressXInd());
    this.a = newA;
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 6;
  }

  private lda_ind_y() { // Load Accumulator with Memory (indirect,Y)
    const newA = this.cpuBus.read(this.getAddressIndY());
    this.a = newA;
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 5 + this.additionalCycles;
  }

  private ldx_imm() { // Load Index X with Memory (immediate)
    const newX = this.cpuBus.read(this.getAddressImm());
    this.x = newX;
    this.updateStatusNegative(newX);
    this.updateStatusZero(newX);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 2;
  }

  private ldx_zpg() { // Load Index X with Memory (zeropage)
    const newX = this.cpuBus.read(this.getAddressZpg());
    this.x = newX;
    this.updateStatusNegative(newX);
    this.updateStatusZero(newX);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 3;
  }

  private ldx_zpg_y() { // Load Index X with Memory (zeropage,Y)
    const newX = this.cpuBus.read(this.getAddressZpgY());
    this.x = newX;
    this.updateStatusNegative(newX);
    this.updateStatusZero(newX);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 4;
  }

  private ldx_abs() { // Load Index X with Memory (absolute)
    const newX = this.cpuBus.read(this.getAddressAbs());
    this.x = newX;
    this.updateStatusNegative(newX);
    this.updateStatusZero(newX);
    this.pc = 0xffff & (this.pc + 3);
    this.cyclesRemaining = 4;
  }

  private ldx_abs_y() { // Load Index X with Memory (absolute,Y)
    const newX = this.cpuBus.read(this.getAddressAbsY());
    this.x = newX;
    this.updateStatusNegative(newX);
    this.updateStatusZero(newX);
    this.pc = 0xffff & (this.pc + 3);
    this.cyclesRemaining = 4 + this.additionalCycles;
  }

  private ldy_imm() { // Load Index Y with Memory (immediate)
    const newY = this.cpuBus.read(this.getAddressImm());
    this.y = newY;
    this.updateStatusNegative(newY);
    this.updateStatusZero(newY);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 2;
  }

  private ldy_zpg() { // Load Index Y with Memory (zeropage)
    const newY = this.cpuBus.read(this.getAddressZpg());
    this.y = newY;
    this.updateStatusNegative(newY);
    this.updateStatusZero(newY);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 3;
  }

  private ldy_zpg_x() { // Load Index Y with Memory (zeropage,X)
    const newY = this.cpuBus.read(this.getAddressZpgX());
    this.y = newY;
    this.updateStatusNegative(newY);
    this.updateStatusZero(newY);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 4;
  }

  private ldy_abs() { // Load Index Y with Memory (absolute)
    const newY = this.cpuBus.read(this.getAddressAbs());
    this.y = newY;
    this.updateStatusNegative(newY);
    this.updateStatusZero(newY);
    this.pc = 0xffff & (this.pc + 3);
    this.cyclesRemaining = 4;
  }

  private ldy_abs_x() { // Load Index Y with Memory (absolute,X)
    const newY = this.cpuBus.read(this.getAddressAbsX());
    this.y = newY;
    this.updateStatusNegative(newY);
    this.updateStatusZero(newY);
    this.pc = 0xffff & (this.pc + 3);
    this.cyclesRemaining = 4 + this.additionalCycles;
  }

  private lsr_a() { // Shift On Bit Right (accumulator)
    const oldA = this.a;
    const newA = 0xff & (oldA >> 1);
    this.a = newA;
    this.statusCarry = !!(oldA & (1 << 0));
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 1);
    this.cyclesRemaining = 2;
  }

  private lsr_zpg() { // Shift On Bit Right (zeropage)
    const address = this.getAddressZpg();
    const oldMemory = this.cpuBus.read(address);
    const newMemory = 0xff & (oldMemory >> 1);
    this.cpuBus.write(address, newMemory);
    this.statusCarry = !!(oldMemory & (1 << 0));
    this.updateStatusNegative(newMemory);
    this.updateStatusZero(newMemory);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 5;
  }

  private lsr_zpg_x() { // Shift On Bit Right (zeropage,X)
    const address = this.getAddressZpgX();
    const oldMemory = this.cpuBus.read(address);
    const newMemory = 0xff & (oldMemory >> 1);
    this.cpuBus.write(address, newMemory);
    this.statusCarry = !!(oldMemory & (1 << 0));
    this.updateStatusNegative(newMemory);
    this.updateStatusZero(newMemory);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 6;
  }

  private lsr_abs() { // Shift On Bit Right (absolute)
    const address = this.getAddressAbs();
    const oldMemory = this.cpuBus.read(address);
    const newMemory = 0xff & (oldMemory >> 1);
    this.cpuBus.write(address, newMemory);
    this.statusCarry = !!(oldMemory & (1 << 0));
    this.updateStatusNegative(newMemory);
    this.updateStatusZero(newMemory);
    this.pc = 0xffff & (this.pc + 3);
    this.cyclesRemaining = 6;
  }

  private lsr_abs_x() { // Shift On Bit Right (absolute,X)
    const address = this.getAddressAbsX();
    const oldMemory = this.cpuBus.read(address);
    const newMemory = 0xff & (oldMemory >> 1);
    this.cpuBus.write(address, newMemory);
    this.statusCarry = !!(oldMemory & (1 << 0));
    this.updateStatusNegative(newMemory);
    this.updateStatusZero(newMemory);
    this.pc = 0xffff & (this.pc + 3);
    this.cyclesRemaining = 7 + this.additionalCycles;
  }

  private nop() { // No Operation
    this.pc = 0xffff & (this.pc + 1);
    this.cyclesRemaining = 2;
  }

  private ora_imm() { // OR Memory with Accumulator (immediate)
    const memory = this.cpuBus.read(this.getAddressImm());
    const newA = this.a | memory;
    this.a = newA;
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 2;
  }

  private ora_zpg() { // OR Memory with Accumulator (zeropage)
    const memory = this.cpuBus.read(this.getAddressZpg());
    const newA = this.a | memory;
    this.a = newA;
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 3;
  }

  private ora_zpg_x() { // OR Memory with Accumulator (zeropage,X)
    const memory = this.cpuBus.read(this.getAddressZpgX());
    const newA = this.a | memory;
    this.a = newA;
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 4;
  }

  private ora_abs() { // OR Memory with Accumulator (absolute)
    const memory = this.cpuBus.read(this.getAddressAbs());
    const newA = this.a | memory;
    this.a = newA;
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 3);
    this.cyclesRemaining = 4;
  }

  private ora_abs_x() { // OR Memory with Accumulator (absolute,X)
    const memory = this.cpuBus.read(this.getAddressAbsX());
    const newA = this.a | memory;
    this.a = newA;
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 3);
    this.cyclesRemaining = 4 + this.additionalCycles;
  }

  private ora_abs_y() { // OR Memory with Accumulator (absolute,Y)
    const memory = this.cpuBus.read(this.getAddressAbsY());
    const newA = this.a | memory;
    this.a = newA;
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 3);
    this.cyclesRemaining = 4 + this.additionalCycles;
  }

  private ora_x_ind() { // OR Memory with Accumulator (X,indirect)
    const memory = this.cpuBus.read(this.getAddressXInd());
    const newA = this.a | memory;
    this.a = newA;
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 6;
  }

  private ora_ind_y() { // OR Memory with Accumulator (indirect,Y)
    const memory = this.cpuBus.read(this.getAddressIndY());
    const newA = this.a | memory;
    this.a = newA;
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 5 + this.additionalCycles;
  }

  private pha() { // Push Accumulator on Stack
    this.pushStack(this.a);
    this.pc = 0xffff & (this.pc + 1);
    this.cyclesRemaining = 3;
  }

  private php() { // Push Processor Status on Stack
    this.pushStack(this.p);
    // this.statusBreak = false;
    this.pc = 0xffff & (this.pc + 1);
    this.cyclesRemaining = 3;
  }

  private pla() { // Pull Accumulator from Stack
    const newA = this.pullStack();
    this.a = newA;
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 1);
    this.cyclesRemaining = 4;
  }

  private plp() { // Pull Processor Status from Stack
    const newP = this.pullStack();
    this.p = newP;
    this.pc = 0xffff & (this.pc + 1);
    this.cyclesRemaining = 4;
  }

  private rol_a() { // Rotate One Bit Left (accumulator)
    const oldA = this.a;
    const carry = this.statusCarry ? 0b00000001 : 0b00000000;
    const newA = 0xff & ((oldA << 1) | carry);
    this.a = newA;
    this.statusCarry = !!(oldA & (1 << 7));
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 1);
    this.cyclesRemaining = 2;
  }

  private rol_zpg() { // Rotate One Bit Left (zeropage)
    const address = this.getAddressZpg();
    const oldMemory = this.cpuBus.read(address);
    const carry = this.statusCarry ? 0b00000001 : 0b00000000;
    const newMemory = 0xff & ((oldMemory << 1) | carry);
    this.cpuBus.write(address, newMemory);
    this.statusCarry = !!(oldMemory & (1 << 7));
    this.updateStatusNegative(newMemory);
    this.updateStatusZero(newMemory);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 5;
  }

  private rol_zpg_x() { // Rotate One Bit Left (zeropage,X)
    const address = this.getAddressZpgX();
    const oldMemory = this.cpuBus.read(address);
    const carry = this.statusCarry ? 0b00000001 : 0b00000000;
    const newMemory = 0xff & ((oldMemory << 1) | carry);
    this.cpuBus.write(address, newMemory);
    this.statusCarry = !!(oldMemory & (1 << 7));
    this.updateStatusNegative(newMemory);
    this.updateStatusZero(newMemory);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 6;
  }

  private rol_abs() { // Rotate One Bit Left (absolute)
    const address = this.getAddressAbs();
    const oldMemory = this.cpuBus.read(address);
    const carry = this.statusCarry ? 0b00000001 : 0b00000000;
    const newMemory = 0xff & ((oldMemory << 1) | carry);
    this.cpuBus.write(address, newMemory);
    this.statusCarry = !!(oldMemory & (1 << 7));
    this.updateStatusNegative(newMemory);
    this.updateStatusZero(newMemory);
    this.pc = 0xffff & (this.pc + 3);
    this.cyclesRemaining = 6;
  }

  private rol_abs_x() { // Rotate One Bit Left (absolute,X)
    const address = this.getAddressAbsX();
    const oldMemory = this.cpuBus.read(address);
    const carry = this.statusCarry ? 0b00000001 : 0b00000000;
    const newMemory = 0xff & ((oldMemory << 1) | carry);
    this.cpuBus.write(address, newMemory);
    this.statusCarry = !!(oldMemory & (1 << 7));
    this.updateStatusNegative(newMemory);
    this.updateStatusZero(newMemory);
    this.pc = 0xffff & (this.pc + 3);
    this.cyclesRemaining = 7;
  }

  private ror_a() { // Rotate One Bit Right (accumulator)
    const oldA = this.a;
    const carry = this.statusCarry ? 0b10000000 : 0b00000000;
    const newA = 0xff & ((oldA >> 1) | carry);
    this.a = newA;
    this.statusCarry = !!(oldA & (1 << 0));
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 1);
    this.cyclesRemaining = 2;
  }

  private ror_zpg() { // Rotate One Bit Right (zeropage)
    const address = this.getAddressZpg();
    const oldMemory = this.cpuBus.read(address);
    const carry = this.statusCarry ? 0b10000000 : 0b00000000;
    const newMemory = 0xff & ((oldMemory >> 1) | carry);
    this.cpuBus.write(address, newMemory);
    this.statusCarry = !!(oldMemory & (1 << 0));
    this.updateStatusNegative(newMemory);
    this.updateStatusZero(newMemory);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 5;
  }

  private ror_zpg_x() { // Rotate One Bit Right (zeropage,X)
    const address = this.getAddressZpgX();
    const oldMemory = this.cpuBus.read(address);
    const carry = this.statusCarry ? 0b10000000 : 0b00000000;
    const newMemory = 0xff & ((oldMemory >> 1) | carry);
    this.cpuBus.write(address, newMemory);
    this.statusCarry = !!(oldMemory & (1 << 0));
    this.updateStatusNegative(newMemory);
    this.updateStatusZero(newMemory);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 6;
  }

  private ror_abs() { // Rotate One Bit Right (absolute)
    const address = this.getAddressAbs();
    const oldMemory = this.cpuBus.read(address);
    const carry = this.statusCarry ? 0b10000000 : 0b00000000;
    const newMemory = 0xff & ((oldMemory >> 1) | carry);
    this.cpuBus.write(address, newMemory);
    this.statusCarry = !!(oldMemory & (1 << 0));
    this.updateStatusNegative(newMemory);
    this.updateStatusZero(newMemory);
    this.pc = 0xffff & (this.pc + 3);
    this.cyclesRemaining = 6;
  }

  private ror_abs_x() { // Rotate One Bit Right (absolute,X)
    const address = this.getAddressAbsX();
    const oldMemory = this.cpuBus.read(address);
    const carry = this.statusCarry ? 0b10000000 : 0b00000000;
    const newMemory = 0xff & ((oldMemory >> 1) | carry);
    this.cpuBus.write(address, newMemory);
    this.statusCarry = !!(oldMemory & (1 << 0));
    this.updateStatusNegative(newMemory);
    this.updateStatusZero(newMemory);
    this.pc = 0xffff & (this.pc + 3);
    this.cyclesRemaining = 7;
  }

  private rti() { // Return from Interrupt
    const newP = this.pullStack();
    const returnAddressLo = this.pullStack();
    const returnAddressHi = this.pullStack() << 8;
    const returnAddress = returnAddressLo | returnAddressHi;
    this.p = newP;
    this.statusInterruptDisable = false;
    this.pc = returnAddress;
    this.cyclesRemaining = 6;
  }

  private rts() { // Return from Subroutine
    const returnAddressLo = this.pullStack();
    const returnAddressHi = this.pullStack() << 8;
    const returnAddress = returnAddressLo | returnAddressHi;
    this.pc = 0xffff & (returnAddress + 1);
    // console.log('[RTS] Returning to: ' + formatHex(this.pc, 4));
    this.cyclesRemaining = 6;
  }

  private sbc_imm() { // Subtract Memory from Accumulator with Borrow (immediate)
    const memory = this.cpuBus.read(this.getAddressImm());
    const memoryComplement = memory ^ 0xff;
    const oldA = this.a;
    const intermediateA = memoryComplement + oldA + this.statusCarry;
    const newA = 0xff & intermediateA;
    this.a = newA;
    this.statusCarry = intermediateA > 0xff;
    this.statusOverflow = !!((intermediateA ^ oldA) & (intermediateA ^ memoryComplement) & (1 << 7));
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 2;
  }

  private sbc_zpg() { // Subtract Memory from Accumulator with Borrow (zeropage)
    const memory = this.cpuBus.read(this.getAddressZpg());
    const memoryComplement = memory ^ 0xff;
    const oldA = this.a;
    const intermediateA = memoryComplement + oldA + this.statusCarry;
    const newA = 0xff & intermediateA;
    this.a = newA;
    this.statusCarry = intermediateA > 0xff;
    this.statusOverflow = !!((intermediateA ^ oldA) & (intermediateA ^ memoryComplement) & (1 << 7));
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 3;
  }

  private sbc_zpg_x() { // Subtract Memory from Accumulator with Borrow (zeropage,X)
    const memory = this.cpuBus.read(this.getAddressZpgX());
    const memoryComplement = memory ^ 0xff;
    const oldA = this.a;
    const intermediateA = memoryComplement + oldA + this.statusCarry;
    const newA = 0xff & intermediateA;
    this.a = newA;
    this.statusCarry = intermediateA > 0xff;
    this.statusOverflow = !!((intermediateA ^ oldA) & (intermediateA ^ memoryComplement) & (1 << 7));
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 4;
  }

  private sbc_abs() { // Subtract Memory from Accumulator with Borrow (absolute)
    const memory = this.cpuBus.read(this.getAddressAbs());
    const memoryComplement = memory ^ 0xff;
    const oldA = this.a;
    const intermediateA = memoryComplement + oldA + this.statusCarry;
    const newA = 0xff & intermediateA;
    this.a = newA;
    this.statusCarry = intermediateA > 0xff;
    this.statusOverflow = !!((intermediateA ^ oldA) & (intermediateA ^ memoryComplement) & (1 << 7));
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 3);
    this.cyclesRemaining = 4;
  }

  private sbc_abs_x() { // Subtract Memory from Accumulator with Borrow (absolute,X)
    const memory = this.cpuBus.read(this.getAddressAbsX());
    const memoryComplement = memory ^ 0xff;
    const oldA = this.a;
    const intermediateA = memoryComplement + oldA + this.statusCarry;
    const newA = 0xff & intermediateA;
    this.a = newA;
    this.statusCarry = intermediateA > 0xff;
    this.statusOverflow = !!((intermediateA ^ oldA) & (intermediateA ^ memoryComplement) & (1 << 7));
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 3);
    this.cyclesRemaining = 4 + this.additionalCycles;
  }

  private sbc_abs_y() { // Subtract Memory from Accumulator with Borrow (absolute,Y)
    const memory = this.cpuBus.read(this.getAddressAbsY());
    const memoryComplement = memory ^ 0xff;
    const oldA = this.a;
    const intermediateA = memoryComplement + oldA + this.statusCarry;
    const newA = 0xff & intermediateA;
    this.a = newA;
    this.statusCarry = intermediateA > 0xff;
    this.statusOverflow = !!((intermediateA ^ oldA) & (intermediateA ^ memoryComplement) & (1 << 7));
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 3);
    this.cyclesRemaining = 4 + this.additionalCycles;
  }

  private sbc_x_ind() { // Subtract Memory from Accumulator with Borrow (X,indirect)
    const memory = this.cpuBus.read(this.getAddressXInd());
    const memoryComplement = memory ^ 0xff;
    const oldA = this.a;
    const intermediateA = memoryComplement + oldA + this.statusCarry;
    const newA = 0xff & intermediateA;
    this.a = newA;
    this.statusCarry = intermediateA > 0xff;
    this.statusOverflow = !!((intermediateA ^ oldA) & (intermediateA ^ memoryComplement) & (1 << 7));
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 6;
  }

  private sbc_ind_y() { // Subtract Memory from Accumulator with Borrow (indirect,Y)
    const memory = this.cpuBus.read(this.getAddressIndY());
    const memoryComplement = memory ^ 0xff;
    const oldA = this.a;
    const intermediateA = memoryComplement + oldA + this.statusCarry;
    const newA = 0xff & intermediateA;
    this.a = newA;
    this.statusCarry = intermediateA > 0xff;
    this.statusOverflow = !!((intermediateA ^ oldA) & (intermediateA ^ memoryComplement) & (1 << 7));
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 5 + this.additionalCycles;
  }

  private sec() { // Set Carry Flag
    this.statusCarry = 1;
    this.pc = 0xffff & (this.pc + 1);
    this.cyclesRemaining = 2;
  }

  private sed() { // Set Decimal Flag
    this.statusDecimal = 1;
    this.pc = 0xffff & (this.pc + 1);
    this.cyclesRemaining = 2;
  }

  private sei() { // Set Interrupt Disable Status
    this.statusInterruptDisable = 1;
    this.pc = 0xffff & (this.pc + 1);
    this.cyclesRemaining = 2;
  }

  private sta_zpg() { // Store Accumulator in Memory (zeropage)
    this.cpuBus.write(this.getAddressZpg(), this.a);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 3;
  }

  private sta_zpg_x() { // Store Accumulator in Memory (zeropage,X)
    this.cpuBus.write(this.getAddressZpgX(), this.a);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 4;
  }

  private sta_abs() { // Store Accumulator in Memory (absolute)
    this.cpuBus.write(this.getAddressAbs(), this.a);
    this.pc = 0xffff & (this.pc + 3);
    this.cyclesRemaining = 4;
  }

  private sta_abs_x() { // Store Accumulator in Memory (absolute,X)
    this.cpuBus.write(this.getAddressAbsX(), this.a);
    this.pc = 0xffff & (this.pc + 3);
    this.cyclesRemaining = 5;
  }

  private sta_abs_y() { // Store Accumulator in Memory (absolute,Y)
    this.cpuBus.write(this.getAddressAbsY(), this.a);
    this.pc = 0xffff & (this.pc + 3);
    this.cyclesRemaining = 5;
  }

  private sta_x_ind() { // Store Accumulator in Memory (X,indirect)
    this.cpuBus.write(this.getAddressXInd(), this.a);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 6;
  }

  private sta_ind_y() { // Store Accumulator in Memory (indirect,Y)
    this.cpuBus.write(this.getAddressIndY(), this.a);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 6;
  }

  private stx_zpg() { // Store Index X in Memory (zeropage)
    this.cpuBus.write(this.getAddressZpg(), this.x);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 3;
  }

  private stx_zpg_y() { // Store Index X in Memory (zeropage,Y)
    this.cpuBus.write(this.getAddressZpgY(), this.x);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 4;
  }

  private stx_abs() { // Store Index X in Memory (absolute)
    this.cpuBus.write(this.getAddressAbs(), this.x);
    this.pc = 0xffff & (this.pc + 3);
    this.cyclesRemaining = 4;
  }

  private sty_zpg() { // Store Index Y in Memory (zeropage)
    this.cpuBus.write(this.getAddressZpg(), this.y);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 3;
  }

  private sty_zpg_x() { // Store Index Y in Memory (zeropage,X)
    this.cpuBus.write(this.getAddressZpgX(), this.y);
    this.pc = 0xffff & (this.pc + 2);
    this.cyclesRemaining = 4;
  }

  private sty_abs() { // Store Index Y in Memory (absolute)
    this.cpuBus.write(this.getAddressAbs(), this.y);
    this.pc = 0xffff & (this.pc + 3);
    this.cyclesRemaining = 4;
  }

  private tax() { // Transfer Accumulator to Index X
    const newX = this.a;
    this.x = newX;
    this.updateStatusNegative(newX);
    this.updateStatusZero(newX);
    this.pc = 0xffff & (this.pc + 1);
    this.cyclesRemaining = 2;
  }

  private tay() { // Transfer Accumulator to Index Y
    const newY = this.a;
    this.y = newY;
    this.updateStatusNegative(newY);
    this.updateStatusZero(newY);
    this.pc = 0xffff & (this.pc + 1);
    this.cyclesRemaining = 2;
  }

  private tsx() { // Transfer Stack Pointer to Index X
    const newX = this.sp;
    this.x = newX;
    this.updateStatusNegative(newX);
    this.updateStatusZero(newX);
    this.pc = 0xffff & (this.pc + 1);
    this.cyclesRemaining = 2;
  }

  private txa() { // Transfer Index X to Accumulator
    const newA = this.x;
    this.a = newA;
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 1);
    this.cyclesRemaining = 2;
  }

  private txs() { // Transfer Index X to Stack Register
    const newSP = this.x;
    this.sp = newSP;
    this.pc = 0xffff & (this.pc + 1);
    this.cyclesRemaining = 2;
  }

  private tya() { // Transfer Index Y to Accumulator
    const newA = this.y;
    this.a = newA;
    this.updateStatusNegative(newA);
    this.updateStatusZero(newA);
    this.pc = 0xffff & (this.pc + 1);
    this.cyclesRemaining = 2;
  }
}
