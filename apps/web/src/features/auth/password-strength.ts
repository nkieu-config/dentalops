export type PasswordStrength = "Weak" | "Good" | "Strong"

export const passwordStrength = (password: string): PasswordStrength | null => {
  if (password.length === 0) return null

  const varietyCount = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((pattern) =>
    pattern.test(password)
  ).length

  if (password.length >= 12 && varietyCount >= 3) return "Strong"
  if (password.length >= 8 && varietyCount >= 2) return "Good"
  return "Weak"
}
