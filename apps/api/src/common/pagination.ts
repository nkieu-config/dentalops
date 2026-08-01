import { AppException } from "./app.exception"

export interface Page<T> {
  items: T[]
  nextCursor: string | null
}

export interface CursorPosition {
  createdAt: Date
  id: string
}

export function encodeCursor(pos: CursorPosition): string {
  return Buffer.from(`${pos.createdAt.toISOString()}|${pos.id}`).toString("base64url")
}

export function decodeCursor(cursor: string | undefined): CursorPosition | null {
  if (!cursor) return null
  const raw = Buffer.from(cursor, "base64url").toString("utf8")
  const [iso, id] = raw.split("|")
  const createdAt = iso ? new Date(iso) : new Date(NaN)
  if (!id || Number.isNaN(createdAt.getTime())) {
    throw new AppException(400, "INVALID_CURSOR", "Malformed pagination cursor")
  }
  return { createdAt, id }
}

export function toPage<T extends { createdAt: Date; id: string }>(
  rows: T[],
  limit: number
): Page<T> {
  const items = rows.slice(0, limit)
  const last = items[items.length - 1]
  return {
    items,
    nextCursor: rows.length > limit && last ? encodeCursor(last) : null
  }
}
