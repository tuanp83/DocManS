import { Injectable, Logger } from "@nestjs/common";
import * as nodemailer from "nodemailer";

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter | null = null;
  private readonly logger = new Logger(MailService.name);
  private initialized = false;

  constructor() {
    this.init();
  }

  private init() {
    try {
      const host = process.env.SMTP_HOST?.trim();
      const port = Number(process.env.SMTP_PORT ?? "587");
      const from = process.env.SMTP_FROM?.trim();
      
      if (!host || !from) {
        this.logger.warn("Cấu hình SMTP chưa đầy đủ (SMTP_HOST, SMTP_FROM). Dịch vụ gửi mail đã bị vô hiệu hóa.");
        return;
      }
      
      const localHost = /^(localhost|127\.0\.0\.1|::1)$/i.test(host);

      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: process.env.SMTP_SECURE === "true" || port === 465,
        requireTLS: !localHost,
        auth: process.env.SMTP_USER ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD ?? "",
        } : undefined,
      });
      this.initialized = true;
      this.logger.log(`MailService initialized with SMTP host: ${host}`);
    } catch (err) {
      this.logger.error("Failed to initialize SMTP transporter", err);
    }
  }

  async sendMail(to: string, subject: string, html: string) {
    if (!this.initialized || !this.transporter) {
      this.logger.warn("MailService not initialized (SMTP not configured), skipping email send.");
      return null;
    }

    try {
      const from = process.env.SMTP_FROM?.trim() || '"DocManS System" <noreply@docmans.hvqy.edu.vn>';
      
      const info = await this.transporter.sendMail({
        from,
        to,
        subject,
        html,
      });

      this.logger.log(`Email sent: ${info.messageId}`);
      return info;
    } catch (err) {
      this.logger.error("Failed to send email", err);
      throw err;
    }
  }
}
