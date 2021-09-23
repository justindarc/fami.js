import { Addressable } from './addressable';
import { EventEmitter } from './events';

export class Bus extends EventEmitter {
  private addressables: Addressable[];
  
  constructor(addressables: Addressable[]) {
    super();

    this.addressables = addressables;

    this.reset();
  }

  reset() {
    // Sort addressables high to low.
    this.addressables = this.addressables.sort((a, b) => b.startAddress - a.startAddress);
  }

  read(address: Address): Byte {
    // Find first addressable where the specified address is within the mapped range.
    for (let addressable of this.addressables) {
      if (address < addressable.startAddress) {
        continue;
      }

      return addressable.read(address);
    }
  }

  write(address: Address, byte: Byte) {
    // Find first addressable where the specified address is within the mapped range.
    for (let addressable of this.addressables) {
      if (address < addressable.startAddress) {
        continue;
      }

      addressable.write(address, byte);
      return;
    }
  }
}
