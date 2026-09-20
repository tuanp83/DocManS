import { Injectable, Logger } from "@nestjs/common";
import * as nodemailer from "nodemailer";

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(MailService.name);
  private initialized = false;

  constructor() {
    this.init();
  }

  private async init() {
    try {
      // For development, we create an Ethereal test account dynamically.
      // In production, you would use credentials from process.env
      const testAccount = await nodemailer.createTestAccount();
      
      this.transporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false, // true for 465, false for other ports
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
      this.initialized = true;
      this.logger.log(`MailService initialized with Ethereal user: ${testAccount.user}`);
    } catch (err) {
      this.logger.error("Failed to initialize Ethereal test account", err);
    }
  }

  async sendMail(to: string, subject: string, html: string) {
    if (!this.initialized) {
      this.logger.warn("MailService not fully initialized yet, skipping email send.");
      return null;
    }

    try {
      const info = await this.transporter.sendMail({
        from: '"DocManS System" <noreply@docmans.hvqy.edu.vn>',
        to,
        subject,
        html,
      });

      this.logger.log(`Email sent: ${info.messageId}`);
      this.logger.log(`Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
      
      return info;
    } catch (err) {
      this.logger.error("Failed to send email", err);
      throw err;
    }
  }
}
