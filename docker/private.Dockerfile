FROM node:22-alpine AS frontend
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client ./
ENV VITE_API_URL=/api/v1 VITE_PRIVATE_DEMO=true
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node server ./server
COPY --from=frontend --chown=node:node /app/client/dist ./client/dist
USER node
EXPOSE 5000
CMD ["node", "server/src/index.js"]
