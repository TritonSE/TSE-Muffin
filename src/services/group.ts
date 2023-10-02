import { App } from "@slack/bolt";
import mongoose from "mongoose";

import { GroupModel } from "../models/GroupModel";
import { RoundDocument } from "../models/RoundModel";
import { Result } from "../util/result";

import { cacheProvider } from "./config-cache";
import { getConversationMembers } from "./slack";

/**
 * @returns Ok with the users that should be matched in this channel, or Err
 * with an error message.
 */
async function getUsersToMatch(
  app: App,
  channel: string,
): Promise<Result<string[], string>> {
  const getMembersResult = await getConversationMembers(app, channel);
  if (!getMembersResult.ok) {
    return getMembersResult;
  }

  // Ensure that we don't pair anyone with this bot.
  const botUserId = (await cacheProvider.get(app)).botUserId;
  const filtered = getMembersResult.value.filter((user) => user !== botUserId);

  return Result.Ok(filtered);
}

/**
 * @returns A shuffled shallow copy of the input array.
 */
function shuffled<T>(values: T[]): T[] {
  const shuffled = [...values];

  for (let size = shuffled.length; size > 1; size--) {
    const i = size - 1;
    const j = Math.floor(Math.random() * size);

    const temp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = temp;
  }

  return shuffled;
}

/**
 * Pair users randomly, including a group of three if there is an odd number, or
 * a group of one if there is only one user.
 */
function makeGroups(users: string[]): string[][] {
  users = shuffled(users);

  const groups: string[][] = [];

  // Make as many pairs as possible.
  let i = 0;
  while (i + 1 < users.length) {
    groups.push([users[i], users[i + 1]]);
    i += 2;
  }

  // Is there an unpaired person?
  if (i < users.length) {
    if (groups.length === 0) {
      // Only one person - put them in a group by themself.
      groups.push([users[i]]);
    } else {
      // Add the person to the first group.
      groups[0].push(users[i]);
    }
  }

  return groups;
}

/**
 * Create groups for a round by matching up the eligible users in the specified
 * channel.
 */
async function createGroups(
  app: App,
  round: RoundDocument,
): Promise<Result<undefined, string>> {
  const usersResult = await getUsersToMatch(app, round.channel);
  if (!usersResult.ok) {
    return Result.Err(`could not get users to match: ${usersResult.error}`);
  }

  const groups = makeGroups(usersResult.value);

  await mongoose.connection.transaction(async () => {
    await GroupModel.insertMany(
      groups.map((userIds) => ({
        round: round._id,
        userIds,
        status: "unknown",
      })),
    );

    round.matchingCompleted = true;
    await round.save();
  });

  return Result.Ok(undefined);
}

export { createGroups };
