import { FleetError } from "../../src/domain.js";
/** Synthetic harness FIFO. Production deployments use durable RouteCapacity. */
export class InferenceQueue {
  active = 0;
  private waiting: Array<() => void> = [];
  constructor(private capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 16) throw Error("INVALID_INFERENCE_CAPACITY");
  }
  run<T>(signal: AbortSignal, operation: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const cancel = () => {
        const index = this.waiting.indexOf(start);
        if (index >= 0) this.waiting.splice(index, 1);
        reject(new FleetError("MODEL_QUEUE_CANCELLED", true));
      };
      const start = () => {
        signal.removeEventListener("abort", cancel);
        if (signal.aborted) {
          cancel();
          return;
        }
        this.active++;
        const finish = () => {
          this.active--;
          this.pump();
        };
        try {
          Promise.resolve(operation()).then(
            (value) => {
              finish();
              resolve(value);
            },
            (error) => {
              finish();
              reject(error);
            },
          );
        } catch (error) {
          finish();
          reject(error);
        }
      };
      if (signal.aborted) {
        cancel();
        return;
      }
      signal.addEventListener("abort", cancel, { once: true });
      this.waiting.push(start);
      this.pump();
    });
  }
  private pump() {
    while (this.active < this.capacity && this.waiting.length) this.waiting.shift()?.();
  }
}
