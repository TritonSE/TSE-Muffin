import { HydratedDocument, model, Schema } from "mongoose";

interface Round {
  /** ID of the channel containing the users to match up. */
  channel: string;

  /** Whether users have been matched into groups. */
  matchingCompleted: boolean;

  /**
   * When to match users into groups and send the initial message for each
   * group.
   */
  matchingScheduledFor: Date;

  /** When to send the reminder message for each group. */
  reminderMessageScheduledFor: Date;

  /** When to send the final message for each group. */
  finalMessageScheduledFor: Date;

  /** When to send the message summarizing how many groups met. */
  summaryMessageScheduledFor: Date;
}

const RoundSchema = new Schema<Round>({
  channel: {
    type: String,
    required: true,
    immutable: true,
  },
  matchingCompleted: {
    type: Boolean,
    required: true,
  },
  matchingScheduledFor: {
    type: Date,
    required: true,
  },
  reminderMessageScheduledFor: {
    type: Date,
    required: true,
  },
  finalMessageScheduledFor: {
    type: Date,
    required: true,
  },
  summaryMessageScheduledFor: {
    type: Date,
    required: true,
  },
});

RoundSchema.index({ matchingCompleted: 1, matchingScheduledFor: 1 });

RoundSchema.index({ channel: 1, matchingScheduledFor: 1 });

const RoundModel = model("Round", RoundSchema);
type RoundDocument = HydratedDocument<Round>;

export { Round, RoundModel, RoundDocument };
