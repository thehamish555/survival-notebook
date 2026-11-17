package dev.hamish.survivalnotebook;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.minecraft.client.Minecraft;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Where everyone on the notebook is right now. Your mod sends your position every couple of seconds while you move
 * (if Share position is on), and the server passes everyone's on through the live connection. The server only keeps them
 * in memory and forgets them after two minutes; the Map tab here and on the website draws them.
 */
final class Players {
	private Players() { }

	record Pos(String uid, String name, String dim, double x, int y, double z, float yaw, long seen) { }
	static final long TTL = 120_000;
	private static final Map<String, Pos> others = new ConcurrentHashMap<>();
	private static String lastSent = "", sentTo = "";
	private static long lastAt;
	private static volatile boolean busy;

	/** Everyone currently shared (yourself included, as the server sees you), newest first. */
	static List<Pos> all() {
		long now = System.currentTimeMillis();
		others.values().removeIf(p -> now - p.seen() > TTL);
		return others.values().stream().sorted((a, b) -> Long.compare(b.seen(), a.seen())).toList();
	}

	/** Called every tick while in a world. Sends at most every 2 seconds, and only when you've moved (or every 30 seconds to stay listed). */
	static void tick(Minecraft mc, int ticks) {
		NbConfig c = NbConfig.get();
		if (ticks % 40 != 7 || busy || mc.player == null || !c.connected() || c.notebookId.isBlank()) return;
		if (!c.sharePosition) { leave(); return; }
		Names.Spot h = Names.here(); if (h == null) return;
		String key = h.dim() + " " + h.xyz();
		long now = System.currentTimeMillis();
		if (key.equals(lastSent) && c.notebookId.equals(sentTo) && now - lastAt < 30_000) return;
		JsonObject b = new JsonObject();
		b.addProperty("dim", h.dim()); b.addProperty("x", mc.player.getX()); b.addProperty("y", mc.player.getY()); b.addProperty("z", mc.player.getZ()); b.addProperty("yaw", mc.player.getYRot());
		String nb = c.notebookId;
		busy = true;
		Api.EXEC.execute(() -> {
			try { Api.ok(Api.call("PUT", "/notebooks/" + nb + "/pos", b)); lastSent = key; sentTo = nb; lastAt = now; }
			catch (Api.ApiException ignored) { /* try again next time */ }
			finally { busy = false; }
		});
	}

	/** Left the world or switched sharing off: take yourself off everyone's map straight away. */
	static void leave() {
		if (sentTo.isEmpty()) return;
		String nb = sentTo; sentTo = ""; lastSent = "";
		Api.EXEC.execute(() -> { try { Api.call("DELETE", "/notebooks/" + nb + "/pos", null); } catch (Api.ApiException ignored) { } });
	}

	/** Everyone who's on right now, when the live connection (re)opens or the notebook changes. */
	static void load(String nb) {
		others.clear();
		try {
			JsonElement e = Api.ok(Api.call("GET", "/notebooks/" + nb + "/pos", null)).body();
			if (e.isJsonArray()) for (JsonElement p : (JsonArray) e) if (p.isJsonObject()) put(p.getAsJsonObject());
		} catch (Api.ApiException | RuntimeException ignored) { }
	}

	/** A live event: {"pos":{...}}. Returns true if it was one (so it doesn't trigger a full refresh). */
	static boolean onEvent(String json) {
		if (!json.contains("\"pos\"")) return false;
		try {
			JsonObject o = JsonParser.parseString(json).getAsJsonObject();
			if (!o.has("pos") || !o.get("pos").isJsonObject()) return false;
			JsonObject p = o.getAsJsonObject("pos");
			if (Notebook.bool(p, "gone")) others.remove(Notebook.str(p, "uid")); else put(p);
			return true;
		} catch (RuntimeException e) { return false; }
	}

	private static void put(JsonObject p) {
		try {
			String uid = Notebook.str(p, "uid"); if (uid.isEmpty()) return;
			others.put(uid, new Pos(uid, Notebook.str(p, "name"), Notebook.str(p, "dim"), p.get("x").getAsDouble(), p.get("y").getAsInt(), p.get("z").getAsDouble(),
				p.has("yaw") ? p.get("yaw").getAsFloat() : 0, System.currentTimeMillis()));
		} catch (RuntimeException ignored) { }
	}

	/** The same colour for a player as on the website. */
	private static final int[] COLOURS = {0xFF5AA9FF, 0xFFFF7A6B, 0xFFB07CFF, 0xFFF2C14E, 0xFF4FD1C5, 0xFFFF9AD5, 0xFF9BE15D, 0xFFFFA94D};
	static int colour(String uid) {
		long h = 7;
		for (char ch : uid.toCharArray()) h = (h * 31 + ch) & 0xFFFFFFFFL;
		return COLOURS[(int) (h % COLOURS.length)];
	}
}
