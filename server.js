const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================== CONFIG ====================
const CONFIG = {
  ZALO_APP_SECRET: process.env.ZALO_APP_SECRET,
  ZALO_OA_TOKEN: process.env.ZALO_OA_TOKEN,
  ZALO_REFRESH_TOKEN: process.env.ZALO_REFRESH_TOKEN,
  ZALO_APP_ID: process.env.ZALO_APP_ID,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  SHEETS_CSV_FAQ: process.env.SHEETS_CSV_FAQ,
  SHEETS_CSV_SERVICES: process.env.SHEETS_CSV_SERVICES,
};

// Token cache
let cachedToken = {
  access_token: CONFIG.ZALO_OA_TOKEN,
  expires_at: Date.now() + 25 * 60 * 60 * 1000,
};

// Knowledge base cache (refresh mỗi 30 phút)
let knowledgeCache = {
  data: '',
  expires_at: 0,
};

// ==================== ZALO TOKEN ====================
async function getValidToken() {
  if (cachedToken.access_token && Date.now() < cachedToken.expires_at - 5 * 60 * 1000) {
    return cachedToken.access_token;
  }
  try {
    console.log('Refreshing Zalo token...');
    const res = await axios.get('https://oauth.zaloapp.com/v4/oa/access_token', {
      params: {
        app_id: CONFIG.ZALO_APP_ID,
        grant_type: 'refresh_token',
        refresh_token: CONFIG.ZALO_REFRESH_TOKEN,
      },
      headers: { secret_key: CONFIG.ZALO_APP_SECRET },
    });
    if (res.data.access_token) {
      cachedToken = {
        access_token: res.data.access_token,
        expires_at: Date.now() + 25 * 60 * 60 * 1000,
      };
      console.log('Token refreshed successfully');
      return cachedToken.access_token;
    }
  } catch (err) {
    console.error('Token refresh failed:', err.message);
  }
  return cachedToken.access_token;
}

// ==================== KNOWLEDGE BASE ====================
async function getKnowledgeBase() {
  if (knowledgeCache.data && Date.now() < knowledgeCache.expires_at) {
    return knowledgeCache.data;
  }
  try {
    let kb = '';

    if (CONFIG.SHEETS_CSV_FAQ) {
      const faqRes = await axios.get(CONFIG.SHEETS_CSV_FAQ, { timeout: 5000 });
      const rows = parseCSV(faqRes.data);
      const activeRows = rows.filter(r => r['Trạng Thái'] === 'ACTIVE');
      if (activeRows.length > 0) {
        kb += '\n=== FAQ ===\n';
        activeRows.forEach(r => {
          kb += `Q: ${r['Câu Hỏi Của Khách']}\nA: ${r['Câu Trả Lời Mẫu']}\n\n`;
        });
      }
    }

    if (CONFIG.SHEETS_CSV_SERVICES) {
      const svcRes = await axios.get(CONFIG.SHEETS_CSV_SERVICES, { timeout: 5000 });
      const rows = parseCSV(svcRes.data);
      const activeRows = rows.filter(r => r['Trạng Thái'] === 'ACTIVE');
      if (activeRows.length > 0) {
        kb += '\n=== DỊCH VỤ & GIÁ ===\n';
        activeRows.forEach(r => {
          kb += `- ${r['Tên Dịch Vụ']}: ${r['Giá (VNĐ)']} — ${r['Mô Tả Chi Tiết']}\n`;
        });
      }
    }

    knowledgeCache = { data: kb, expires_at: Date.now() + 30 * 60 * 1000 };
    console.log('Knowledge base refreshed');
    return kb;
  } catch (err) {
    console.error('KB fetch error:', err.message);
    return knowledgeCache.data || '';
  }
}

function parseCSV(csv) {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const vals = line.match(/(".*?"|[^,]+)(?=,|$)/g) || [];
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = (vals[i] || '').trim().replace(/^"|"$/g, '');
    });
    return obj;
  });
}

// ==================== GEMINI ====================
const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_API_KEY);

const SYSTEM_PROMPT = `Bạn là nhân viên chăm sóc khách hàng của 4RAU Barber Cutclub trên Zalo. Vai trò của bạn là hỗ trợ khách hàng đặt lịch, hỏi giá, tìm chi nhánh và giải đáp thắc mắc.

PHONG CÁCH GIAO TIẾP:
- Xưng "em", gọi khách là "anh" (hoặc "chị" nếu biết)
- Nhắn ngắn gọn kiểu chat Zalo, không viết dài
- Thân thiện, nhiệt tình, chuyên nghiệp
- KHÔNG dùng emoji
- Nếu khách nhắn tiếng Anh thì trả lời bằng tiếng Anh

CHI NHÁNH (16 cơ sở tại TP.HCM):
- Q1: 77 Yersin (Tiệm Tóc Của Chú Tư CN1), 59 Đồng Du (CN3)
- Q3: 262c Điện Biên Phủ, P. Võ Thị Sáu (Tiệm Tóc Của Chú Tư CN2)
- Q2: 37 Xuân Thủy, Thảo Điền | Popup Store Thủ Thiêm Park
- Thủ Đức: SH.09 One Verandah, Đường Tạ Hiện (4RAU Đào Kim Cương)
- Q4: 360B Bến Văn Đồn, P.1
- Q7: SCENIC VALLEY 2 - Block C002
- Q9: Tòa S5.03 VinHomes Grand Park
- Q10: 634 Điện Biên Phủ, P.11
- Tân Bình: 81 Bình Giã, P.13
- Tân Phú: 603A Lũy Bán Bích
- Gò Vấp: 843 Phan Văn Trị, P.7
- Bình Thạnh: 184 Bùi Đình Tuý
- Bình Tân: Căn SHOP16 Chung Cư PRIVIA KHANG ĐIỀN

GIỜ MỞ CỬA: 10:00 - 19:30 (Thứ 4: 10:00 - 16:00)
HOTLINE: 19004407
ĐẶT LỊCH: https://4rau.vn/

GIÁ CƠ BẢN:
- Cắt tóc: từ 108.000đ
- Cắt + Gội: 183.000đ
- Combo Basic: 271.000đ
- Combo Premium: 291.000đ

XỬ LÝ TÌNH HUỐNG:
- Hỏi đặt lịch → hướng dẫn vào https://4rau.vn/
- Hỏi chi nhánh → hỏi lại khu vực, gợi ý chi nhánh gần nhất
- Hỏi barber cụ thể → hướng dẫn chọn trên web
- Khiếu nại → xin lỗi, gắn tag [ESCALATE] để chuyển người thật
- Không rõ ý → hỏi lại lịch sự`;

async function askGemini(userMessage, knowledgeBase) {
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    systemInstruction: knowledgeBase
      ? `${SYSTEM_PROMPT}\n\n=== KNOWLEDGE BASE ===\n${knowledgeBase}`
      : SYSTEM_PROMPT,
  });

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    generationConfig: { maxOutputTokens: 500, temperature: 0.7 },
  });

  return result.response.text();
}

// ==================== ZALO SEND MESSAGE ====================
async function sendZaloMessage(userId, text) {
  const token = await getValidToken();
  try {
    await axios.post(
      'https://openapi.zalo.me/v3.0/oa/message/cs',
      {
        recipient: { user_id: userId },
        message: { text: text.replace(/\n/g, ' ') },
      },
      { headers: { access_token: token, 'Content-Type': 'application/json' } }
    );
    console.log(`Sent reply to ${userId}`);
  } catch (err) {
    console.error('Send message error:', err.response?.data || err.message);
  }
}

// ==================== WEBHOOK ====================
app.post('/webhook', async (req, res) => {
  res.status(200).json({ status: 'ok' });

  try {
    const body = req.body;
    const event = body.event_name;

    console.log('RAW BODY:', JSON.stringify(body));
    console.log('EVENT:', event);

    if (event !== 'user_send_text') return;

    const userId = body.sender?.id;
    const userMessage = body.message?.text;

    if (!userId || !userMessage) return;

    console.log(`[${userId}] ${userMessage}`);

    const kb = await getKnowledgeBase();
    const reply = await askGemini(userMessage, kb);

    await sendZaloMessage(userId, reply);
    console.log(`[Reply] ${reply.substring(0, 100)}...`);
  } catch (err) {
    console.error('Webhook error:', err.message);
  }
});

app.get('/webhook', (req, res) => {
  res.status(200).send('OK');
});

app.get('/ping', (req, res) => {
  res.json({ status: 'alive', time: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.json({ service: '4RAU Chatbot', status: 'running' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`4RAU Chatbot running on port ${PORT}`);
});
