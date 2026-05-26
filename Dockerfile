# ---- build stage ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ src/
RUN npm run build

# ---- runtime stage ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist/ dist/
COPY bin/ bin/

EXPOSE 3000
ENV MCP_HTTP_PORT=3000
ENV MCP_HTTP_HOST=0.0.0.0

CMD ["node", "dist/http.js"]
