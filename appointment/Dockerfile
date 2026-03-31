FROM node:18-alpine
WORKDIR /app

COPY package.json .
RUN npm install

COPY payment.proto .
COPY . .

EXPOSE 3003
CMD ["node", "index.js"]