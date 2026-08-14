export const HUE_COUNT = 6

export interface AppointmentHue {
  background: string
  border: string
}

export const appointmentHue = (colorIndex: number): AppointmentHue => {
  const hue = colorIndex % HUE_COUNT
  return {
    background: `var(--hue${hue}-bg)`,
    border: `var(--hue${hue}-border)`,
  }
}
