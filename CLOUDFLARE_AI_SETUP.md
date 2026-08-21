# Quiz AI setup

تم تجهيز مشروع Quiz ليتصل بـ Cloudflare Workers AI.

## 1. نشر الـ Worker

من مجلد `cloudflare-worker`:

```bash
npx wrangler login
npx wrangler deploy
```

سيكون الـ Worker مرتبطًا بـ Workers AI من خلال binding باسم `AI`، ويستخدم الموديل:

`@cf/qwen/qwen3-30b-a3b-fp8`

## 2. ربط الموقع

بعد النشر، انسخ رابط الـ Worker وضعه في `ai-config.js`:

```js
export const AI_API_URL = 'https://YOUR-WORKER.workers.dev/api/ai';
```

## 3. التشغيل

الموقع يفتح نافذة مساعد AI من الزر الموجود أسفل الشاشة. الطلبات تمر عبر Worker، لذلك لا توجد مفاتيح Cloudflare داخل `index.html`.

## ملاحظة

الـ Worker هو الجزء الذي يحتاج حساب Cloudflare ونشرًا فعليًا. GitHub Pages يستضيف الواجهة فقط ولا يشغل Worker بنفسه.
