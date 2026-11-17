package dev.hamish.survivalnotebook;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Shopping list, same as the website's: blocks for farms not built yet (from their Litematica files), quantities on open to-dos,
 * and books your gear still needs. "Have" is read live from your inventory, including shulker boxes and bundles.
 */
final class PageShopping {
	private PageShopping() { }

	static String from = "Everything", show = "Still needed";
	private static final String[] FROM = {"Everything", "Farms", "To-dos", "Books"};

	private static volatile JsonObject blocks = new JsonObject();   // file id -> {items: {item: count}, error?}
	private static volatile String blocksFor = "";
	private static volatile boolean loading;

	record Line(String key, String icon, String label, int need, int have, List<String> from) { int left() { return Math.max(0, need - have); } }

	static void reset() { NotebookScreen.scroll = 0; }

	/** Asks the server for the farms' block counts when the set of attached files changes. */
	private static void loadBlocks(String fileKey) {
		NbConfig c = NbConfig.get();
		if (fileKey.equals(blocksFor) || loading || c.notebookId.isBlank()) return;
		loading = true;
		final String nb = c.notebookId;
		Api.EXEC.execute(() -> {
			try { blocks = Api.ok(Api.call("GET", "/notebooks/" + nb + "/blocks", null)).obj(); blocksFor = fileKey; }
			catch (Api.ApiException | RuntimeException ignored) { blocksFor = fileKey; }
			finally { loading = false; Notebook.touch(); }
		});
	}

	static List<Line> lines() {
		Map<String, Line> m = new LinkedHashMap<>();
		JsonObject inv = InventoryScanner.scan();
		JsonObject items = inv == null ? new JsonObject() : inv.getAsJsonObject("items");
		StringBuilder fileKey = new StringBuilder();
		List<JsonObject> farms = new ArrayList<>();
		for (JsonObject f : Notebook.rows("farms")) {
			if (Notebook.bool(f, "built") || !f.has("file") || !f.get("file").isJsonObject()) continue;
			farms.add(f); fileKey.append(Notebook.str(f.getAsJsonObject("file"), "id")).append(',');
		}
		loadBlocks(fileKey.toString());
		if (from.equals("Everything") || from.equals("Farms")) for (JsonObject f : farms) {
			JsonObject b = blocks.has(Notebook.str(f.getAsJsonObject("file"), "id")) ? blocks.getAsJsonObject(Notebook.str(f.getAsJsonObject("file"), "id")) : null;
			if (b == null || !b.has("items")) continue;
			String name = Notebook.str(f, "name").isBlank() ? "Unnamed farm" : Notebook.str(f, "name");
			for (var e : b.getAsJsonObject("items").entrySet()) add(m, e.getKey(), e.getKey(), Names.pretty(e.getKey().replaceFirst("^.*:", "")), e.getValue().getAsInt(), name);
		}
		if (from.equals("Everything") || from.equals("To-dos")) for (JsonObject t : Notebook.rows("todos")) {
			int q;
			try { q = t.has("qty") && t.get("qty").isJsonPrimitive() ? (int) Math.floor(t.get("qty").getAsDouble()) : 0; } catch (RuntimeException e) { q = 0; }
			if (q <= 0 || !Notebook.str(t, "auto").isEmpty() || Notebook.str(t, "progress").equals("Done")) continue;
			String icon = Notebook.str(t, "icon"), project = Notebook.str(t, "project").isBlank() ? "Untitled to-do" : Notebook.str(t, "project");
			add(m, icon.isBlank() ? "todo:" + Notebook.str(t, "id") : icon, icon, icon.isBlank() ? project : Names.pretty(icon), q, "To-do: " + project);
		}
		if (from.equals("Everything") || from.equals("Books")) for (var b : books(Notebook.gear(Notebook.userId)).entrySet()) {
			String[] nk = b.getKey().split("\\|");
			add(m, "book:" + nk[0] + ":" + nk[1], "enchanted_book", Enchants.lvl(nk[0], Integer.parseInt(nk[1]), Integer.parseInt(nk[1])) + " book", b.getValue(), "Gear");
		}
		List<Line> out = new ArrayList<>();
		JsonObject ender = inv != null && inv.has("ender") ? inv.getAsJsonObject("ender") : null;
		for (Line l : m.values()) {
			int have = 0;
			for (JsonObject src : ender == null ? List.of(inv == null ? new JsonObject() : inv) : List.of(inv, ender)) {   // what you carry, plus your ender chest
				if (l.key().startsWith("book:")) {
					int c = l.key().lastIndexOf(':');
					String name = l.key().substring(5, c); int lv = Integer.parseInt(l.key().substring(c + 1));
					if (src.has("books")) for (JsonElement e : src.getAsJsonArray("books")) {
						var a = e.getAsJsonArray();
						if (a.get(0).getAsString().equals(name) && a.get(1).getAsInt() >= lv) have += a.get(2).getAsInt();
					}
				} else if (!l.key().startsWith("todo:") && src.has("items") && src.getAsJsonObject("items").has(l.key())) have += src.getAsJsonObject("items").get(l.key()).getAsInt();
			}
			out.add(new Line(l.key(), l.icon(), l.label(), l.need(), l.key().startsWith("todo:") ? -1 : have, l.from()));
		}
		out.sort((a, b) -> a.left() != b.left() ? Integer.compare(b.left(), a.left()) : a.label().compareTo(b.label()));
		return out;
	}

	private static void add(Map<String, Line> m, String key, String icon, String label, int n, String src) {
		Line l = m.get(key);
		List<String> f = l == null ? new ArrayList<>() : l.from();
		if (!f.contains(src)) f.add(src);
		m.put(key, new Line(key, icon, label, (l == null ? 0 : l.need()) + n, 0, f));
	}

	/** "I'll get it" / "You" / someone's name: who's gathering this item, shared with the website (the notebook's shop list). */
	private static void claimPill(NotebookScreen s, String key, int x, int y) {
		Ui.Pal p = Ui.pal();
		String id = key.length() > 64 ? key.substring(0, 64) : key;
		JsonObject c = Notebook.find("shop", id);
		String who = c == null ? "" : Notebook.str(c, "uid"), name = who.isEmpty() ? "" : Notebook.memberName(who);
		if (!name.isEmpty() && !who.equals(Notebook.userId)) { s.pill(x, y, 70, 15, Ui.clip(s.font(), name, 64), p.gray, () -> { }, false); return; }
		boolean mine = !name.isEmpty();
		s.pill(x, y, 70, 15, mine ? "You \u2715" : "I'll get it", mine ? p.blue : p.secondary, () -> {
			if (mine) Notebook.deleteRow("shop", id);
			else { JsonObject row = new JsonObject(); row.addProperty("id", id); row.addProperty("uid", Notebook.userId); row.addProperty("ts", System.currentTimeMillis()); Notebook.saveRow("shop", row); }
		}, Notebook.canEdit());
	}

	/** Books still needed across your gear ("Name|level" -> how many), like the website's book list. */
	static Map<String, Integer> books(List<JsonObject> gear) {
		Map<String, Integer> need = new LinkedHashMap<>();
		for (JsonObject it : gear) {
			Enchants.Result r = Enchants.analyseItem(it);
			for (Enchants.Owned o : r.owned()) if (o.state().equals("low")) need.merge(o.name() + "|" + o.max(), 1, Integer::sum);
			for (Enchants.Missing x : r.missing()) if (!x.alt()) need.merge(x.name() + "|" + x.max(), 1, Integer::sum);
			for (Enchants.Missing g : r.goals()) need.merge(g.name() + "|" + g.max(), 1, Integer::sum);
		}
		return need;
	}

	private static final java.util.regex.Pattern UNSTACKABLE = java.util.regex.Pattern.compile(".*(_bucket|_bed|_boat|_raft|_minecart|shulker_box|_sword|_pickaxe|_axe|_shovel|_hoe|_helmet|_chestplate|_leggings|_boots|saddle|cake|potion|enchanted_book)$|^book:.*");

	/** "251 (3 st + 59)" for things that stack to 64. */
	static String amount(String key, int n) {
		if (n < 64 || UNSTACKABLE.matcher(key).matches()) return String.valueOf(n);
		return n + " (" + n / 64 + " st" + (n % 64 > 0 ? " + " + n % 64 : "") + ")";
	}

	static void build(NotebookScreen s) {
		Ui.Pal p = Ui.pal();
		int y = s.top;
		s.dropdown("shop-from", s.cx, y, 150, "From", List.of(FROM), from, from.equals("Everything") ? p.gray : p.teal, v -> { from = v; NotebookScreen.scroll = 0; });
		s.dropdown("shop-show", s.cx + 156, y, 150, "Show", List.of("Still needed", "Everything"), show, p.gray, v -> { show = v; NotebookScreen.scroll = 0; });
		List<Line> all = lines(), view = new ArrayList<>();
		int done = 0;
		for (Line l : all) { if (l.have() >= 0 && l.left() == 0) done++; if (show.equals("Everything") || l.have() < 0 || l.left() > 0) view.add(l); }
		if (!all.isEmpty()) s.textRight(done + " of " + all.size() + " done", s.cx + s.cw - 10, y + 6, p.mut);
		JsonObject ender = InventoryScanner.enderNow();
		s.text(ender == null ? "Have counts what you're carrying, with shulker boxes and bundles. Open your ender chest to count it too."
			: "Have counts what you're carrying and your ender chest, with shulker boxes and bundles.", s.cx, y + 26, p.mut);

		int listTop = y + 40, rowH = 22, vis = Math.max(1, (s.bottom - listTop) / rowH), rowW = s.cw - 10;
		s.setScroll(view.size(), vis);
		if (all.isEmpty()) s.wrap("Nothing to gather. Attach Litematica files to farms you haven't built, add to-dos with a quantity (/notebook todo 64 glass), or plan gear that needs books.", s.cx + 4, listTop + 6, s.cw - 16, p.mut);
		else if (view.isEmpty()) s.text("You have everything on the list.", s.cx + 4, listTop + 6, p.grassHi);
		for (int i = 0; i < vis && NotebookScreen.scroll + i < view.size(); i++) {
			final Line l = view.get(NotebookScreen.scroll + i);
			final int ry = listTop + i * rowH;
			s.row(s.cx, ry, rowW, rowH - 1, 0, i, null);
			claimPill(s, l.key(), s.cx + rowW - 74, ry + 3);
			s.paint((g, mx, my) -> {
				Compat.drawItem(g, l.icon(), s.cx + 5, ry + 2);
				boolean got = l.have() >= 0 && l.left() == 0;
				String right = l.have() < 0 ? "need " + amount(l.key(), l.need()) : got ? "got " + l.have() + " / " + l.need() : amount(l.key(), l.left()) + " to go";
				int rw = s.font().width(right);
				g.text(s.font(), right, s.cx + rowW - 80 - rw, ry + 7, got ? p.grassHi : p.ink, false);
				String detail = l.have() < 0 ? String.join(", ", l.from()) : "have " + l.have() + " of " + l.need() + " · " + String.join(", ", l.from());
				g.text(s.font(), Ui.clip(s.font(), l.label(), Math.max(60, (rowW - rw - 112) / 2)), s.cx + 26, ry + 7, got ? p.mut : p.ink, false);
				int dx = s.cx + 30 + Math.min(s.font().width(l.label()), Math.max(60, (rowW - rw - 112) / 2));
				g.text(s.font(), Ui.clip(s.font(), detail, s.cx + rowW - 88 - rw - dx), dx + 6, ry + 7, p.mut, false);
			});
		}
	}
}
