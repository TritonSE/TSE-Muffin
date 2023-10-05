import { App } from "@slack/bolt";

import { IntervalTimer } from "../util/timer";

import { allJobs } from "./jobs";

class JobRunner {
  timer: IntervalTimer;

  constructor(
    private app: App,
    periodicJobIntervalSec: number,
  ) {
    this.timer = JobRunner.getTimer(periodicJobIntervalSec);
  }

  private static getTimer(periodicJobIntervalSec: number): IntervalTimer {
    const intervalMs = periodicJobIntervalSec * 1000;

    // Round down to the preceding multiple of intervalMs. This ensures that,
    // if the interval is one hour (for example), the intervals are aligned to
    // the start of every hour.
    const startMs = Math.floor(Date.now() / intervalMs) * intervalMs;

    return new IntervalTimer(intervalMs, startMs);
  }

  async run(): Promise<void> {
    console.log(`running scheduled jobs: ${new Date().toISOString()}`);

    for (const cls of allJobs) {
      const job = new cls(this.app);
      console.log(`running job: ${cls.description}`);

      let result;
      try {
        result = await job.run();
      } catch (e) {
        console.error(e);
        console.log("(err)");
        continue;
      }

      if (result.ok) {
        console.log(result.value);
        console.log("(ok)");
      } else {
        console.log(result.error);
        console.log("(err)");
      }
    }
  }
}

export { JobRunner };
