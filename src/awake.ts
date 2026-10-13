import { type ChildProcess, spawn } from "node:child_process";

// Process-scoped assertions, never a global power-setting change. -s applies on AC.
export class AwakeGuard {
  private child?: ChildProcess;
  constructor(
    private enabled: boolean,
    private platform = process.platform,
    private launch: typeof spawn = spawn,
  ) {}
  update(running: boolean) {
    if (!this.enabled || this.platform !== "darwin") return;
    if (!running) {
      this.close();
      return;
    }
    if (this.child) return;
    const child = this.launch("/usr/bin/caffeinate", ["-i", "-s", "-w", String(process.pid)], { stdio: "ignore" });
    this.child = child;
    const ended = () => {
      if (this.child === child) this.child = undefined;
    };
    child.once("exit", ended);
    child.once("error", ended);
  }
  close() {
    const child = this.child;
    this.child = undefined;
    child?.kill("SIGTERM");
  }
}
