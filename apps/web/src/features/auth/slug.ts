export const SLUG_PATTERN = /^[a-z0-9-]{3,40}$/

const MIN_LENGTH = 3
const MAX_LENGTH = 40

export const toSlug = (clinicName: string): string => {
  const candidate = clinicName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_LENGTH)
    .replace(/-+$/g, "")

  return candidate.length >= MIN_LENGTH ? candidate : ""
}
