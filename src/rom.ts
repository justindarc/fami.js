import { Addressable } from './addressable';
import { formatHex } from './util';

export class ROM extends Addressable {
  private bytes: Uint8Array;

  constructor(startAddress: Address, endAddress: Address, mirrorEndAddress?: Address) {
    super(startAddress, endAddress, mirrorEndAddress);

    const bytes = new Uint8Array(this.actualSize);
    this.bytes = bytes;
  }

  load(startAddress: Address, bytes: Uint8Array) {
    this.actualSize = bytes.byteLength;

    for (let i = 0; i < bytes.byteLength; i++) {
      this.setByte(startAddress + i, bytes[i]);
    }
  }

  read(address: Address): Byte {
    const index = (address - this.startAddress) % this.actualSize;
    return 0xff & this.bytes[index];
  }

  write(address: Address, byte: Byte) {
    // console.warn(`[ROM] Attempting to write byte ${formatHex(byte, 2)} to ROM address ${formatHex(address, 4)}`);
    console.warn(`[ROM] Attempting to write byte ${formatHex(byte, 2)} to ROM`);
    // this.setByte(address, byte);
  }

  private setByte(address: Address, byte: Byte) {
    const index = (address - this.startAddress) % this.actualSize;
    this.bytes[index] = byte;
  }
}
