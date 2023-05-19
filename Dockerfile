FROM node:20

WORKDIR /app

ENV NODE_ENV=development
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 8080
CMD npm start
