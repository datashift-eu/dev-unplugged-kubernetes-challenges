FROM node:25-alpine

WORKDIR /app

COPY ./src .
RUN npm install

VOLUME /app

CMD node voyager.js