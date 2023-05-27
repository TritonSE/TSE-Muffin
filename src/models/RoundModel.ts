import { HydratedDocument, model, Schema } from "mongoose";

interface Round {
  /** When to send the initial message for each group. */
  initialMessageScheduledFor: Date;

  /** When to send the reminder message for each group. */
  reminderMessageScheduledFor: Date;

  /** When to send the final message for each group. */
  finalMessageScheduledFor: Date;
}

const RoundSchema = new Schema<Round>({
  initialMessageScheduledFor: {
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
});

const RoundModel = model("Round", RoundSchema);
type RoundDocument = HydratedDocument<Round>;

export { RoundModel, RoundDocument };
