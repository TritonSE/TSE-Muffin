import { App } from "@slack/bolt";
import mongoose from "mongoose";

import env from "../env";
import { Group, GroupModel } from "../models/GroupModel";
import { RoundDocument } from "../models/RoundModel";
import { Result } from "../util/result";

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
  const filtered = getMembersResult.value.filter(
    (user) => user !== env.BOT_USER_ID,
  );

  return Result.ok(filtered);
}

async function getPreviousPairings(channel: string): Promise<Group[]> {
  return GroupModel.find({ channel: channel })
    .sort({ initialMessageTimestamp: -1 })
    .limit(50);
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
function makeGroups(users: string[], prevGroups: Group[]): string[][] {
  if (users.length === 0) {
    return [];
  } else if (users.length <= 3) {
    return [users];
  }

  users = shuffled(users);

  // Attempt to avoid pairing users who have been paired previously.

  const prevPairs = new Set<string>();
  for (const group of prevGroups) {
    for (let i = 0; i < group.userIds.length; i++) {
      for (let j = 0; j < group.userIds.length; j++) {
        if (i != j) {
          prevPairs.add(group.userIds[i] + group.userIds[j]);
        }
      }
    }
  }

  for (let iteration = 0; iteration < 20; iteration++) {
    // Iterate over all pairs. There might be one extra person at the end, who
    // becomes part of a group of three, but we ignore them for simplicity.
    for (let i = 0; i + 1 < users.length; i += 2) {
      if (prevPairs.has(users[i] + users[i + 1])) {
        // Users have been paired before - swap one of them with someone else.
        const src = i + Math.floor(Math.random() * 2);
        const dest = Math.floor(Math.random() * users.length);

        const temp = users[src];
        users[src] = users[dest];
        users[dest] = temp;
      }
    }
  }

  const groups: string[][] = [];

  // Make as many pairs as possible.
  let i = 0;
  while (i + 1 < users.length) {
    groups.push([users[i], users[i + 1]]);
    i += 2;
  }

  // Is there an unpaired person?
  if (i < users.length) {
    // Add the person to the first group.
    groups[0].push(users[i]);
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
    return Result.err(`could not get users to match: ${usersResult.error}`);
  }

  const groups = makeGroups(
    usersResult.value,
    await getPreviousPairings(round.channel),
  );

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

  return Result.ok(undefined);
}

export { createGroups };
