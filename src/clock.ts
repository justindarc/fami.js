type ClockCallback = () => void;

interface TickCallback {
  callback: ClockCallback;
  divider: number;
  cyclesRemaining: number;
}

export class Clock {
  private isRunning = false;

  yieldInterval: number;
  yieldDelay: number;

  tickCallbacks: TickCallback[];

  constructor(yieldInterval: number = 100, yieldDelay: number = 0) {
    this.yieldInterval = yieldInterval;
    this.yieldDelay = yieldDelay;

    this.tickCallbacks = [];
  }

  addTickCallback(callback: ClockCallback, divider: number, offset: number = 0) {
    const cyclesRemaining = (divider + (offset || 0)) % divider;
    this.tickCallbacks.push({ callback, divider, cyclesRemaining });
  }

  start() {
    this.isRunning = true;
    this.tick();
  }

  stop() {
    this.isRunning = false;
  }

  step() {
    for (let tickCallback of this.tickCallbacks) {
      if (tickCallback.cyclesRemaining <= 0) {
        tickCallback.callback();
      }

      tickCallback.cyclesRemaining = (tickCallback.divider + tickCallback.cyclesRemaining - 1) % tickCallback.divider;
    }
  }

  private tick() {
    if (!this.isRunning) {
      return;
    }

    for (var i = 0; i < this.yieldInterval; i++) {
      this.step();
    }

    setTimeout(() => this.tick(), this.yieldDelay);
  }
}
