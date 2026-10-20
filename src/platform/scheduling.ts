/** Retains historical alternating lane priority; each lane owns its unchanged admission check. */
export class DispatchScheduler {
  private preferPlatform = true;
  async dispatch(ports: { legacy(): Promise<void>; platform(): Promise<boolean>; hasCapacity(): boolean }) {
    if (this.preferPlatform) {
      await ports.platform();
      await ports.legacy();
    } else {
      await ports.legacy();
      await ports.platform();
    }
    this.preferPlatform = !this.preferPlatform;
    while (ports.hasCapacity() && (await ports.platform())) {}
  }
}
