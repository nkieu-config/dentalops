import { CalendarCheck2, DoorOpen, UsersRound } from "lucide-react"
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "../ui/card"

const moments = [
  {
    title: "Team availability",
    description: "See who can take the next patient before the phone rings.",
    icon: UsersRound
  },
  {
    title: "Rooms and resources",
    description: "Keep every chair and shared resource in the same calm plan.",
    icon: DoorOpen
  },
  {
    title: "Online booking",
    description: "Let patients find a real opening while your team stays in control.",
    icon: CalendarCheck2
  }
] as const

export const ClinicDayStory = () => (
  <section aria-labelledby="clinic-day-title" className="space-y-4">
    <div className="space-y-1">
      <p className="text-sm font-semibold tracking-wide text-decorative">ONE DAY, IN SYNC</p>
      <h2 id="clinic-day-title" className="text-2xl font-semibold tracking-tight">
        A clinic day that stays together.
      </h2>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      {moments.map(({ title, description, icon: Icon }) => (
        <Card key={title} className="shadow-xs">
          <CardHeader>
            <Icon className="h-5 w-5 text-decorative" aria-hidden />
            <CardTitle>{title}</CardTitle>
          </CardHeader>
          <CardBody>
            <CardDescription>{description}</CardDescription>
          </CardBody>
        </Card>
      ))}
    </div>
  </section>
)
