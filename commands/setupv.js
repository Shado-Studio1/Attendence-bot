const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setupv')
    .setDescription('إعداد نظام الطلبات والإجازات'),

  async execute(interaction) {
    if (interaction.user.id !== config.ownerId) {
      return interaction.reply({ content: '⛔️ ليس لديك صلاحية لاستخدام هذا الأمر.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle('🏢 نظام الطلبات والإجازات')
      .setDescription('اختر نوع الطلب الذي تريد تقديمه:')
      .setThumbnail(config.thumbnails)
      .setImage(config.images)
      .setColor(0x3498DB)
      .setFooter({ text: 'نظام إدارة الطلبات', iconURL: config.thumbnail });

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('vacation_request')
          .setLabel('📅 تقديم على إجازة')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('leave_admin_request')
          .setLabel('🚪 تقديم على ترك الإدارة')
          .setStyle(ButtonStyle.Secondary)
      );

    await interaction.reply({ embeds: [embed], components: [row] });
  },
};