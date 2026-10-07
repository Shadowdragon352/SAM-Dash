FROM node:22-alpine AS frontend
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client ./
# The repository's Axios client selects /api/v1 in production.
ENV VITE_NODE_ENV=production
ENV VITE_API_URL=/api/v1
RUN npm run build

FROM nginx:stable-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend /app/client/dist /usr/share/nginx/html
EXPOSE 8080
