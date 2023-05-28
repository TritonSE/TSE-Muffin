import { App } from "@slack/bolt";

import { RoundModel } from "../models/RoundModel";
import { createGroups } from "../services/group";
import { Result } from "../util/result";

abstract class Job {
  constructor(protected readonly app: App) {}

  abstract run(): Promise<Result<string, string>>;
}

class MatchingJob extends Job {
  static description =
    "match users into groups for rounds that are scheduled to start";

  async run() {
    let roundsToStart;
    try {
      roundsToStart = await RoundModel.find({
        matchingCompleted: false,
        matchingScheduledFor: { $lte: new Date() },
      });
    } catch (e) {
      console.error(e);
      return Result.Err(
        "unknown error occurred while querying rounds that are scheduled to start (check logs)"
      );
    }

    const lines: string[] = [];
    let errored = false;
    for (const round of roundsToStart) {
      let line = `${round._id.toString()}: `;
      const result = await createGroups(this.app, round);

      if (result.ok) {
        line += "ok";
      } else {
        line += result.error;
        errored = true;
      }

      lines.push(line);
    }

    const joined = lines.join("\n");
    return errored ? Result.Err(joined) : Result.Ok(joined);
  }
}

interface JobClass {
  description: string;
}

const allJobs = [MatchingJob] satisfies JobClass[];

export { allJobs };
