const {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
  AttachmentBuilder,
  EmbedBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const {
  buildTranscriptHtml,
  registerSlashCommands,
  handleConfigSlashCommand
} = require('./utils');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

// قفل منع التضارب عند ضغط زر الاستلام في نفس اللحظة
const claimLocks = new Set();

// مدة الانتظار بين فتح التذاكر في كل الأقسام (دقيقتان)
const TICKET_COOLDOWN_MS = 2 * 60 * 1000;

// الحد الأقصى لاختصارات AFK النصية لكل عضو
const MAX_AFK_SHORTCUTS = 3;

// ================= الإعدادات والـ IDs =================
const parseIds = (val) =>
  (val || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const CONFIG = {
  juniorRoles: parseIds(process.env.JUNIOR_STAFF_ROLES),
  seniorRoles: parseIds(process.env.SENIOR_STAFF_ROLES),
  highRoles: parseIds(process.env.HIGH_STAFF_ROLES),
  ticketCategoryId: process.env.TICKET_CATEGORY_ID || '',
  mediaChannelId: process.env.MEDIA_CHANNEL_ID || '',
  ratingsChannelId: process.env.RATINGS_CHANNEL_ID || '',
  ticketLogChannelId: process.env.TICKET_LOG_CHANNEL_ID || '',
  configLogChannelId: process.env.CONFIG_LOG_CHANNEL_ID || '',
  topClaimsChannelId: process.env.TOP_CLAIMS_CHANNEL_ID || ''
};

// أقسام التذاكر الستة بنفس النص الأصلي
const CATEGORIES = {
  tech: {
    key: 'tech',
    label: '1 - Technical Support | الدعم الفني',
    shortLabel: 'Technical Support',
    emoji: '🛠️',
    style: ButtonStyle.Secondary,
    body:
      `1 - Technical Support | الدعم الفني\n` +
      `-# Report technical problems, bugs, or issues affecting your gameplay.\n` +
      `-# للإبلاغ عن المشاكل التقنية والأخطاء التي تواجهك أثناء اللعب.`,
    mentionType: 'junior'
  },
  general: {
    key: 'general',
    label: '2 - General Questions | الاستفسارات العامة',
    shortLabel: 'General Questions',
    emoji: '💬',
    style: ButtonStyle.Secondary,
    body:
      `2 - General Questions | الاستفسارات العامة\n` +
      `-# Need information? Ask us about the server, its features, or rules.\n` +
      `-# للاستفسار عن السيرفر وأنظمته ومميزاته والقوانين الخاصة به.`,
    mentionType: 'junior'
  },
  store: {
    key: 'store',
    label: '3 - Store & Payments | المتجر والمدفوعات',
    shortLabel: 'Store & Payments',
    emoji: '🛒',
    style: ButtonStyle.Secondary,
    body:
      `3 - Store & Payments | المتجر والمدفوعات\n` +
      `-# Get help with rank purchases, Coin transactions, and payment issues.\n` +
      `-# للمساعدة في شراء الرتب والكوينز ومتابعة عمليات الدفع.`,
    mentionType: 'junior_and_senior'
  },
  reports: {
    key: 'reports',
    label: '4 - Player Reports | الشكاوى والبلاغات',
    shortLabel: 'Report Player',
    emoji: '🚨',
    style: ButtonStyle.Secondary,
    body:
      `4 - Player Reports | الشكاوى والبلاغات\n` +
      `-# Report players who break the rules or engage in inappropriate behavior.\n` +
      `-# لتقديم بلاغ ضد لاعب مخالف أو الإبلاغ عن تصرف غير مناسب.`,
    mentionType: 'junior'
  },
  management: {
    key: 'management',
    label: '5 - Management Contact | التواصل مع الإدارة',
    shortLabel: 'High Support',
    emoji: '👑',
    style: ButtonStyle.Secondary,
    body:
      `5 - Management Contact | التواصل مع الإدارة\n` +
      `-# Contact the senior management team regarding important or private matters.\n` +
      `-# للتواصل مع الإدارة العليا بخصوص الأمور المهمة أو الخاصة.`,
    mentionType: 'high'
  },
  media: {
    key: 'media',
    label: '6 - Media & Partnerships | التقديم على الميديا',
    shortLabel: 'Media Apply',
    emoji: '🎥',
    style: ButtonStyle.Secondary,
    body:
      `6 - Media & Partnerships | التقديم على الميديا\n` +
      `-# Apply for Media ranks or discuss content creation partnerships with SoftMC.\n` +
      `-# للتقديم على رتبة الميديا أو طلب التعاون وصناعة المحتوى مع SoftMC.`,
    mentionType: 'none'
  }
};

// حفظ حالة التذاكر، عداد الاستلام، اختصارات AFK، وتخصيص الأزرار
const DATA_FILE = path.join(__dirname, 'tickets_data.json');

function loadData() {
  const defaultButtons = {
    claim: { style: 'Primary', roleId: null },
    unclaim: { style: 'Secondary', roleId: null },
    call_staff: { style: 'Secondary', roleId: null },
    call_user: { style: 'Secondary', roleId: null },
    summon_user: { style: 'Secondary', roleId: null },
    close: { style: 'Danger', roleId: null }
  };

  if (!fs.existsSync(DATA_FILE)) {
    const initial = {
      tickets: {},
      claimStats: {},
      afkUsers: {},
      afkShortcuts: {},
      ticketCooldowns: {},
      topBoardMessageId: null,
      buttons: defaultButtons
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    parsed.tickets = parsed.tickets || {};
    parsed.claimStats = parsed.claimStats || {};
    parsed.afkUsers = parsed.afkUsers || {};
    parsed.afkShortcuts = parsed.afkShortcuts || {};
    parsed.ticketCooldowns = parsed.ticketCooldowns || {};
    parsed.topBoardMessageId = parsed.topBoardMessageId || null;
    parsed.buttons = Object.assign(defaultButtons, parsed.buttons || {});
    return parsed;
  } catch {
    return {
      tickets: {},
      claimStats: {},
      afkUsers: {},
      afkShortcuts: {},
      ticketCooldowns: {},
      topBoardMessageId: null,
      buttons: defaultButtons
    };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (days > 0) parts.push(`${days} يوم`);
  if (hours > 0) parts.push(`${hours} ساعة`);
  if (minutes > 0) parts.push(`${minutes} دقيقة`);
  parts.push(`${seconds} ثانية`);

  return parts.join(' و ');
}

// عداد مزخرف في سطر واحد متماسك بدون كسر للسطر في الموبايل
function formatFancyCounter(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n) => String(n).padStart(2, '0');
  const blocks = [];
  if (days > 0) blocks.push(`⸢ ${pad(days)} يوم ⸥`);
  blocks.push(`⸢ ${pad(hours)} ساعة ⸥`);
  blocks.push(`⸢ ${pad(minutes)} دقيقة ⸥`);
  blocks.push(`⸢ ${pad(seconds)} ثانية ⸥`);
  return blocks.join(' • ');
}

function buildAfkActivatedPayload(userId, reason, sinceMs) {
  const unixSec = Math.floor(sinceMs / 1000);
  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('💤 ═══『 وضع الغياب • AFK 』═══ 💤')
    .setDescription(
      `✦ **العضو:** <@${userId}>\n` +
      `✦ **السبب:** ${reason}\n` +
      `✦ **بدأ منذ:** <t:${unixSec}:R> (<t:${unixSec}:t>)\n` +
      `✦ **العداد:** ${formatFancyCounter(0)}`
    )
    .setFooter({ text: 'SoftMC AFK • سيتم إنهاء الوضع تلقائياً عند أول رسالة تكتبها' })
    .setTimestamp(sinceMs);

  return {
    content: `<@${userId}>`,
    embeds: [embed]
  };
}

function buildAfkWelcomeBackEmbed(userId, awayMs, missedContacts = []) {
  const counterText = formatFancyCounter(awayMs);

  const contactsSection =
    Array.isArray(missedContacts) && missedContacts.length > 0
      ? `\n\n📩 **محاولات التواصل أثناء غيابك (${missedContacts.length}):**\n` +
        missedContacts
          .slice(0, 10)
          .map((c) => {
            const timeTag = c.at ? `<t:${Math.floor(c.at / 1000)}:R>` : '';
            const linkPart = c.url ? ` — [الانتقال للرسالة](${c.url})` : '';
            return `• <@${c.senderId}> حاول التواصل معك ${timeTag}${linkPart}`;
          })
          .join('\n')
      : '\n\n✨ *لم يحاول أحد التواصل معك أثناء غيابك.*';

  return new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('⚡ ═══『 أهلاً بعودتك • AFK ENDED 』═══ ⚡')
    .setDescription(
      `✦ **العضو:** <@${userId}>\n` +
      `✦ **مدة الغياب:** ${counterText}` +
      contactsSection
    )
    .setFooter({ text: 'SoftMC AFK • تم إنهاء وضع الغياب بنجاح' })
    .setTimestamp();
}

function mapStyle(styleName) {
  const map = {
    Primary: ButtonStyle.Primary,
    Secondary: ButtonStyle.Secondary,
    Success: ButtonStyle.Success,
    Danger: ButtonStyle.Danger
  };
  return map[styleName] || ButtonStyle.Secondary;
}

function hasAnyRole(member, roleIds) {
  if (!member || !member.roles) return false;
  return roleIds.some((id) => member.roles.cache.has(id));
}

function isJuniorStaff(member) {
  return hasAnyRole(member, CONFIG.juniorRoles);
}

function isSeniorStaff(member) {
  return hasAnyRole(member, CONFIG.seniorRoles);
}

function isHighStaff(member) {
  return hasAnyRole(member, CONFIG.highRoles);
}

// قراءة إن كان العضو إدارياً بدون الاعتماد الصارم على IDs محددة فقط
function isAnyStaff(member, ticket = null) {
  if (!member) return false;
  if (ticket && ticket.claimedBy && member.id === ticket.claimedBy) return true;

  if (isJuniorStaff(member) || isSeniorStaff(member) || isHighStaff(member)) {
    return true;
  }

  const perms = member.permissions;
  if (
    perms?.has(PermissionFlagsBits.Administrator) ||
    perms?.has(PermissionFlagsBits.ManageChannels) ||
    perms?.has(PermissionFlagsBits.ManageMessages) ||
    perms?.has(PermissionFlagsBits.ModerateMembers) ||
    perms?.has(PermissionFlagsBits.KickMembers) ||
    perms?.has(PermissionFlagsBits.BanMembers) ||
    perms?.has(PermissionFlagsBits.ManageRoles)
  ) {
    return true;
  }

  const staffKeywords = [
    'admin', 'staff', 'mod', 'moderator', 'support', 'management', 'manager',
    'owner', 'helper', 'trial', 'ادارة', 'إدارة', 'اداري', 'إداري', 'مشرف', 'دعم', 'مساعد'
  ];

  return Boolean(
    member.roles?.cache?.some((r) => {
      if (r.id === member.guild?.id) return false;
      const roleName = (r.name || '').toLowerCase();
      return staffKeywords.some((kw) => roleName.includes(kw));
    })
  );
}

function getCategoryMentions(categoryKey) {
  const cat = CATEGORIES[categoryKey];
  if (!cat) return '';
  if (cat.mentionType === 'junior') {
    return CONFIG.juniorRoles.map((id) => `<@&${id}>`).join(' ');
  }
  if (cat.mentionType === 'junior_and_senior') {
    const all = [...new Set([...CONFIG.juniorRoles, ...CONFIG.seniorRoles])];
    return all.map((id) => `<@&${id}>`).join(' ');
  }
  if (cat.mentionType === 'high') {
    return CONFIG.highRoles.map((id) => `<@&${id}>`).join(' ');
  }
  return '';
}

// ================= لوحة توب 5 مستلمين التكتات =================
function buildTopClaimsPayload(data) {
  const entries = Object.entries(data.claimStats || {})
    .filter(([, count]) => Number(count) > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
  const lines = entries.length
    ? entries.map(([uid, count], i) => `${medals[i]} <@${uid}> — **${count}** تكت`).join('\n')
    : 'لا يوجد إداريون مستلمون للتذاكر حتى الآن.';

  const embed = new EmbedBuilder()
    .setTitle('🏆 توب 5 أكثر الإداريين استلاماً للتذاكر | SoftMC')
    .setDescription(lines)
    .setColor(0xf1c40f)
    .setFooter({ text: 'آخر تحديث' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('refresh_top_claims')
      .setLabel('إعادة تحميل')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

async function updateTopClaimsBoard() {
  if (!CONFIG.topClaimsChannelId) return;
  const channel = await client.channels.fetch(CONFIG.topClaimsChannelId).catch(() => null);
  if (!channel) return;

  const data = loadData();
  const payload = buildTopClaimsPayload(data);

  if (data.topBoardMessageId) {
    const existingMsg = await channel.messages.fetch(data.topBoardMessageId).catch(() => null);
    if (existingMsg) {
      await existingMsg.edit(payload).catch(() => null);
      return;
    }
  }

  const sent = await channel.send(payload).catch(() => null);
  if (sent) {
    data.topBoardMessageId = sent.id;
    saveData(data);
  }
}

// كل قسم في رسالة نصية عادية (مش Embed) ومعاه الزرار بتاعه تحتيه مباشرة
function buildCategoryMessages() {
  return Object.values(CATEGORIES).map((cat) => {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`open_ticket_${cat.key}`)
        .setLabel(cat.shortLabel)
        .setEmoji(cat.emoji)
        .setStyle(cat.style)
    );

    return {
      content: cat.body,
      components: [row]
    };
  });
}

function buildTicketActionRows(buttonSettings, claimedBy = null) {
  const claimCfg = buttonSettings.claim || { style: 'Primary' };
  const unclaimCfg = buttonSettings.unclaim || { style: 'Secondary' };
  const callStaffCfg = buttonSettings.call_staff || { style: 'Secondary' };
  const callUserCfg = buttonSettings.call_user || { style: 'Secondary' };
  const summonUserCfg = buttonSettings.summon_user || { style: 'Secondary' };
  const closeCfg = buttonSettings.close || { style: 'Danger' };

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('tkt_claim')
      .setLabel(claimedBy ? 'مستلمة' : 'استلام')
      .setStyle(mapStyle(claimCfg.style))
      .setDisabled(Boolean(claimedBy)),
    new ButtonBuilder()
      .setCustomId('tkt_unclaim')
      .setLabel('إلغاء الاستلام')
      .setStyle(mapStyle(unclaimCfg.style))
      .setDisabled(!claimedBy),
    new ButtonBuilder()
      .setCustomId('tkt_call_staff')
      .setLabel('طلب إدارة')
      .setStyle(mapStyle(callStaffCfg.style)),
    new ButtonBuilder()
      .setCustomId('tkt_call_user')
      .setLabel('طلب عضو')
      .setStyle(mapStyle(callUserCfg.style))
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('tkt_summon_user')
      .setLabel('استدعاء عضو')
      .setStyle(mapStyle(summonUserCfg.style)),
    new ButtonBuilder()
      .setCustomId('tkt_close')
      .setLabel('إغلاق')
      .setStyle(mapStyle(closeCfg.style))
  );

  return [row1, row2];
}

// ================= جاهزية البوت وتسجيل الأوامر =================
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerSlashCommands(client);
  await updateTopClaimsBoard();
});

// ================= نظام AFK والاختصارات والمنشن/الرد =================
client.on('messageCreate', async (message) => {
  if (!message.guild || message.author.bot) return;

  const data = loadData();
  data.afkUsers = data.afkUsers || {};
  data.afkShortcuts = data.afkShortcuts || {};
  let dataChanged = false;

  const currentAfkEntry = data.afkUsers[message.author.id];
  const trimmedContent = (message.content || '').trim();
  const normalizedContent = trimmedContent.toLowerCase();

  // 1) إنهاء وضع AFK عند كتابة أي رسالة من العضو نفسه + عرض المحاولات التي حدثت أثناء غيابه
  if (currentAfkEntry) {
    const elapsedSinceSet = Date.now() - currentAfkEntry.since;
    if (elapsedSinceSet > 1500) {
      const missedContacts = Array.isArray(currentAfkEntry.missedContacts)
        ? currentAfkEntry.missedContacts
        : [];
      delete data.afkUsers[message.author.id];
      dataChanged = true;

      const welcomeEmbed = buildAfkWelcomeBackEmbed(message.author.id, elapsedSinceSet, missedContacts);
      const uniqueSendersMentions = [...new Set(missedContacts.map((c) => `<@${c.senderId}>`))].join(' ');

      await message.reply({
        content: uniqueSendersMentions ? `<@${message.author.id}> ${uniqueSendersMentions}` : `<@${message.author.id}>`,
        embeds: [welcomeEmbed]
      }).catch(() => null);
    }
  } else if (normalizedContent) {
    // 2) تفعيل وضع AFK تلقائياً لو كتب العضو أحد اختصاراته النصية (بحد أقصى 3 اختصارات)
    const userShortcuts = Array.isArray(data.afkShortcuts[message.author.id])
      ? data.afkShortcuts[message.author.id]
      : [];

    const matchedShortcut = userShortcuts.find(
      (item) => item && String(item.word || '').toLowerCase() === normalizedContent
    );

    if (matchedShortcut) {
      const now = Date.now();
      const reason = matchedShortcut.reason || 'غير محدد';
      data.afkUsers[message.author.id] = {
        since: now,
        reason,
        missedContacts: []
      };
      dataChanged = true;

      await message.reply(buildAfkActivatedPayload(message.author.id, reason, now)).catch(() => null);
    }
  }

  // 3) التحقق إن كان المرسل منشن أو رد (Reply) على عضو في وضع AFK
  const targetAfkUserIds = new Set();
  if (message.mentions?.users?.size) {
    for (const u of message.mentions.users.values()) {
      if (!u.bot && u.id !== message.author.id) {
        targetAfkUserIds.add(u.id);
      }
    }
  }

  if (message.reference?.messageId) {
    const repliedMsg = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
    if (repliedMsg?.author && !repliedMsg.author.bot && repliedMsg.author.id !== message.author.id) {
      targetAfkUserIds.add(repliedMsg.author.id);
    }
  }

  for (const afkUserId of targetAfkUserIds) {
    const targetEntry = data.afkUsers[afkUserId];
    if (!targetEntry) continue;

    targetEntry.missedContacts = Array.isArray(targetEntry.missedContacts)
      ? targetEntry.missedContacts
      : [];

    targetEntry.missedContacts.push({
      senderId: message.author.id,
      url: message.url,
      at: Date.now()
    });
    dataChanged = true;

    const awayCounter = formatFancyCounter(Date.now() - targetEntry.since);
    const awayReason = targetEntry.reason || 'غير محدد';

    const statusEmbed = new EmbedBuilder()
      .setColor(0xf39c12)
      .setTitle('💤 ═══『 العضو في وضع AFK 』═══ 💤')
      .setDescription(
        `✦ **العضو:** <@${afkUserId}>\n` +
        `✦ **السبب:** ${awayReason}\n` +
        `✦ **مدة الغياب:** ${awayCounter}`
      )
      .setFooter({ text: 'سيتم إشعاره بمحاولة تواصلك فور عودته' });

    await message.reply({
      embeds: [statusEmbed]
    }).catch(() => null);
  }

  if (dataChanged) {
    saveData(data);
  }
});

// ================= معالجة أوامر السلاش =================
client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'afk') {
      const reason = (interaction.options.getString('reason') || '').trim() || 'غير محدد';
      const now = Date.now();
      const data = loadData();
      data.afkUsers = data.afkUsers || {};
      data.afkUsers[interaction.user.id] = {
        since: now,
        reason,
        missedContacts: []
      };
      saveData(data);

      return interaction.reply(buildAfkActivatedPayload(interaction.user.id, reason, now));
    }

    if (interaction.commandName === 'editafk') {
      const action = interaction.options.getString('action');
      const rawWord = (interaction.options.getString('word') || '').trim();
      const rawReason = (interaction.options.getString('reason') || '').trim();

      const data = loadData();
      data.afkShortcuts = data.afkShortcuts || {};
      const currentList = Array.isArray(data.afkShortcuts[interaction.user.id])
        ? [...data.afkShortcuts[interaction.user.id]]
        : [];

      if (action === 'list') {
        if (currentList.length === 0) {
          return interaction.reply({
            content: `ℹ️ ليس لديك أي اختصارات AFK مسجلة حالياً (الحد الأقصى: **${MAX_AFK_SHORTCUTS}** اختصارات).`,
            flags: MessageFlags.Ephemeral
          });
        }

        const formattedList = currentList
          .map((item, idx) => `${idx + 1}. الكلمة: **${item.word}** — السبب: **${item.reason || 'غير محدد'}**`)
          .join('\n');

        return interaction.reply({
          content: `📋 **اختصارات AFK الخاصة بك (${currentList.length}/${MAX_AFK_SHORTCUTS}):**\n${formattedList}`,
          flags: MessageFlags.Ephemeral
        });
      }

      if (!rawWord) {
        return interaction.reply({
          content: '❌ يرجى كتابة الكلمة أو الجملة في خيار `word` (مثال: `بروح`).',
          flags: MessageFlags.Ephemeral
        });
      }

      const lowerWord = rawWord.toLowerCase();
      const existingIndex = currentList.findIndex(
        (item) => String(item.word || '').toLowerCase() === lowerWord
      );

      if (action === 'remove') {
        if (existingIndex === -1) {
          return interaction.reply({
            content: `❌ الاختصار **"${rawWord}"** غير موجود ضمن اختصاراتك.`,
            flags: MessageFlags.Ephemeral
          });
        }

        currentList.splice(existingIndex, 1);
        if (currentList.length > 0) {
          data.afkShortcuts[interaction.user.id] = currentList;
        } else {
          delete data.afkShortcuts[interaction.user.id];
        }
        saveData(data);

        return interaction.reply({
          content: `🗑️ تم حذف الاختصار **"${rawWord}"** بنجاح (${currentList.length}/${MAX_AFK_SHORTCUTS}).`,
          flags: MessageFlags.Ephemeral
        });
      }

      // action === 'set' (إضافة أو تعديل)
      const reasonToSave = rawReason || (existingIndex !== -1 ? currentList[existingIndex].reason : 'غير محدد');

      if (existingIndex !== -1) {
        currentList[existingIndex] = {
          word: rawWord,
          reason: reasonToSave
        };
      } else {
        if (currentList.length >= MAX_AFK_SHORTCUTS) {
          return interaction.reply({
            content: `⚠️ وصلت للحد الأقصى وهو **${MAX_AFK_SHORTCUTS} اختصارات** فقط. احذف اختصاراً أولاً عبر \`/editafk action:حذف\`.`,
            flags: MessageFlags.Ephemeral
          });
        }
        currentList.push({
          word: rawWord,
          reason: reasonToSave
        });
      }

      data.afkShortcuts[interaction.user.id] = currentList;
      saveData(data);

      return interaction.reply({
        content:
          `✅ تم حفظ الاختصار **"${rawWord}"** (السبب: **${reasonToSave}**).\n` +
          `عند كتابة **"${rawWord}"** في الشات بدون سلاش سيتم تفعيل وضع **AFK** تلقائياً (${currentList.length}/${MAX_AFK_SHORTCUTS}).`,
        flags: MessageFlags.Ephemeral
      });
    }

    if (interaction.commandName === 'applyt') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({
          content: '❌ هذا الأمر متاح فقط لأصحاب صلاحية **Administrator**.',
          flags: MessageFlags.Ephemeral
        });
      }

      await interaction.channel.send({
        content: '# SoftMC | Support Center'
      });

      const categoryMsgs = buildCategoryMessages();
      for (const msg of categoryMsgs) {
        await interaction.channel.send(msg);
      }

      return interaction.reply({
        content: '✅ تم إرسال لوحة **SoftMC | Support Center** بالشكل الأصلي (كل قسم رسالة نصية ومعاه الزرار بتاعه).',
        flags: MessageFlags.Ephemeral
      });
    }

    // أوامر سلاش تعديل الأزرار وأمر /reset
    await handleConfigSlashCommand(interaction, {
      loadData,
      saveData,
      config: CONFIG,
      updateTopClaimsBoard
    });
    return;
  }

  // ================= معالجة الأزرار =================
  if (interaction.isButton()) {
    const id = interaction.customId;

    if (id === 'refresh_top_claims') {
      const data = loadData();
      const payload = buildTopClaimsPayload(data);
      return interaction.update(payload);
    }

    // 1) فتح قسم من لوحة التذاكر (بما فيهم الميديا كتكت عادي)
    if (id.startsWith('open_ticket_')) {
      const catKey = id.replace('open_ticket_', '');
      const category = CATEGORIES[catKey];
      if (!category) return;

      const preData = loadData();
      preData.ticketCooldowns = preData.ticketCooldowns || {};
      const lastOpenedAt = preData.ticketCooldowns[interaction.user.id] || 0;
      const remainingMs = TICKET_COOLDOWN_MS - (Date.now() - lastOpenedAt);

      if (remainingMs > 0) {
        return interaction.reply({
          content: `⏳ لقد فتحت تذكرة مؤخراً. يمكنك فتح تذكرة جديدة في أي قسم بعد **${formatDuration(remainingMs)}**.`,
          flags: MessageFlags.Ephemeral
        });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const data = loadData();
      data.ticketCooldowns = data.ticketCooldowns || {};
      data.ticketCooldowns[interaction.user.id] = Date.now();

      const guild = interaction.guild;
      const member = interaction.member;

      const permissionOverwrites = [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: member.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles
          ]
        },
        {
          id: client.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ManageMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
        }
      ];

      const staffToAllow = [...new Set([...CONFIG.juniorRoles, ...CONFIG.seniorRoles, ...CONFIG.highRoles])];
      for (const roleId of staffToAllow) {
        if (guild.roles.cache.has(roleId)) {
          permissionOverwrites.push({
            id: roleId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.AttachFiles
            ]
          });
        }
      }

      const safeName = `${catKey}-${member.user.username}`
        .toLowerCase()
        .replace(/[^a-z0-9-_]/g, '')
        .slice(0, 90) || `ticket-${Date.now().toString().slice(-5)}`;

      const targetParent =
        catKey === 'media' && CONFIG.mediaChannelId
          ? CONFIG.mediaChannelId
          : CONFIG.ticketCategoryId || null;

      const channel = await guild.channels.create({
        name: safeName,
        type: ChannelType.GuildText,
        parent: targetParent && guild.channels.cache.get(targetParent)?.type === ChannelType.GuildCategory ? targetParent : (CONFIG.ticketCategoryId || null),
        permissionOverwrites
      });

      data.tickets[channel.id] = {
        ownerId: member.id,
        categoryKey: catKey,
        claimedBy: null,
        claimedHistory: [],
        createdAt: new Date().toISOString()
      };
      saveData(data);

      const mentions = getCategoryMentions(catKey);
      const embedDescription =
        `أهلاً بك <@${member.id}> في تذكرتك!\n\n` +
        `${category.body}` +
        `${mentions ? `\n\n${mentions}` : ''}`;

      const ticketEmbed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle(category.label)
        .setDescription(embedDescription);

      await channel.send({
        content: mentions || undefined,
        embeds: [ticketEmbed],
        components: buildTicketActionRows(data.buttons, null)
      });

      return interaction.editReply({
        content: `✅ تم فتح تذكرتك بنجاح: <#${channel.id}>`
      });
    }

    // 2) الأزرار داخل التذكرة
    if (id.startsWith('tkt_')) {
      const data = loadData();
      const ticket = data.tickets[interaction.channel.id];
      if (!ticket) {
        return interaction.reply({
          content: '❌ هذه الروم ليست مسجلة كتذكرة نشطة.',
          flags: MessageFlags.Ephemeral
        });
      }

      const member = interaction.member;
      const isOwner = interaction.user.id === ticket.ownerId;
      const isClaimer = ticket.claimedBy === interaction.user.id;
      const staffMember = isAnyStaff(member, ticket) && !isOwner;

      const btnKey = id.replace('tkt_', '');
      const btnCfg = data.buttons[btnKey];
      if (btnCfg?.roleId && !member.roles.cache.has(btnCfg.roleId) && !member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({
          content: '❌ ليس لديك الرول المحدد لاستخدام هذا الزر.',
          flags: MessageFlags.Ephemeral
        });
      }

      // زر الاستلام (Claim) مع منع التضارب وحساب النقاط لأول مستلم فقط
      if (id === 'tkt_claim') {
        if (!staffMember) {
          return interaction.reply({
            content: '❌ هذا الزر مخصص للإدارة فقط ولا يمكن لصاحب التذكرة استخدامه.',
            flags: MessageFlags.Ephemeral
          });
        }

        const lockKey = interaction.channel.id;
        if (claimLocks.has(lockKey)) {
          return interaction.reply({
            content: '⏳ جاري معالجة استلام التذكرة بواسطة شخص آخر الآن...',
            flags: MessageFlags.Ephemeral
          });
        }

        claimLocks.add(lockKey);
        try {
          const freshData = loadData();
          const freshTicket = freshData.tickets[interaction.channel.id];
          if (!freshTicket) {
            return interaction.reply({
              content: '❌ التذكرة غير متاحة.',
              flags: MessageFlags.Ephemeral
            });
          }

          if (freshTicket.claimedBy) {
            return interaction.reply({
              content: `❌ التذكرة مستلمة بالفعل بواسطة <@${freshTicket.claimedBy}> ولا يمكن لأحد آخر استلامها.`,
              flags: MessageFlags.Ephemeral
            });
          }

          freshTicket.claimedHistory = freshTicket.claimedHistory || [];
          const previousClaimers = freshTicket.claimedHistory.filter((uid) => uid !== interaction.user.id);
          const alreadyClaimedBySameUser = freshTicket.claimedHistory.includes(interaction.user.id);

          freshTicket.claimedBy = interaction.user.id;

          if (!alreadyClaimedBySameUser) {
            freshTicket.claimedHistory.push(interaction.user.id);
            freshData.claimStats[interaction.user.id] = (freshData.claimStats[interaction.user.id] || 0) + 1;
          }

          saveData(freshData);
          await updateTopClaimsBoard();

          if (interaction.message && interaction.message.editable) {
            await interaction.message.edit({
              components: buildTicketActionRows(freshData.buttons, freshTicket.claimedBy)
            }).catch(() => null);
          }

          const userTotal = freshData.claimStats[interaction.user.id] || 0;
          let replyMsg = `✅ تم استلام التذكرة بواسطة <@${interaction.user.id}> (إجمالي استلاماته: **${userTotal}**).`;

          if (alreadyClaimedBySameUser) {
            replyMsg = `✅ تم استلام التذكرة بواسطة <@${interaction.user.id}> (تم احتساب التكت لك مسبقاً في أول استلام — رصيدك: **${userTotal}**).`;
          } else if (previousClaimers.length > 0) {
            const prevMentions = previousClaimers.map((uid) => `<@${uid}>`).join('، ');
            replyMsg += `\nℹ️ ملحوظة: تم احتساب التكت أيضاً للإداري السابق (${prevMentions}).`;
          }

          return interaction.reply({ content: replyMsg });
        } finally {
          claimLocks.delete(lockKey);
        }
      }

      // زر الإغلاق -> أي إداري يقدر يغلقه أو صاحب التذكرة
      if (id === 'tkt_close') {
        if (!staffMember && !isOwner && !isClaimer) {
          return interaction.reply({
            content: '❌ لا تملك صلاحية إغلاق هذه التذكرة.',
            flags: MessageFlags.Ephemeral
          });
        }

        const closedById = interaction.user.id;
        await interaction.reply({
          content: `🔒 جاري إغلاق التذكرة بواسطة <@${closedById}>... بانتظار تقييم <@${ticket.ownerId}> خلال **12 ثانية**.`
        });

        const starRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`rate_1_${interaction.channel.id}`).setLabel('1 ⭐').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`rate_2_${interaction.channel.id}`).setLabel('2 ⭐').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`rate_3_${interaction.channel.id}`).setLabel('3 ⭐').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`rate_4_${interaction.channel.id}`).setLabel('4 ⭐').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`rate_5_${interaction.channel.id}`).setLabel('5 ⭐').setStyle(ButtonStyle.Secondary)
        );

        const ratingPrompt = await interaction.channel.send({
          content: `⭐ <@${ticket.ownerId}> يرجى تقييم الإداري خلال **12 ثانية** (لو لم تقيّم سيتم خصم 3 نجوم وتسجيل "العضو ماقيم"):`,
          components: [starRow]
        });

        const ratingState = {
          stars: null,
          reason: null,
          submitted: false
        };

        client._pendingRatings = client._pendingRatings || new Map();
        client._pendingRatings.set(interaction.channel.id, ratingState);

        const collector = ratingPrompt.createMessageComponentCollector({
          time: 12000,
          filter: (btn) => btn.user.id === ticket.ownerId && btn.customId.startsWith('rate_')
        });

        collector.on('collect', async (starBtn) => {
          const pickedStars = Number(starBtn.customId.split('_')[1]);
          ratingState.stars = pickedStars;

          const reasonModal = new ModalBuilder()
            .setCustomId(`rating_reason_modal_${interaction.channel.id}`)
            .setTitle(`سبب التقييم (${pickedStars} نجوم)`);

          const reasonInput = new TextInputBuilder()
            .setCustomId('rating_reason_input')
            .setLabel('اكتب سبب التقييم')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false);

          reasonModal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
          await starBtn.showModal(reasonModal);
        });

        collector.on('end', async () => {
          await new Promise((r) => setTimeout(r, 1500));

          const latestData = loadData();
          const currentTicket = latestData.tickets[interaction.channel.id];
          if (!currentTicket) return;

          let finalStarsText;
          let finalReasonText;

          if (ratingState.stars === null) {
            finalStarsText = 'العضو ماقيم (-3 ⭐)';
            finalReasonText = 'العضو ماقيم';
          } else {
            finalStarsText = `${ratingState.stars} / 5 ⭐`;
            finalReasonText = ratingState.reason && ratingState.reason.trim().length > 0
              ? ratingState.reason.trim()
              : 'لم يتم كتابة سبب';
          }

          if (CONFIG.ratingsChannelId) {
            const ratingsCh = await client.channels.fetch(CONFIG.ratingsChannelId).catch(() => null);
            if (ratingsCh) {
              await ratingsCh.send({
                content:
                  `📊 **تقييم تذكرة جديدة**\n` +
                  `• **العضو:** <@${currentTicket.ownerId}>\n` +
                  `• **الإداري المستلم:** ${currentTicket.claimedBy ? `<@${currentTicket.claimedBy}>` : 'غير مستلمة'}\n` +
                  `• **التقييم:** ${finalStarsText}\n` +
                  `• **السبب:** ${finalReasonText}`
              });
            }
          }

          const allMessages = [];
          let lastId;
          while (true) {
            const batch = await interaction.channel.messages.fetch({
              limit: 100,
              ...(lastId ? { before: lastId } : {})
            });
            if (batch.size === 0) break;
            allMessages.push(...batch.values());
            lastId = batch.last().id;
          }
          allMessages.reverse();

          const enrichedMessages = allMessages.map((m) => ({
            createdTimestamp: m.createdTimestamp,
            content: m.content,
            embeds: m.embeds,
            attachments: m.attachments,
            author: {
              tag: m.member?.displayName || m.author?.globalName || m.author?.tag || m.author?.username || 'Unknown',
              username: m.author?.username || '',
              avatarURL: m.author?.displayAvatarURL({ extension: 'png', size: 128 }) || ''
            }
          }));

          const claimedMember = currentTicket.claimedBy
            ? await interaction.guild.members.fetch(currentTicket.claimedBy).catch(() => null)
            : null;

          const htmlContent = buildTranscriptHtml({
            guildName: interaction.guild.name,
            channelName: interaction.channel.name,
            ownerId: currentTicket.ownerId,
            claimedById: currentTicket.claimedBy,
            claimedByName: claimedMember?.displayName || claimedMember?.user?.tag || (currentTicket.claimedBy ? currentTicket.claimedBy : 'غير مستلمة'),
            claimedByAvatar: claimedMember?.user?.displayAvatarURL({ extension: 'png', size: 128 }) || '',
            closedById,
            ratingText: finalStarsText,
            reasonText: finalReasonText,
            messages: enrichedMessages
          });

          if (CONFIG.ticketLogChannelId) {
            const logCh = await client.channels.fetch(CONFIG.ticketLogChannelId).catch(() => null);
            if (logCh) {
              const highMentions = CONFIG.highRoles.map((id) => `<@&${id}>`).join(' ');
              const file = new AttachmentBuilder(Buffer.from(htmlContent, 'utf8'), {
                name: `transcript-${interaction.channel.name}.html`
              });

              await logCh.send({
                content:
                  `${highMentions ? `${highMentions}\n` : ''}` +
                  `📁 **سجل تذكرة مغلقة | Ticket Transcript**\n` +
                  `• **العضو:** <@${currentTicket.ownerId}>\n` +
                  `• **الإداري المستلم:** ${currentTicket.claimedBy ? `<@${currentTicket.claimedBy}>` : 'غير مستلمة'}\n` +
                  `• **التقييم:** ${finalStarsText}\n` +
                  `• **السبب:** ${finalReasonText}\n` +
                  `• **تم الإغلاق بواسطة:** <@${closedById}>`,
                files: [file]
              });
            }
          }

          client._pendingRatings?.delete(interaction.channel.id);
          delete latestData.tickets[interaction.channel.id];
          saveData(latestData);

          await interaction.channel.delete('Ticket closed after rating window').catch(() => null);
        });
        return;
      }

      // زر استدعاء عضو -> يستدعي صاحب التذكرة تلقائياً بدون كتابة اسم
      if (id === 'tkt_summon_user') {
        if (!staffMember && !isClaimer) {
          return interaction.reply({
            content: '❌ هذا الزر مخصص للإدارة فقط.',
            flags: MessageFlags.Ephemeral
          });
        }

        const ownerId = ticket.ownerId;
        await interaction.channel.permissionOverwrites.edit(ownerId, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
          AttachFiles: true
        }).catch(() => null);

        const targetUser = await client.users.fetch(ownerId).catch(() => null);
        let dmSent = false;

        if (targetUser) {
          const dmMsg = await targetUser
            .send(`📣 تم استدعاؤك بواسطة الإداري <@${interaction.user.id}> في تذكرتك <#${interaction.channel.id}>.`)
            .catch(() => null);
          dmSent = Boolean(dmMsg);
        }

        return interaction.reply({
          content: dmSent
            ? `📣 تم استدعاء صاحب التذكرة <@${ownerId}> وإرسال إشعار له في الخاص بواسطة <@${interaction.user.id}>.`
            : `📣 تم استدعاء صاحب التذكرة <@${ownerId}> بواسطة <@${interaction.user.id}> (الخاص مقفول لديه).`
        });
      }

      // لو التذكرة مش مستلمة: أي شخص غير إداري أو غير صاحب التذكرة يتمنع
      if (!ticket.claimedBy && !staffMember && !isOwner) {
        return interaction.reply({
          content: '⚠️ يرجى استلام التكت',
          flags: MessageFlags.Ephemeral
        });
      }

      // زر إلغاء الاستلام (Unclaim)
      if (id === 'tkt_unclaim') {
        if (!staffMember && !isClaimer) {
          return interaction.reply({
            content: '❌ هذا الزر مخصص للإدارة فقط.',
            flags: MessageFlags.Ephemeral
          });
        }
        if (!ticket.claimedBy) {
          return interaction.reply({
            content: '⚠️ التذكرة غير مستلمة حالياً.',
            flags: MessageFlags.Ephemeral
          });
        }

        ticket.claimedBy = null;
        saveData(data);

        if (interaction.message && interaction.message.editable) {
          await interaction.message.edit({
            components: buildTicketActionRows(data.buttons, null)
          }).catch(() => null);
        }

        return interaction.reply({
          content: `🔓 تم إلغاء استلام التذكرة بواسطة <@${interaction.user.id}> وأصبح الاستلام متاحاً من جديد.`
        });
      }

      // زر طلب إدارة
      if (id === 'tkt_call_staff') {
        if (!staffMember && !isOwner) {
          return interaction.reply({
            content: '❌ لا تملك صلاحية استخدام هذا الزر.',
            flags: MessageFlags.Ephemeral
          });
        }
        if (ticket.claimedBy) {
          return interaction.reply({
            content: `📣 تم استدعاء الإداري المستلم: <@${ticket.claimedBy}> بواسطة <@${interaction.user.id}>.`
          });
        } else {
          const mentions = getCategoryMentions(ticket.categoryKey);
          return interaction.reply({
            content: `📣 تم طلب الإدارة بواسطة <@${interaction.user.id}>: ${mentions || 'يرجى متابعة التذكرة'}`
          });
        }
      }

      // زر طلب عضو (بحث بالاسم أو اليوزر)
      if (id === 'tkt_call_user') {
        if (!staffMember && !isClaimer) {
          return interaction.reply({
            content: '❌ هذا الزر مخصص للإدارة فقط.',
            flags: MessageFlags.Ephemeral
          });
        }

        const searchModal = new ModalBuilder()
          .setCustomId('call_user_search_modal')
          .setTitle('طلب عضو | بحث بالاسم أو اليوزر');

        const queryInput = new TextInputBuilder()
          .setCustomId('user_search_query')
          .setLabel('اكتب حرفين أو أكثر أو الاسم/اليوزر كامل')
          .setStyle(TextInputStyle.Short)
          .setMinLength(2)
          .setRequired(true);

        searchModal.addComponents(new ActionRowBuilder().addComponents(queryInput));
        return interaction.showModal(searchModal);
      }
    }
  }

  // ================= معالجة القوائم المنسدلة =================
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('pick_call_user_')) {
    const ticketChannelId = interaction.customId.replace('pick_call_user_', '');
    const targetUserId = interaction.values[0];
    const ticketChannel = await interaction.guild.channels.fetch(ticketChannelId).catch(() => null);

    if (!ticketChannel) {
      return interaction.update({
        content: '❌ تعذر العثور على روم التذكرة.',
        components: []
      });
    }

    await ticketChannel.permissionOverwrites.edit(targetUserId, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      AttachFiles: true
    });

    const targetUser = await client.users.fetch(targetUserId).catch(() => null);
    let dmSent = false;

    if (targetUser) {
      const dmMsg = await targetUser
        .send(
          `📩 مرحباً <@${targetUserId}>، تم فتح روم التذكرة لك وتم طلبك بواسطة الإداري <@${interaction.user.id}> في الروم <#${ticketChannel.id}>.`
        )
        .catch(() => null);
      dmSent = Boolean(dmMsg);
    }

    if (dmSent) {
      await ticketChannel.send({
        content: `✅ تم فتح الروم للعضو <@${targetUserId}> وإرسال إشعار له في الخاص بواسطة <@${interaction.user.id}>.`
      });
    } else {
      await ticketChannel.send({
        content:
          `⚠️ تم فتح الروم للعضو <@${targetUserId}> ويقدر يدخل يتكلم، ولكن الخاص مقفول لديه ولم تُرسل الرسالة في الخاص.\n` +
          `📣 <@${targetUserId}> تم طلبك من قبل الإداري <@${interaction.user.id}>.`
      });
    }

    return interaction.update({
      content: `✅ تم إضافة <@${targetUserId}> وإتمام الإجراء بنجاح.`,
      components: []
    });
  }

  // ================= معالجة المودالات =================
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'call_user_search_modal') {
      const query = interaction.fields.getTextInputValue('user_search_query').trim().toLowerCase();
      await interaction.guild.members.fetch().catch(() => null);

      const matches = interaction.guild.members.cache
        .filter((m) => {
          if (m.user.bot) return false;
          const uname = (m.user.username || '').toLowerCase();
          const gname = (m.user.globalName || '').toLowerCase();
          const dname = (m.displayName || '').toLowerCase();
          return uname.includes(query) || gname.includes(query) || dname.includes(query);
        })
        .first(25);

      if (!matches || matches.length === 0) {
        return interaction.reply({
          content: `❌ لم يتم العثور على أعضاء مطابقين لـ **"${query}"**.`,
          flags: MessageFlags.Ephemeral
        });
      }

      const select = new StringSelectMenuBuilder()
        .setCustomId(`pick_call_user_${interaction.channel.id}`)
        .setPlaceholder('اختر العضو المطلوب من النتائج...')
        .addOptions(
          matches.map((m) => ({
            label: m.displayName.slice(0, 100),
            description: `@${m.user.username}`.slice(0, 100),
            value: m.id
          }))
        );

      return interaction.reply({
        content: `🔎 نتائج البحث عن **"${query}"** (${matches.length}):`,
        components: [new ActionRowBuilder().addComponents(select)],
        flags: MessageFlags.Ephemeral
      });
    }

    if (interaction.customId.startsWith('rating_reason_modal_')) {
      const chId = interaction.customId.replace('rating_reason_modal_', '');
      const reasonVal = interaction.fields.getTextInputValue('rating_reason_input') || '';
      const state = client._pendingRatings?.get(chId);

      if (state) {
        state.reason = reasonVal;
        state.submitted = true;
      }

      return interaction.reply({
        content: '✅ تم تسجيل تقييمك وسببه بنجاح.',
        flags: MessageFlags.Ephemeral
      });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
