import { Injectable } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class ProposalDeliverablesService {
  constructor(private readonly prisma: PrismaClient) {}

  async getDeliverables(proposalId: string) {
    return this.prisma.proposalDeliverable.findMany({
      where: { proposalId },
      orderBy: { createdAt: "desc" }
    });
  }

  async createDeliverable(
    proposalId: string,
    data: {
      type: string;
      title: string;
      description?: string;
      proofFileName?: string;
      proofStorageKey?: string;
      publishedAt?: Date;
    },
    userId: string
  ) {
    return this.prisma.proposalDeliverable.create({
      data: {
        proposalId,
        type: data.type,
        title: data.title,
        description: data.description,
        proofFileName: data.proofFileName,
        proofStorageKey: data.proofStorageKey,
        publishedAt: data.publishedAt,
        createdById: userId
      }
    });
  }
}
