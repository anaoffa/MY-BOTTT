const fs = require('fs');
const path = require('path');
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const STATS_FILE = path.join(DATA_DIR, 'stats.json');

const DEFAULT_CONFIG = {
  buttons: {
    claim: { style: 'Success', roleId: null, label: 'استلام التذكرة', emoji: '✋' },
    unclaim: { style: 'Secondary', roleId: null, label: 'إلغاء الاستلام', emoji: '↩️' },
    call_staff: { style: 'Primary', roleId: null, label: 'استدعاء الإدارة', emoji: '🔔' },
    call_user: { style: 'Primary', roleId: null, label: 'استدعاء العضو', emoji: '📣' },
    close: { style: 'Danger', roleId: null, label: 'إغلاق التذكرة', emoji: '🔒' },
  },
  topClaimsMessageId: null,
};

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2), 'utf8');
      return JSON.parse(JSON.stringify(fallback));
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    return JSON.parse(JSON.stringify(fallback));
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function getConfig() {
  const cfg = readJson(CONFIG_FILE, DEFAULT_CONFIG);
  cfg.buttons = { ...DEFAULT_CONFIG.buttons, ...(cfg.buttons || {}) };
  return cfg;
}

function saveConfig(cfg) {
  writeJson(CONFIG_FILE, cfg);
}

function getStats() {
  return readJson(STATS_FILE, { claims: {}, ratings: {} });
}

function saveStats(stats) {
  writeJson(STATS_FILE, stats);
}

function parseRoleIds(envVar) {
  if (!envVar) return [];
  return envVar
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

function getStaffRoles() {
  return {
    junior: parseRoleIds(process.env.JUNIOR_STAFF_ROLES),
    senior: parseRoleIds(process.env.SENIOR_STAFF_ROLES),
    high: parseRoleIds(process.env.HIGH_STAFF_ROLES),
  };
}

function getButtonStyle(styleName) {
  switch ((styleName || '').toLowerCase()) {
    case 'primary':
    case 'blue':
      return ButtonStyle.Primary;
    case 'success':
    case 'green':
      return ButtonStyle.Success;
    case 'danger':
    case 'red':
      return ButtonStyle.Danger;
    case 'secondary':
    case 'gray':
    case 'grey':
    default:
      return ButtonStyle.Secondary;
  }
}

function buildTicketControlRows(claimedBy = null) {
  const cfg = getConfig();
  const btns = cfg.buttons;

  const claimBtn = new ButtonBuilder()
    .setCustomId('ticket_claim')
    .setLabel(btns.claim.label || 'استلام التذكرة')
    .setEmoji(btns.claim.emoji || '✋')
    .setStyle(getButtonStyle(btns.claim.style))
    .setDisabled(Boolean(claimedBy));

  const unclaimBtn = new ButtonBuilder()
    .setCustomId('ticket_unclaim')
    .setLabel(btns.unclaim.label || 'إلغاء الاستلام')
    .setEmoji(btns.unclaim.emoji || '↩️')
    .setStyle(getButtonStyle(btns.unclaim.style))
    .setDisabled(!claimedBy);

  const callStaffBtn = new ButtonBuilder()
    .setCustomId('ticket_call_staff')
    .setLabel(btns.call_staff.label || 'استدعاء الإدارة')
    .setEmoji(btns.call_staff.emoji || '🔔')
    .setStyle(getButtonStyle(btns.call_staff.style));

  const callUserBtn = new ButtonBuilder()
    .setCustomId('ticket_call_user')
    .setLabel(btns.call_user.label || 'استدعاء العضو')
    .setEmoji(btns.call_user.emoji || '📣')
    .setStyle(getButtonStyle(btns.call_user.style));

  const closeBtn = new ButtonBuilder()
    .setCustomId('ticket_close')
    .setLabel(btns.close.label || 'إغلاق التذكرة')
    .setEmoji(btns.close.emoji || '🔒')
    .setStyle(getButtonStyle(btns.close.style));

  return [
    new ActionRowBuilder().addComponents(claimBtn, unclaimBtn, callStaffBtn, callUserBtn, closeBtn),
  ];
}

function buildPanelPayload() {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🎫 SoftMC | Support Center')
    .setDescription(
      [
        'مرحباً بك في **مركز الدعم الفني الرسمي لسيرفر SoftMC**.',
        'اختر القسم المناسب لمشكلتك أو طلبك من القائمة بالأسفل لفتح تذكرة خاصة مع فريق الإدارة.',
        '',
        '**الأقسام المتاحة:**',
        '🛠️ **الدعم الفني العام** — للاستفسارات والمشاكل العامة داخل السيرفر.',
        '🛒 **المتجر والمدفوعات** — لمشاكل الشراء والرتب والباقات.',
        '🚨 **البلاغات والشكاوى** — للإبلاغ عن مخالفي القوانين أو الهاكات.',
        '⚖️ **الاعتراض على العقوبات** — لطلب مراجعة الباند أو الميوت.',
        '🎥 **تقديم الميديا (صناع المحتوى)** — للتقديم على رتبة اليوتيوبر / الستريمر.',
        '👑 **الإدارة العليا** — للتواصل المباشر مع الإدارة العليا في الحالات الخاصة.',
      ].join('\n')
    )
    .setFooter({ text: 'SoftMC Official Ticket System • يرجى الالتزام بقوانين الدعم' })
    .setTimestamp();

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('softmc_ticket_category')
    .setPlaceholder('اختر قسم التذكرة من هنا...')
    .addOptions(
      {
        label: 'الدعم الفني العام',
        description: 'استفسارات ومساعدة عامة داخل السيرفر',
        value: 'general_support',
        emoji: '🛠️',
      },
      {
        label: 'المتجر والمدفوعات',
        description: 'مشاكل المتجر، الرتب، وعمليات الدفع',
        value: 'store_payments',
        emoji: '🛒',
      },
      {
        label: 'البلاغات والشكاوى',
        description: 'الإبلاغ عن لاعب مخالف أو مشكلة طارئة',
        value: 'reports',
        emoji: '🚨',
      },
      {
        label: 'الاعتراض على العقوبات',
        description: 'تقديم طلب فك حظر أو مراجعة عقوبة',
        value: 'appeals',
        emoji: '⚖️',
      },
      {
        label: 'تقديم الميديا (صناع المحتوى)',
        description: 'التقديم على رتب صناع المحتوى والستريمرز',
        value: 'media_apply',
        emoji: '🎥',
      },
      {
        label: 'الإدارة العليا',
        description: 'تواصل مباشر مع الإدارة العليا فقط',
        value: 'high_staff',
        emoji: '👑',
      }
    );

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(selectMenu)],
  };
}

function buildTopClaimsPayload() {
  const stats = getStats();
  const entries = Object.entries(stats.claims || {})
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
  const lines = entries.length
    ? entries.map(
        ([userId, count], idx) =>
          `${medals[idx]} <@${userId}> — **${count}** تذكرة مستلمة`
      )
    : ['لا توجد تذاكر مستلمة مسجلة حتى الآن.'];

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('🏆 SoftMC | توب 5 أكثر الإداريين استلاماً للتذاكر')
    .setDescription(lines.join('\n\n'))
    .setFooter({ text: 'يتم التحديث تلقائياً أو عبر زر إعادة التحميل بالأسفل' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('refresh_top_claims')
      .setLabel('إعادة تحميل')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Primary)
  );

  return { embeds: [embed], components: [row] };
}

async function updateTopClaimsBoard(client) {
  const channelId = process.env.TOP_CLAIMS_CHANNEL_ID;
  if (!channelId) return;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const cfg = getConfig();
  const payload = buildTopClaimsPayload();

  if (cfg.topClaimsMessageId) {
    const existingMsg = await channel.messages.fetch(cfg.topClaimsMessageId).catch(() => null);
    if (existingMsg) {
      await existingMsg.edit(payload).catch(() => null);
      return;
    }
  }

  const sent = await channel.send(payload).catch(() => null);
  if (sent) {
    cfg.topClaimsMessageId = sent.id;
    saveConfig(cfg);
  }
}

async function sendConfigLog(client, { user, action, target, before, after }) {
  const logChannelId = process.env.CONFIG_LOG_CHANNEL_ID;
  if (!logChannelId) return;

  const channel = await client.channels.fetch(logChannelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const embed = new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle('⚙️ سجل تعديلات إعدادات البوت')
    .addFields(
      { name: '👤 الإداري المنفذ', value: `<@${user.id}> (${user.tag})`, inline: true },
      { name: '📌 العملية', value: action, inline: true },
      { name: '🎯 الهدف', value: target, inline: true },
      { name: '⬅️ قبل التعديل', value: String(before), inline: true },
      { name: '➡️ بعد التعديل', value: String(after), inline: true }
    )
    .setTimestamp();

  await channel.send({ embeds: [embed] }).catch(() => null);
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function generateHtmlTranscript(channel, meta = {}) {
  const fetched = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  const messages = fetched ? Array.from(fetched.values()).reverse() : [];

  const rowsHtml = messages
    .map((m) => {
      const time = new Date(m.createdTimestamp).toLocaleString('ar-EG');
      const author = escapeHtml(m.author ? m.author.tag : 'Unknown');
      const content = escapeHtml(m.content || (m.embeds.length ? '[Embed Message]' : '[Attachment]'));
      return `
        <div class="msg">
          <div class="meta"><span class="author">${author}</span> <span class="time">${time}</span></div>
          <div class="body">${content.replace(/\n/g, '<br>')}</div>
        </div>
      `;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>SoftMC Transcript - ${escapeHtml(channel.name)}</title>
  <style>
    body { font-family: Tahoma, Arial, sans-serif; background: #1e1f22; color: #f2f3f5; padding: 24px; }
    .header { background: #2b2d31; padding: 16px; border-radius: 8px; margin-bottom: 20px; border-right: 4px solid #5865f2; }
    .msg { background: #2b2d31; padding: 12px 16px; border-radius: 6px; margin-bottom: 10px; }
    .meta { font-size: 13px; color: #b5bac1; margin-bottom: 6px; }
    .author { color: #ffffff; font-weight: bold; margin-left: 8px; }
    .body { font-size: 15px; line-height: 1.5; word-break: break-word; }
  </style>
</head>
<body>
  <div class="header">
    <h2>🎫 SoftMC Ticket Transcript — #${escapeHtml(channel.name)}</h2>
    <p>صاحب التذكرة: ${escapeHtml(meta.openerTag || 'غير معروف')} | المستلم: ${escapeHtml(meta.claimerTag || 'لم تُستلم')}</p>
  </div>
  ${rowsHtml || '<p>لا توجد رسائل مسجلة في هذه التذكرة.</p>'}
</body>
</html>`;
}

function getSlashCommands() {
  const applytCmd = new SlashCommandBuilder()
    .setName('applyt')
    .setDescription('إرسال لوحة SoftMC | Support Center الخاصة بالتذاكر')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

  const ticketBtnCmd = new SlashCommandBuilder()
    .setName('ticket-btn')
    .setDescription('تعديل لون أو رول أي زر داخل التذكرة (للإدارة ذات صلاحية Administrator فقط)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((opt) =>
      opt
        .setName('button')
        .setDescription('اختر الزر المراد تعديله')
        .setRequired(true)
        .addChoices(
          { name: 'Claim (استلام)', value: 'claim' },
          { name: 'Unclaim (إلغاء الاستلام)', value: 'unclaim' },
          { name: 'Call Staff (استدعاء الإدارة)', value: 'call_staff' },
          { name: 'Call User (استدعاء العضو)', value: 'call_user' },
          { name: 'Close (إغلاق)', value: 'close' }
        )
    )
    .addStringOption((opt) =>
      opt
        .setName('color')
        .setDescription('اختر لون الزر الجديد')
        .setRequired(false)
        .addChoices(
          { name: 'أخضر (Success)', value: 'Success' },
          { name: 'أزرق (Primary)', value: 'Primary' },
          { name: 'رمادي (Secondary)', value: 'Secondary' },
          { name: 'أحمر (Danger)', value: 'Danger' }
        )
    )
    .addRoleOption((opt) =>
      opt
        .setName('role')
        .setDescription('تحديد رول مخصص لاستخدام الزر (اختياري)')
        .setRequired(false)
    )
    .addBooleanOption((opt) =>
      opt
        .setName('clear_role')
        .setDescription('إزالة قيد الرول عن هذا الزر')
        .setRequired(false)
    );

  const resetCmd = new SlashCommandBuilder()
    .setName('reset')
    .setDescription('تصفير نقاط استلام الاداره')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((opt) =>
      opt
        .setName('staff')
        .setDescription('اختر الإداري (اتركه فارغاً لتصفير نقاط الجميع)')
        .setRequired(false)
    )
    .addIntegerOption((opt) =>
      opt
        .setName('amount')
        .setDescription('عدد النقاط المراد خصمها من الإداري المحدد (اتركه فارغاً للتصفير الكامل)')
        .setMinValue(1)
        .setRequired(false)
    );

  return [applytCmd.toJSON(), ticketBtnCmd.toJSON(), resetCmd.toJSON()];
}

module.exports = {
  getConfig,
  saveConfig,
  getStats,
  saveStats,
  getStaffRoles,
  buildTicketControlRows,
  buildPanelPayload,
  buildTopClaimsPayload,
  updateTopClaimsBoard,
  sendConfigLog,
  generateHtmlTranscript,
  getSlashCommands,
};
