const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('time')
    .setDescription('عرض لوحة المتصدرين لأكثر الأعضاء قضاءً للوقت'),

  async execute(interaction) {
    const sessionsPath = path.join(__dirname, '../sessions.json');
    let sessionsData = {};
    
    try {
      if (fs.existsSync(sessionsPath)) {
        sessionsData = JSON.parse(fs.readFileSync(sessionsPath, 'utf8'));
      }
    } catch (error) {
      console.error('Error loading sessions data:', error);
      return interaction.reply({ content: '❌ حدث خطأ في تحميل بيانات الجلسات.', ephemeral: true });
    }

    // Convert to array and sort by total time
    const sortedUsers = Object.entries(sessionsData)
      .map(([userId, data]) => ({
        userId,
        username: data.username,
        totalTime: data.totalTime,
        sessions: data.sessions
      }))
      .sort((a, b) => b.totalTime - a.totalTime)
      .slice(0, 10); // Top 10

    if (sortedUsers.length === 0) {
      return interaction.reply({ 
        content: '📊 لا توجد بيانات جلسات متاحة حتى الآن.', 
        ephemeral: true 
      });
    }

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