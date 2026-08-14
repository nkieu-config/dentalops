const PHONE_PATTERN = /^0\d{8,9}$/

export const PHONE_ERROR = "Enter a 9–10 digit mobile number, e.g. 0812345678"

export const normalizePhone = (value: string): string => value.replace(/[\s-]/g, "")

export const isValidPhone = (value: string): boolean => PHONE_PATTERN.test(normalizePhone(value))
