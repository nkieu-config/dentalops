import { Injectable } from "@nestjs/common"
import { Prisma } from "@prisma/client"
import * as argon2 from "argon2"
import { AppException } from "../common/app.exception"
import { PrismaService } from "../prisma/prisma.service"
import { currentTenant } from "../tenant/tenant-context"
import { CreateStaffDto } from "./dto/create-staff.dto"
import { UpdateStaffDto } from "./dto/update-staff.dto"

const emailTaken = () =>
  new AppException(409, "EMAIL_TAKEN", "Somebody in this clinic already uses that email")
const emptyUpdate = () => new AppException(400, "EMPTY_UPDATE", "Provide at least one field to update")
const staffNotFound = () => new AppException(404, "NOT_FOUND", "Staff member not found")
const selfManagementForbidden = () =>
  new AppException(409, "SELF_MANAGEMENT_FORBIDDEN", "An owner cannot change their own role or active status")

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

  async update(id: string, dto: UpdateStaffDto) {
    if (Object.keys(dto).length === 0) throw emptyUpdate()
    const actor = currentTenant()
    if (!actor) throw staffNotFound()
    if (actor.userId === id && (dto.role !== undefined || dto.isActive === false)) {
      throw selfManagementForbidden()
    }
    const member = await this.prisma.scoped.user.findUnique({ where: { id }, select: { id: true } })
    if (!member) throw staffNotFound()
    return this.prisma.scoped.user.update({
      where: { id },
      data: dto,
      select: { id: true, name: true, role: true, isActive: true }
    })
  }
}
