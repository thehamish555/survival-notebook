package dev.hamish.survivalnotebook;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import net.minecraft.client.Minecraft;
import net.minecraft.core.component.DataComponents;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.component.BundleContents;
import net.minecraft.world.item.component.ItemContainerContents;
import net.minecraft.world.item.enchantment.ItemEnchantments;

import java.util.Map;
import java.util.TreeMap;

/**
 * Counts everything you're carrying for the website's shopping list, including what's inside shulker boxes and bundles
 * (and bundles inside shulker boxes). Enchanted books are also listed by enchantment. Call on the client thread.
 */
final class InventoryScanner {
	private InventoryScanner() { }

	/** The inventory row: {id: "inv", ts, items: {item: count}, books: [[enchant name, level, count]]}. Null when not in a world. */
	static JsonObject scan() {
		var player = Minecraft.getInstance().player;
		if (player == null) return null;
		Map<String, Integer> items = new TreeMap<>(), books = new TreeMap<>();
		var inv = player.getInventory();
		for (int i = 0; i < inv.getContainerSize(); i++) add(inv.getItem(i), items, books, 0);
		JsonObject o = new JsonObject(), it = new JsonObject();
		items.forEach(it::addProperty);
		JsonArray bk = new JsonArray();
		books.forEach((k, n) -> { int bar = k.lastIndexOf('|'); JsonArray b = new JsonArray(); b.add(k.substring(0, bar)); b.add(Integer.parseInt(k.substring(bar + 1))); b.add(n); bk.add(b); });
		o.addProperty("id", "inv");
		o.addProperty("ts", System.currentTimeMillis());
		o.add("items", it);
		o.add("books", bk);
		return o;
	}

	private static void add(ItemStack s, Map<String, Integer> items, Map<String, Integer> books, int depth) {
		if (s == null || s.isEmpty()) return;
		items.merge(Compat.itemId(s), s.getCount(), Integer::sum);
		ItemEnchantments stored = s.getOrDefault(DataComponents.STORED_ENCHANTMENTS, ItemEnchantments.EMPTY);
		for (var e : stored.entrySet()) {
			String key = e.getKey().unwrapKey().map(Object::toString).orElse("");
			if (!key.isEmpty()) books.merge(Names.enchant(Names.pathOf(key)) + "|" + e.getIntValue(), s.getCount(), Integer::sum);
		}
		if (depth >= 3) return;
		ItemContainerContents box = s.get(DataComponents.CONTAINER);
		if (box != null) box.nonEmptyItemCopyStream().forEach(x -> add(x, items, books, depth + 1));
		BundleContents bundle = s.get(DataComponents.BUNDLE_CONTENTS);
		if (bundle != null) bundle.itemCopies().forEach(x -> add(x, items, books, depth + 1));
	}
}
