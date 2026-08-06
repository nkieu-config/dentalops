import { Body, Controller, Delete, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { SkipThrottle } from "@nestjs/throttler"
import { Roles } from "../auth/roles.decorator"
import { CreateBranchDto } from "./dto/create-branch.dto"
import { CreateResourceDto } from "./dto/create-resource.dto"
import { CreateServiceDto } from "./dto/create-service.dto"
import { UpdateBranchDto } from "./dto/update-branch.dto"
import { UpdateResourceDto } from "./dto/update-resource.dto"
import { UpdateServiceDto } from "./dto/update-service.dto"
import { DirectoryWriteService } from "./directory-write.service"

@SkipThrottle()
@ApiTags("directory")
@ApiBearerAuth()
@Controller()
@Roles("owner")
export class DirectoryWriteController {
  constructor(private readonly directory: DirectoryWriteService) {}

  @Post("branches")
  createBranch(@Body() dto: CreateBranchDto) {
    return this.directory.createBranch(dto)
  }

  @Patch("branches/:id")
  updateBranch(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateBranchDto) {
    return this.directory.updateBranch(id, dto)
  }

  @Delete("branches/:id")
  deactivateBranch(@Param("id", ParseUUIDPipe) id: string) {
    return this.directory.deactivateBranch(id)
  }

  @Post("services")
  createService(@Body() dto: CreateServiceDto) {
    return this.directory.createService(dto)
  }

  @Patch("services/:id")
  updateService(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateServiceDto) {
    return this.directory.updateService(id, dto)
  }

  @Delete("services/:id")
  deactivateService(@Param("id", ParseUUIDPipe) id: string) {
    return this.directory.deactivateService(id)
  }

  @Post("resources")
  createResource(@Body() dto: CreateResourceDto) {
    return this.directory.createResource(dto)
  }

  @Patch("resources/:id")
  updateResource(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateResourceDto) {
    return this.directory.updateResource(id, dto)
  }

  @Delete("resources/:id")
  deactivateResource(@Param("id", ParseUUIDPipe) id: string) {
    return this.directory.deactivateResource(id)
  }
}
