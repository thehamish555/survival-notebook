package dev.hamish.survivalnotebook;

import com.google.gson.JsonObject;
import com.mojang.brigadier.arguments.StringArgumentType;
import net.fabricmc.fabric.api.client.command.v2.ClientCommandRegistrationCallback;
import net.fabricmc.fabric.api.client.command.v2.ClientCommands;
import net.fabricmc.fabric.api.client.command.v2.FabricClientCommandSource;
import net.minecraft.network.chat.Component;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Client commands (they never reach the server, so they work anywhere):
 * /notebook opens the notebook, /notebook place <name> saves where you're standing, /notebook todo <text> adds a to-do for you.
 */
final class Commands {
	private Commands() { }

	static volatile boolean openSoon;   // the chat screen closes after a command runs, so the notebook opens on the next tick

	static void register() {
		ClientCommandRegistrationCallback.EVENT.register((d, ctx) -> d.register(ClientCommands.literal("notebook")
			.executes(c -> { openSoon = true; return 1; })
			.then(ClientCommands.literal("place").then(ClientCommands.argument("name", StringArgumentType.greedyString())
				.executes(c -> place(c.getSource(), StringArgumentType.getString(c, "name")))))
			.then(ClientCommands.literal("todo").then(ClientCommands.argument("text", StringArgumentType.greedyString())
				.executes(c -> todo(c.getSource(), StringArgumentType.getString(c, "text")))))));
	}

	private static boolean ready(FabricClientCommandSource src) {
		if (Notebook.canEdit()) return true;
		src.sendError(Component.literal(Notebook.ok ? "You can only view this notebook" : "Not connected. Press N, then Settings."));
		return false;
	}

	private static int place(FabricClientCommandSource src, String name) {
		if (!ready(src)) return 0;
		Names.Spot spot = Names.here();
		if (spot == null) { src.sendError(Component.literal("Can't read your position in this dimension")); return 0; }
		Notebook.savePlace(name.trim(), "Important", spot);
		return 1;
	}

	private static final Pattern QTY = Pattern.compile("^(\\d{1,6})\\s*x?\\s+(.+)$", Pattern.CASE_INSENSITIVE);

	/** "64 glass" becomes a to-do with a quantity of 64 and the glass icon, so it goes on the shopping list. */
	static JsonObject todoRow(String text) {
		String t = text.trim();
		JsonObject row = new JsonObject();
		row.addProperty("id", Names.newId()); row.addProperty("project", t); row.addProperty("priority", "Medium");
		row.addProperty("progress", "To-Do"); row.addProperty("assignee", Notebook.userId); row.addProperty("notes", "");
		Matcher m = QTY.matcher(t);
		if (m.matches()) {
			String item = itemFor(m.group(2));
			if (item != null) { row.addProperty("qty", Integer.parseInt(m.group(1))); row.addProperty("icon", item); }
		}
		return row;
	}

	/** "Oak logs" -> oak_log, if that's a real item; otherwise null. */
	private static String itemFor(String words) {
		String id = words.trim().toLowerCase().replaceAll("[^a-z0-9_ ]", "").replaceAll("\\s+", "_");
		for (String c : new String[] {id, id.replaceAll("es$", ""), id.replaceAll("s$", "")}) if (!c.isEmpty() && !Compat.stack(c).isEmpty()) return c;
		return null;
	}

	private static int todo(FabricClientCommandSource src, String text) {
		if (!ready(src)) return 0;
		if (text.isBlank()) { src.sendError(Component.literal("Say what the to-do is")); return 0; }
		JsonObject row = todoRow(text);
		Notebook.saveRow("todos", row);
		src.sendFeedback(Component.literal("[Survival Notebook] Added to-do “" + text.trim() + "”" + (row.has("qty") ? " (shopping list: " + row.get("qty").getAsInt() + ")" : "")));
		return 1;
	}
}
