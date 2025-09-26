const { REST, Routes } = require("discord.js");
const fs = require("fs");
const path = require("path");
const { clientId, guildId, token } = require("./config.json");

const commands = [];
const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".js"));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if ("data" in command && "execute" in command) {
    commands.push(command.data.toJSON());
  } else {
    console.log(`[تحذير] الأمر ${file} لا يحتوي data/execute`);
  }
}

const rest = new REST({ version: "10" }).setToken(token);

(async () => {
  try {
    console.log(`⌛️ جاري رفع ${commands.length} أمر(أوامر)...`);

    // أوامر محلية (سيرفر محدد)
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: commands,
    });

    console.log("✅ تم تسجيل الأوامر بنجاح!");
  } catch (error) {
    console.error(error);
  }
})();
