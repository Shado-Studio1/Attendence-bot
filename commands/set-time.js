const { SlashCommandBuilder } = require('discord.js');
const { getSessionsCollection } = require('../db/sessions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set-time')
    .setDescription('ضبط عدد الساعات المنجزة لعضو وإعطاؤه الرتبة إذا اكتملت المدة')
    .addUserOption(option =>
      option
        .setName('member')
        .setDescription('العضو المراد تعديل وقته')
        .setRequired(true)
    )
    .addNumberOption(option =>
      option
        .setName('hours')
        .setDescription('عدد الساعات المراد إضافتها للعضو')
        .setRequired(true)
        .setMinValue(0)
    )
    .addNumberOption(option =>
      option
        .setName('minutes')
        .setDescription('عدد الدقائق المراد إضافتها (اختياري)')
        .setRequired(false)
        .setMinValue(0)
    )
    .addNumberOption(option =>
      option
        .setName('seconds')
        .setDescription('عدد الثواني المراد إضافتها (اختياري)')
        .setRequired(false)
        .setMinValue(0)
    ),

  async execute(interaction) {
    const config = require('../config.json');

    if (interaction.user.id !== config.ownerId) {
      return interaction.reply({ content: '⛔️ هذا الأمر مخصص للمالك فقط.', ephemeral: true });
    }

    if (!config.rewardSettings || !config.rewardSettings.roleId || !config.rewardSettings.hoursRequired) {
      return interaction.reply({
        content: '⚠️ لم يتم إعداد الرتبة والمستوى المطلوب. استخدم `/set-role` أولاً لتحديد الرتبة وعدد الساعات.',
        ephemeral: true,
      });
    }

    const targetMember = interaction.options.getMember('member');
    const addedHours = interaction.options.getNumber('hours');
    const addedMinutes = interaction.options.getNumber('minutes') || 0;
    const addedSeconds = interaction.options.getNumber('seconds') || 0;

    if (!targetMember) {
      return interaction.reply({ content: '⚠️ لم أستطع العثور على العضو المحدد.', ephemeral: true });
    }

    const totalMillisecondsToAdd = ((addedHours * 60 + addedMinutes) * 60 + addedSeconds) * 1000;

    if (totalMillisecondsToAdd <= 0) {
      return interaction.reply({ content: '⚠️ يجب أن يكون الوقت المضاف أكبر من صفر.', ephemeral: true });
    }

    let sessionsCollection;

    try {
      sessionsCollection = await getSessionsCollection();
    } catch (error) {
      console.error('Failed to connect to MongoDB:', error);
      return interaction.reply({ content: '❌ حدث خطأ أثناء الاتصال بقاعدة البيانات.', ephemeral: true });
    }

    let userSession;
    try {
      userSession = await sessionsCollection.findOne({ userId: targetMember.id });
    } catch (error) {
      console.error('Failed to fetch session from MongoDB:', error);
      return interaction.reply({ content: '❌ حدث خطأ أثناء تحميل بيانات الجلسات من قاعدة البيانات.', ephemeral: true });
    }

    if (!userSession) {
      userSession = {
        userId: targetMember.id,
        username: targetMember.displayName,
        totalTime: 0,
        sessions: 0,
      };
    }

    userSession.totalTime += totalMillisecondsToAdd;
    userSession.username = targetMember.displayName;

    try {
      await sessionsCollection.updateOne(
        { userId: targetMember.id },
        { $set: userSession },
        { upsert: true }
      );
    } catch (error) {
      console.error('Failed to save session to MongoDB:', error);
      return interaction.reply({ content: '❌ حدث خطأ أثناء حفظ بيانات الجلسات في قاعدة البيانات.', ephemeral: true });
    }

    const requiredMilliseconds = config.rewardSettings.hoursRequired * 60 * 60 * 1000;
    const memberTotalTime = userSession.totalTime;

    let roleGranted = false;

    if (memberTotalTime >= requiredMilliseconds) {
      const rewardRole = interaction.guild.roles.cache.get(config.rewardSettings.roleId);

      if (!rewardRole) {
        return interaction.reply({
          content: '⚠️ لم يتم العثور على الرتبة المحددة في السيرفر. تأكد من صحة المعرف في `/set-role`.',
          ephemeral: true,
        });
      }

      if (!targetMember.roles.cache.has(rewardRole.id)) {
        try {
          await targetMember.roles.add(rewardRole);
          roleGranted = true;
        } catch (error) {
          console.error('Failed to add reward role:', error);
          return interaction.reply({ content: '❌ حدث خطأ أثناء محاولة إعطاء الرتبة للعضو.', ephemeral: true });
        }
      }
    }

    const finalHours = Math.floor(memberTotalTime / (1000 * 60 * 60));
    const finalMinutes = Math.floor((memberTotalTime % (1000 * 60 * 60)) / (1000 * 60));
    const finalSeconds = Math.floor((memberTotalTime % (1000 * 60)) / 1000);

    return interaction.reply({
      content: `✅ تم تحديث وقت ${targetMember.displayName}.
الإجمالي الآن: ${finalHours} ساعة ${finalMinutes} دقيقة ${finalSeconds} ثانية.${roleGranted ? `\n🎉 تم إعطاء الرتبة <@&${config.rewardSettings.roleId}> للعضو!` : ''}`,
      ephemeral: true,
    });
  },
};