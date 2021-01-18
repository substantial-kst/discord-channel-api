FROM node:12

RUN mkdir /api
RUN mkdir /api/node_modules

COPY ./node_modules/ /api/node_modules/
COPY ./dist/ /api/

WORKDIR /api

CMD ["node", "./server.js"]
