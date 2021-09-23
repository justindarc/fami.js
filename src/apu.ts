import { Addressable } from './addressable';

export class APU extends Addressable {
  private static START_ADDRESS = 0x4000;
  private static END_ADDRESS   = 0x4015;

  constructor() {
    super(APU.START_ADDRESS, APU.END_ADDRESS);
  }
}
