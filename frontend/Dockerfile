FROM node:20-alpine AS builder

WORKDIR /app

# Public client config is inlined into the JavaScript bundle by `next build`, so it must be
# provided here as build args; setting these only on the running container has no effect.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SENTIMENT_API_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_SENTIMENT_API_URL=$NEXT_PUBLIC_SENTIMENT_API_URL \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

RUN missing=""; \
    for name in NEXT_PUBLIC_API_URL NEXT_PUBLIC_SENTIMENT_API_URL NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY; do \
      eval "value=\${$name}"; [ -n "$value" ] || missing="$missing $name"; \
    done; \
    if [ -n "$missing" ]; then echo "Missing required build args:$missing (pass --build-arg NAME=value)" >&2; exit 1; fi

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built application from builder
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/package.json ./

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
