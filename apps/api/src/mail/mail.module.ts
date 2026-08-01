import { Inject, Module, OnModuleDestroy } from "@nestjs/common"
import Redis from "ioredis"
import { MailProcessor } from "./mail.processor"
import { MailQueue } from "./mail.queue"
import { createMailRedis, MAIL_REDIS } from "./mail.redis"
import { createMailTransport, MAIL_TRANSPORT } from "./mail.transport"

@Module({
  providers: [
    { provide: MAIL_REDIS, useFactory: createMailRedis },
    { provide: MAIL_TRANSPORT, useFactory: createMailTransport },
    MailQueue,
    MailProcessor
  ],
  exports: [MailQueue]
})
export class MailModule implements OnModuleDestroy {
  constructor(@Inject(MAIL_REDIS) private readonly redis: Redis) {}

  async onModuleDestroy() {
    await this.redis.quit()
  }
}
