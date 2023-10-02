import { type GroupStatus } from "./models/GroupModel.js";
import { formatChannel, formatEmoji, formatUser } from "./util/formatting.js";

// The order of object keys matters here, because we use the same order when we
// add reactions to messages.
const REACTION_TO_GROUP_STATUS = {
  white_check_mark: "met",
  calendar: "scheduled",
  x: "did_not_meet",
} as const satisfies Record<string, GroupStatus>;

const GROUP_STATUS_TO_REACTION = {
  met: "white_check_mark",
  scheduled: "calendar",
  did_not_meet: "x",
} as const satisfies UnionToIntersection<
  // Janky type stuff to enforce that this object is the same as the one above,
  // but with the keys and values swapped.
  {
    [Reaction in keyof typeof REACTION_TO_GROUP_STATUS]: {
      [K in (typeof REACTION_TO_GROUP_STATUS)[Reaction]]: Reaction;
    };
  }[keyof typeof REACTION_TO_GROUP_STATUS]
>;

// https://stackoverflow.com/a/50375286
type UnionToIntersection<T> = (
  T extends unknown ? (t: T) => void : never
) extends (u: infer U) => void
  ? U
  : never;

const reactionLegend = [
  `${formatEmoji(GROUP_STATUS_TO_REACTION.met)} _yes_`,
  `${formatEmoji(GROUP_STATUS_TO_REACTION.scheduled)} _it's scheduled_`,
  `${formatEmoji(GROUP_STATUS_TO_REACTION.did_not_meet)} _no_`,
].join(", ");

function composeInitialMessage(channel: string, userIds: string[]): string {
  const formattedUsers = userIds.map(formatUser).join(", ");
  const formattedChannel = formatChannel(channel);

  let allOfYouAre;
  switch (userIds.length) {
    case 1:
      allOfYouAre = "you're";
      break;
    case 2:
      allOfYouAre = "both of you are";
      break;
    default:
      allOfYouAre = "all of you are";
      break;
  }

  return [
    `${formattedUsers}: time to meet for muffins! ${formatEmoji("cupcake")}`,
    `_You've been matched up because ${allOfYouAre} in ${formattedChannel}._`,
  ].join("\n\n");
}

function composeReminderMessage(): string {
  return [
    "Hello again! Have you had a chance to meet for muffins yet?",
    reactionLegend,
  ].join("\n\n");
}

function composeFinalMessage(): string {
  return [
    "This round of muffins is ending soon! Were you able to meet?",
    reactionLegend,
  ].join("\n\n");
}

function composeSummaryMessage(met: number, total: number): string {
  let stats;
  if (total === 1) {
    stats = met === 0 ? "the one group did not meet" : "the one group met";
  } else {
    stats = `${met} of the ${total} groups met`;
  }
  return `In the last round of muffins, ${stats}.`;
}

function composeReactionMenuReply(
  user: string,
  status: Exclude<GroupStatus, "unknown">,
): string {
  const youSaid = `${formatUser(user)} said`;

  let description;
  switch (status) {
    case "met":
      description = `you met! ${formatEmoji("cupcake")}`;
      break;
    case "scheduled":
      description = `it's scheduled! ${formatEmoji("cupcake")}`;
      break;
    case "did_not_meet":
      description = "you didn't meet.";
      break;
  }

  return `${youSaid} ${description}`;
}

export {
  REACTION_TO_GROUP_STATUS,
  composeInitialMessage,
  composeReminderMessage,
  composeFinalMessage,
  composeSummaryMessage,
  composeReactionMenuReply,
};
