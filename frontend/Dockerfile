# ── Stage 1: Build ──
FROM node:20-alpine AS build
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy everything (simpler, avoids missing file issues)
COPY . .

# Install dependencies (not frozen, let pnpm resolve)
RUN pnpm install --shamefully-hoist

# Build UI library first, then the app
RUN pnpm --filter @amafin/ui build && pnpm --filter @amafin/app build

# ── Stage 2: Serve with nginx ──
FROM nginx:alpine
COPY --from=build /app/apps/amafin/dist /usr/share/nginx/html/react
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
