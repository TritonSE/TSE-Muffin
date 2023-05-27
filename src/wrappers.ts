import { App } from "@slack/bolt";

import { Result } from "./result";

/**
 * If a Slack Web API method throws an error, catch it and return the response
 * attached to the error. This way, the caller can use the `ok` field to
 * determine if an error occurred, instead of using try/catch.
 */
async function catchWrapper<R extends { ok: boolean }>(
  promise: Promise<R>
): Promise<R> {
  try {
    return await promise;
  } catch (e) {
    console.error(e);
    if (
      typeof e === "object" &&
      e !== null &&
      "data" in e &&
      typeof e.data === "object" &&
      e.data !== null &&
      "ok" in e.data &&
      typeof e.data.ok === "boolean"
    ) {
      // This is probably a response object.
      return e.data as R;
    }
    throw e;
  }
}

/**
 * @returns Ok with this bot's user ID, or Err with an error message.
 */
async function getBotUserId(app: App): Promise<Result<string, string>> {
  const response = await catchWrapper(app.client.auth.test());

  if (!response.ok) {
    return Result.Err(response.error ?? "unknown error");
  }

  if (typeof response.user_id !== "string") {
    const message = "user_id is missing from auth.test response";
    console.error(message, response);
    return Result.Err(message);
  }

  return Result.Ok(response.user_id);
}

/**
 * @returns Ok with the user IDs, or Err with an error message.
 */
async function getConversationMembers(
  app: App,
  channel: string
): Promise<Result<string[], string>> {
  const members: string[] = [];

  let cursor: string | undefined = undefined;
  do {
    const promise = app.client.conversations.members({
      channel,
      cursor,
    });
    const response = await catchWrapper(promise);

    if (!response.ok) {
      return Result.Err(response.error ?? "unknown error");
    }

    if (response.members) {
      members.push(...response.members);
    }

    cursor = response.response_metadata?.next_cursor;
  } while (cursor);

  return Result.Ok(members);
}

type User = Exclude<
  Awaited<ReturnType<App["client"]["users"]["info"]>>["user"],
  undefined
>;

/**
 * @returns Ok with the user object, or Err with an error message.
 */
async function getUserInfo(
  app: App,
  user: string
): Promise<Result<User, string>> {
  const response = await catchWrapper(app.client.users.info({ user }));

  if (!response.ok) {
    return Result.Err(response.error ?? "unknown error");
  }

  if (response.user === undefined) {
    const message = "user is missing from users.info response";
    console.error(message, response);
    return Result.Err(message);
  }

  return Result.Ok(response.user);
}

/**
 * @returns Ok with no value, or Err with an error message.
 */
async function addReaction(
  app: App,
  channel: string,
  timestamp: string,
  reaction: string
): Promise<Result<undefined, string>> {
  const response = await catchWrapper(
    app.client.reactions.add({
      channel,
      timestamp,
      name: reaction,
    })
  );

  if (!response.ok) {
    return Result.Err(response.error ?? "unknown error");
  }

  return Result.Ok(undefined);
}

/**
 * @returns Ok with the message timestamp, or Err with an error message.
 */
async function sendMessage(
  app: App,
  channel: string,
  text: string
): Promise<Result<string, string>> {
  const response = await catchWrapper(
    app.client.chat.postMessage({
      channel,
      text,
    })
  );

  if (!response.ok) {
    return Result.Err(response.error ?? "unknown error");
  }

  if (response.ts === undefined) {
    const message = "ts is missing from chat.postMessage response";
    console.error(message, response);
    return Result.Err(message);
  }

  return Result.Ok(response.ts);
}

/**
 * @returns Ok with no value, or Err with an error message.
 */
async function editMessage(
  app: App,
  channel: string,
  timestamp: string,
  text: string
): Promise<Result<undefined, string>> {
  const response = await catchWrapper(
    app.client.chat.update({
      channel,
      ts: timestamp,
      text,
    })
  );

  if (!response.ok) {
    return Result.Err(response.error ?? "unknown error");
  }

  return Result.Ok(undefined);
}

/**
 * @returns Ok with the channel ID, or Err with an error message.
 */
async function openDirectMessage(
  app: App,
  userIds: string[]
): Promise<Result<string, string>> {
  const response = await catchWrapper(
    app.client.conversations.open({
      users: userIds.join(","),
    })
  );

  if (!response.ok) {
    return Result.Err(response.error ?? "unknown error");
  }

  if (response.channel?.id === undefined) {
    const message = "channel.id is missing from conversations.open response";
    console.error(message, response);
    return Result.Err(message);
  }

  return Result.Ok(response.channel.id);
}

/**
 * @returns Ok with the message timestamp, or Err with an error message.
 */
async function sendDirectMessage(
  app: App,
  userIds: string[],
  text: string
): Promise<Result<string, string>> {
  const channelResult = await openDirectMessage(app, userIds);
  if (!channelResult.ok) {
    return Result.Err(`failed to open direct message: ${channelResult.error}`);
  }

  const sendMessageResult = await sendMessage(app, channelResult.value, text);
  if (!sendMessageResult.ok) {
    return Result.Err(`failed to send message: ${sendMessageResult.error}`);
  }

  return Result.Ok(sendMessageResult.value);
}

export {
  addReaction,
  editMessage,
  getBotUserId,
  getConversationMembers,
  getUserInfo,
  sendMessage,
  sendDirectMessage,
};
