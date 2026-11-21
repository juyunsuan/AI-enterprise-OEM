FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY protocol ./protocol
RUN npm ci --omit=dev || npm install --omit=dev
COPY src ./src
ENV DSH_SERVER_PORT=8081 DSH_SERVER_HOST=0.0.0.0 DSH_SERVER_DATA_FILE=/data/state.json
EXPOSE 8081
CMD ["npx", "tsx", "src/main.ts"]
