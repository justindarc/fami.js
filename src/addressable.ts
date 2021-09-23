export class Addressable {
  startAddress: Address;
  endAddress: Address;
  mirrorEndAddress: Address;

  actualSize: Word;
  mirrorSize: Word;

  constructor(startAddress: Address, endAddress: Address, mirrorEndAddress?: Address) {
    this.startAddress = startAddress;
    this.endAddress = endAddress;
    this.mirrorEndAddress = mirrorEndAddress ?? endAddress;

    const actualSize = endAddress - startAddress + 1;
    this.actualSize = actualSize;

    const mirrorSize = this.mirrorEndAddress - startAddress + 1;
    this.mirrorSize = mirrorSize;
  }

  read(address: Address): Byte {
    return 0x00;
  }

  write(address: Address, byte: Byte) {
    // NOOP
  }
}
