import { Addressable } from './addressable';

export class RAM extends Addressable {
  private bytes: Uint8Array;

  constructor(startAddress: Address, endAddress: Address, mirrorEndAddress?: Address) {
    super(startAddress, endAddress, mirrorEndAddress);

    const bytes = new Uint8Array(this.actualSize);
    this.bytes = bytes;
  }

  read(address: Address): Byte {
    const index = (address - this.startAddress) % this.actualSize;
    return 0xff & this.bytes[index];
  }

  write(address: Address, byte: Byte) {
    const index = (address - this.startAddress) % this.actualSize;
    this.bytes[index] = byte;
  }
}
