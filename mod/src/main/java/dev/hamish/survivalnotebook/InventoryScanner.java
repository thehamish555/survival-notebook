package dev.hamish.survivalnotebook;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import net.minecraft.client.Minecraft;
import net.minecraft.core.component.DataComponents;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.component.BundleContents;
import net.minecraft.world.item.component.ItemContainerContents;
import net.minecraft.world.item.enchantment.ItemEnchantments;

import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * Counts everything you're carrying for the website's shopping list, including what's inside shulker boxes and bundles
 * (and bundles inside shulker boxes). Enchanted books are also listed by enchantment. Call on the client thread.
 */
final class InventoryScanner {
	private InventoryScanner() { }

	/** Your ender chest as it was the last time you opened it: {ts, items, books}. Null until it's been seen (or read back from the notebook). */
	static volatile JsonObject ender;

	/**
	 * The inventory row: {id: "inv", ts, items: {item: count}, books: [[enchant name, level, count]], ender?: {ts, items, books}}.
	 * Null when not in a world.
	 */
	static JsonObject scan() {
		var player = Minecraft.getInstance().player;
		if (player == null) return null;
		Map<String, Integer> items = new TreeMap<>(), books = new TreeMap<>();
		var inv = player.getInventory();
		for (int i = 0; i < inv.getContainerSize(); i++) add(inv.getItem(i), items, books, 0);
		JsonObject o = pack(items, books);
		o.addProperty("id", "inv");
		o.addProperty("ts", System.currentTimeMillis());
		JsonObject e = enderNow();
		if (e != null) o.add("ender", e.deepCopy());
		return o;
	}

	private static JsonObject pack(Map<String, Integer> items, Map<String, Integer> books) {
		JsonObject o = new JsonObject(), it = new JsonObject();
		items.forEach(it::addProperty);
		JsonArray bk = new JsonArray();
		books.forEach((k, n) -> { int bar = k.lastIndexOf('|'); JsonArray b = new JsonArray(); b.add(k.substring(0, bar)); b.add(Integer.parseInt(k.substring(bar + 1))); b.add(n); bk.add(b); });
		o.add("items", it);
		o.add("books", bk);
		return o;
	}

	/** The remembered ender chest; after a restart it comes back from what this mod last sent to the notebook. */
	static JsonObject enderNow() {
		if (ender != null) return ender;
		List<JsonObject> mine = Notebook.rows("inv:" + Notebook.userId);
		if (!mine.isEmpty() && mine.get(0).has("ender") && mine.get(0).get("ender").isJsonObject()) ender = mine.get(0).getAsJsonObject("ender").deepCopy();
		return ender;
	}

	/** Call every few ticks: while the ender chest is open, remember what's in it (shulker boxes and bundles included). */
	static void watchEnder() {
		List<ItemStack> slots = Compat.enderChestSlots();
		if (slots == null) return;
		Map<String, Integer> items = new TreeMap<>(), books = new TreeMap<>();
		for (ItemStack s : slots) add(s, items, books, 0);
		JsonObject next = pack(items, books), cur = ender;
		if (cur != null && cur.get("items").equals(next.get("items")) && cur.get("books").equals(next.get("books"))) return;   // unchanged: keep its time
		next.addProperty("ts", System.currentTimeMillis());
		ender = next;
	}

	private static void add(ItemStack s, Map<String, Integer> items, Map<String, Integer> books, int depth) {
		if (s == null || s.isEmpty()) return;
		items.merge(Compat.shopId(s), s.getCount(), Integer::sum);   // potions keep their effect, so the shopping list matches exactly
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
