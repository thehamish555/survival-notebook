package dev.hamish.survivalnotebook;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import net.minecraft.client.Minecraft;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.item.enchantment.ItemEnchantments;

/** Reads every enchanted item in your inventory (hotbar, main, armor, offhand) into the website's gear format. Call on the client thread. */
final class GearScanner {
	private GearScanner() { }

	static JsonArray scan() {
		JsonArray out = new JsonArray();
		var player = Minecraft.getInstance().player;
		if (player == null) return out;
		var inv = player.getInventory();
		for (int i = 0; i < inv.getContainerSize(); i++) {
			var stack = inv.getItem(i);
			if (stack.isEmpty()) continue;
			ItemEnchantments enchants = stack.getOrDefault(DataComponents.ENCHANTMENTS, ItemEnchantments.EMPTY);
			if (enchants.isEmpty()) continue;
			String path = Names.pathOf(BuiltInRegistries.ITEM.getKey(stack.getItem()).toString());
			JsonObject levels = new JsonObject();
			for (var e : enchants.entrySet()) {
				String key = e.getKey().unwrapKey().map(Object::toString).orElse("");
				if (!key.isEmpty()) levels.addProperty(Names.enchant(Names.pathOf(key)), e.getIntValue());
			}
			JsonObject item = new JsonObject();
			item.addProperty("id", "mod_" + i + "_" + path);   // stable per slot, so the website keeps its row order
			item.addProperty("name", stack.getHoverName().getString());
			item.addProperty("item", path);                   // the website derives the item type (and what it can still get) from this
			item.addProperty("icon", path);                   // matches the website's extracted item icons
			item.addProperty("group", Names.group(path));
			item.add("enchants", levels);
			item.addProperty("mod", true);                    // marks it as managed by the mod
			out.add(item);
		}
		return out;
	}
}
