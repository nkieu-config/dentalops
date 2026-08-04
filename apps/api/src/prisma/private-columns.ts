import type { Prisma } from "@prisma/client"

export const PRIVATE_COLUMNS = {
  user: { passwordHash: true }
} satisfies Prisma.GlobalOmitConfig
