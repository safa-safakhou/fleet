import { FleetError } from "../domain.js";

/** Process-local execution slots. Durable claims remain the cross-process authority. */
export class WorkerPool {
  private readonly active = new Set<Promise<unknown>>();
  private closed = false;
  constructor(private readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 16)
      throw new FleetError("INVALID_WORKER_CAPACITY", true);
  }
  get hasCapacity() {
    return !this.closed && this.active.size < this.capacity;
  }
  run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.closed) return Promise.reject(new FleetError("WORKER_POOL_CLOSED", true));
    if (!this.hasCapacity) return Promise.reject(new FleetError("WORKER_POOL_FULL", true));
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((done, failed) => {
      resolve = done;
      reject = failed;
    });
    const completion = { promise, resolve, reject };
    this.active.add(completion.promise);
    const finish = () => this.active.delete(completion.promise);
    try {
      Promise.resolve(operation()).then(
        (value) => {
          finish();
          completion.resolve(value);
        },
        (error) => {
          finish();
          completion.reject(error);
        },
      );
    } catch (error) {
      finish();
      completion.reject(error);
    }
    return completion.promise;
  }
  close() {
    this.closed = true;
  }
  async drain() {
    await Promise.allSettled([...this.active]);
  }
}
