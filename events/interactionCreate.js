const {
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");

const config = require("../config.json");
const { getSessionsCollection } = require('../db/sessions');
const loginTimes = new Map();

async function upsertSession(userSession) {
  try {
    const collection = await getSessionsCollection();
    await collection.updateOne(
      { userId: userSession.userId },
      { $set: userSession },
      { upsert: true }
    );
  } catch (error) {
    console.error('Error saving sessions data to MongoDB:', error);
  }
}

async function getSessionByUserId(userId) {
  try {
    const collection = await getSessionsCollection();
    return await collection.findOne({ userId });
  } catch (error) {
    console.error('Error loading session from MongoDB:', error);
    return null;
  }
}

async function grantRewardRoleIfEligible(member, totalTime) {
  if (!member) {
    return false;
  }

  const rewardSettings = config.rewardSettings;
  if (!rewardSettings || !rewardSettings.roleId || !rewardSettings.hoursRequired) {
    return false;
  }

  const requiredMilliseconds = rewardSettings.hoursRequired * 60 * 60 * 1000;
  if (totalTime < requiredMilliseconds) {
    return false;
  }

  const guild = member.guild;
  if (!guild) {
    return false;
  }

  const rewardRole = guild.roles.cache.get(rewardSettings.roleId);
  if (!rewardRole) {
    console.warn('Reward role defined in config but not found in guild.');
    return false;
  }

  if (member.roles.cache.has(rewardRole.id)) {
    return false;
  }

  try {
    await member.roles.add(rewardRole);
    return true;
  } catch (error) {
    console.error('Failed to assign reward role:', error);
    return false;
  }
}

module.exports = {
  name: "interactionCreate",
  async execute(interaction) {
    if (interaction.isButton()) {
      const customId = interaction.customId;

      // For report-related buttons, extract target and reporter
      let target, reporter;
      if (["accept", "cancel", "close", "warn", "kick", "ban", "mute", "timeout"].includes(customId)) {
        const member = interaction.message.embeds[0]?.data.fields.find(f => f.name.includes("👤"))?.value;
        target = interaction.guild.members.cache.get(member?.replace(/[<@>]/g, ""));

        const reporterField = interaction.message.embeds[0]?.data.fields.find(f => f.name.includes("👮‍♂️"))?.value;
        const reporterId = reporterField?.replace(/[<@>]/g, "");
        reporter = interaction.guild.members.cache.get(reporterId);

        if (!target) {
          await interaction.reply({ content: "⚠️ لم أستطع العثور على العضو.", flags: MessageFlags.Ephemeral });
          return;
        }
      }

    switch (interaction.customId) {
      case "accept":
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        if (reporter) {
          try {
            await reporter.send("تم استلام البلاغ بتاعك وحل مشكلتك");
          } catch (e) {
            // Couldn't send DM
          }
        }
        const acceptedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
          .addFields({ name: "حالة", value: "استلام", inline: true });
        const acceptedRow1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("close").setLabel("🔒 اغلاق").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId("warn").setLabel("⚠️ تحذير").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId("kick").setLabel("👢 طرد").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("ban").setLabel("🔨 باند").setStyle(ButtonStyle.Danger)
        );
        const acceptedRow2 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("mute").setLabel("🔇 ميوت").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId("timeout").setLabel("⏳ تايم أوت").setStyle(ButtonStyle.Secondary)
        );
        await interaction.message.edit({ embeds: [acceptedEmbed], components: [acceptedRow1, acceptedRow2] });
        await interaction.editReply({ content: "تم استلام البلاغ." });
        break;

      case "cancel":
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const canceledEmbed = EmbedBuilder.from(interaction.message.embeds[0])
          .addFields({ name: "حالة", value: "ملغي", inline: true });
        await interaction.message.edit({ embeds: [canceledEmbed], components: [] });
        await interaction.editReply({ content: "تم إلغاء البلاغ." });
        break;

      case "close":
        const modal = new ModalBuilder()
          .setCustomId("close_report")
          .setTitle("إغلاق البلاغ")
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("reason")
                .setLabel("سبب الإغلاق")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
            )
          );
        await interaction.showModal(modal);
        break;

      case "warn":
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await interaction.editReply({ content: `⚠️ تم إعطاء تحذير إلى ${target.user.tag}` });
        break;

      case "kick":
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        if (!interaction.guild.members.me.permissions.has("KickMembers")) {
          return interaction.editReply({ content: "❌ لا أملك صلاحية الطرد." });
        }
        if (!interaction.member.permissions.has("KickMembers")) {
          return interaction.editReply({ content: "❌ لا تملك صلاحية الطرد." });
        }
        await target.kick("تم عبر زر البلاغ");
        await interaction.editReply({ content: `👢 تم طرد ${target.user.tag}` });
        break;

      case "ban":
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        if (!interaction.guild.members.me.permissions.has("BanMembers")) {
          return interaction.editReply({ content: "❌ لا أملك صلاحية الباند." });
        }
        if (!interaction.member.permissions.has("BanMembers")) {
          return interaction.editReply({ content: "❌ لا تملك صلاحية الباند." });
        }
        await target.ban({ reason: "تم عبر زر البلاغ" });
        await interaction.editReply({ content: `🔨 تم حظر ${target.user.tag}` });
        break;

      case "mute":
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const muteRole = interaction.guild.roles.cache.find(r => r.name === "Muted");
        if (!muteRole) {
          return interaction.editReply({ content: "⚠️ لم يتم العثور على رتبة Muted" });
        }
        if (!interaction.guild.members.me.permissions.has("ManageRoles")) {
          return interaction.editReply({ content: "❌ لا أملك صلاحية إدارة الرتب." });
        }
        if (!interaction.member.permissions.has("ManageRoles")) {
          return interaction.editReply({ content: "❌ لا تملك صلاحية إدارة الرتب." });
        }
        await target.roles.add(muteRole);
        await interaction.editReply({ content: `🔇 تم ميوت ${target.user.tag}` });
        break;

      case "timeout":
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        if (!interaction.guild.members.me.permissions.has("ModerateMembers")) {
          return interaction.editReply({ content: "❌ لا أملك صلاحية التايم أوت." });
        }
        if (!interaction.member.permissions.has("ModerateMembers")) {
          return interaction.editReply({ content: "❌ لا تملك صلاحية التايم أوت." });
        }
        await target.timeout(10 * 60 * 1000, "تايم أوت من زر البلاغ"); // 10 دقائق
        await interaction.editReply({ content: `⏳ تم تايم أوت ${target.user.tag} لمدة 10 دقائق` });
        break;

      case "login":
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        if (loginTimes.has(interaction.user.id)) {
          return interaction.editReply({ content: "أنت مسجل دخول بالفعل." });
        }
        loginTimes.set(interaction.user.id, Date.now());
        const loginLogChannel = interaction.guild.channels.cache.get(config.loginLogChannel);
        if (loginLogChannel) {
          const loginEmbed = new EmbedBuilder()
            .setTitle('🟢 تسجيل دخول')
            .setDescription(`**${interaction.user.displayName}** سجل دخول إلى النظام`)
            .addFields(
              { name: '👤 العضو', value: `<@${interaction.user.id}>`, inline: true },
              { name: '🆔 المعرف', value: interaction.user.id, inline: true },
              { name: '⏰ الوقت', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
            )
            .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
            .setColor(0x00FF00)
            .setTimestamp()
            .setFooter({ text: 'نظام تسجيل الدخول', iconURL: interaction.guild.iconURL() });
          await loginLogChannel.send({ embeds: [loginEmbed] });
        }
        await interaction.editReply({ content: "✅ تم تسجيل دخولك بنجاح." });
        break;

      case "logout":
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        if (!loginTimes.has(interaction.user.id)) {
          return interaction.editReply({ content: "أنت لست مسجل دخول." });
        }
        const loginTime = loginTimes.get(interaction.user.id);
        const duration = Date.now() - loginTime;
        const hours = Math.floor(duration / (1000 * 60 * 60));
        const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((duration % (1000 * 60)) / 1000);
        const durationStr = `${hours} ساعات ${minutes} دقائق ${seconds} ثواني`;
        
        // Save session data
        let userSession = await getSessionByUserId(interaction.user.id);
        if (!userSession) {
          userSession = {
            userId: interaction.user.id,
            username: interaction.user.displayName,
            totalTime: 0,
            sessions: 0
          };
        }

        userSession.totalTime += duration;
        userSession.sessions += 1;
        userSession.username = interaction.user.displayName;

        await upsertSession(userSession);

        await grantRewardRoleIfEligible(interaction.member, userSession.totalTime);
        
        loginTimes.delete(interaction.user.id);
        const logoutLogChannel = interaction.guild.channels.cache.get(config.loginLogChannel);
        if (logoutLogChannel) {
          const logoutEmbed = new EmbedBuilder()
            .setTitle('🔴 تسجيل خروج')
            .setDescription(`**${interaction.user.displayName}** سجل خروج من النظام`)
            .addFields(
              { name: '👤 العضو', value: `<@${interaction.user.id}>`, inline: true },
              { name: '🆔 المعرف', value: interaction.user.id, inline: true },
              { name: '⏰ وقت الخروج', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
              { name: '⏱️ مدة الجلسة', value: durationStr, inline: false }
            )
            .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
            .setColor(0xFF0000)
            .setTimestamp()
            .setFooter({ text: 'نظام تسجيل الخروج', iconURL: interaction.guild.iconURL() });
          await logoutLogChannel.send({ embeds: [logoutEmbed] });
        }
        await interaction.editReply({ content: `✅ تم تسجيل خروجك بنجاح. المدة: ${durationStr}` });
        break;

      case "vacation_request":
        const vacationModal = new ModalBuilder()
          .setCustomId("vacation_modal")
          .setTitle("طلب إجازة")
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("vacation_reason")
                .setLabel("ما هو سبب طلب الإجازة؟")
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder("اكتب سبب طلب الإجازة هنا...")
                .setRequired(true)
                .setMaxLength(1000)
            )
          );
        await interaction.showModal(vacationModal);
        break;

      case "leave_admin_request":
        const leaveAdminModal = new ModalBuilder()
          .setCustomId("leave_admin_modal")
          .setTitle("طلب ترك الإدارة")
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("leave_admin_reason")
                .setLabel("ما هو سبب ترك الإدارة؟")
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder("اكتب سبب ترك الإدارة هنا...")
                .setRequired(true)
                .setMaxLength(1000)
            )
          );
        await interaction.showModal(leaveAdminModal);
        break;

      default:
        // Handle vacation and leave admin buttons
        if (interaction.customId.startsWith('vacation_accept_')) {
          const userId = interaction.customId.replace('vacation_accept_', '');
          const acceptVacationModal = new ModalBuilder()
            .setCustomId(`vacation_accept_modal_${userId}`)
            .setTitle("قبول طلب الإجازة")
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId("accept_reason")
                  .setLabel("سبب القبول (اختياري)")
                  .setStyle(TextInputStyle.Paragraph)
                  .setPlaceholder("اكتب سبب قبول الطلب...")
                  .setRequired(false)
                  .setMaxLength(500)
              )
            );
          await interaction.showModal(acceptVacationModal);
        } else if (interaction.customId.startsWith('vacation_reject_')) {
          const userId = interaction.customId.replace('vacation_reject_', '');
          const rejectVacationModal = new ModalBuilder()
            .setCustomId(`vacation_reject_modal_${userId}`)
            .setTitle("رفض طلب الإجازة")
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId("reject_reason")
                  .setLabel("سبب الرفض")
                  .setStyle(TextInputStyle.Paragraph)
                  .setPlaceholder("اكتب سبب رفض الطلب...")
                  .setRequired(true)
                  .setMaxLength(500)
              )
            );
          await interaction.showModal(rejectVacationModal);
        } else if (interaction.customId.startsWith('leave_admin_accept_')) {
          const userId = interaction.customId.replace('leave_admin_accept_', '');
          const acceptLeaveModal = new ModalBuilder()
            .setCustomId(`leave_admin_accept_modal_${userId}`)
            .setTitle("قبول طلب ترك الإدارة")
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId("accept_reason")
                  .setLabel("سبب القبول (اختياري)")
                  .setStyle(TextInputStyle.Paragraph)
                  .setPlaceholder("اكتب سبب قبول الطلب...")
                  .setRequired(false)
                  .setMaxLength(500)
              )
            );
          await interaction.showModal(acceptLeaveModal);
        } else if (interaction.customId.startsWith('leave_admin_reject_')) {
          const userId = interaction.customId.replace('leave_admin_reject_', '');
          const rejectLeaveModal = new ModalBuilder()
            .setCustomId(`leave_admin_reject_modal_${userId}`)
            .setTitle("رفض طلب ترك الإدارة")
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId("reject_reason")
                  .setLabel("سبب الرفض")
                  .setStyle(TextInputStyle.Paragraph)
                  .setPlaceholder("اكتب سبب رفض الطلب...")
                  .setRequired(true)
                  .setMaxLength(500)
              )
            );
          await interaction.showModal(rejectLeaveModal);
        }
        break;
    }
    } else if (interaction.isModalSubmit()) {
      if (interaction.customId === "close_report") {
        const reason = interaction.fields.getTextInputValue("reason");

        const member = interaction.message.embeds[0]?.data.fields.find(f => f.name.includes("👤"))?.value;
        const target = interaction.guild.members.cache.get(member?.replace(/[<@>]/g, ""));

        if (target) {
          try {
            await target.send(`تم إغلاق بلاغك بسبب: ${reason}`);
          } catch (e) {
            // Couldn't send DM
          }
        }

        const closedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
          .addFields({ name: "حالة", value: "مغلق", inline: true });
        await interaction.message.edit({ embeds: [closedEmbed], components: [] });
        await interaction.reply({ content: "تم إغلاق البلاغ.", flags: MessageFlags.Ephemeral });
      } else if (interaction.customId === "vacation_modal") {
        const vacationReason = interaction.fields.getTextInputValue("vacation_reason");
        
        const vacationLogChannel = interaction.guild.channels.cache.get(config.vacationLogChannel);
        if (vacationLogChannel) {
          const vacationEmbed = new EmbedBuilder()
            .setTitle('📅 طلب إجازة جديد')
            .setDescription(`**${interaction.user.displayName}** قدم طلب إجازة`)
            .addFields(
              { name: '👤 مقدم الطلب', value: `<@${interaction.user.id}>`, inline: true },
              { name: '🆔 المعرف', value: interaction.user.id, inline: true },
              { name: '⏰ وقت التقديم', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
              { name: '📝 سبب الإجازة', value: vacationReason, inline: false }
            )
            .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
            .setColor(0x3498DB)
            .setTimestamp()
            .setFooter({ text: 'نظام طلبات الإجازات', iconURL: interaction.guild.iconURL() });
          
          const vacationButtons = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`vacation_accept_${interaction.user.id}`)
                .setLabel('✅ قبول')
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId(`vacation_reject_${interaction.user.id}`)
                .setLabel('❌ رفض')
                .setStyle(ButtonStyle.Danger)
            );
          
          await vacationLogChannel.send({ embeds: [vacationEmbed], components: [vacationButtons] });
        }
        
        await interaction.reply({ 
          content: "✅ تم تقديم طلب الإجازة بنجاح! سيتم مراجعته من قبل الإدارة.", 
          flags: MessageFlags.Ephemeral 
        });
      } else if (interaction.customId === "leave_admin_modal") {
        const leaveAdminReason = interaction.fields.getTextInputValue("leave_admin_reason");
        
        const leaveAdminLogChannel = interaction.guild.channels.cache.get(config.leaveAdminLogChannel);
        if (leaveAdminLogChannel) {
          const leaveAdminEmbed = new EmbedBuilder()
            .setTitle('🚪 طلب ترك الإدارة')
            .setDescription(`**${interaction.user.displayName}** قدم طلب ترك الإدارة`)
            .addFields(
              { name: '👤 مقدم الطلب', value: `<@${interaction.user.id}>`, inline: true },
              { name: '🆔 المعرف', value: interaction.user.id, inline: true },
              { name: '⏰ وقت التقديم', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
              { name: '📝 سبب ترك الإدارة', value: leaveAdminReason, inline: false }
            )
            .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
            .setColor(0xE74C3C)
            .setTimestamp()
            .setFooter({ text: 'نظام طلبات ترك الإدارة', iconURL: interaction.guild.iconURL() });
          
          const leaveAdminButtons = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`leave_admin_accept_${interaction.user.id}`)
                .setLabel('✅ قبول')
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId(`leave_admin_reject_${interaction.user.id}`)
                .setLabel('❌ رفض')
                .setStyle(ButtonStyle.Danger)
            );
          
          await leaveAdminLogChannel.send({ embeds: [leaveAdminEmbed], components: [leaveAdminButtons] });
        }
        
        await interaction.reply({ 
          content: "✅ تم تقديم طلب ترك الإدارة بنجاح! سيتم مراجعته من قبل الإدارة العليا.", 
          flags: MessageFlags.Ephemeral 
        });
      } else if (interaction.customId.startsWith('vacation_accept_modal_')) {
        const userId = interaction.customId.replace('vacation_accept_modal_', '');
        const acceptReason = interaction.fields.getTextInputValue("accept_reason") || "تم قبول الطلب";
        
        const targetUser = interaction.guild.members.cache.get(userId);
        if (targetUser) {
          try {
            const acceptEmbed = new EmbedBuilder()
              .setTitle('✅ تم قبول طلب الإجازة')
              .setDescription('تم قبول طلب الإجازة الخاص بك')
              .addFields(
                { name: '📝 سبب القبول', value: acceptReason, inline: false },
                { name: '👤 تم القبول بواسطة', value: `<@${interaction.user.id}>`, inline: true },
                { name: '⏰ وقت القبول', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
              )
              .setColor(0x00FF00)
              .setTimestamp();
            
            await targetUser.send({ embeds: [acceptEmbed] });
          } catch (error) {
            console.log('Could not send DM to user');
          }
        }
        
        // Update the original message
        const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
          .addFields({ name: '✅ حالة الطلب', value: `تم القبول بواسطة <@${interaction.user.id}>`, inline: false })
          .addFields({ name: '📝 سبب القبول', value: acceptReason, inline: false })
          .setColor(0x00FF00);
        
        await interaction.message.edit({ embeds: [updatedEmbed], components: [] });
        await interaction.reply({ content: "✅ تم قبول طلب الإجازة وإرسال إشعار للعضو.", flags: MessageFlags.Ephemeral });
        
      } else if (interaction.customId.startsWith('vacation_reject_modal_')) {
        const userId = interaction.customId.replace('vacation_reject_modal_', '');
        const rejectReason = interaction.fields.getTextInputValue("reject_reason");
        
        const targetUser = interaction.guild.members.cache.get(userId);
        if (targetUser) {
          try {
            const rejectEmbed = new EmbedBuilder()
              .setTitle('❌ تم رفض طلب الإجازة')
              .setDescription('تم رفض طلب الإجازة الخاص بك')
              .addFields(
                { name: '📝 سبب الرفض', value: rejectReason, inline: false },
                { name: '👤 تم الرفض بواسطة', value: `<@${interaction.user.id}>`, inline: true },
                { name: '⏰ وقت الرفض', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
              )
              .setColor(0xFF0000)
              .setTimestamp();
            
            await targetUser.send({ embeds: [rejectEmbed] });
          } catch (error) {
            console.log('Could not send DM to user');
          }
        }
        
        // Update the original message
        const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
          .addFields({ name: '❌ حالة الطلب', value: `تم الرفض بواسطة <@${interaction.user.id}>`, inline: false })
          .addFields({ name: '📝 سبب الرفض', value: rejectReason, inline: false })
          .setColor(0xFF0000);
        
        await interaction.message.edit({ embeds: [updatedEmbed], components: [] });
        await interaction.reply({ content: "❌ تم رفض طلب الإجازة وإرسال إشعار للعضو.", flags: MessageFlags.Ephemeral });
        
      } else if (interaction.customId.startsWith('leave_admin_accept_modal_')) {
        const userId = interaction.customId.replace('leave_admin_accept_modal_', '');
        const acceptReason = interaction.fields.getTextInputValue("accept_reason") || "تم قبول الطلب";
        
        const targetUser = interaction.guild.members.cache.get(userId);
        if (targetUser) {
          try {
            const acceptEmbed = new EmbedBuilder()
              .setTitle('✅ تم قبول طلب ترك الإدارة')
              .setDescription('تم قبول طلب ترك الإدارة الخاص بك')
              .addFields(
                { name: '📝 سبب القبول', value: acceptReason, inline: false },
                { name: '👤 تم القبول بواسطة', value: `<@${interaction.user.id}>`, inline: true },
                { name: '⏰ وقت القبول', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
              )
              .setColor(0x00FF00)
              .setTimestamp();
            
            await targetUser.send({ embeds: [acceptEmbed] });
          } catch (error) {
            console.log('Could not send DM to user');
          }
        }
        
        // Update the original message
        const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
          .addFields({ name: '✅ حالة الطلب', value: `تم القبول بواسطة <@${interaction.user.id}>`, inline: false })
          .addFields({ name: '📝 سبب القبول', value: acceptReason, inline: false })
          .setColor(0x00FF00);
        
        await interaction.message.edit({ embeds: [updatedEmbed], components: [] });
        await interaction.reply({ content: "✅ تم قبول طلب ترك الإدارة وإرسال إشعار للعضو.", flags: MessageFlags.Ephemeral });
        
      } else if (interaction.customId.startsWith('leave_admin_reject_modal_')) {
        const userId = interaction.customId.replace('leave_admin_reject_modal_', '');
        const rejectReason = interaction.fields.getTextInputValue("reject_reason");
        
        const targetUser = interaction.guild.members.cache.get(userId);
        if (targetUser) {
          try {
            const rejectEmbed = new EmbedBuilder()
              .setTitle('❌ تم رفض طلب ترك الإدارة')
              .setDescription('تم رفض طلب ترك الإدارة الخاص بك')
              .addFields(
                { name: '📝 سبب الرفض', value: rejectReason, inline: false },
                { name: '👤 تم الرفض بواسطة', value: `<@${interaction.user.id}>`, inline: true },
                { name: '⏰ وقت الرفض', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
              )
              .setColor(0xFF0000)
              .setTimestamp();
            
            await targetUser.send({ embeds: [rejectEmbed] });
          } catch (error) {
            console.log('Could not send DM to user');
          }
        }
        
        // Update the original message
        const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
          .addFields({ name: '❌ حالة الطلب', value: `تم الرفض بواسطة <@${interaction.user.id}>`, inline: false })
          .addFields({ name: '📝 سبب الرفض', value: rejectReason, inline: false })
          .setColor(0xFF0000);
        
        await interaction.message.edit({ embeds: [updatedEmbed], components: [] });
        await interaction.reply({ content: "❌ تم رفض طلب ترك الإدارة وإرسال إشعار للعضو.", flags: MessageFlags.Ephemeral });
      }
    }
  }
};
