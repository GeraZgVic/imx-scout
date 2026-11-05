FROM mcr.microsoft.com/playwright:v1.58.2-jammy

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

RUN npm run client:build

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

USER pwuser

CMD ["sh", "./docker-entrypoint.sh"]
