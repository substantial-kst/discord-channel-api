import Koa from 'koa';
import fetch from 'node-fetch';
import { RouterContext } from '../router';
import { getRateLimit } from '../lib/_rateLimit';

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
  }
  ctx.response.body = responseBody;
  ctx.response.status = 200;
  return next();
};
