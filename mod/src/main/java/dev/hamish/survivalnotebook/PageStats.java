package dev.hamish.survivalnotebook;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Players' vanilla statistics, same as the website's Stats tab: the game's own Statistics numbers, nothing from cheats or commands. */
final class PageStats {
	private PageStats() { }

	static String uid = "", list = "How you travel";
	private static final String[] LISTS = {"How you travel", "Most mined", "Most killed", "Killed by", "Most crafted", "Most used"};
	private static final Map<String, String> TRAVEL = new LinkedHashMap<>(), TRAVEL_ICON = Map.ofEntries(
		Map.entry("walk", "leather_boots"), Map.entry("sprint", "golden_boots"), Map.entry("sneak", "leather_leggings"), Map.entry("swim", "cod"), Map.entry("walk_under_water", "turtle_helmet"),
		Map.entry("walk_on_water", "lily_pad"), Map.entry("fly", "feather"), Map.entry("elytra", "elytra"), Map.entry("climb", "ladder"), Map.entry("fall", "slime_ball"), Map.entry("boat", "oak_boat"),
		Map.entry("minecart", "minecart"), Map.entry("horse", "saddle"), Map.entry("pig", "carrot_on_a_stick"), Map.entry("strider", "warped_fungus_on_a_stick"));
	static {
		String[][] t = {{"walk", "Walking"}, {"sprint", "Sprinting"}, {"sneak", "Sneaking"}, {"swim", "Swimming"}, {"fly", "Flying"}, {"elytra", "Elytra"}, {"climb", "Climbing"}, {"fall", "Falling"},
			{"boat", "Boat"}, {"minecart", "Minecart"}, {"horse", "Horse"}, {"pig", "Pig"}, {"strider", "Strider"}, {"walk_on_water", "On water"}, {"walk_under_water", "Underwater"}};
		for (String[] x : t) TRAVEL.put(x[0], x[1]);
	}

	static void reset() { NotebookScreen.scroll = 0; }

	private static long num(JsonObject o, String k) { try { return o != null && o.has(k) && o.get(k).isJsonPrimitive() ? o.get(k).getAsLong() : 0; } catch (RuntimeException e) { return 0; } }
	private static String n(long v) { return String.format("%,d", v); }
	private static String time(long ticks) { long m = ticks / 20 / 60, h = m / 60; return h >= 1 ? h + " h " + (m % 60) + " m" : m + " m"; }
	private static String dist(long cm) { double b = cm / 100.0; return b >= 1000 ? String.format("%.1f km", b / 1000) : String.format("%,d m", Math.round(b)); }
	private static String strip(String id) { return id.replaceFirst("^minecraft[:.]", ""); }
	private static String mobIcon(String id) {
		String k = strip(id);
		return switch (k) { case "player" -> "player_head"; case "ender_dragon" -> "dragon_head"; case "wither" -> "nether_star"; case "snow_golem" -> "carved_pumpkin"; default -> k + "_spawn_egg"; };
	}

	/** [icon, label, value text, value] rows for the chosen list. */
	private static List<Object[]> rows(JsonObject r) {
		List<Object[]> out = new ArrayList<>();
		if (list.equals("How you travel")) {
			JsonObject d = r.has("distCm") && r.get("distCm").isJsonObject() ? r.getAsJsonObject("distCm") : new JsonObject();
			for (var e : d.entrySet()) { long v = e.getValue().getAsLong(); if (v > 0) out.add(new Object[] {TRAVEL_ICON.getOrDefault(e.getKey(), ""), TRAVEL.getOrDefault(e.getKey(), Names.pretty(e.getKey())), dist(v), v}); }
			out.sort((a, b) -> Long.compare((long) b[3], (long) a[3]));
			return out;
		}
		String key = switch (list) { case "Most mined" -> "mined"; case "Most killed" -> "mobs"; case "Killed by" -> "killedBy"; case "Most crafted" -> "crafted"; default -> "used"; };
		boolean mobs = key.equals("mobs") || key.equals("killedBy");
		JsonArray a = r.has(key) && r.get(key).isJsonArray() ? r.getAsJsonArray(key) : new JsonArray();
		for (JsonElement e : a) {
			if (!e.isJsonArray() || e.getAsJsonArray().size() < 2) continue;
			String id = e.getAsJsonArray().get(0).getAsString(); long v = e.getAsJsonArray().get(1).getAsLong();
			out.add(new Object[] {mobs ? mobIcon(id) : strip(id), Names.pretty(strip(id)), n(v), v});
		}
		return out;
	}

	static void build(NotebookScreen s) {
		Ui.Pal p = Ui.pal();
		List<JsonObject> members = Notebook.memberList();
		if (uid.isBlank() || Notebook.memberName(uid).isEmpty()) uid = Notebook.userId;
		List<String> names = new ArrayList<>();
		for (JsonObject m : members) names.add(Notebook.str(m, "name"));
		int y = s.top;
		s.dropdown("stats-who", s.cx, y, 170, "Player", names, Notebook.memberName(uid), p.blue, v -> { for (JsonObject m : members) if (Notebook.str(m, "name").equals(v)) uid = Notebook.str(m, "id"); NotebookScreen.scroll = 0; });
		s.dropdown("stats-list", s.cx + 176, y, 170, "", List.of(LISTS), list, p.gray, v -> { list = v; NotebookScreen.scroll = 0; });
		List<JsonObject> got = Notebook.rows("stats:" + uid);
		JsonObject r = got.isEmpty() ? null : got.get(0);
		if (r == null) {
			s.wrap("No stats from " + (uid.equals(Notebook.userId) ? "you" : Notebook.memberName(uid)) + " yet. They sync on their own with Share stats on (Settings > Sync & privacy). These are the game's own Statistics numbers, vanilla only, nothing from cheats or commands.", s.cx, y + 30, s.cw - 12, p.mut);
			return;
		}
		long ts = num(r, "ts");
		s.text("Updated " + (ts > 0 ? Deaths.HHMM.format(java.time.Instant.ofEpochMilli(ts)) : "recently") + (Notebook.str(r, "world").isBlank() ? "" : " · " + Notebook.str(r, "world")) + (Notebook.str(r, "mode").equals("mp") ? " · multiplayer" : " · singleplayer"), s.cx, y + 26, p.mut);

		long travel = 0;
		if (r.has("distCm") && r.get("distCm").isJsonObject()) for (var e : r.getAsJsonObject("distCm").entrySet()) travel += e.getValue().getAsLong();
		JsonObject totals = r.has("totals") && r.get("totals").isJsonObject() ? r.getAsJsonObject("totals") : null;
		Object[][] tiles = {{"Time played", time(num(r, "playTicks")), "clock"}, {"Deaths", n(num(r, "deaths")), "bone"}, {"Mobs killed", n(num(r, "mobKills")), "iron_sword"},
			{"Distance", dist(travel), "leather_boots"}, {"Blocks mined", n(num(totals, "mined")), "iron_pickaxe"}, {"Items crafted", n(num(totals, "crafted")), "crafting_table"},
			{"Jumps", n(num(r, "jumps")), "rabbit_foot"}, {"Damage dealt", n(num(r, "damageDealt") / 10), "diamond_sword"}, {"Advancements", r.has("advancements") ? n(num(r, "advancements")) : "–", "experience_bottle"}};
		int tw = (s.cw - 22) / 3, ty = y + 40;
		for (int i = 0; i < tiles.length; i++) {
			final int x = s.cx + (i % 3) * (tw + 6), yy = ty + (i / 3) * 28;
			final String label = (String) tiles[i][0], value = (String) tiles[i][1], icon = (String) tiles[i][2];
			s.paint((g, mx, my) -> {
				Ui.bevel(g, x, yy, tw, 25, p.row, p.hi, p.lo, p.edge);
				Compat.drawItem(g, icon, x + 5, yy + 4);
				g.text(s.font(), Ui.clip(s.font(), label, tw - 30), x + 26, yy + 4, p.mut, false);
				g.text(s.font(), Ui.clip(s.font(), value, tw - 30), x + 26, yy + 14, p.ink, false);
			});
		}

		List<Object[]> list = rows(r);
		int listTop = ty + 3 * 28 + 4, rowH = 18, vis = Math.max(1, (s.bottom - listTop) / rowH), rowW = s.cw - 10;
		s.setScroll(list.size(), vis);
		if (list.isEmpty()) s.text("Nothing yet.", s.cx + 4, listTop + 4, p.mut);
		final long max = list.isEmpty() ? 1 : Math.max(1, (long) list.get(0)[3]);
		int widest = 0; for (Object[] r0 : list) widest = Math.max(widest, s.font().width((String) r0[2]));
		final int valCol = widest;
		for (int i = 0; i < vis && NotebookScreen.scroll + i < list.size(); i++) {
			final Object[] row = list.get(NotebookScreen.scroll + i);
			final int ry = listTop + i * rowH;
			s.paint((g, mx, my) -> {
				Ui.rounded(g, s.cx, ry, rowW, rowH - 1, p.row, p.rowAlt);
				Compat.drawItem(g, (String) row[0], s.cx + 3, ry);
				int nameW = Math.min(150, rowW / 3), valW = s.font().width((String) row[2]);
				g.text(s.font(), Ui.clip(s.font(), (String) row[1], nameW), s.cx + 22, ry + 5, p.ink, false);
				int bx = s.cx + 26 + nameW, bw = Math.max(10, rowW - nameW - valCol - 40);
				g.fill(bx, ry + 6, bx + bw, ry + 11, p.panel2);
				g.fill(bx, ry + 6, bx + Math.max(2, (int) (bw * (long) row[3] / max)), ry + 11, p.grass);
				g.text(s.font(), (String) row[2], s.cx + rowW - 6 - valW, ry + 5, p.ink, false);
			});
		}
	}
}
