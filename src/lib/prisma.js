const { PrismaClient } = require("@prisma/client");

const globalForPrisma = globalThis;

const prisma = globalForPrisma.__imxPrisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__imxPrisma = prisma;
}

module.exports = prisma;
