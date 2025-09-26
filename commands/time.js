const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const { getSessionsCollection } = require('../db/sessions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('time')
    .setDescription('عرض لوحة المتصدرين لأكثر الأعضاء قضاءً للوقت'),

  async execute(interaction) {
    const config = require('../config.json');

    if (interaction.user.id !== config.ownerId) {
      return interaction.reply({ content: '⛔️ ليس لديك صلاحية لاستخدام هذا الأمر.', ephemeral: true });
    }

    let sessionsCollection;
    try {
      sessionsCollection = await getSessionsCollection();
    } catch (error) {
      console.error('Failed to connect to MongoDB:', error);
      return interaction.reply({ content: '❌ حدث خطأ أثناء الاتصال بقاعدة البيانات.', ephemeral: true });
    }

    let sessionsData = [];
    try {
      sessionsData = await sessionsCollection
        .find({}, { projection: { _id: 0 } })
        .sort({ totalTime: -1 })
        .limit(10)
        .toArray();
    } catch (error) {
      console.error('Error loading sessions data from MongoDB:', error);
      return interaction.reply({ content: '❌ حدث خطأ في تحميل بيانات الجلسات من قاعدة البيانات.', ephemeral: true });
    }

    if (sessionsData.length === 0) {
      return interaction.reply({ 
        content: '📊 لا توجد بيانات جلسات متاحة حتى الآن.', 
        ephemeral: true 
      });
    }

    const sortedUsers = sessionsData.map(user => ({
      userId: user.userId,
      username: user.username,
      totalTime: user.totalTime,
      sessions: user.sessions,
    }));

    const embed = new EmbedBuilder()
      .setTitle('🏆 لوحة المتصدرين - أكثر الأعضاء قضاءً للوقت')
      .setDescription('ترتيب الأعضاء حسب إجمالي الوقت المقضي في النظام')
      .setColor(0xFFD700)
      .setTimestamp()
      .setFooter({ text: 'نظام إحصائيات الوقت', iconURL: interaction.guild.iconURL() });

    let leaderboardText = '';
    const medals = ['🥇', '🥈', '🥉'];
    
    sortedUsers.forEach((user, index) => {
      const hours = Math.floor(user.totalTime / (1000 * 60 * 60));
      const minutes = Math.floor((user.totalTime % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((user.totalTime % (1000 * 60)) / 1000);
      
      const medal = index < 3 ? medals[index] : `${index + 1}.`;
      const timeStr = `${hours}س ${minutes}د ${seconds}ث`;
      
      leaderboardText += `${medal} **${user.username}**\n`;
      leaderboardText += `⏱️ الوقت الإجمالي: ${timeStr}\n`;
      leaderboardText += `📊 عدد الجلسات: ${user.sessions}\n`;
      leaderboardText += `👤 <@${user.userId}>\n\n`;
    });

    embed.setDescription(leaderboardText);

    // Add current time info
    const now = new Date();
    const timestamp = Math.floor(now.getTime() / 1000);
    embed.addFields(
      { name: '🕐 الوقت الحالي', value: `<t:${timestamp}:F>`, inline: false }
    );

    await interaction.reply({ embeds: [embed] });
  },
};