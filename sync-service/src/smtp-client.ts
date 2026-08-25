import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { emailSafePipeline, type EmailSafeMessage } from './email-safe-pipeline';

export interface SmtpConfig {
  host: string;
  port: number;
  emailAddress: string;
  password: string;
  displayName?: string;
}

export interface SendMailOptions {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  htmlBody: string;
  inReplyTo?: string;
  references?: string;
  attachments?: Array<{ filename: string; content: Buffer; mimeType: string }>;
}

export class SmtpClient {
  private transporter: Transporter;
  private config: SmtpConfig;

  constructor(config: SmtpConfig) {
    this.config = config;
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: { user: config.emailAddress, pass: config.password },
      // Never accept an untrusted certificate: this connection carries mailbox
      // credentials and outbound message content.
      tls: { rejectUnauthorized: true },
    });
  }

  async verify(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch {
      return false;
    }
  }

  processHtml(html: string): EmailSafeMessage {
    return emailSafePipeline(html);
  }

  async sendMail(opts: SendMailOptions): Promise<{ messageId: string; html: string; text: string }> {
    const safe = emailSafePipeline(opts.htmlBody);
    const info = await this.transporter.sendMail({
      from: `"${this.config.displayName ?? ''}" <${this.config.emailAddress}>`,
      to: opts.to.join(', '),
      cc: opts.cc?.join(', '),
      bcc: opts.bcc?.join(', '),
      subject: opts.subject,
      html: safe.html,
      text: safe.text,
      inReplyTo: opts.inReplyTo,
      references: opts.references,
      attachments: opts.attachments?.map(a => ({
        filename: a.filename,
        content: a.content,
        contentType: a.mimeType,
      })),
    });
    return { messageId: info.messageId, html: safe.html, text: safe.text };
  }
}
