import Koa from 'koa';
import fetch from 'node-fetch';
import { RouterContext } from '../router';
import { getRateLimit } from '../lib/_rateLimit';
import { createChannel, channels } from '../server';

// Initialize rate-limit state values
let rateLimit = getRateLimit();

export const fetchChannel = async (channelId: string) => {
  return fetch(`https://discord.com/api/v7/channels/${channelId}`, {
    headers: {
      authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
    },
    method: 'GET',
  });
};

export const fetchServerUsers = async (guildId: string) => {
  return fetch(
    `https://discord.com/api/v7//guilds/${guildId}/members?limit=1000`,
    {
      headers: {
        authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
      },
      method: 'GET',
    },
  );
};

export const channelHandler = async (ctx: RouterContext, next: Koa.Next) => {
  const { channel: channelId } = ctx.request.query;
  let responseBody: any;
  if (!rateLimit.canFetch(ctx.logger)) {
    ctx.logger.warn('Rate limit exceeded');
    ctx.response.body = 'Rate limit exceeded';
    ctx.response.status = 429;
    return next();
  } else {
    // ctx.logger.debug("Fetching channel");
    const result = await fetchChannel(channelId);
    rateLimit.update(result, ctx.logger);
    responseBody = await result.json();

    const { guild_id } = responseBody;
    const userResult = await fetchServerUsers(guild_id);
    const users = await userResult.json();
    ctx.logger.warn(
      'Users: %o',
      users.map((u: any) => {
        return { username: u.user.username, nick: u.nick };
      }),
    );
    if (!channels[channelId]) {
      createChannel(channelId);
    }
    users.forEach((guildUser: any) => {
      const { nick, user } = guildUser;
      channels[channelId].users[user.id] = nick;
    });
    ctx.logger.warn('Guild users: %o', channels[channelId].users);
  }
  ctx.response.body = responseBody;
  ctx.response.status = 200;
  return next();
};
