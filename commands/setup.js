const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('إعداد نظام تسجيل الدخول والخروج'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('⏰ نظام تسجيل الدخول والخروج')
      .setDescription(`اضغط على الزر المناسب لتسجيل الدخول أو الخروج من النظام.`)
      .setThumbnail(config.thumbnail)
      .setImage(config.image)
      .setColor(0x00FF00)
      .setFooter({ text: 'نظام إدارة الحضور والانصراف', iconURL: config.thumbnail });

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('login')
          .setLabel('🟢 تسجيل دخول')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('logout')
          .setLabel('🔴 تسجيل خروج')
          .setStyle(ButtonStyle.Danger)
      );

    await interaction.reply({ embeds: [embed], components: [row] });
  },
};