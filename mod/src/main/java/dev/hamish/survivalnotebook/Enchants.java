package dev.hamish.survivalnotebook;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Which enchantments each item can get, max levels and conflicts. Loaded from the same enchants.json the website uses. */
final class Enchants {
	private Enchants() { }

	record Def(String key, String name, int max, boolean curse) { }
	record Kind(String key, String label, String group, List<String> enchants, List<String[]> variants) { }
	record Owned(String name, int level, int max, String state) { }              // state: max | low | curse | other
	record Missing(String key, String name, int max, boolean alt) { }
	record Result(List<Owned> owned, List<Missing> missing, List<Missing> off, List<Missing> goals, int upgrades, int remaining, boolean done, boolean known) { }

	static final Map<String, Def> ENCH = new LinkedHashMap<>();
	static final Map<String, String> KEY_BY_NAME = new HashMap<>();
	static final Map<String, Kind> KINDS = new LinkedHashMap<>();
	private static final List<List<String>> EXCLUSIVE = new ArrayList<>();

	static {
		try (InputStream in = Enchants.class.getResourceAsStream("/assets/survival_notebook/enchants.json")) {
			if (in != null) {
				JsonObject root = JsonParser.parseReader(new InputStreamReader(in, StandardCharsets.UTF_8)).getAsJsonObject();
				for (var e : root.getAsJsonObject("enchants").entrySet()) {
					JsonObject o = e.getValue().getAsJsonObject();
					Def d = new Def(e.getKey(), o.get("name").getAsString(), o.get("max").getAsInt(), o.has("curse"));
					ENCH.put(d.key(), d); KEY_BY_NAME.put(d.name(), d.key());
				}
				for (JsonElement s : root.getAsJsonArray("exclusive")) { List<String> set = new ArrayList<>(); for (JsonElement k : s.getAsJsonArray()) set.add(k.getAsString()); EXCLUSIVE.add(set); }
				for (var e : root.getAsJsonObject("kinds").entrySet()) {
					JsonObject o = e.getValue().getAsJsonObject();
					List<String> en = new ArrayList<>(); for (JsonElement k : o.getAsJsonArray("enchants")) en.add(k.getAsString());
					List<String[]> vs = new ArrayList<>(); for (JsonElement v : o.getAsJsonArray("variants")) vs.add(new String[] {v.getAsJsonObject().get("label").getAsString(), v.getAsJsonObject().get("id").getAsString()});
					KINDS.put(e.getKey(), new Kind(e.getKey(), o.get("label").getAsString(), o.get("group").getAsString(), en, vs));
				}
			}
		} catch (Exception ignored) { /* rules unavailable: gear still syncs, just without "missing" hints */ }
	}

	static String kindOf(String itemPath) {
		for (Kind k : KINDS.values()) for (String[] v : k.variants()) if (v[1].equals(itemPath)) return k.key();
		return null;
	}

	private static Set<String> conflicts(String key) {
		Set<String> out = new HashSet<>();
		for (List<String> set : EXCLUSIVE) if (set.contains(key)) out.addAll(set);
		out.remove(key);
		return out;
	}

	/** What an item still needs. {@code have} maps display names to levels (how gear is stored). Mirrors web/lib/enchants.ts. */
	static Result analyse(String kind, Map<String, Integer> have) { return analyse(kind, have, Set.of(), Map.of()); }

	/**
	 * What an item still needs. {@code have}: display name -> level. {@code off}: enchant keys switched off for THIS item (listed in result.off, don't count).
	 * {@code goal}: display name -> level you want on it (counts as needed; also excludes whatever it conflicts with). Mirrors web/lib/enchants.ts.
	 */
	static Result analyse(String kind, Map<String, Integer> have, Set<String> off, Map<String, Integer> goal) {
		Map<String, Integer> goalKey = new LinkedHashMap<>();
		for (var e : goal.entrySet()) { String k = KEY_BY_NAME.get(e.getKey()); if (k != null && e.getValue() > 0) goalKey.put(k, e.getValue()); }
		Map<String, Integer> levels = new HashMap<>();
		List<Owned> owned = new ArrayList<>();
		int upgrades = 0;
		for (var e : have.entrySet()) {
			String key = KEY_BY_NAME.get(e.getKey());
			Def d = key == null ? null : ENCH.get(key);
			if (key != null) levels.put(key, e.getValue());
			int max = key != null && goalKey.containsKey(key) ? goalKey.get(key) : d == null ? e.getValue() : d.max();
			String state = d == null ? "other" : d.curse() ? "curse" : e.getValue() >= max ? "max" : "low";
			if (state.equals("low")) upgrades++;
			owned.add(new Owned(e.getKey(), e.getValue(), max, state));
		}
		Kind k = kind == null ? null : KINDS.get(kind);
		if (k == null) return new Result(owned, List.of(), List.of(), List.of(), upgrades, 0, false, false);

		List<Missing> goals = new ArrayList<>();
		Set<String> wanted = new HashSet<>();
		for (var e : goalKey.entrySet()) if (levels.getOrDefault(e.getKey(), 0) <= 0) { Def d = ENCH.get(e.getKey()); if (d != null) { goals.add(new Missing(e.getKey(), d.name(), e.getValue(), false)); wanted.add(e.getKey()); } }

		List<Missing> missing = new ArrayList<>(), offList = new ArrayList<>();
		for (String key : k.enchants()) {
			Def d = ENCH.get(key);
			if (d == null || d.curse() || levels.getOrDefault(key, 0) > 0 || wanted.contains(key)) continue;
			boolean excluded = false;
			for (String c : conflicts(key)) if (levels.getOrDefault(c, 0) > 0 || wanted.contains(c)) excluded = true;
			if (excluded) continue;
			(off.contains(key) ? offList : missing).add(new Missing(key, d.name(), d.max(), false));
		}
		Set<String> keys = new HashSet<>();
		for (Missing m : missing) keys.add(m.key());
		for (int i = 0; i < missing.size(); i++) {
			Missing m = missing.get(i);
			boolean alt = false;
			for (String c : conflicts(m.key())) if (keys.contains(c)) alt = true;
			missing.set(i, new Missing(m.key(), m.name(), m.max(), alt));
		}
		Set<String> seen = new HashSet<>();
		int groups = 0;
		for (Missing m : missing) {   // alternatives count once: connected groups of conflicting missing enchants
			if (seen.contains(m.key())) continue;
			groups++;
			Deque<String> stack = new ArrayDeque<>(List.of(m.key()));
			while (!stack.isEmpty()) {
				String c = stack.pop();
				if (!seen.add(c)) continue;
				for (String n : conflicts(c)) if (keys.contains(n)) stack.push(n);
			}
		}
		int remaining = upgrades + groups + goals.size();
		boolean hasReal = owned.stream().anyMatch(o -> !o.state().equals("curse"));
		return new Result(owned, missing, offList, goals, upgrades, remaining, remaining == 0 && hasReal, true);
	}

	/** "Sharpness V", but just "Mending" when the max level is I. */
	static String lvl(String name, int level, int max) {
		if (max <= 1) return name;
		String[] r = {"", "I", "II", "III", "IV", "V"};
		return name + " " + (level >= 0 && level < r.length ? r[level] : String.valueOf(level));
	}

	static Set<String> strSet(JsonObject item, String key) {
		Set<String> out = new HashSet<>();
		if (item.has(key) && item.get(key).isJsonArray()) for (JsonElement e : item.getAsJsonArray(key)) out.add(e.getAsString());
		return out;
	}

	static Map<String, Integer> levelMap(JsonObject item, String key) {
		Map<String, Integer> out = new LinkedHashMap<>();
		if (item.has(key) && item.get(key).isJsonObject())
			for (var e : item.getAsJsonObject(key).entrySet()) if (e.getValue().isJsonPrimitive()) out.put(e.getKey(), e.getValue().getAsInt());
		return out;
	}

	/** Analyses a gear row the way the website does: a planned item (plan: true) has nothing yet, so everything on it is a goal. */
	static Result analyseItem(JsonObject item) {
		String kind = kindOf(itemPath(item));
		boolean plan = Notebook.bool(item, "plan");
		Map<String, Integer> goal = levelMap(item, "goal");
		if (plan) { Map<String, Integer> g = new LinkedHashMap<>(levelMap(item, "enchants")); g.putAll(goal); return analyse(kind, Map.of(), strSet(item, "off"), g); }
		return analyse(kind, levelMap(item, "enchants"), strSet(item, "off"), goal);
	}

	/** Items' enchants as name -> level from a gear item's JSON. */
	static Map<String, Integer> levelsOf(JsonObject item) {
		Map<String, Integer> out = new LinkedHashMap<>();
		if (item.has("enchants") && item.get("enchants").isJsonObject())
			for (var e : item.getAsJsonObject("enchants").entrySet()) if (e.getValue().isJsonPrimitive()) out.put(e.getKey(), e.getValue().getAsInt());
		return out;
	}

	static String itemPath(JsonObject item) {
		String s = Notebook.str(item, "item");
		return s.isEmpty() ? Notebook.str(item, "icon") : s;
	}
}
