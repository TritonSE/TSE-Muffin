import { App } from "@slack/bolt";

import {
  composeReactionMenuReply,
  REACTION_TO_GROUP_STATUS,
} from "../dialogue.js";
import env from "../env.js";
import { GroupModel, type GroupStatus } from "../models/GroupModel.js";
import { mockSendMessage } from "../services/mock-slack.js";
import { sendMessage } from "../services/slack.js";

async function onReactionAddedToMessage(
  app: App,
  user: string,
  channel: string,
  timestamp: string,
  reaction: string,
): Promise<void> {
  console.log(
    `reaction added to message: channel=${channel} timestamp=${timestamp} reaction=${reaction}`,
  );

  let status: GroupStatus | null = null;
  if (reaction in REACTION_TO_GROUP_STATUS) {
    status =
      REACTION_TO_GROUP_STATUS[
        reaction as keyof typeof REACTION_TO_GROUP_STATUS
      ];
  }

  if (status === null) {
    console.log(`reaction not supported by reaction menu: ${reaction}`);
    return;
  }

  const group = await GroupModel.findOne({
    channel,
    $or: [
      { reminderMessageTimestamp: timestamp },
      { finalMessageTimestamp: timestamp },
    ],
  });

  if (group === null) {
    console.log("message does not have a reaction menu");
    return;
  }

  group.status = status;
  await group.save();
  console.log(`updated status: group=${group._id.toString()} status=${status}`);

  const send = env.MOCK_SCHEDULED_MESSAGES ? mockSendMessage : sendMessage;
  const text = composeReactionMenuReply(user, status);
  await send(app, channel, text);
}

export { onReactionAddedToMessage };
