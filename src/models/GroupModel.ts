import { HydratedDocument, model, Schema, Types } from "mongoose";

const GROUP_STATUSES = ["unknown", "met", "did_not_meet", "scheduled"] as const;
type GroupStatus = (typeof GROUP_STATUSES)[number];

interface Group {
  round: Types.ObjectId;

  /** Slack user IDs of the people in this group. */
  userIds: string[];

  /** Has this group met? */
  status: GroupStatus;

  /**
   * ID of the channel (actually a multi-person direct message) containing the
   * bot and the users in this group.
   *
   * When a user adds a reaction to a message, we need to look up the group
   * corresponding to the message's channel, so we need to store the channel ID
   * to enable this query.
   *
   * We don't actually need to use this for sending messages, since we can use
   * the Slack API to get the channel ID from the list of users.
   *
   * Set after the initial message is sent.
   */
  channel?: string;

  /**
   * Slack timestamp of the initial message.
   *
   * Set after the initial message is sent.
   */
  initialMessageTimestamp?: string;

  /**
   * Slack timestamp of the reminder message.
   *
   * Set after the reminder message is sent.
   */
  reminderMessageTimestamp?: string;

  /**
   * Slack timestamp of the final message.
   *
   * Set after the final message is sent.
   */
  finalMessageTimestamp?: string;
}

const GroupSchema = new Schema<Group>({
  round: {
    type: Schema.Types.ObjectId,
    required: true,
    immutable: true,
    index: true,
  },
  userIds: {
    type: [String],
    required: true,
    immutable: true,
  },
  status: {
    type: String,
    required: true,
    enum: GROUP_STATUSES,
  },
  channel: {
    type: String,
    required: false,
    index: true,
  },
  initialMessageTimestamp: {
    type: String,
    required: false,
  },
  reminderMessageTimestamp: {
    type: String,
    required: false,
  },
  finalMessageTimestamp: {
    type: String,
    required: false,
  },
});

const indexes: { [K in keyof Group]?: 1 | -1 }[] = [
  // Used to determine what scheduled messages should be sent.
  { round: 1, initialMessageTimestamp: 1, status: 1 },
  { round: 1, reminderMessageTimestamp: 1, status: 1 },
  { round: 1, finalMessageTimestamp: 1, status: 1 },
  // Used to find the most recent groups in a particular channel.
  { channel: 1, initialMessageTimestamp: -1 },
];
indexes.forEach((index) => GroupSchema.index(index));

const GroupModel = model("Group", GroupSchema);
type GroupDocument = HydratedDocument<Group>;

export { Group, GroupStatus, GroupModel, GroupDocument };
