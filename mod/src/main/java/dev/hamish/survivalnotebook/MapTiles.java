package dev.hamish.survivalnotebook;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import net.minecraft.resources.Identifier;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.zip.Inflater;

/**
 * The shared map, for the in-game Map tab: which tiles the notebook has, downloading the ones on screen, and turning them into textures.
 * Tiles this game recorded but hasn't uploaded yet are drawn on top, so what you just explored shows straight away.
 */
final class MapTiles {
	private MapTiles() { }

	private static final ExecutorService NET = Executors.newFixedThreadPool(2, r -> { Thread t = new Thread(r, "survival-notebook-map"); t.setDaemon(true); return t; });
	private static final int MAX_TEXTURES = 192;

	private static final Map<String, Long> server = new ConcurrentHashMap<>();   // "dim/tx/tz" -> last updated on the server
	private static final Map<String, byte[]> bytes = new ConcurrentHashMap<>();
	private static final Map<String, Long> fetched = new ConcurrentHashMap<>();  // which version of each tile we hold
	private static final Set<String> loading = ConcurrentHashMap.newKeySet();
	private static final Map<String, Identifier> textures = new LinkedHashMap<>(16, 0.75f, true);   // render thread only, least recently drawn first
	private static final Map<String, Long> built = new java.util.HashMap<>();
	private static volatile long listedAt;
	private static volatile String nbFor = "";
	static volatile boolean listed;

	/** Forget everything (another notebook was picked). Render thread. */
	static void reset() {
		for (String k : new ArrayList<>(textures.keySet())) Compat.releaseTile(k);
		textures.clear(); built.clear(); server.clear(); bytes.clear(); fetched.clear(); listed = false; listedAt = 0;
	}

	/** Re-reads the list of tiles at most once a minute (and straight away for a different notebook). */
	static void refreshList() {
		NbConfig c = NbConfig.get();
		if (c.notebookId.isBlank()) return;
		if (!c.notebookId.equals(nbFor)) { nbFor = c.notebookId; reset(); }
		long now = System.currentTimeMillis();
		if (now - listedAt < 60_000) return;
		listedAt = now;
		final String nb = c.notebookId;
		NET.execute(() -> {
			try {
				var arr = Api.ok(Api.call("GET", "/notebooks/" + nb + "/map", null)).body().getAsJsonArray();
				Map<String, Long> next = new java.util.HashMap<>();
				for (JsonElement e : arr) { JsonObject o = e.getAsJsonObject(); next.put(o.get("dim").getAsString() + "/" + o.get("tx").getAsInt() + "/" + o.get("tz").getAsInt(), o.get("updated").getAsLong()); }
				server.keySet().retainAll(next.keySet()); server.putAll(next); listed = true;
			} catch (Api.ApiException | RuntimeException ignored) { listedAt = 0; }
		});
	}

	/** Every tile known in a dimension (on the server, or recorded here and not sent yet). */
	static List<int[]> tilesIn(String dim) {
		Set<String> keys = new HashSet<>(server.keySet());
		keys.addAll(MapRecorder.keys());
		List<int[]> out = new ArrayList<>();
		for (String k : keys) { String[] p = k.split("/"); if (p[0].equals(dim)) out.add(new int[] {Integer.parseInt(p[1]), Integer.parseInt(p[2])}); }
		return out;
	}

	/** The texture to draw for a tile, starting a download if needed. Null while there's nothing to show yet. Render thread. */
	static Identifier texture(String key) {
		Long want = server.get(key);
		if (want != null && !want.equals(fetched.get(key)) && loading.add(key)) download(key, want);
		byte[] base = bytes.get(key), local = MapRecorder.copy(key);
		if (base == null && local == null) return null;
		long version = (want == null ? 0 : fetched.getOrDefault(key, 0L)) * 31 + MapRecorder.version(key);
		Identifier id = textures.get(key);
		if (id == null || built.getOrDefault(key, -1L) != version) {
			byte[] px = base == null ? new byte[128 * 128] : base.clone();
			if (local != null) for (int i = 0; i < px.length; i++) if (local[i] != 0) px[i] = local[i];
			id = Compat.tileTexture(key, px);
			if (id == null) return null;
			textures.put(key, id); built.put(key, version);
			while (textures.size() > MAX_TEXTURES) { String old = textures.keySet().iterator().next(); textures.remove(old); built.remove(old); Compat.releaseTile(old); }
		}
		return id;
	}

	private static void download(String key, long version) {
		final String nb = NbConfig.get().notebookId;
		NET.execute(() -> {
			try {
				byte[] z = Api.getBytes("/notebooks/" + nb + "/map/" + key + "?v=" + version);
				bytes.put(key, inflate(z)); fetched.put(key, version);
			} catch (Api.ApiException | RuntimeException | java.util.zip.DataFormatException ignored) {
				fetched.put(key, version);   // don't retry every frame; the next list refresh brings a new version
			} finally { loading.remove(key); }
		});
	}

	static byte[] inflate(byte[] z) throws java.util.zip.DataFormatException {
		Inflater inf = new Inflater();
		inf.setInput(z);
		byte[] out = new byte[128 * 128];
		int n = 0;
		while (n < out.length && !inf.finished()) { int r = inf.inflate(out, n, out.length - n); if (r == 0 && (inf.needsInput() || inf.needsDictionary())) break; n += r; }
		inf.end();
		return out;
	}
}
