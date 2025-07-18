# syntax = docker/dockerfile:1

FROM oven/bun:1

LABEL fly_launch_runtime="Bun"

# Bun app lives here
WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy package files
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install

# Copy application code
COPY . .

# Start the server
CMD ["bun", "run", "src/index.ts"]
