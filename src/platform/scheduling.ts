/** Retains historical alternating lane priority; each lane owns its unchanged admission check. */
export class DispatchScheduler {
  private preferPlatform = true;
  async dispatch(ports: { legacy(): Promise<boolean>; platform(): Promise<boolean>; hasCapacity(): boolean }) {
    if (this.preferPlatform) {
      if (ports.hasCapacity()) await ports.platform();
      if (ports.hasCapacity()) await ports.legacy();
    } else {
      if (ports.hasCapacity()) await ports.legacy();
      if (ports.hasCapacity()) await ports.platform();
    }
    this.preferPlatform = !this.preferPlatform;
    while (ports.hasCapacity()) {
      if (await ports.platform()) continue;
      if (!(await ports.legacy())) break;
    }
  }
}
