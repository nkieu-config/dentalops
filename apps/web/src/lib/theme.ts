const STORAGE_KEY = "dentalops-theme"

export const initTheme = () => {
  const stored = localStorage.getItem(STORAGE_KEY)
  const dark = stored ? stored === "dark" : matchMedia("(prefers-color-scheme: dark)").matches
  document.documentElement.classList.toggle("dark", dark)
}

export const toggleTheme = () => {
  const dark = document.documentElement.classList.toggle("dark")
  localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light")
}
