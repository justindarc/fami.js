import { Addressable } from './addressable';

export class DisabledIO extends Addressable {
  private static START_ADDRESS = 0x4018;
  private static END_ADDRESS   = 0x401f;

  constructor() {
    super(DisabledIO.START_ADDRESS, DisabledIO.END_ADDRESS);
  }
}
