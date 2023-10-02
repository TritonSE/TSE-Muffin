import { HydratedDocument, model, Schema } from "mongoose";

interface Round {
  /** ID of the channel containing the users to match up. */
  channel: string;

  /**
   * When to match users into groups and send the initial message for each
   * group.
   */
  matchingScheduledFor: Date;

  /** Whether users have been matched into groups. */
  matchingCompleted: boolean;

  /** Whether initial messages have been sent to every group. */
  allInitialMessagesSent: boolean;

  /** When to send the reminder message for each group. */
  reminderMessageScheduledFor: Date;

  /** Whether reminder messages have been sent to every group. */
  allReminderMessagesSent: boolean;

  /** When to send the final message for each group. */
  finalMessageScheduledFor: Date;

  /** Whether final messages have been sent to every group. */
  allFinalMessagesSent: boolean;

  /** When to send the message summarizing how many groups met. */
  summaryMessageScheduledFor: Date;

  /** Timestamp of the summary message, if it has been sent. */
  summaryMessageTimestamp?: string;
}

const RoundSchema = new Schema<Round>({
  channel: {
    type: String,
    required: true,
    immutable: true,
  },
  matchingScheduledFor: {
    type: Date,
    required: true,
  },
  matchingCompleted: {
    type: Boolean,
    required: true,
  },
  allInitialMessagesSent: {
    type: Boolean,
    required: true,
  },
  reminderMessageScheduledFor: {
    type: Date,
    required: true,
  },
  allReminderMessagesSent: {
    type: Boolean,
    required: true,
  },
  finalMessageScheduledFor: {
    type: Date,
    required: true,
  },
  allFinalMessagesSent: {
    type: Boolean,
    required: true,
  },
  summaryMessageScheduledFor: {
    type: Date,
    required: true,
  },
  summaryMessageTimestamp: {
    type: String,
    required: false,
  },
});

const indexes: { [K in keyof Round]?: 1 }[] = [
  // Used to determine which rounds to run matching for.
  { matchingCompleted: 1, matchingScheduledFor: 1 },

  // Used to determine what messages should be sent next.
  { allInitialMessagesSent: 1, matchingScheduledFor: 1 },
  { allReminderMessagesSent: 1, reminderMessageScheduledFor: 1 },
  { allFinalMessagesSent: 1, reminderMessageScheduledFor: 1 },
  { summaryMessageTimestamp: 1, summaryMessageScheduledFor: 1 },

  // Used to get the most recent round in a channel, to determine the start date
  // when scheduling the next round.
  { channel: 1, matchingScheduledFor: 1 },
];
indexes.forEach((index) => RoundSchema.index(index));

const RoundModel = model("Round", RoundSchema);
type RoundDocument = HydratedDocument<Round>;

export { Round, RoundModel, RoundDocument };
