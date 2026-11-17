package dev.hamish.survivalnotebook;

import com.google.gson.JsonObject;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;

import java.util.List;

/**
 * The shared map in game: tiles recorded by everyone's mod (Share map), your saved places as pins and you as an arrow.
 * Drag to move, scroll to zoom, click a pin to track it (click again to stop).
 */
final class PageMap {
	private PageMap() { }

	private static final String[] DIMS = {"ow", "nether", "end"}, LABELS = {"Overworld", "Nether", "End"};
	static String dim = "";
	static double cx, cz, scale = 1;
	private static boolean centred, dragging, moved;
	private static int ax, ay, aw, ah;   // the map area on screen, for the mouse handlers

	static void reset() { dragging = false; }

	private static String label(String d) { for (int i = 0; i < DIMS.length; i++) if (DIMS[i].equals(d)) return LABELS[i]; return "Overworld"; }
	private static String key(String l) { for (int i = 0; i < LABELS.length; i++) if (LABELS[i].equals(l)) return DIMS[i]; return "ow"; }

	private static boolean centreOnMe() {
		Names.Spot h = Names.here();
		var p = Minecraft.getInstance().player;
		if (h == null || p == null || !h.dim().equals(dim)) return false;
		cx = p.getX(); cz = p.getZ();
		return true;
	}

	/** Somewhere useful to start: you, else the middle of what's mapped, else your first place in this dimension. */
	private static void centre() {
		if (centreOnMe()) return;
		List<int[]> t = MapTiles.tilesIn(dim);
		if (!t.isEmpty()) {
			int x0 = Integer.MAX_VALUE, x1 = Integer.MIN_VALUE, z0 = Integer.MAX_VALUE, z1 = Integer.MIN_VALUE;
			for (int[] a : t) { x0 = Math.min(x0, a[0]); x1 = Math.max(x1, a[0]); z0 = Math.min(z0, a[1]); z1 = Math.max(z1, a[1]); }
			cx = (x0 + x1 + 1) * 64.0; cz = (z0 + z1 + 1) * 64.0;
			return;
		}
		for (JsonObject o : Notebook.rows("coords")) { double[] xyz = xyz(Notebook.str(o, dim)); if (xyz != null) { cx = xyz[0]; cz = xyz[2]; return; } }
		cx = 0; cz = 0;
	}

	private static double[] xyz(String s) {
		if (!Names.isXyz(s)) return null;
		String[] a = s.trim().split("\\s+");
		return new double[] {Double.parseDouble(a[0]) + 0.5, Double.parseDouble(a[1]), Double.parseDouble(a[2]) + 0.5};
	}

	static void build(NotebookScreen s) {
		Ui.Pal p = Ui.pal();
		MapTiles.refreshList();
		if (dim.isEmpty()) { Names.Spot h = Names.here(); dim = h == null ? "ow" : h.dim(); }
		if (!centred) { centre(); centred = true; }
		int y = s.top;
		s.dropdown("map-dim", s.cx, y, 150, "Dimension", List.of(LABELS), label(dim), p.gray, v -> { dim = key(v); centre(); });
		s.btn(s.cx + 156, y, 24, "+", 1, () -> zoom(1.5), true);
		s.btn(s.cx + 184, y, 24, "−", 1, () -> zoom(1 / 1.5), true);
		s.btn(s.cx + 212, y, 70, "Find me", 1, () -> { Names.Spot h = Names.here(); if (h == null) return; dim = h.dim(); centreOnMe(); s.rebuild(); }, Names.here() != null);
		s.textRight("Drag, scroll, click a pin to track", s.cx + s.cw - 10, y + 6, p.mut);

		ax = s.cx; ay = y + 26; aw = s.cw - 10; ah = s.bottom - ay;
		final boolean sharing = NbConfig.get().shareMap;
		s.paint((g, mx, my) -> draw(s, g, mx, my, sharing));
	}

	private static int sx(double x) { return (int) Math.round(ax + aw / 2.0 + (x - cx) * scale); }
	private static int sz(double z) { return (int) Math.round(ay + ah / 2.0 + (z - cz) * scale); }

	private static void draw(NotebookScreen s, GuiGraphicsExtractor g, int mx, int my, boolean sharing) {
		Ui.Pal p = Ui.pal();
		var font = s.font();
		g.fill(ax, ay, ax + aw, ay + ah, p.panel2);
		g.outline(ax - 1, ay - 1, aw + 2, ah + 2, p.edge);
		g.enableScissor(ax, ay, ax + aw, ay + ah);
		List<int[]> tiles = MapTiles.tilesIn(dim);
		for (int[] t : tiles) {
			int x0 = sx(t[0] * 128.0), z0 = sz(t[1] * 128.0), x1 = sx(t[0] * 128.0 + 128), z1 = sz(t[1] * 128.0 + 128);
			if (x1 < ax || z1 < ay || x0 > ax + aw || z0 > ay + ah) continue;
			var id = MapTiles.texture(dim + "/" + t[0] + "/" + t[1]);
			if (id != null) Compat.blitTile(g, id, x0, z0, x1, z1);
		}
		String tracked = NbConfig.get().trackedPlace;
		JsonObject hover = pinAt(mx, my);
		for (JsonObject o : Notebook.rows("coords")) {
			double[] at = xyz(Notebook.str(o, dim));
			if (at == null) continue;
			int px = sx(at[0]), pz = sz(at[2]);
			boolean on = Notebook.str(o, "id").equals(tracked), hov = o == hover;
			if (on || hov) g.fill(px - 4, pz - 4, px + 5, pz + 5, on ? p.gold : p.ink);
			g.fill(px - 3, pz - 3, px + 4, pz + 4, 0xFF000000);
			g.fill(px - 2, pz - 2, px + 3, pz + 3, Ui.cat(Notebook.str(o, "cat")).fg());
			if (scale >= 0.5 || hov || on) {
				String name = Notebook.str(o, "name").isBlank() ? "Unnamed place" : Notebook.str(o, "name");
				g.text(font, (on ? "> " : "") + name, px + 6, pz - 4, on ? p.gold : 0xFFFFFFFF, true);
			}
		}
		var pl = Minecraft.getInstance().player;
		Names.Spot here = Names.here();
		if (pl != null && here != null && here.dim().equals(dim)) {   // you: a white square with a line the way you're facing
			int px = sx(pl.getX()), pz = sz(pl.getZ());
			double yaw = Math.toRadians(pl.getYRot()), dx = -Math.sin(yaw), dz = Math.cos(yaw);
			for (int i = 3; i <= 9; i++) { int lx = px + (int) Math.round(dx * i), lz = pz + (int) Math.round(dz * i); g.fill(lx, lz, lx + 1, lz + 1, 0xFFFFFFFF); }
			g.fill(px - 3, pz - 3, px + 4, pz + 4, 0xFF000000);
			g.fill(px - 2, pz - 2, px + 3, pz + 3, 0xFFFFFFFF);
		}
		g.disableScissor();
		if (tiles.isEmpty()) {
			String msg = !MapTiles.listed ? "Loading the map…" : sharing ? "Nothing mapped here yet. Explore and it fills in." : "No map yet. Turn on Share map in Settings > Sync & privacy.";
			g.text(font, msg, ax + (aw - font.width(msg)) / 2, ay + ah / 2 - 4, p.mut, false);
		}
		if (Ui.over(mx, my, ax, ay, aw, ah)) {
			String c = "x " + (int) Math.floor(cx + (mx - ax - aw / 2.0) / scale) + "  z " + (int) Math.floor(cz + (my - ay - ah / 2.0) / scale);
			g.fill(ax + 2, ay + ah - 13, ax + 8 + font.width(c), ay + ah - 2, 0xAA000000);
			g.text(font, c, ax + 5, ay + ah - 11, 0xFFFFFFFF, false);
		}
	}

	private static JsonObject pinAt(double mx, double my) {
		JsonObject best = null;
		double bd = 6;
		for (JsonObject o : Notebook.rows("coords")) {
			double[] at = xyz(Notebook.str(o, dim));
			if (at == null) continue;
			double d = Math.hypot(sx(at[0]) - mx, sz(at[2]) - my);
			if (d < bd) { bd = d; best = o; }
		}
		return best;
	}

	private static boolean inside(double x, double y) { return x >= ax && x < ax + aw && y >= ay && y < ay + ah; }

	static void zoom(double f) { scale = Math.max(1 / 16.0, Math.min(16, scale * f)); }

	// ---- mouse (called by NotebookScreen while this tab is open)

	static boolean press(double x, double y) { if (!inside(x, y)) return false; dragging = true; moved = false; return true; }

	static boolean drag(double dx, double dy) {
		if (!dragging) return false;
		cx -= dx / scale; cz -= dy / scale;
		if (Math.abs(dx) + Math.abs(dy) > 0.5) moved = true;
		return true;
	}

	static boolean release(double x, double y) {
		if (!dragging) return false;
		dragging = false;
		if (moved) return true;
		JsonObject pin = pinAt(x, y);
		if (pin != null) {   // click a pin: track it, or stop tracking it
			NbConfig c = NbConfig.get();
			String id = Notebook.str(pin, "id");
			c.trackedPlace = id.equals(c.trackedPlace) ? "" : id;
			NbConfig.save();
			Compat.soundToggle();
		}
		return true;
	}

	static boolean scroll(double x, double y, double amount) {
		if (!inside(x, y) || amount == 0) return false;
		double f = amount > 0 ? 1.25 : 0.8, wx = cx + (x - ax - aw / 2.0) / scale, wz = cz + (y - ay - ah / 2.0) / scale;
		double next = Math.max(1 / 16.0, Math.min(16, scale * f));
		cx = wx - (wx - cx) * (scale / next); cz = wz - (wz - cz) * (scale / next);   // zoom towards the cursor
		scale = next;
		return true;
	}
}
