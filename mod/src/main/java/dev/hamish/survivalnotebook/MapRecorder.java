package dev.hamish.survivalnotebook;

import net.minecraft.client.Minecraft;

import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.zip.Deflater;

/**
 * Records a map of the chunks loaded around you (opt-in: Settings, Share map) and sends it to the notebook in 128x128-block tiles.
 * A few chunks are read each second on the game thread; compressing and uploading happen on the sync thread.
 */
final class MapRecorder {
	private MapRecorder() { }

	static final int TILE = 128;
	private static final int CHUNKS_PER_SECOND = 24, UPLOADS_PER_ROUND = 6;
	private static final long RESCAN_MS = 5 * 60_000;

	private static final Map<String, byte[]> tiles = new HashMap<>();   // "dim/tx/tz" -> 128*128 packed pixels
	private static final Map<String, Long> touched = new HashMap<>();
	private static final Set<String> dirty = new HashSet<>();
	private static final Map<Long, Long> scanned = new HashMap<>();
	private static String dimNow = "";
	private static volatile boolean full, busy;

	/** Forget everything (new world, new notebook, or sharing switched off). */
	static synchronized void reset() { tiles.clear(); touched.clear(); dirty.clear(); scanned.clear(); dimNow = ""; full = false; }

	static void tick(Minecraft mc, int ticks) {
		if (mc.player == null || mc.level == null) return;
		Names.Spot here = Names.here();
		if (here == null) return;
		if (!here.dim().equals(dimNow)) { synchronized (MapRecorder.class) { scanned.clear(); dimNow = here.dim(); } }
		if (ticks % 20 == 0) scanSome(mc, here.dim());
		if (ticks % 600 == 300) upload();
	}

	/** Reads the nearest chunks that haven't been read in the last few minutes, ring by ring outwards. */
	private static synchronized void scanSome(Minecraft mc, String dim) {
		int pcx = (int) Math.floor(mc.player.getX()) >> 4, pcz = (int) Math.floor(mc.player.getZ()) >> 4, py = (int) Math.floor(mc.player.getY()) + 2;
		int r = Math.min(Compat.viewChunks(), 12), budget = CHUNKS_PER_SECOND;
		long now = System.currentTimeMillis();
		if (scanned.size() > 20_000) scanned.clear();
		for (int d = 0; d <= r && budget > 0; d++) {
			for (int dx = -d; dx <= d && budget > 0; dx++) for (int dz = -d; dz <= d && budget > 0; dz++) {
				if (Math.max(Math.abs(dx), Math.abs(dz)) != d) continue;   // only this ring
				int cx = pcx + dx, cz = pcz + dz;
				long key = ((long) cx << 32) ^ (cz & 0xFFFFFFFFL);
				Long at = scanned.get(key);
				if (at != null && now - at < RESCAN_MS) continue;
				byte[] px = Compat.mapChunk(cx, cz, py);
				if (px == null) continue;
				scanned.put(key, now);
				budget--;
				put(dim, cx, cz, px, now);
			}
		}
	}

	private static void put(String dim, int cx, int cz, byte[] px, long now) {
		int tx = Math.floorDiv(cx * 16, TILE), tz = Math.floorDiv(cz * 16, TILE);
		String key = dim + "/" + tx + "/" + tz;
		byte[] t = tiles.computeIfAbsent(key, k -> new byte[TILE * TILE]);
		int ox = Math.floorMod(cx * 16, TILE), oz = Math.floorMod(cz * 16, TILE);
		boolean changed = false;
		for (int z = 0; z < 16; z++) for (int x = 0; x < 16; x++) {
			byte b = px[z * 16 + x];
			int i = (oz + z) * TILE + ox + x;
			if (b != 0 && t[i] != b) { t[i] = b; changed = true; }
		}
		touched.put(key, now);
		if (changed) dirty.add(key);
	}

	/** Sends a few changed tiles (most recently explored first). Tiles nobody has touched for a while are dropped from memory. */
	private static void upload() {
		NbConfig c = NbConfig.get();
		if (full || busy || c.notebookId.isBlank() || !Notebook.canEdit()) return;
		List<String[]> keys = new ArrayList<>();
		List<byte[]> data = new ArrayList<>();
		synchronized (MapRecorder.class) {
			List<String> order = new ArrayList<>(dirty);
			order.sort((a, b) -> Long.compare(touched.getOrDefault(b, 0L), touched.getOrDefault(a, 0L)));
			for (String k : order.subList(0, Math.min(UPLOADS_PER_ROUND, order.size()))) { keys.add(k.split("/")); data.add(tiles.get(k).clone()); dirty.remove(k); }
			long old = System.currentTimeMillis() - 15 * 60_000;
			tiles.keySet().removeIf(k -> !dirty.contains(k) && touched.getOrDefault(k, 0L) < old);
			touched.keySet().retainAll(tiles.keySet());
		}
		if (keys.isEmpty()) return;
		busy = true;
		final String nb = c.notebookId;
		Api.EXEC.execute(() -> {
			try {
				for (int i = 0; i < keys.size(); i++) {
					String[] k = keys.get(i);
					Api.Res r = Api.putBytes("/notebooks/" + nb + "/map/" + k[0] + "/" + k[1] + "/" + k[2], deflate(data.get(i)));
					if (r.status() == 413) { full = true; Notebook.msg("The map for this notebook is full. The owner can clear it on the website."); return; }
					if (r.status() / 100 != 2) { synchronized (MapRecorder.class) { dirty.add(String.join("/", k)); } return; }   // try again next round
				}
			} catch (Api.ApiException e) {
				synchronized (MapRecorder.class) { for (String[] k : keys) dirty.add(String.join("/", k)); }
			} finally { busy = false; }
		});
	}

	static byte[] deflate(byte[] raw) {
		Deflater d = new Deflater(Deflater.BEST_COMPRESSION);
		d.setInput(raw); d.finish();
		ByteArrayOutputStream out = new ByteArrayOutputStream(4096);
		byte[] buf = new byte[4096];
		while (!d.finished()) out.write(buf, 0, d.deflate(buf));
		d.end();
		return out.toByteArray();
	}
}
