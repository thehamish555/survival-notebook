package dev.hamish.survivalnotebook;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import net.minecraft.client.Minecraft;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Where everyone on the notebook is. Your mod sends your position every couple of seconds while you move (if Share position
 * is on) and marks you offline when you leave; the server keeps each player's last spot and passes changes on through the
 * live connection. The Map tab here and on the website draws them: online players bright, offline ones dimmed where they left.
 */
final class Players {
	private Players() { }

	/** online: still sending (a live update in the last two minutes). seen: when we last heard about them, on this computer's clock. */
	record Pos(String uid, String name, String dim, double x, int y, double z, float yaw, boolean online, long seen, String mcName, String mcUuid) {
		boolean live() { return online && System.currentTimeMillis() - seen < ONLINE_FOR; }
	}
	static final long ONLINE_FOR = 120_000;
	private static final Map<String, Pos> people = new ConcurrentHashMap<>();
	private static String lastSent = "", sentTo = "";
	private static long lastAt;
	private static volatile boolean busy;

	/** Everyone with a position in this notebook, online first, then most recently seen. */
	static List<Pos> all() {
		return people.values().stream().sorted((a, b) -> a.live() != b.live() ? (a.live() ? -1 : 1) : Long.compare(b.seen(), a.seen())).toList();
	}

	/** Called every tick while in a world. Sends at most every 2 seconds, and only when you've moved (or every 30 seconds to stay online). */
	static void tick(Minecraft mc, int ticks) {
		NbConfig c = NbConfig.get();
		if (ticks % 40 != 7 || busy || mc.player == null || !c.connected() || c.notebookId.isBlank()) return;
		if (!c.sharePosition) { beat(c); return; }
		Names.Spot h = Names.here(); if (h == null) return;
		String key = h.dim() + " " + h.xyz();
		long now = System.currentTimeMillis();
		if (key.equals(lastSent) && c.notebookId.equals(sentTo) && now - lastAt < 30_000) return;
		JsonObject b = new JsonObject();
		b.addProperty("dim", h.dim()); b.addProperty("x", mc.player.getX()); b.addProperty("y", mc.player.getY()); b.addProperty("z", mc.player.getZ()); b.addProperty("yaw", mc.player.getYRot());
		b.addProperty("mcName", mc.player.getName().getString()); b.addProperty("mcUuid", mc.player.getUUID().toString());   // for your face on the map
		b.addProperty("play", c.sharePlayTime);   // counts toward time played only with Share play time on
		String nb = c.notebookId;
		busy = true;
		Api.EXEC.execute(() -> {
			try { Api.ok(Api.call("PUT", "/notebooks/" + nb + "/pos", b)); lastSent = key; sentTo = nb; lastAt = now; }
			catch (Api.ApiException ignored) { /* try again next time */ }
			finally { busy = false; }
		});
	}

	private static long beatAt;

	/** Share position off but Share play time on: a heartbeat every 30 seconds, so your time played still counts without anyone seeing where you are. */
	private static void beat(NbConfig c) {
		long now = System.currentTimeMillis();
		if (!c.sharePlayTime || now - beatAt < 30_000) return;
		beatAt = now;
		String nb = c.notebookId;
		busy = true;
		Api.EXEC.execute(() -> {
			try { Api.call("PUT", "/notebooks/" + nb + "/play", new JsonObject()); }
			catch (Api.ApiException ignored) { /* try again next time */ }
			finally { busy = false; }
		});
	}

	/** Left the world: you stay on the map where you were, shown as offline. */
	static void leave() {
		if (sentTo.isEmpty()) return;
		String nb = sentTo; sentTo = ""; lastSent = "";
		Api.EXEC.execute(() -> { try { Api.call("DELETE", "/notebooks/" + nb + "/pos", null); } catch (Api.ApiException ignored) { } });
	}

	/** Switched Share position off: take you off the map altogether. */
	static void forget() {
		NbConfig c = NbConfig.get();
		String nb = c.notebookId; sentTo = ""; lastSent = "";
		if (nb.isBlank() || !c.connected()) return;
		Api.EXEC.execute(() -> { try { Api.call("DELETE", "/notebooks/" + nb + "/pos/me", null); } catch (Api.ApiException ignored) { } });
	}

	/** Everyone's last position, when the live connection (re)opens or the notebook changes. */
	static void load(String nb) {
		people.clear();
		try {
			JsonElement e = Api.ok(Api.call("GET", "/notebooks/" + nb + "/pos", null)).body();
			if (e.isJsonArray()) for (JsonElement p : (JsonArray) e) if (p.isJsonObject()) put(p.getAsJsonObject());
		} catch (Api.ApiException | RuntimeException ignored) { }
	}

	/** A live event: {"pos":{...}}. Returns true if it was one (so it doesn't trigger a full refresh). */
	static boolean onEvent(String json) {
		if (!json.contains("\"pos\"")) return false;
		try {
			JsonObject o = com.google.gson.JsonParser.parseString(json).getAsJsonObject();
			if (!o.has("pos") || !o.get("pos").isJsonObject()) return false;
			JsonObject p = o.getAsJsonObject("pos");
			if (Notebook.bool(p, "gone")) people.remove(Notebook.str(p, "uid")); else put(p);
			return true;
		} catch (RuntimeException e) { return false; }
	}

	private static void put(JsonObject p) {
		try {
			String uid = Notebook.str(p, "uid"); if (uid.isEmpty()) return;
			people.put(uid, new Pos(uid, Notebook.str(p, "name"), Notebook.str(p, "dim"), p.get("x").getAsDouble(), p.get("y").getAsInt(), p.get("z").getAsDouble(),
				p.has("yaw") ? p.get("yaw").getAsFloat() : 0, Notebook.bool(p, "online"), System.currentTimeMillis() - (Notebook.bool(p, "online") ? 0 : age(p)),
				Notebook.str(p, "mcName"), Notebook.str(p, "mcUuid")));
		} catch (RuntimeException ignored) { }
	}
	/** How long ago the server last heard from an offline player, so "last seen" is right even though our clocks differ. */
	private static long age(JsonObject p) {
		try { return Math.max(0, Math.min(System.currentTimeMillis() - p.get("ts").getAsLong(), 365L * 86_400_000)); } catch (RuntimeException e) { return 0; }
	}

	/** The same colour for a player as on the website. */
	private static final int[] COLOURS = {0xFF5AA9FF, 0xFFFF7A6B, 0xFFB07CFF, 0xFFF2C14E, 0xFF4FD1C5, 0xFFFF9AD5, 0xFF9BE15D, 0xFFFFA94D};
	static int colour(String uid) {
		long h = 7;
		for (char ch : uid.toCharArray()) h = (h * 31 + ch) & 0xFFFFFFFFL;
		return COLOURS[(int) (h % COLOURS.length)];
	}

	/** A member's Minecraft UUID, if their mod has shared a position. */
	static String uuidOf(String uid) { Pos p = people.get(uid); return p == null ? "" : p.mcUuid(); }

	/** A player's face, from their real skin (the game fetches it, by UUID or else by Minecraft name). False if there's nothing to go on. */
	private static final Map<String, net.minecraft.world.item.component.ResolvableProfile> PROFILES = new ConcurrentHashMap<>();
	static boolean head(net.minecraft.client.gui.GuiGraphicsExtractor g, String mcUuid, String mcName, int x, int y, int size) {
		try {
			net.minecraft.world.item.component.ResolvableProfile prof;
			if (mcUuid != null && !mcUuid.isBlank()) { java.util.UUID id = java.util.UUID.fromString(mcUuid); prof = PROFILES.computeIfAbsent(mcUuid, k -> net.minecraft.world.item.component.ResolvableProfile.createUnresolved(id)); }
			else if (mcName != null && mcName.matches("[A-Za-z0-9_]{3,16}")) prof = PROFILES.computeIfAbsent("name:" + mcName, k -> net.minecraft.world.item.component.ResolvableProfile.createUnresolved(mcName));
			else return false;
			net.minecraft.client.gui.components.PlayerFaceExtractor.extractRenderState(g, prof, x, y, size);
			return true;
		} catch (RuntimeException e) { return false; }
	}

	/** The same face with a frame in their colour, for the map; dimmed when they're offline. */
	static void face(net.minecraft.client.gui.GuiGraphicsExtractor g, String mcUuid, int x, int y, int size, int frame, boolean dim) {
		g.fill(x - 2, y - 2, x + size + 2, y + size + 2, 0xFF000000);
		g.fill(x - 1, y - 1, x + size + 1, y + size + 1, frame);
		if (!head(g, mcUuid, "", x, y, size)) g.fill(x, y, x + size, y + size, frame);
		if (dim) g.fill(x, y, x + size, y + size, 0x99202020);
	}
}
