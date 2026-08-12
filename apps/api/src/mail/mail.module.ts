import { Inject, Module, OnModuleDestroy } from "@nestjs/common"
import Redis from "ioredis"
import { MailProcessor } from "./mail.processor"
import { MAIL_REDIS, MailQueue } from "./mail.queue"
import { createQueueConnection } from "../redis/queue-connection"
import { closeRedis } from "../redis/redis-client"
import { createMailTransport, MAIL_TRANSPORT } from "./mail.transport"

@Module({
  providers: [
    { provide: MAIL_REDIS, useFactory: createQueueConnection("mail") },
    { provide: MAIL_TRANSPORT, useFactory: createMailTransport },
    MailQueue,
    MailProcessor
  ],
  exports: [MailQueue]
})
export class MailModule implements OnModuleDestroy {
  constructor(@Inject(MAIL_REDIS) private readonly redis: Redis) {}

  async onModuleDestroy() {
    await closeRedis(this.redis)
  }
}
