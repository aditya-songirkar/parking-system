# ---------- Stage 1: compile the C++ backend for Linux ----------
FROM gcc:13-bookworm AS cpp-build
WORKDIR /src
COPY main.cpp .
RUN g++ -O2 -std=c++17 -static-libstdc++ -static-libgcc -o parking_app main.cpp

# ---------- Stage 2: Node.js middleware + frontend ----------
FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    PARKING_BIN=/app/parking_app

COPY package*.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY public ./public
COPY --from=cpp-build /src/parking_app ./parking_app

# parking_data.txt lives here (mounted as a volume in Kubernetes)
RUN mkdir -p /data && chown -R node:node /data /app
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
