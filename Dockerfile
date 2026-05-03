FROM node:24-alpine

WORKDIR /app
COPY . .

EXPOSE 4173
CMD ["node", "server.js"]
