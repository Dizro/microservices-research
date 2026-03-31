FROM node:18-alpine
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
# 3004 - REST API, 50051 - gRPC
EXPOSE 3004 50051
CMD ["node", "server.js"]