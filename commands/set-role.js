const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set-role')
    .setDescription('تعيين رتبة يتم منحها تلقائيًا بعد وصول العضو لعدد ساعات محدد')
    .addRoleOption(option =>
      option
        .setName('role')
        .setDescription('الرتبة التي سيتم منحها تلقائيًا')
        .setRequired(true)
    )
    .addNumberOption(option =>
      option
        .setName('hours')
        .setDescription('عدد الساعات المطلوبة للحصول على الرتبة')
        .setRequired(true)
        .setMinValue(0.1)
    ),

  async execute(interaction) {
    const config = require('../config.json');

    if (interaction.user.id !== config.ownerId) {
      return interaction.reply({ content: '⛔️ هذا الأمر مخصص للمالك فقط.', ephemeral: true });
    }

    const selectedRole = interaction.options.getRole('role');
    const requiredHours = interaction.options.getNumber('hours');

    if (!selectedRole) {
      return interaction.reply({ content: '⚠️ لم أستطع العثور على الرتبة المحددة.', ephemeral: true });
    }

    if (!Number.isFinite(requiredHours) || requiredHours <= 0) {
      return interaction.reply({ content: '⚠️ الرجاء إدخال عدد ساعات صحيح (أكبر من صفر).', ephemeral: true });
    }

    const configPath = path.join(__dirname, '../config.json');

    // حدث إعدادات المكافآت في الكائن الحالي (سيتم تحديث المرجع في باقي الملفات)
    config.rewardSettings = {
      roleId: selectedRole.id,
      hoursRequired: requiredHours,
    };

    try {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    } catch (error) {
      console.error('Failed to update config.json with reward settings:', error);
      return interaction.reply({ content: '❌ حدث خطأ أثناء حفظ الإعدادات. حاول مرة أخرى لاحقًا.', ephemeral: true });
    }

    return interaction.reply({
      content: `✅ تم تعيين الرتبة <@&${selectedRole.id}> ليتم منحها تلقائيًا عند وصول العضو إلى ${requiredHours} ساعة.`,
      ephemeral: true,
    });
  },
};