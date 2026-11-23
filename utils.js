const {
  SlashCommandBuilder,
  REST,
  Routes,
  PermissionFlagsBits,
  MessageFlags
} = require('discord.js');

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildTranscriptHtml({
  guildName,
  channelName,
  ownerId,
  claimedById,
  claimedByName,
  claimedByAvatar,
  closedById,
  ratingText,
  reasonText,
  messages
}) {
  const rowsHtml = messages
    .map((msg) => {
      const authorTag = escapeHtml(msg.author?.tag || msg.author?.username || 'Unknown');
      const avatarUrl = escapeHtml(
        msg.author?.displayAvatarURL?.({ extension: 'png', size: 64 }) || ''
      );
      const timeStr = escapeHtml(new Date(msg.createdTimestamp).toLocaleString('ar-EG'));
      const contentHtml = escapeHtml(msg.content || '').replace(/\n/g, '<br>');

      const attachmentsHtml = [...(msg.attachments?.values() || [])]
        .map(
          (att) =>
            `<div class="att"><a href="${escapeHtml(att.url)}" target="_blank">${escapeHtml(
              att.name || 'مرفق'
            )}</a></div>`
        )
        .join('');

      return `
        <div class="msg">
          <img class="avatar" src="${avatarUrl}" alt="avatar" />
          <div class="msg-body">
            <div class="msg-header">
              <span class="author">${authorTag}</span>
              <span class="time">${timeStr}</span>
            </div>
            <div class="msg-content">${contentHtml || '<em>[بدون نص]</em>'}</div>
            ${attachmentsHtml}
          </div>
        </div>
      `;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8" />
<title>Transcript - ${escapeHtml(channelName)}</title>
<style>
  body { font-family: Arial, Tahoma, sans-serif; background: #141619; color: #eceff4; margin: 0; padding: 24px; }
  .card { max-width: 900px; margin: 0 auto; background: #1e2229; border-radius: 12px; padding: 20px; border: 1px solid #2e3440; }
  h1 { margin: 0 0 14px; font-size: 20px; color: #fff; }
  .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; background: #171a1f; padding: 14px; border-radius: 8px; margin-bottom: 20px; font-size: 14px; }
  .staff-box { display: flex; align-items: center; gap: 10px; }
  .staff-box img { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; }
  .msg { display: flex; gap: 12px; padding: 12px 0; border-bottom: 1px solid #2b303a; }
  .msg:last-child { border-bottom: none; }
  .avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
  .msg-header { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
  .author { font-weight: bold; color: #88c0d0; font-size: 14px; }
  .time { color: #9aa5b1; font-size: 12px; }
  .msg-content { font-size: 14px; line-height: 1.5; word-break: break-word; }
  .att { margin-top: 6px; }
  .att a { color: #81a1c1; text-decoration: none; }
</style>
</head>
<body>
  <div class="card">
    <h1>SoftMC Ticket Transcript — ${escapeHtml(channelName)}</h1>
    <div class="meta">
      <div><strong>السيرفر:</strong> ${escapeHtml(guildName)}</div>
      <div><strong>صاحب التذكرة ID:</strong> ${escapeHtml(ownerId)}</div>
      <div class="staff-box">
        ${claimedByAvatar ? `<img src="${escapeHtml(claimedByAvatar)}" alt="staff" />` : ''}
        <div><strong>الإداري المستلم:</strong> ${escapeHtml(claimedByName)} (${escapeHtml(claimedById || 'لا يوجد')})</div>
      </div>
      <div><strong>أغلق التذكرة ID:</strong> ${escapeHtml(closedById)}</div>
      <div><strong>التقييم:</strong> ${escapeHtml(ratingText)}</div>
      <div><strong>السبب:</strong> ${escapeHtml(reasonText)}</div>
    </div>
    <div class="messages">
      ${rowsHtml || '<p>لا توجد رسائل مسجلة.</p>'}
    </div>
  </div>
</body>
</html>`;
}

async function sendConfigLog(client, configLogChannelId, payload) {
  if (!configLogChannelId) return;
  const ch = await client.channels.fetch(configLogChannelId).catch(() => null);
  if (!ch) return;

  await ch.send({
    content:
      `🛠️ **سجل تعديل إعدادات البوت**\n` +
      `• **المعدِّل:** <@${payload.actorId}>\n` +
      `• **الزر / القسم:** \`${payload.buttonKey}\`\n` +
      `• **نوع التعديل:** ${payload.field}\n` +
      `• **قبل:** ${payload.before}\n` +
      `• **بعد:** ${payload.after}`
  });
}

function getSlashCommandsJson() {
  const applytCmd = new SlashCommandBuilder()
    .setName('applyt')
    .setDescription('إرسال لوحة SoftMC | Support Center الخاصة بالتذاكر')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

  const editBtnCmd = new SlashCommandBuilder()
    .setName('ticket-btn')
    .setDescription('تعديل لون أو رول أي زر داخل التذكرة (للإدارة ذات صلاحية Administrator فقط)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((opt) =>
      opt
        .setName('button')
        .setDescription('اختر الزر المراد تعديله')
        .setRequired(true)
        .addChoices(
          { name: 'استلام (Claim)', value: 'claim' },
          { name: 'إلغاء الاستلام (Unclaim)', value: 'unclaim' },
          { name: 'طلب إدارة (Call Staff)', value: 'call_staff' },
          { name: 'طلب عضو (Call User)', value: 'call_user' },
          { name: 'إغلاق (Close)', value: 'close' }
        )
    )
    .addStringOption((opt) =>
      opt
        .setName('color')
        .setDescription('لون الزر')
        .setRequired(false)
        .addChoices(
          { name: 'أزرق (Primary)', value: 'Primary' },
          { name: 'رمادي (Secondary)', value: 'Secondary' },
          { name: 'أخضر (Success)', value: 'Success' },
          { name: 'أحمر (Danger)', value: 'Danger' }
        )
    )
    .addRoleOption((opt) =>
      opt
        .setName('role')
        .setDescription('تحديد رول مخصص للزر (اختياري)')
        .setRequired(false)
    )
    .addBooleanOption((opt) =>
      opt
        .setName('clear_role')
        .setDescription('إزالة الرول المخصص للزر والعودة للوضع الافتراضي')
        .setRequired(false)
    );

  const resetCmd = new SlashCommandBuilder()
    .setName('reset')
    .setDescription('تصفير نقاط استلام الاداره')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((opt) =>
      opt
        .setName('user')
        .setDescription('منشن الشخص / الإداري لتصفير نقاطه (اتركه فارغاً لتصفير الكل)')
        .setRequired(false)
    )
    .addIntegerOption((opt) =>
      opt
        .setName('amount')
        .setDescription('الرقم المراد تصفيره/خصمه من نقاط الإداري (اتركه فارغاً لتصفير كل نقاطه)')
        .setMinValue(1)
        .setRequired(false)
    );

  return [applytCmd.toJSON(), editBtnCmd.toJSON(), resetCmd.toJSON()];
}

async function registerSlashCommands(client) {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID || client.user?.id;
  if (!token || !clientId) return;

  const rest = new REST({ version: '10' }).setToken(token);
  const commands = getSlashCommandsJson();

  if (process.env.GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(clientId, process.env.GUILD_ID), {
      body: commands
    });
  } else {
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
  }
}

async function handleConfigSlashCommand(interaction, { loadData, saveData, config, updateTopClaimsBoard }) {
  // 1) أمر /reset
  if (interaction.commandName === 'reset') {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: '❌ هذا الأمر متاح فقط لأصحاب صلاحية **Administrator**.',
        flags: MessageFlags.Ephemeral
      });
    }

    const targetUser = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    const data = loadData();
    data.claimStats = data.claimStats || {};

    if (!targetUser) {
      data.claimStats = {};
      saveData(data);
      if (updateTopClaimsBoard) await updateTopClaimsBoard();

      await sendConfigLog(interaction.client, config.configLogChannelId, {
        actorId: interaction.user.id,
        buttonKey: 'claimStats',
        field: 'تصفير نقاط استلام الإدارة (الكل)',
        before: 'نقاط جميع الإداريين',
        after: '0 (تم تصفير الكل)'
      });

      return interaction.reply({
        content: '✅ تم تصفير نقاط استلام جميع الإدارة بالكامل وتحديث لوحة التوب 5.',
        flags: MessageFlags.Ephemeral
      });
    }

    const beforeScore = data.claimStats[targetUser.id] || 0;
    let afterScore = 0;

    if (amount !== null) {
      afterScore = Math.max(0, beforeScore - amount);
    }

    data.claimStats[targetUser.id] = afterScore;
    saveData(data);
    if (updateTopClaimsBoard) await updateTopClaimsBoard();

    await sendConfigLog(interaction.client, config.configLogChannelId, {
      actorId: interaction.user.id,
      buttonKey: `claimStats (${targetUser.tag})`,
      field: amount !== null ? `تصفير/خصم (${amount}) من النقاط` : 'تصفير كل نقاط الإداري',
      before: `${beforeScore}`,
      after: `${afterScore}`
    });

    const msg =
      amount !== null
        ? `✅ تم تصفير/خصم **${amount}** من نقاط <@${targetUser.id}> (أصبح رصيده: **${afterScore}** بدلاً من **${beforeScore}**).`
        : `✅ تم تصفير جميع نقاط <@${targetUser.id}> (أصبحت **0** بدلاً من **${beforeScore}**).`;

    return interaction.reply({
      content: msg,
      flags: MessageFlags.Ephemeral
    });
  }

  // 2) أمر /ticket-btn
  if (interaction.commandName !== 'ticket-btn') return;

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      content: '❌ هذا الأمر متاح فقط لأصحاب صلاحية **Administrator**.',
      flags: MessageFlags.Ephemeral
    });
  }

  await interaction.guild.roles.fetch().catch(() => null);

  const buttonKey = interaction.options.getString('button', true);
  const newColor = interaction.options.getString('color');
  const newRole = interaction.options.getRole('role');
  const clearRole = interaction.options.getBoolean('clear_role');

  if (!newColor && !newRole && !clearRole) {
    return interaction.reply({
      content: '⚠️ اختر على الأقل تعديلاً واحداً (`color` أو `role` أو `clear_role`).',
      flags: MessageFlags.Ephemeral
    });
  }

  const data = loadData();
  data.buttons[buttonKey] = data.buttons[buttonKey] || { style: 'Secondary', roleId: null };
  const current = data.buttons[buttonKey];

  if (newColor && current.style !== newColor) {
    const beforeColor = current.style;
    current.style = newColor;
    await sendConfigLog(interaction.client, config.configLogChannelId, {
      actorId: interaction.user.id,
      buttonKey,
      field: 'لون الزر',
      before: beforeColor,
      after: newColor
    });
  }

  if (clearRole) {
    const beforeRole = current.roleId ? `<@&${current.roleId}>` : 'لا يوجد';
    current.roleId = null;
    await sendConfigLog(interaction.client, config.configLogChannelId, {
      actorId: interaction.user.id,
      buttonKey,
      field: 'الرول المخصص',
      before: beforeRole,
      after: 'تمت الإزالة (افتراضي)'
    });
  } else if (newRole) {
    const beforeRole = current.roleId ? `<@&${current.roleId}>` : 'لا يوجد';
    current.roleId = newRole.id;
    await sendConfigLog(interaction.client, config.configLogChannelId, {
      actorId: interaction.user.id,
      buttonKey,
      field: 'الرول المخصص',
      before: beforeRole,
      after: `<@&${newRole.id}>`
    });
  }

  saveData(data);

  return interaction.reply({
    content: `✅ تم حفظ التعديلات على الزر \`${buttonKey}\` وإرسالها إلى روم لوق التعديلات.`,
    flags: MessageFlags.Ephemeral
  });
}

module.exports = {
  buildTranscriptHtml,
  sendConfigLog,
  registerSlashCommands,
  handleConfigSlashCommand
};
