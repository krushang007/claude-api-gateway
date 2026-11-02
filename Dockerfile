FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY pricing.mjs ./
COPY db.mjs ./
COPY server.mjs ./
COPY dashboard.html ./

RUN mkdir -p /app/data

ENV PORT=8765
ENV DATA_DIR=/app/data

EXPOSE 8765

CMD ["node", "server.mjs"]

