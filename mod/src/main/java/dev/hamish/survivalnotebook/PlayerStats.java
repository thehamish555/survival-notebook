package dev.hamish.survivalnotebook;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.minecraft.client.Minecraft;

import java.io.IOException;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

/**
 * Your own vanilla statistics (the same numbers as the game's Statistics screen), shared to the website.
 * Singleplayer: read from the world's own stats file. Multiplayer: the numbers the server already sends you for the Statistics screen.
 * Nothing here reads or depends on cheats, commands or anything the game wouldn't show you itself.
 */
final class PlayerStats {
	private PlayerStats() { }

	/** category ("custom", "mined", "killed"…) -> id ("play_time", "stone"…) -> value. Names have no "minecraft:" prefix. */
	record Raw(Map<String, Map<String, Integer>> stats, long modified, String world, boolean multiplayer, int advancements) { }

	private static String strip(String s) { return s.replaceFirst("^minecraft[:.]", ""); }

	// ---- singleplayer: the world's stats file

	/** Parses vanilla's stats json ({"stats":{"minecraft:mined":{"minecraft:stone":5}}}). */
	static Map<String, Map<String, Integer>> parseFile(String json) {
		Map<String, Map<String, Integer>> out = new HashMap<>();
		JsonObject root = JsonParser.parseString(json).getAsJsonObject();
		JsonObject st = root.has("stats") && root.get("stats").isJsonObject() ? root.getAsJsonObject("stats") : root;
		for (var cat : st.entrySet()) {
			if (!cat.getValue().isJsonObject()) continue;
			Map<String, Integer> m = out.computeIfAbsent(strip(cat.getKey()), k -> new HashMap<>());
			for (var e : cat.getValue().getAsJsonObject().entrySet()) if (e.getValue().isJsonPrimitive()) m.put(strip(e.getKey()), e.getValue().getAsInt());
		}
		return out;
	}

	static int countAdvancements(String json) {
		int n = 0;
		try {
			for (var e : JsonParser.parseString(json).getAsJsonObject().entrySet())
				if (e.getValue().isJsonObject() && !e.getKey().contains("/recipes/") && !e.getKey().contains(":recipes/") && e.getValue().getAsJsonObject().has("done") && e.getValue().getAsJsonObject().get("done").getAsBoolean()) n++;
		} catch (RuntimeException ignored) { }
		return n;
	}

	/** The stats dir of the current singleplayer world, asked from the game by reflection; null if that isn't possible. */
	private static Path worldDir(Minecraft mc) {
		try {
			Object server = Minecraft.class.getMethod("getSingleplayerServer").invoke(mc);
			if (server == null) return null;
			Class<?> lr = Class.forName("net.minecraft.world.level.storage.LevelResource");
			Object root = lr.getField("ROOT").get(null);
			Method gp = null;
			for (Method m : server.getClass().getMethods()) if (m.getName().equals("getWorldPath") && m.getParameterCount() == 1) gp = m;
			return gp == null ? null : (Path) gp.invoke(server, root);
		} catch (ReflectiveOperationException | RuntimeException | LinkageError e) { return null; }
	}

	private static Raw singleplayer(Minecraft mc, String uuid) {
		Path world = worldDir(mc);
		List<Path> candidates = new ArrayList<>();
		if (world != null) candidates.add(world);
		else try (Stream<Path> s = Files.list(net.fabricmc.loader.api.FabricLoader.getInstance().getGameDir().resolve("saves"))) { s.forEach(candidates::add); } catch (IOException | RuntimeException ignored) { }
		Path best = null; long bestM = -1;
		for (Path w : candidates) {
			Path f = w.resolve("stats").resolve(uuid + ".json");
			try { long m = Files.getLastModifiedTime(f).toMillis(); if (m > bestM) { best = w; bestM = m; } } catch (IOException ignored) { }
		}
		if (best == null) return null;
		try {
			Map<String, Map<String, Integer>> stats = parseFile(Files.readString(best.resolve("stats").resolve(uuid + ".json")));
			int adv = 0;
			try { adv = countAdvancements(Files.readString(best.resolve("advancements").resolve(uuid + ".json"))); } catch (IOException ignored) { }
			return new Raw(stats, bestM, best.getFileName().toString(), false, adv);
		} catch (IOException | RuntimeException e) { return null; }
	}

	// ---- multiplayer: what the server sends for the Statistics screen (by reflection, best effort)

	/** Asks the server for fresh statistics, exactly like opening the Statistics screen does. */
	static void requestFromServer(Minecraft mc) {
		try {
			Class<?> pk = Class.forName("net.minecraft.network.protocol.game.ServerboundClientCommandPacket");
			Class<?> act = Class.forName("net.minecraft.network.protocol.game.ServerboundClientCommandPacket$Action");
			Object packet = pk.getConstructor(act).newInstance(act.getField("REQUEST_STATS").get(null));
			Object conn = Minecraft.class.getMethod("getConnection").invoke(mc);
			if (conn == null) return;
			for (Method m : conn.getClass().getMethods()) if (m.getName().equals("send") && m.getParameterCount() == 1 && m.getParameterTypes()[0].isAssignableFrom(pk)) { m.invoke(conn, packet); return; }
		} catch (ReflectiveOperationException | RuntimeException | LinkageError ignored) { }
	}

	private static Raw multiplayer(Minecraft mc) {
		try {
			Object counter = mc.player.getClass().getMethod("getStats").invoke(mc.player);
			Map<?, ?> map = null;
			for (Class<?> c = counter.getClass(); c != null && map == null; c = c.getSuperclass())
				for (Field f : c.getDeclaredFields()) if (Map.class.isAssignableFrom(f.getType())) { f.setAccessible(true); map = (Map<?, ?>) f.get(counter); break; }
			if (map == null || map.isEmpty()) return null;
			Map<String, Map<String, Integer>> out = new HashMap<>();
			for (var e : map.entrySet()) {
				if (!(e.getValue() instanceof Number n)) continue;
				String name;
				try { name = String.valueOf(e.getKey().getClass().getMethod("getName").invoke(e.getKey())); } catch (ReflectiveOperationException ex) { name = String.valueOf(e.getKey()); }
				int c = name.indexOf(':');                                   // "minecraft.mined:minecraft.stone"
				if (c < 0) continue;
				out.computeIfAbsent(strip(name.substring(0, c)), k -> new HashMap<>()).put(strip(name.substring(c + 1)), n.intValue());
			}
			String server = "server";
			try { Object d = Minecraft.class.getMethod("getCurrentServer").invoke(mc); if (d != null) server = String.valueOf(d.getClass().getField("ip").get(d)); } catch (ReflectiveOperationException ignored) { }
			return new Raw(out, 0, server, true, -1);
		} catch (ReflectiveOperationException | RuntimeException | LinkageError e) { return null; }
	}

	/** Reads the current stats (singleplayer file, or what the server last sent). Null if unavailable. */
	static Raw read() {
		Minecraft mc = Minecraft.getInstance();
		if (mc.player == null) return null;
		String uuid = mc.player.getUUID().toString();
		boolean sp;
		try { sp = Minecraft.class.getMethod("getSingleplayerServer").invoke(mc) != null; } catch (ReflectiveOperationException e) { sp = false; }
		return sp ? singleplayer(mc, uuid) : multiplayer(mc);
	}

	// ---- the row the website shows

	private static int get(Map<String, Map<String, Integer>> s, String cat, String id) { var m = s.get(cat); return m == null ? 0 : m.getOrDefault(id, 0); }

	private static JsonArray top(Map<String, Integer> m, int n) {
		JsonArray a = new JsonArray();
		if (m == null) return a;
		m.entrySet().stream().filter(e -> e.getValue() > 0).sorted((x, y) -> y.getValue() - x.getValue()).limit(n).forEach(e -> { JsonArray p = new JsonArray(); p.add(e.getKey()); p.add(e.getValue()); a.add(p); });
		return a;
	}

	private static long sum(Map<String, Integer> m) { long t = 0; if (m != null) for (int v : m.values()) t += v; return t; }

	/** Turns raw stats into the compact row stored in the notebook. */
	static JsonObject row(Raw r, long now) {
		var s = r.stats();
		JsonObject o = new JsonObject();
		o.addProperty("id", "stats");
		o.addProperty("ts", r.multiplayer() ? now : r.modified());
		o.addProperty("world", r.world()); o.addProperty("mode", r.multiplayer() ? "mp" : "sp");
		o.addProperty("playTicks", Math.max(get(s, "custom", "play_time"), get(s, "custom", "play_one_minute")));
		o.addProperty("deaths", get(s, "custom", "deaths"));
		o.addProperty("mobKills", get(s, "custom", "mob_kills")); o.addProperty("playerKills", get(s, "custom", "player_kills"));
		o.addProperty("damageDealt", get(s, "custom", "damage_dealt")); o.addProperty("damageTaken", get(s, "custom", "damage_taken"));
		o.addProperty("jumps", get(s, "custom", "jump"));
		JsonObject dist = new JsonObject();
		String[][] d = {{"walk", "walk_one_cm"}, {"sprint", "sprint_one_cm"}, {"sneak", "crouch_one_cm"}, {"swim", "swim_one_cm"}, {"fly", "fly_one_cm"}, {"elytra", "aviate_one_cm"}, {"climb", "climb_one_cm"}, {"fall", "fall_one_cm"},
			{"boat", "boat_one_cm"}, {"minecart", "minecart_one_cm"}, {"horse", "horse_one_cm"}, {"pig", "pig_one_cm"}, {"strider", "strider_one_cm"}, {"walk_on_water", "walk_on_water_one_cm"}, {"walk_under_water", "walk_under_water_one_cm"}};
		for (String[] x : d) { int v = get(s, "custom", x[1]); if (v > 0) dist.addProperty(x[0], v); }
		o.add("distCm", dist);
		JsonObject totals = new JsonObject();
		for (String c : new String[] {"mined", "crafted", "used", "broken", "picked_up", "dropped"}) totals.addProperty(c, sum(s.get(c)));
		o.add("totals", totals);
		if (r.advancements() >= 0) o.addProperty("advancements", r.advancements());
		o.add("mined", top(s.get("mined"), 15)); o.add("mobs", top(s.get("killed"), 15)); o.add("killedBy", top(s.get("killed_by"), 10));
		o.add("crafted", top(s.get("crafted"), 15)); o.add("used", top(s.get("used"), 15));
		return o;
	}
}
