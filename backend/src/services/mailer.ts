import nodemailer from 'nodemailer';
import { db } from '../db/pool';

let transporter: nodemailer.Transporter | null = null;
let etherealAccount: { user: string; pass: string; host: string; port: number } | null = null;

export async function getEtherealAccount() {
  if (etherealAccount) return etherealAccount;

  if (process.env.ETHEREAL_USER && process.env.ETHEREAL_PASS) {
    etherealAccount = {
      user: process.env.ETHEREAL_USER,
      pass: process.env.ETHEREAL_PASS,
      host: 'smtp.ethereal.email',
      port: 587,
    };
    return etherealAccount;
  }

  const account = await nodemailer.createTestAccount();
  etherealAccount = {
    user: account.user,
    pass: account.pass,
    host: account.smtp.host,
    port: account.smtp.port,
  };
  console.log('Ethereal test account created:', account.user);
  return etherealAccount;
}

export async function getTransporter() {
  if (transporter) return transporter;
  const account = await getEtherealAccount();
  transporter = nodemailer.createTransport({
    host: account.host,
    port: account.port,
    secure: false,
    auth: {
      user: account.user,
      pass: account.pass,
    },
  });
  return transporter;
}

export async function sendEmail(opts: {
  from: string;
  to: string;
  subject: string;
  html: string;
}) {
  const tp = await getTransporter();
  const info = await tp.sendMail(opts);
  return info;
}

export async function logEmailToEthereal(info: nodemailer.SentMessageInfo) {
  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    console.log('Ethereal preview URL:', previewUrl);
  }
  return previewUrl;
}
