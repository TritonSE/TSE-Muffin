import { App } from "@slack/bolt";

import {
  composeFinalMessage,
  composeInitialMessage,
  composeReminderMessage,
  composeSummaryMessage,
  REACTION_TO_GROUP_STATUS,
} from "../dialogue";
import env from "../env";
import { Group, GroupModel, GroupStatus } from "../models/GroupModel";
import { Round, RoundModel } from "../models/RoundModel";
import { createGroups } from "../services/group";
import {
  mockAddReactions,
  mockSendDirectMessage,
  mockSendMessage,
} from "../services/mock-slack";
import {
  addReactions,
  sendDirectMessage,
  sendMessage,
} from "../services/slack";
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
  abstract includeReactionMenu: boolean;

  async run() {
    const rounds = await RoundModel.find({
      [this.roundMessagesSentField]: false,
      [this.roundMessagesScheduledForField]: { $lte: new Date() },
    });

    const send = env.MOCK_SCHEDULED_MESSAGES
      ? mockSendDirectMessage
      : sendDirectMessage;

    // 300 messages per minute = 5 messages per second.
    // https://api.slack.com/methods/chat.postMessage#rate_limiting
    const sendRateLimit = new IntervalTimer(1000 / 5);

    const react = env.MOCK_SCHEDULED_MESSAGES ? mockAddReactions : addReactions;
    const reactions = Object.keys(REACTION_TO_GROUP_STATUS);

    // 50 reactions per minute, but we also need to account for the number of
    // reactions we are adding at a time.
    // https://api.slack.com/methods/reactions.add
    const reactBatchesPerMinute = 50 / reactions.length;
    const reactRateLimit = new IntervalTimer(60000 / reactBatchesPerMinute);

    const lines: string[] = [];
    let errored = false;
    for (const round of rounds) {
      const groups = await GroupModel.find({
        round: round._id,
        [this.groupMessageTimestampField]: null,
        // Only send messages if we don't know whether they met yet.
        status: { $in: ["unknown", "scheduled"] },
      });
      for (const group of groups) {
        // Send the scheduled message.

        const text = this.composeMessage(round.channel, group.userIds);

        await sendRateLimit.wait();
        const sendResult = await send(this.app, group.userIds, text);

        let line = `send round=${round._id.toString()} group=${group._id.toString()}: `;
        if (sendResult.ok) {
          const [dmChannel, timestamp] = sendResult.value;
          line += `${dmChannel} ${timestamp}`;

          if (group.channel === undefined) {
            group.channel = dmChannel;
          }
          group[this.groupMessageTimestampField] = timestamp;
          await group.save();
        } else {
          line += sendResult.error;
          errored = true;
        }
        lines.push(line);

        // Add reaction menu if appropriate for this message.
        // We don't have retry logic here because it seems too complex to be
        // worth the effort.
        if (sendResult.ok && this.includeReactionMenu) {
          const [dmChannel, timestamp] = sendResult.value;

          await reactRateLimit.wait();
          const reactResult = await react(
            this.app,
            dmChannel,
            timestamp,
            reactions
          );

          if (reactResult.ok) {
            lines.push("react ok");
          } else {
            lines.push(`react err: ${reactResult.error.join(" ")}`);
            errored = true;
          }
        }
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
  readonly includeReactionMenu = false;
}

class ReminderMessageJob extends ScheduledDirectMessageJob {
  static description = "send reminder messages to groups";
  readonly roundMessagesSentField = "allReminderMessagesSent";
  readonly roundMessagesScheduledForField = "reminderMessageScheduledFor";
  readonly groupMessageTimestampField = "reminderMessageTimestamp";
  readonly composeMessage = composeReminderMessage;
  readonly includeReactionMenu = true;
}

class FinalMessageJob extends ScheduledDirectMessageJob {
  static description = "send final messages to groups";
  readonly roundMessagesSentField = "allFinalMessagesSent";
  readonly roundMessagesScheduledForField = "finalMessageScheduledFor";
  readonly groupMessageTimestampField = "finalMessageTimestamp";
  readonly composeMessage = composeFinalMessage;
  readonly includeReactionMenu = true;
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
