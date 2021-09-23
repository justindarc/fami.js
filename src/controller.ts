import { Addressable } from './addressable';

export interface ControllerOptions {

}

export class Controller extends Addressable {
  private static STATUS_FLAG_BIT_RIGHT  = 7;
  private static STATUS_FLAG_BIT_LEFT   = 6;
  private static STATUS_FLAG_BIT_DOWN   = 5;
  private static STATUS_FLAG_BIT_UP     = 4;
  private static STATUS_FLAG_BIT_START  = 3;
  private static STATUS_FLAG_BIT_SELECT = 2;
  private static STATUS_FLAG_BIT_B      = 1;
  private static STATUS_FLAG_BIT_A      = 0;

  options: ControllerOptions;

  private currentIndex = 0;

  private statusRight = false;
  private statusLeft = false;
  private statusDown = false;
  private statusUp = false;
  private statusStart = false;
  private statusSelect = false;
  private statusB = false;
  private statusA = false;

  constructor(startAddress: Address, endAddress: Address, options: ControllerOptions) {
    super(startAddress, endAddress);

    this.options = options;
  }

  read(address: Address): Byte {
    let result: Byte = 0x00;

    switch (this.currentIndex) {
      case Controller.STATUS_FLAG_BIT_RIGHT:
        result |= this.statusRight ? 0x01 : 0x00;
        break;
      case Controller.STATUS_FLAG_BIT_LEFT:
        result |= this.statusLeft ? 0x01 : 0x00;
        break;
      case Controller.STATUS_FLAG_BIT_DOWN:
        result |= this.statusDown ? 0x01 : 0x00;
        break;
      case Controller.STATUS_FLAG_BIT_UP:
        result |= this.statusUp ? 0x01 : 0x00;
        break;
      case Controller.STATUS_FLAG_BIT_START:
        result |= this.statusStart ? 0x01 : 0x00;
        break;
      case Controller.STATUS_FLAG_BIT_SELECT:
        result |= this.statusSelect ? 0x01 : 0x00;
        break;
      case Controller.STATUS_FLAG_BIT_B:
        result |= this.statusB ? 0x01 : 0x00;
        break;
      case Controller.STATUS_FLAG_BIT_A:
        result |= this.statusA ? 0x01 : 0x00;
        break;
    }

    this.currentIndex = (this.currentIndex + 1) % 8;

    return result;
  }
}
