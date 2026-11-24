const fs = require('fs');
const path = require('path');
const {
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  MessageFlags
} = require('discord.js');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const STATS_FILE = path.join(DATA_DIR, 'stats.json');

const DEFAULT_CONFIG = {
  buttons: {
    claim: { style: 'Success', roleId: null, label: 'استلام', emoji: '✋' },
    unclaim: { style: 'Secondary', roleId: null, label: 'إلغاء الاستلام', emoji: '↩️' },
    call_staff: { style: 'Primary', roleId: null, label: 'طلب إدارة', emoji: '🔔' },
    call_user: { style: 'Primary', roleId: null, label: 'طلب عضو', emoji: '📩' },
    summon_user: { style: 'Secondary', roleId: null, label: 'استدعاء عضو', emoji: '📣' },
    close: { style: 'Danger', roleId: null, label: 'إغلاق', emoji: '🔒' }
  },
  topClaimsMessageId: null
};

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2), 'utf8');
      return JSON.parse(JSON.stringify(fallback));
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
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
    high: parseRoleIds(process.env.HIGH_STAFF_ROLES)
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
    .setCustomId('tkt_claim')
    .setLabel(claimedBy ? 'مستلمة' : (btns.claim.label || 'استلام'))
    .setEmoji(btns.claim.emoji || '✋')
    .setStyle(getButtonStyle(btns.claim.style))
    .setDisabled(Boolean(claimedBy));

  const unclaimBtn = new ButtonBuilder()
    .setCustomId('tkt_unclaim')
    .setLabel(btns.unclaim.label || 'إلغاء الاستلام')
    .setEmoji(btns.unclaim.emoji || '↩️')
    .setStyle(getButtonStyle(btns.unclaim.style))
    .setDisabled(!claimedBy);

  const callStaffBtn = new ButtonBuilder()
    .setCustomId('tkt_call_staff')
    .setLabel(btns.call_staff.label || 'طلب إدارة')
    .setEmoji(btns.call_staff.emoji || '🔔')
    .setStyle(getButtonStyle(btns.call_staff.style));

  const callUserBtn = new ButtonBuilder()
    .setCustomId('tkt_call_user')
    .setLabel(btns.call_user.label || 'طلب عضو')
    .setEmoji(btns.call_user.emoji || '📩')
    .setStyle(getButtonStyle(btns.call_user.style));

  const summonUserBtn = new ButtonBuilder()
    .setCustomId('tkt_summon_user')
    .setLabel(btns.summon_user.label || 'استدعاء عضو')
    .setEmoji(btns.summon_user.emoji || '📣')
    .setStyle(getButtonStyle(btns.summon_user.style));

  const closeBtn = new ButtonBuilder()
    .setCustomId('tkt_close')
    .setLabel(btns.close.label || 'إغلاق')
    .setEmoji(btns.close.emoji || '🔒')
    .setStyle(getButtonStyle(btns.close.style));

  return [
    new ActionRowBuilder().addComponents(claimBtn, unclaimBtn, callStaffBtn, callUserBtn),
    new ActionRowBuilder().addComponents(summonUserBtn, closeBtn)
  ];
}

function buildPanelPayload() {
  const embed = new EmbedBuilder()
    .setColor(0xb8860b)
    .setTitle('🎫 SoftMC | Support Center')
    .setDescription(
      [
        'مرحباً بك في **مركز الدعم الفني الرسمي لسيرفر SoftMC**.',
        'اختر القسم المناسب لمشكلتك أو طلبك لفتح تذكرة خاصة مع فريق الإدارة.',
        '',
        '**الأقسام المتاحة:**',
        '🛠️ **1 - Technical Support | الدعم الفني**',
        '💬 **2 - General Questions | الاستفسارات العامة**',
        '🛒 **3 - Store & Payments | المتجر والمدفوعات**',
        '🚨 **4 - Player Reports | الشكاوى والبلاغات**',
        '👑 **5 - Management Contact | التواصل مع الإدارة**',
        '🎥 **6 - Media & Partnerships | التقديم على الميديا**'
      ].join('\n')
    )
    .setFooter({ text: 'SoftMC Official Ticket System • يرجى الالتزام بقوانين الدعم' })
    .setTimestamp();

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('softmc_ticket_category')
    .setPlaceholder('اختر قسم التذكرة من هنا...')
    .addOptions(
      {
        label: '1 - Technical Support | الدعم الفني',
        description: 'استفسارات ومشاكل تقنية داخل السيرفر',
        value: 'tech',
        emoji: '🛠️'
      },
      {
        label: '2 - General Questions | الاستفسارات العامة',
        description: 'استفسارات عامة عن السيرفر والقوانين',
        value: 'general',
        emoji: '💬'
      },
      {
        label: '3 - Store & Payments | المتجر والمدفوعات',
        description: 'مشاكل المتجر، الرتب، وعمليات الدفع',
        value: 'store',
        emoji: '🛒'
      },
      {
        label: '4 - Player Reports | الشكاوى والبلاغات',
        description: 'الإبلاغ عن لاعب مخالف أو تصرف غير مناسب',
        value: 'reports',
        emoji: '🚨'
      },
      {
        label: '5 - Management Contact | التواصل مع الإدارة',
        description: 'تواصل مباشر مع الإدارة العليا',
        value: 'management',
        emoji: '👑'
      },
      {
        label: '6 - Media & Partnerships | التقديم على الميديا',
        description: 'فتح تذكرة للتقديم على الميديا والشراكات',
        value: 'media',
        emoji: '🎥'
      }
    );

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(selectMenu)]
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

function formatMentionsForHtml(escapedText) {
  return String(escapedText || '')
    .replace(/&lt;@!?(\d+)&gt;/g, '<span class="mention user-mention">@User • $1</span>')
    .replace(/&lt;@&amp;(\d+)&gt;/g, '<span class="mention role-mention">@Role • $1</span>')
    .replace(/&lt;#(\d+)&gt;/g, '<span class="mention channel-mention">#Channel • $1</span>')
    .replace(/@everyone/g, '<span class="mention role-mention">@everyone</span>')
    .replace(/@here/g, '<span class="mention role-mention">@here</span>');
}

function buildTranscriptHtml(options = {}) {
  const {
    guildName = 'SoftMC',
    channelName = 'ticket',
    ownerId = '',
    claimedById = null,
    claimedByName = 'غير مستلمة',
    claimedByAvatar = '',
    closedById = '',
    ratingText = '',
    reasonText = '',
    messages = []
  } = options;

  const msgList = Array.isArray(messages) ? messages : [];

  const rowsHtml = msgList
    .map((m) => {
      const ts = m.createdTimestamp ? new Date(m.createdTimestamp).toLocaleString('ar-EG') : '';
      const author = escapeHtml(m.author?.tag || m.author?.username || 'Unknown');
      const username = m.author?.username ? ` (@${escapeHtml(m.author.username)})` : '';
      const avatarUrl = m.author?.avatarURL || '';

      const attachmentLinks =
        m.attachments && m.attachments.size
          ? Array.from(m.attachments.values())
              .map((att) => `<div class="attachment"><a href="${escapeHtml(att.url || '')}" target="_blank">📎 ${escapeHtml(att.name || 'مرفق')}</a></div>`)
              .join('')
          : '';

      const rawContent =
        m.content ||
        (m.embeds && m.embeds.length ? '[Embed Message]' : m.attachments && m.attachments.size ? '' : '');

      const formattedBody = rawContent
        ? formatMentionsForHtml(escapeHtml(rawContent)).replace(/\n/g, '<br>')
        : '';

      return `
        <div class="msg">
          <div class="msg-row">
            ${avatarUrl ? `<img class="msg-avatar" src="${escapeHtml(avatarUrl)}" alt="${author}" />` : '<div class="msg-avatar placeholder">👤</div>'}
            <div class="msg-content">
              <div class="meta">
                <span class="author">${author}${username}</span>
                <span class="time">${escapeHtml(ts)}</span>
              </div>
              ${formattedBody ? `<div class="body">${formattedBody}</div>` : ''}
              ${attachmentLinks}
            </div>
          </div>
        </div>
      `;
    })
    .join('\n');

  const ownerMentionHtml = ownerId ? `<span class="mention user-mention">@User • ${escapeHtml(ownerId)}</span>` : 'غير معروف';
  const claimerMentionHtml = claimedById
    ? `<span class="mention user-mention">${escapeHtml(claimedByName)} (${escapeHtml(claimedById)})</span>`
    : escapeHtml(claimedByName);
  const closerMentionHtml = closedById ? `<span class="mention user-mention">@User • ${escapeHtml(closedById)}</span>` : 'غير معروف';

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(guildName)} Transcript - ${escapeHtml(channelName)}</title>
  <style>
    body { font-family: Tahoma, Arial, sans-serif; background: #313338; color: #f2f3f5; padding: 24px; margin: 0; }
    .header { background: #2b2d31; padding: 18px; border-radius: 10px; margin-bottom: 20px; border-right: 4px solid #b8860b; display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
    .avatar { width: 54px; height: 54px; border-radius: 50%; object-fit: cover; }
    .chat-box { background: #2b2d31; padding: 14px; border-radius: 10px; }
    .msg { padding: 10px 8px; border-radius: 6px; margin-bottom: 6px; transition: background 0.15s; }
    .msg:hover { background: #26282c; }
    .msg-row { display: flex; align-items: flex-start; gap: 12px; }
    .msg-avatar { width: 42px; height: 42px; border-radius: 50%; object-fit: cover; flex-shrink: 0; background: #383a40; }
    .placeholder { display: flex; align-items: center; justify-content: center; font-size: 18px; }
    .msg-content { flex: 1; min-width: 0; }
    .meta { font-size: 13px; color: #b5bac1; margin-bottom: 5px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .author { color: #ffffff; font-weight: bold; }
    .time { font-size: 12px; color: #949ba4; }
    .body { font-size: 15px; line-height: 1.55; word-break: break-word; color: #dbdee1; }
    .mention { background: rgba(88, 101, 242, 0.28); color: #dee0fc; padding: 1px 6px; border-radius: 4px; font-size: 13px; font-weight: 500; }
    .role-mention { background: rgba(184, 134, 11, 0.28); color: #ffe599; }
    .channel-mention { background: rgba(88, 101, 242, 0.22); color: #c9cdff; }
    .attachment { margin-top: 6px; }
    .attachment a { color: #00a8fc; text-decoration: none; font-size: 13px; }
    .attachment a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="header">
    ${claimedByAvatar ? `<img class="avatar" src="${escapeHtml(claimedByAvatar)}" alt="Claimer" />` : ''}
    <div>
      <h2 style="margin:0 0 6px 0;">🎫 ${escapeHtml(guildName)} Ticket Transcript — #${escapeHtml(channelName)}</h2>
      <p style="margin:4px 0;">صاحب التذكرة: ${ownerMentionHtml} | المستلم: ${claimerMentionHtml} | أغلقها: ${closerMentionHtml}</p>
      ${ratingText ? `<p style="margin:4px 0;">التقييم: ${escapeHtml(ratingText)} | السبب: ${escapeHtml(reasonText)}</p>` : ''}
    </div>
  </div>
  <div class="chat-box">
    ${rowsHtml || '<p>لا توجد رسائل مسجلة في هذه التذكرة.</p>'}
  </div>
</body>
</html>`;
}

async function generateHtmlTranscript(channel, meta = {}) {
  const fetched = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  const messages = fetched ? Array.from(fetched.values()).reverse() : [];
  return buildTranscriptHtml({
    guildName: channel.guild?.name || 'SoftMC',
    channelName: channel.name,
    ownerId: meta.openerId || '',
    claimedById: meta.claimerId || null,
    claimedByName: meta.claimerTag || 'لم تُستلم',
    closedById: meta.closedById || '',
    messages
  });
}

function getSlashCommands() {
  const applytCmd = new SlashCommandBuilder()
    .setName('applyt')
    .setDescription('إرسال لوحة SoftMC | Support Center الخاصة بالتذاكر')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

  const afkCmd = new SlashCommandBuilder()
    .setName('afk')
    .setDescription('تفعيل وضع AFK وحساب مدة غيابك حتى أول رسالة تكتبها')
    .addStringOption((opt) =>
      opt
        .setName('reason')
        .setDescription('سبب الغياب (اختياري)')
        .setRequired(false)
    );

  const editAfkCmd = new SlashCommandBuilder()
    .setName('editafk')
    .setDescription('إدارة اختصارات AFK النصية بدون سلاش (حد أقصى 3 اختصارات)')
    .addStringOption((opt) =>
      opt
        .setName('action')
        .setDescription('اختر العملية')
        .setRequired(true)
        .addChoices(
          { name: 'إضافة أو تعديل اختصار', value: 'set' },
          { name: 'حذف اختصار', value: 'remove' },
          { name: 'عرض اختصاراتي', value: 'list' }
        )
    )
    .addStringOption((opt) =>
      opt
        .setName('word')
        .setDescription('الكلمة أو الجملة التي تفعل AFK بدون سلاش (مثال: بروح)')
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt
        .setName('reason')
        .setDescription('السبب الافتراضي لهذا الاختصار (اختياري)')
        .setRequired(false)
    );

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
          { name: 'Call Staff (طلب إدارة)', value: 'call_staff' },
          { name: 'Call User (طلب عضو)', value: 'call_user' },
          { name: 'Summon User (استدعاء عضو)', value: 'summon_user' },
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

  return [
    applytCmd.toJSON(),
    afkCmd.toJSON(),
    editAfkCmd.toJSON(),
    ticketBtnCmd.toJSON(),
    resetCmd.toJSON()
  ];
}

function getPrimaryGuildId() {
  const raw = process.env.GUILD_ID || process.env.GUILD_IDS || '';
  const firstId = raw
    .split(',')
    .map((id) => id.replace(/^"+|"+$/g, '').trim())
    .filter(Boolean)[0];
  return firstId || '';
}

async function registerSlashCommands(client) {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID || client.user?.id;
  if (!token || !clientId) return;

  const rest = new REST({ version: '10' }).setToken(token);
  const body = getSlashCommands();
  const guildId = getPrimaryGuildId();

  try {
    // مسح أوامر الجلوبال بالكامل (بما فيها أي أمر botcontrol أو أوامر مكررة قديمة)
    await rest.put(Routes.applicationCommands(clientId), { body: [] });

    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
    } else {
      await rest.put(Routes.applicationCommands(clientId), { body });
    }
  } catch (err) {
    console.error('Failed to register slash commands:', err);
  }
}

async function handleConfigSlashCommand(interaction, helpers = {}) {
  const { loadData, saveData, updateTopClaimsBoard: updateBoard } = helpers;

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      content: '❌ هذا الأمر متاح فقط لأصحاب صلاحية **Administrator**.',
      flags: MessageFlags.Ephemeral
    });
  }

  if (interaction.commandName === 'ticket-btn') {
    const btnKey = interaction.options.getString('button');
    const color = interaction.options.getString('color');
    const role = interaction.options.getRole('role');
    const clearRole = interaction.options.getBoolean('clear_role');

    const data = typeof loadData === 'function' ? loadData() : getConfig();
    data.buttons = data.buttons || {};
    const current = data.buttons[btnKey] || { style: 'Secondary', roleId: null };
    const beforeStr = `style=${current.style}, role=${current.roleId || 'none'}`;

    if (color) current.style = color;
    if (clearRole) current.roleId = null;
    else if (role) current.roleId = role.id;

    data.buttons[btnKey] = current;
    if (typeof saveData === 'function') saveData(data);
    saveConfig(data);

    const afterStr = `style=${current.style}, role=${current.roleId || 'none'}`;
    await sendConfigLog(interaction.client, {
      user: interaction.user,
      action: 'تعديل زر تذكرة',
      target: btnKey,
      before: beforeStr,
      after: afterStr
    });

    return interaction.reply({
      content: `✅ تم تحديث إعدادات الزر **${btnKey}** (${afterStr}).`,
      flags: MessageFlags.Ephemeral
    });
  }

  if (interaction.commandName === 'reset') {
    const staffUser = interaction.options.getUser('staff');
    const amount = interaction.options.getInteger('amount');

    const data = typeof loadData === 'function' ? loadData() : { claimStats: {} };
    data.claimStats = data.claimStats || {};

    if (staffUser) {
      const prev = data.claimStats[staffUser.id] || 0;
      const next = amount ? Math.max(0, prev - amount) : 0;
      data.claimStats[staffUser.id] = next;

      if (typeof saveData === 'function') saveData(data);
      if (typeof updateBoard === 'function') await updateBoard();
      await updateTopClaimsBoard(interaction.client);

      return interaction.reply({
        content: `✅ تم تحديث نقاط <@${staffUser.id}> من **${prev}** إلى **${next}**.`,
        flags: MessageFlags.Ephemeral
      });
    } else {
      data.claimStats = {};
      if (typeof saveData === 'function') saveData(data);
      if (typeof updateBoard === 'function') await updateBoard();
      await updateTopClaimsBoard(interaction.client);

      return interaction.reply({
        content: '✅ تم تصفير جميع نقاط استلام التذاكر بنجاح.',
        flags: MessageFlags.Ephemeral
      });
    }
  }
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
  buildTranscriptHtml,
  generateHtmlTranscript,
  getSlashCommands,
  registerSlashCommands,
  handleConfigSlashCommand
};
