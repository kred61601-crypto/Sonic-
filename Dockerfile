ARG RUNTIME_IMAGE=quay.io/officialkango/queen-riam-runtime:latest
FROM ${RUNTIME_IMAGE}
WORKDIR /app
COPY . .
RUN rm -rf .git .env && npm install --omit=dev --legacy-peer-deps --ignore-scripts
RUN npm rebuild sharp || true
RUN mkdir -p tmp session data
ENV NODE_ENV=production
ENV PORT=10000
ENV BOT_INTERNAL_PORT=10001
EXPOSE 10000
CMD ["node", "web.js"]
