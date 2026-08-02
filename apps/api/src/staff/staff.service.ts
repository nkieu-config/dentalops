import { Injectable } from "@nestjs/common"
import { Prisma } from "@prisma/client"
import * as argon2 from "argon2"
import { AppException } from "../common/app.exception"
import { PrismaService } from "../prisma/prisma.service"
import { CreateStaffDto } from "./dto/create-staff.dto"

const emailTaken = () =>
  new AppException(409, "EMAIL_TAKEN", "Somebody in this clinic already uses that email")

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateStaffDto) {
    const email = dto.email.toLowerCase()
    const passwordHash = await argon2.hash(dto.password)

    try {
      return await this.prisma.scoped.$transaction(async (tx) => {
        const existing = await tx.user.findFirst({ where: { email } })
        if (existing) throw emailTaken()
        return tx.user.create({
          data: { email, passwordHash, name: dto.name, role: dto.role } as never,
          select: { id: true, name: true, role: true, isActive: true }
        })
      })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw emailTaken()
      }
      throw e
    }
  }
}
