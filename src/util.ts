export function compareBytes(a: Uint8Array, b: Uint8Array): boolean {
  const aLength = a.byteLength;
  const bLength = b.byteLength;

  if (aLength !== bLength) {
    return false;
  }

  for (var i = 0; i < aLength; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }

  return true;
}

export function formatBinary(value: number, size: number): string {
  let string = value.toString(2);
  while (string.length < size) {
    string = '0' + string;
  }
  return '0b' + string;
}

export function formatHex(value: number, size: number): string {
  let string = value.toString(16);
  while (string.length < size) {
    string = '0' + string;
  }
  return '0x' + string;
}

export function getBit(byte: Byte, index: number): Bit {
  return !(byte & 1 << index) ? 0 : 1;
}

export function setBit(byte: Byte, index: number, bit: Bit | boolean): Byte {
  if (bit) {
    return byte | (1 << index);
  }

  return byte & ~(1 << index);
}

export function isSamePage(a: Address, b: Address): boolean {
  return (a & 0xff00) === (b & 0xff00);
}

export function padStringRight(string: string, size: number, character: Character = ' '): string {
  let paddedString = string;
  while (paddedString.length < size) {
    paddedString += character;
  }
  return paddedString;
}

export function stringToBytes(string: string): Uint8Array {
  const textEncoder = new TextEncoder();
  return textEncoder.encode(string);
}

export function unsignedByteToSignedByte(byte: Byte): Byte {
  return byte > 127 ? byte - 256 : byte;
}
