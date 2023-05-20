function formatChannel(channel: string): string {
  return `<#${channel}>`;
}

function parseChannel(channel: string): string {
  const match = /<#([0-9A-Z]+)>/.exec(channel);
  return match !== null ? match[1] : channel;
}

function formatUser(user: string): string {
  return `<@${user}>`;
}

export {
  formatChannel,
  parseChannel,
  formatUser,
}
