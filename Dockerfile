FROM node:20

WORKDIR /app

ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci
COPY . .

EXPOSE 8080
CMD npm start
