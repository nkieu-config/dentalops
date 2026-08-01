import { delay, http, HttpResponse } from "msw"
import { setupServer } from "msw/node"

export const API = "http://localhost:3001/api/v1"
export const server = setupServer()
export { delay, http, HttpResponse }
