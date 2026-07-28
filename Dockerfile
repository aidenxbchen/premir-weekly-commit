# Multi-stage build: compile web + server, ship a single slim runtime image
# that serves both the API and the built frontend from one process.

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm install --omit=dev --workspace server
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/web/dist ./web/dist

EXPOSE 3000
CMD ["node", "server/dist/index.js"]
