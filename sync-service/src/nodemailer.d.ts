declare module 'nodemailer' {
  export interface Transporter {
    sendMail(mail: Record<string, unknown>): Promise<{ messageId: string }>;
    verify(): Promise<true>;
  }
  export function createTransport(options: Record<string, unknown>): Transporter;
}
