import { App } from "@slack/bolt";

import { Result } from "./result";

let cachedBotUserId: string | null = null;

async function getBotUserId(app: App): Promise<string> {
  if (cachedBotUserId !== null) {
    return cachedBotUserId;
  }

  const response = await app.client.auth.test();

  if (response.ok && typeof response.user_id === "string") {
    cachedBotUserId = response.user_id;
    return cachedBotUserId;
  }

  console.error(response);
  if (!response.ok) {
    throw new Error(`auth.test failed: ${response.error}`);
  } else {
    throw new Error("auth.test response has no user_id");
  }
}

async function getConversationMembers(
  app: App,
  channel: string
): Promise<Result<string[], string>> {
  const members: string[] = [];

  let cursor: string | undefined = undefined;

  while (true) {
    let response: Awaited<ReturnType<typeof app.client.conversations.members>>;
    try {
      response = await app.client.conversations.members({
        channel,
        cursor,
      });
    } catch (e: any) {
      console.error(e);
      response = e.data;
    }

    if (!response.ok) {
      return Result.Err(response.error || "unknown error");
    }

    if (response.members) {
      members.push(...response.members);
    }

    const nextCursor = response.response_metadata?.next_cursor;
    if (!nextCursor) {
      break;
    }
    cursor = nextCursor;
  }

  return Result.Ok(members);
}

async function addReaction(
  app: App,
  channel: string,
  timestamp: string,
  name: string
): Promise<Result<undefined, string>> {
  let response: Awaited<ReturnType<typeof app.client.reactions.add>>;
  try {
    response = await app.client.reactions.add({
      channel,
      timestamp,
      name,
    });
  } catch (e: any) {
    console.error(e);
    response = e.data;
  }

  if (!response.ok) {
    return Result.Err(response.error || "unknown error");
  }

  return Result.Ok(undefined);
}

export { addReaction, getBotUserId, getConversationMembers };
