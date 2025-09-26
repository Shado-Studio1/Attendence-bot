require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { Client, Collection, GatewayIntentBits, Partials, MessageFlags, ActivityType } = require("discord.js");
const config = require("./config.json");
const { token } = config;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// Collection لتخزين الأوامر
client.commands = new Collection();

// تحميل الأوامر من مجلد commands
const commandsPath = path.join(__dirname, "commands");
if (fs.existsSync(commandsPath)) {
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".js"));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ("data" in command && "execute" in command) {
      client.commands.set(command.data.name, command);
    } else {
      console.log(`[تحذير] الأمر ${filePath} لا يحتوي data/execute`);
    }
  }
} else {
  console.log("⚠️ لم يتم العثور على مجلد commands");
}

// تحميل الأحداث من مجلد events
const eventsPath = path.join(__dirname, "events");
if (fs.existsSync(eventsPath)) {
  const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith(".js"));

  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client));
    }
  }
} else {
  console.log("⚠️ لم يتم العثور على مجلد events");
}

// Event جاهز
client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  client.user.setActivity(config.botActivity || "Dev Shadow", { type: ActivityType.Watching });
});

// Event للتعامل مع الأوامر
client.on("interactionCreate", async interaction => {
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction, client);
    } catch (error) {
      console.error(error);

      // نتأكد لو الأمر رد أو اتأخر قبل كده
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: "❌ Error while executing the command", flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content: "❌ Error while executing the command", flags: MessageFlags.Ephemeral });
      }
    }
  }
});

// تشغيل البوت
client.login(token);
