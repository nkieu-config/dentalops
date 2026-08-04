import { JwtService } from "@nestjs/jwt"
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer
} from "@nestjs/websockets"
import type { Namespace, Socket } from "socket.io"
import { JwtPayload } from "../auth/auth.service"
import {
  APPOINTMENT_CHANGED,
  AppointmentChangedEvent,
  AppointmentChangedInput,
  branchRoom,
  REALTIME_NAMESPACE,
  SUBSCRIBE,
  SubscribeAck,
  SubscribeInput
} from "./realtime.events"
import { isStaffSession } from "../auth/jwt.strategy"
import { secretFor } from "../auth/token-secrets"

export interface RealtimeSocketData {
  tenantId: string
}

export type RealtimeSocket = Socket & { data: Partial<RealtimeSocketData> }

@WebSocketGateway({
  namespace: REALTIME_NAMESPACE,
  cors: { origin: process.env.WEB_ORIGIN ?? "http://localhost:5173", credentials: true }
})
export class RealtimeGateway implements OnGatewayInit {
  @WebSocketServer() private readonly namespace?: Namespace

  constructor(private readonly jwt: JwtService) {}

  afterInit(namespace: Namespace) {
    namespace.use((socket, next) => {
      this.authenticate(socket as RealtimeSocket).then(
        () => next(),
        () => next(new Error("UNAUTHORIZED"))
      )
    })
  }

  @SubscribeMessage(SUBSCRIBE)
  subscribe(
    @ConnectedSocket() client: RealtimeSocket,
    @MessageBody() body: SubscribeInput | undefined
  ): SubscribeAck {
    const tenantId = client.data.tenantId
    const branchId = body?.branchId
    if (!tenantId || typeof branchId !== "string" || branchId.length === 0) {
      return { joined: null }
    }
    const room = branchRoom(tenantId, branchId)
    void client.join(room)
    return { joined: room }
  }

  appointmentChanged(input: AppointmentChangedInput): void {
    if (!this.namespace) return
    const event: AppointmentChangedEvent = {
      appointmentId: input.appointmentId,
      branchId: input.branchId,
      action: input.action
    }
    this.namespace.to(branchRoom(input.tenantId, input.branchId)).emit(APPOINTMENT_CHANGED, event)
  }

  private async authenticate(socket: RealtimeSocket): Promise<void> {
    const token: unknown = socket.handshake.auth?.token
    if (typeof token !== "string" || token.length === 0) throw new Error("UNAUTHORIZED")
    const payload = await this.jwt.verifyAsync<Partial<JwtPayload>>(token, {
      secret: secretFor("access")
    })
    if (!isStaffSession(payload)) throw new Error("UNAUTHORIZED")
    socket.data.tenantId = payload.tenantId
  }
}
