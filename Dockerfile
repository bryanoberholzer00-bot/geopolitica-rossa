FROM node:20-alpine

WORKDIR /app

# Copy package.json only and install production dependencies
COPY package.json ./
RUN npm install --omit=dev --ignore-scripts

# Copy the rest of the app (including pre-built dist/)
COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
