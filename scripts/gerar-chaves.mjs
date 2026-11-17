// Gera segredos novos para uma instalação própria (nada é gravado; copie para a Vercel).
// Uso: node scripts/gerar-chaves.mjs
import { randomBytes } from 'node:crypto';
import webpush from 'web-push';

const vapid = webpush.generateVAPIDKeys();
console.log(`CRON_SECRET=${randomBytes(32).toString('hex')}`);
console.log(`WHATSAPP_WEBHOOK_SECRET=${randomBytes(32).toString('hex')}`);
console.log(`VAPID_PUBLIC_KEY=${vapid.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${vapid.privateKey}`);
console.log('VAPID_SUBJECT=mailto:SEU-EMAIL');
