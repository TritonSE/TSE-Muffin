import { App } from "@slack/bolt";

import {
  composeFinalMessage,
  composeInitialMessage,
  composeReminderMessage,
  composeSummaryMessage,
} from "../dialogue";
import env from "../env";
import { Group, GroupModel, GroupStatus } from "../models/GroupModel";
import { Round, RoundModel } from "../models/RoundModel";
import { createGroups } from "../services/group";
import { mockSendDirectMessage, mockSendMessage } from "../services/mock-slack";
import { sendDirectMessage, sendMessage } from "../services/slack";
import { Result } from "../util/result";
import { IntervalTimer } from "../util/timer";

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

abstract class ScheduledDirectMessageJob extends Job {
  abstract roundMessagesSentField: keyof Round & `all${string}MessagesSent`;
  abstract roundMessagesScheduledForField: keyof Round &
    `${string}ScheduledFor`;
  abstract groupMessageTimestampField: keyof Group &
    `${string}MessageTimestamp`;
  abstract composeMessage: (channel: string, userIds: string[]) => string;

  async run() {
    const rounds = await RoundModel.find({
      [this.roundMessagesSentField]: false,
      [this.roundMessagesScheduledForField]: { $lte: new Date() },
    });

    const send = env.MOCK_SCHEDULED_MESSAGES
      ? mockSendDirectMessage
      : sendDirectMessage;
    const rateLimit = new IntervalTimer(200);

    const lines: string[] = [];
    let errored = false;
    for (const round of rounds) {
      const groups = await GroupModel.find({
        round: round._id,
        [this.groupMessageTimestampField]: null,
      });
      for (const group of groups) {
        const text = this.composeMessage(round.channel, group.userIds);

        await rateLimit.wait();
        const sendResult = await send(this.app, group.userIds, text);

        let line = `round=${round._id.toString()} group=${group._id.toString()}: `;
        if (sendResult.ok) {
          const timestamp = sendResult.value;
          line += timestamp;
          group[this.groupMessageTimestampField] = timestamp;
          await group.save();
        } else {
          line += sendResult.error;
          errored = true;
        }
        lines.push(line);
      }
    }

    const joined = lines.join("\n");
    return errored ? Result.Err(joined) : Result.Ok(joined);
  }
}

class InitialMessageJob extends ScheduledDirectMessageJob {
  static description = "send initial messages to groups";
  readonly roundMessagesSentField = "allInitialMessagesSent";
  readonly roundMessagesScheduledForField = "matchingScheduledFor";
  readonly groupMessageTimestampField = "initialMessageTimestamp";
  readonly composeMessage = composeInitialMessage;
}

class ReminderMessageJob extends ScheduledDirectMessageJob {
  static description = "send reminder messages to groups";
  readonly roundMessagesSentField = "allReminderMessagesSent";
  readonly roundMessagesScheduledForField = "reminderMessageScheduledFor";
  readonly groupMessageTimestampField = "reminderMessageTimestamp";
  readonly composeMessage = composeReminderMessage;
}

class FinalMessageJob extends ScheduledDirectMessageJob {
  static description = "send final messages to groups";
  readonly roundMessagesSentField = "allFinalMessagesSent";
  readonly roundMessagesScheduledForField = "finalMessageScheduledFor";
  readonly groupMessageTimestampField = "finalMessageTimestamp";
  readonly composeMessage = composeFinalMessage;
}

class SummaryMessageJob extends Job {
  static description = "send summary messages to channels";

  async run() {
    const rounds = await RoundModel.find({
      summaryMessageTimestamp: null,
      summaryMessageScheduledFor: { $lte: new Date() },
    });

    const send = env.MOCK_SCHEDULED_MESSAGES ? mockSendMessage : sendMessage;
    const rateLimit = new IntervalTimer(200);

    const lines: string[] = [];
    let errored = false;
    for (const round of rounds) {
      const aggregated: { _id: GroupStatus; count: number }[] =
        await GroupModel.aggregate([
          { $match: { round: round._id } },
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ]);

      const counts = aggregated.reduce<Record<GroupStatus, number>>(
        (acc, o) => ({ ...acc, [o._id]: o.count }),
        {
          unknown: 0,
          met: 0,
          did_not_meet: 0,
          scheduled: 0,
        }
      );

      const met = counts.met + counts.scheduled;
      const total = met + counts.unknown + counts.did_not_meet;

      const text = composeSummaryMessage(met, total);

      await rateLimit.wait();
      const sendResult = await send(this.app, round.channel, text);

      let line = `round=${round._id.toString()}: `;
      if (sendResult.ok) {
        const timestamp = sendResult.value;
        line += timestamp;
        round.summaryMessageTimestamp = timestamp;
        await round.save();
      } else {
        line += sendResult.error;
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

const allJobs = [
  MatchingJob,
  InitialMessageJob,
  ReminderMessageJob,
  FinalMessageJob,
  SummaryMessageJob,
] satisfies JobClass[];

export { allJobs };
