import { GroupStatus } from "./models/GroupModel";
import { formatChannel, formatEmoji, formatUser } from "./util/formatting";

const REACTION_TO_GROUP_STATUS = {
  white_check_mark: "met",
  calendar: "scheduled",
  x: "did_not_meet",
} as const satisfies Record<string, GroupStatus>;

// Janky type stuff to enforce that this object is the same as the one above,
// but with the keys and values swapped.

// https://stackoverflow.com/a/50375286
type UnionToIntersection<T> = (
  T extends unknown ? (t: T) => void : never
) extends (u: infer U) => void
  ? U
  : never;

const GROUP_STATUS_TO_REACTION: UnionToIntersection<
  {
    [Reaction in keyof typeof REACTION_TO_GROUP_STATUS & string]: {
      [K in (typeof REACTION_TO_GROUP_STATUS)[Reaction]]: Reaction;
    };
  }[keyof typeof REACTION_TO_GROUP_STATUS]
> = {
  met: "white_check_mark",
  scheduled: "calendar",
  did_not_meet: "x",
} as const;

const reactionLegend = [
  `${formatEmoji(GROUP_STATUS_TO_REACTION.met)} _we met_`,
  `${formatEmoji(GROUP_STATUS_TO_REACTION.scheduled)} _it's scheduled_`,
  `${formatEmoji(GROUP_STATUS_TO_REACTION.did_not_meet)} _no_`,
].join(", ");

function composeInitialMessage(channel: string, userIds: string[]): string {
  const formattedUsers = userIds.map(formatUser).join(", ");
  const formattedChannel = formatChannel(channel);
  return [
    `${formattedUsers}: time to meet for muffins!`,
    `_You're receiving this message because you're in the ${formattedChannel} channel._`,
  ].join("\n");
}

function composeReminderMessage(): string {
  return [
    "Have you had a chance to meet for muffins yet?",
    reactionLegend,
  ].join("\n");
}

function composeFinalMessage(): string {
  return [
    "This round of muffins is ending soon! Were you able to meet?",
    reactionLegend,
  ].join("\n");
}

function composeSummaryMessage(met: number, total: number): string {
  let stats;
  if (total === 1) {
    stats = met === 0 ? "the one group did not meet" : "the one group met";
  } else {
    stats = `${met} of the ${total} groups met`;
  }
  return `In the last round of muffins, ${stats}. :cupcake:`;
}

export {
  composeInitialMessage,
  composeReminderMessage,
  composeFinalMessage,
  composeSummaryMessage,
};
