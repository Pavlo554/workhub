const { admin, setCors } = require('./_lib/firebase')

module.exports = async (req, res) => {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' })

  const { email } = req.body || {}
  if (!email) return res.status(400).json({ error: 'Email обовʼязковий' })

  const RESEND_KEY = process.env.RESEND_API_KEY
  if (!RESEND_KEY) return res.status(500).json({ error: 'Email сервіс не налаштовано' })

  try {
    // Generate reset link via Firebase Admin (real signed token, not fake)
    const resetLink = await admin.auth().generatePasswordResetLink(email, {
      url: 'https://workhub.app',
    })

    // Send via Resend for reliable delivery
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'WorkHub <noreply@workhub-aifo.vercel.app>',
        to: [email],
        subject: 'Скидання пароля — WorkHub',
        html: buildEmailHTML(resetLink),
      }),
    })

    if (!r.ok) {
      const err = await r.json()
      console.error('Resend error:', err)
      return res.status(500).json({ error: 'Не вдалось надіслати лист' })
    }

    return res.status(200).json({ ok: true })
  } catch (err) {
    // Firebase throws auth/user-not-found if email not registered
    if (err.code === 'auth/user-not-found') {
      // Return ok to avoid user enumeration — don't reveal which emails exist
      return res.status(200).json({ ok: true })
    }
    console.error('send-password-reset error:', err)
    return res.status(500).json({ error: err.message })
  }
}

function buildEmailHTML(resetLink) {
  return `<!DOCTYPE html>
<html lang="uk">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0D0F14;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:560px;margin:40px auto;padding:0 16px">

    <div style="text-align:center;margin-bottom:32px">
      <div style="display:inline-flex;align-items:center;gap:8px">
        <div style="width:36px;height:36px;background:linear-gradient(135deg,#667eea,#4F8EF7);border-radius:10px"></div>
        <span style="color:#F1F5F9;font-size:20px;font-weight:800;letter-spacing:.5px">WorkHub</span>
      </div>
    </div>

    <div style="background:#1A1D2E;border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:40px 36px">
      <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#F1F5F9">Скидання пароля</h1>
      <p style="margin:0 0 24px;font-size:15px;color:#94A3B8;line-height:1.6">
        Хтось запросив скидання пароля для вашого акаунту WorkHub. Натисніть кнопку нижче, щоб задати новий пароль.
      </p>

      <a href="${resetLink}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#667eea,#4F8EF7);color:#fff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:700">
        Скинути пароль
      </a>

      <p style="margin:28px 0 0;font-size:12px;color:#64748B;line-height:1.6">
        Якщо ви не запитували скидання пароля — просто проігноруйте цей лист. Ваш пароль залишиться незмінним.<br><br>
        Посилання дійсне протягом <strong style="color:#94A3B8">1 години</strong>.
      </p>
    </div>

    <p style="text-align:center;font-size:11px;color:#475569;margin-top:24px">
      WorkHub CRM · Автоматичний лист, відповідати не потрібно
    </p>
  </div>
</body>
</html>`
}
