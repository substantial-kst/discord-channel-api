import Koa, { Context } from 'koa';
import Router from '@koa/router';
import { WithLogger } from './server';
import { messagesHandler } from './handlers/messages';
import { channelHandler } from './handlers/channel';

const routes = {
  users: `/users`,
  channel: '/channel',
  messages: '/messages',
};

export type RouterContext = Koa.ParameterizedContext<any, Context & WithLogger>;

const router = new Router<
  any,
  Koa.ParameterizedContext<any, Context & WithLogger>
>();

const noOpHandler = (ctx: RouterContext) => {
  ctx.status = 200;
};

router.get(routes.users, noOpHandler);
router.get(routes.channel, channelHandler);
router.get(routes.messages, messagesHandler);
router.get('/healthcheck', noOpHandler);

export default router;
