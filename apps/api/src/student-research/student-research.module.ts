import { Module } from "@nestjs/common";
import { StudentResearchService } from "./student-research.service.js";
import { StudentResearchController } from "./student-research.controller.js";

@Module({
  controllers: [StudentResearchController],
  providers: [StudentResearchService],
  exports: [StudentResearchService],
})
export class StudentResearchModule {}
