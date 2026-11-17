package dev.hamish.survivalnotebook;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import net.minecraft.client.Minecraft;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.item.enchantment.ItemEnchantments;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

/** Remembers what you were carrying (refreshed while you're alive) so a death can record what was lost, and where. */
final class Deaths {
	private Deaths() { }

	static final DateTimeFormatter HHMM = DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.systemDefault());

	record Loot(int stacks, int level, JsonArray enchanted) { }

	private static volatile Loot last = new Loot(0, 0, new JsonArray());
	private static volatile String causeMsg = "";
	private static volatile int causeTick = -1000;

	static Loot last() { return last; }

	/** Call every few ticks while the player is alive and on the client thread. */
	static void snapshot() {
		var player = Minecraft.getInstance().player;
		if (player == null) return;
		var inv = player.getInventory();
		int stacks = 0;
		JsonArray ench = new JsonArray();
		for (int i = 0; i < inv.getContainerSize(); i++) {
			var stack = inv.getItem(i);
			if (stack.isEmpty()) continue;
			stacks++;
			ItemEnchantments e = stack.getOrDefault(DataComponents.ENCHANTMENTS, ItemEnchantments.EMPTY);
			if (e.isEmpty()) continue;
			String path = Names.pathOf(BuiltInRegistries.ITEM.getKey(stack.getItem()).toString());
			List<String> parts = new ArrayList<>();
			for (var en : e.entrySet()) {
				String key = en.getKey().unwrapKey().map(Object::toString).orElse("");
				if (!key.isEmpty()) { var def = Enchants.ENCH.get(Names.pathOf(key)); parts.add(Enchants.lvl(Names.enchant(Names.pathOf(key)), en.getIntValue(), def == null ? en.getIntValue() : def.max())); }
			}
			JsonObject o = new JsonObject();
			o.addProperty("item", path);
			o.addProperty("name", stack.getHoverName().getString());
			o.addProperty("summary", summary(parts));
			ench.add(o);
		}
		last = new Loot(stacks, player.experienceLevel, ench);
	}

	static String summary(List<String> parts) {
		return parts.size() <= 3 ? String.join(", ", parts) : String.join(", ", parts.subList(0, 3)) + " +" + (parts.size() - 3) + " more";
	}

	/** Game chat lines that start with your name are candidates for "how you died" ("Steve was slain by Zombie"). */
	static void onGameMessage(String text, int tick) {
		var p = Minecraft.getInstance().player;
		if (p == null) return;
		String me = p.getName().getString();
		if (text.startsWith(me + " ") && !text.startsWith(me + " joined") && !text.startsWith(me + " left")) { causeMsg = text; causeTick = tick; }
	}

	static String cause(int nowTick) { return nowTick - causeTick < 200 ? causeMsg : ""; }

	/** The row saved to the notebook's Deaths list. */
	static JsonObject row(Names.Spot spot, String cause, Loot loot) {
		JsonObject o = new JsonObject();
		o.addProperty("id", Names.newId());
		o.addProperty("uid", Notebook.userId);
		o.addProperty("ts", System.currentTimeMillis());
		o.addProperty("ow", spot.dim().equals("ow") ? spot.xyz() : "");
		o.addProperty("nether", spot.dim().equals("nether") ? spot.xyz() : "");
		o.addProperty("end", spot.dim().equals("end") ? spot.xyz() : "");
		o.addProperty("cause", cause);
		o.addProperty("items", loot.stacks());
		o.addProperty("xp", loot.level());
		o.add("enchanted", loot.enchanted().deepCopy());
		o.addProperty("recovered", false);
		return o;
	}

	static String label(JsonObject d) {
		long ts = d.has("ts") ? d.get("ts").getAsLong() : 0;
		return "Death " + (ts == 0 ? "" : HHMM.format(Instant.ofEpochMilli(ts)));
	}
}
