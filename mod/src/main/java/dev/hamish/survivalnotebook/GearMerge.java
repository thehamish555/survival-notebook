package dev.hamish.survivalnotebook;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Merges what the game scanned with what's already in your gear list, so nothing you set by hand is lost when items are re-synced:
 * - a synced item keeps its per-item switches (off), goals and nickname (matched by slot, else by item + enchants);
 * - a planned item (plan: true, "something I want to make") merges into the best-matching real item of the same type when you get one;
 * - an item that leaves your inventory but has goals/switches is kept as "stored" instead of vanishing.
 * Items you added by hand (not planned) are never touched.
 */
final class GearMerge {
	private GearMerge() { }

	private static String s(JsonObject o, String k) { return o.has(k) && o.get(k).isJsonPrimitive() ? o.get(k).getAsString() : ""; }
	private static boolean b(JsonObject o, String k) { return o.has(k) && o.get(k).isJsonPrimitive() && o.get(k).getAsBoolean(); }
	private static boolean nonEmpty(JsonObject o, String k) {
		JsonElement e = o.get(k);
		return e != null && (e.isJsonArray() ? e.getAsJsonArray().size() > 0 : e.isJsonObject() && !e.getAsJsonObject().entrySet().isEmpty());
	}

	private static String sig(JsonObject o) {
		return Enchants.itemPath(o) + "|" + new java.util.TreeMap<>(Enchants.levelMap(o, "enchants"));
	}

	static JsonArray merge(JsonArray old, JsonArray scanned) {
		List<JsonObject> pool = new ArrayList<>(), plans = new ArrayList<>(), keep = new ArrayList<>();
		for (JsonElement e : old) {
			if (!e.isJsonObject()) continue;
			JsonObject o = e.getAsJsonObject();
			if (b(o, "mod") || b(o, "away")) pool.add(o); else if (b(o, "plan")) plans.add(o); else keep.add(o);
		}
		List<JsonObject> out = new ArrayList<>(), copies = new ArrayList<>();
		List<JsonObject> matched = new ArrayList<>();
		for (JsonElement e : scanned) {
			JsonObject sc = e.getAsJsonObject().deepCopy();
			JsonObject m = take(pool, x -> s(x, "id").equals(s(sc, "id")) && Enchants.itemPath(x).equals(Enchants.itemPath(sc)));
			if (m == null) m = take(pool, x -> sig(x).equals(sig(sc)));
			copies.add(sc); matched.add(m);
		}
		for (int i = 0; i < copies.size(); i++) {   // second chance: the same kind of item whose enchants changed (e.g. you upgraded it)
			if (matched.get(i) == null) matched.set(i, closest(pool, copies.get(i)));
		}
		for (int i = 0; i < copies.size(); i++) {
			JsonObject sc = copies.get(i), m = matched.get(i);
			boolean fromPlan = false;
			if (m == null) { m = bestPlan(plans, sc); fromPlan = m != null; }
			if (m != null) inherit(sc, m, fromPlan);
			out.add(sc);
		}
		for (JsonObject left : pool) {   // gone from the inventory: keep only if it carries something you set
			if (nonEmpty(left, "off") || nonEmpty(left, "goal") || !s(left, "alias").isBlank()) {
				left.remove("mod");
				left.addProperty("away", true);
				left.addProperty("id", "away_" + Names.newId());
				keep.add(left);
			}
		}
		keep.addAll(plans);
		JsonArray res = new JsonArray();
		for (JsonObject o : keep) res.add(o);
		for (JsonObject o : out) res.add(o);
		return res;
	}

	private static JsonObject take(List<JsonObject> pool, java.util.function.Predicate<JsonObject> p) {
		for (int i = 0; i < pool.size(); i++) if (p.test(pool.get(i))) return pool.remove(i);
		return null;
	}

	/** The leftover item of the same type sharing the most enchants with this one (at least one), removed from the pool. */
	private static JsonObject closest(List<JsonObject> pool, JsonObject sc) {
		JsonObject best = null; int bestScore = 0;
		var have = Enchants.levelMap(sc, "enchants");
		for (JsonObject p : pool) {
			if (!Enchants.itemPath(p).equals(Enchants.itemPath(sc))) continue;
			int score = 0;
			for (String k : Enchants.levelMap(p, "enchants").keySet()) if (have.containsKey(k)) score++;
			if (score > bestScore) { best = p; bestScore = score; }
		}
		if (best != null) pool.remove(best);
		return best;
	}

	/** The planned item of the same type sharing the most enchants with this one (ties: the first planned). */
	private static JsonObject bestPlan(List<JsonObject> plans, JsonObject sc) {
		JsonObject best = null; int bestScore = -1;
		var have = Enchants.levelMap(sc, "enchants");
		for (JsonObject p : plans) {
			if (!Enchants.itemPath(p).equals(Enchants.itemPath(sc))) continue;
			int score = 0;
			for (String k : Enchants.levelMap(p, "enchants").keySet()) if (have.containsKey(k)) score++;
			for (String k : Enchants.levelMap(p, "goal").keySet()) if (have.containsKey(k)) score++;
			if (score > bestScore) { best = p; bestScore = score; }
		}
		if (best != null) plans.remove(best);
		return best;
	}

	private static void inherit(JsonObject sc, JsonObject m, boolean fromPlan) {
		if (!fromPlan && !s(m, "id").isBlank() && !s(m, "id").startsWith("away_")) sc.addProperty("id", s(m, "id"));   // keep the row's identity so an open item doesn't vanish on re-sync
		if (nonEmpty(m, "off")) sc.add("off", m.get("off").deepCopy());
		JsonObject goal = new JsonObject();
		if (fromPlan) for (var e : Enchants.levelMap(m, "enchants").entrySet()) goal.addProperty(e.getKey(), e.getValue());
		for (var e : Enchants.levelMap(m, "goal").entrySet()) goal.addProperty(e.getKey(), e.getValue());
		if (goal.size() > 0) sc.add("goal", goal);
		String alias = !s(m, "alias").isBlank() ? s(m, "alias") : fromPlan ? s(m, "name") : "";
		if (!alias.isBlank()) sc.addProperty("alias", alias);
	}
}
