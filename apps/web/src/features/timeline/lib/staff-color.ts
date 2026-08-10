export const STAFF_HUE_COUNT = 6

export const staffHue = (staffId: string): number => {
  let hash = 0
  for (let i = 0; i < staffId.length; i++) {
    hash = (hash * 31 + staffId.charCodeAt(i)) >>> 0
  }
  return hash % STAFF_HUE_COUNT
}
