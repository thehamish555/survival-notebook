package dev.hamish.survivalnotebook;

import com.google.gson.JsonObject;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;

import java.util.List;

/**
 * The shared map in game: tiles recorded by everyone's mod (Share map), your saved places as pins and a marker for you.
 * Drag to move, scroll to zoom. Clicking a place tracks it and shows the farms there.
 */
final class PageMap {
	private PageMap() { }

	private static final String[] DIMS = {"ow", "nether", "end"}, LABELS = {"Overworld", "Nether", "End"};
	static String dim = "";
	static double cx, cz, scale = 1;
	static String selected = "";   // the place whose details show at the bottom of the map
	private static boolean centred, dragging, moved;
	private static double pressX, pressY;
	private static int ax, ay, aw, ah, px0, py0, px1, py1;   // the map area and the details panel on screen, for the mouse handlers
	private static NotebookScreen screen;

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
		String hint = "Drag to move, scroll to zoom, click a place, right-click to add one";
		if (s.cx + 290 + s.font().width(hint) < s.cx + s.cw - 10) s.textRight(hint, s.cx + s.cw - 10, y + 6, p.mut);   // only when there's room beside the buttons

		ax = s.cx; ay = y + 26; aw = s.cw - 10; ah = s.bottom - ay;
		screen = s;
		final boolean sharing = NbConfig.get().shareMap;
		s.paint((g, mx, my) -> draw(s, g, mx, my, sharing));
		details(s);
	}

	/** The picked place: its coordinates, whether it's tracked, and the farms linked to it (like the website's farm Location). */
	private static void details(NotebookScreen s) {
		px0 = px1 = py0 = py1 = 0;
		JsonObject place = selected.isEmpty() ? null : Notebook.find("coords", selected);
		if (place == null) { selected = ""; return; }
		Ui.Pal p = Ui.pal();
		List<JsonObject> farms = new java.util.ArrayList<>();
		for (JsonObject f : Notebook.rows("farms")) if (Notebook.str(f, "place").equals(selected)) farms.add(f);
		final int shown = Math.min(farms.size(), 4), w = Math.min(aw - 12, 300), h = 38 + Math.max(1, shown) * 12 + (farms.size() > shown ? 10 : 0);
		final int x = ax + 6, y = ay + ah - h - 6;
		px0 = x; py0 = y; px1 = x + w; py1 = y + h;
		final String name = Notebook.str(place, "name").isBlank() ? "Unnamed place" : Notebook.str(place, "name"), xyz = Notebook.str(place, dim);
		final boolean tracked = selected.equals(NbConfig.get().trackedPlace);
		s.paint((g, mx, my) -> {
			Ui.bevel(g, x, y, w, h, p.panel, p.hi, p.lo, p.edge);
			g.fill(x + 1, y + 1, x + w - 1, y + 3, Ui.cat(Notebook.str(place, "cat")).fg());
			g.text(s.font(), Ui.clip(s.font(), name, w - 150), x + 6, y + 7, p.gold, false);
			g.text(s.font(), xyz.isBlank() ? "" : label(dim) + " " + xyz, x + 6, y + 19, p.mut, false);
			if (farms.isEmpty()) g.text(s.font(), "No farms here. Pick this place as a farm's Location to list it.", x + 6, y + 33, p.mut, false);
			for (int i = 0; i < shown; i++) {
				JsonObject f = farms.get(i);
				String st = Notebook.bool(f, "built") ? "Built" : Notebook.bool(f, "building") ? "Building" : "To build";
				int fy = y + 32 + i * 12;
				Compat.drawItem(g, Notebook.str(f, "icon").isBlank() ? "wheat" : Notebook.str(f, "icon"), x + 4, fy - 4);
				g.text(s.font(), Ui.clip(s.font(), Notebook.str(f, "name").isBlank() ? "Unnamed farm" : Notebook.str(f, "name"), w - 90), x + 22, fy, p.ink, false);
				g.text(s.font(), st, x + w - 8 - s.font().width(st), fy, st.equals("Built") ? p.grassHi : p.mut, false);
			}
			if (farms.size() > shown) g.text(s.font(), "+" + (farms.size() - shown) + " more on the Farms tab", x + 22, y + 32 + shown * 12, p.mut, false);
		});
		s.pill(x + w - 140, y + 5, 70, 15, tracked ? "Tracking" : "Track", tracked ? p.amber : p.gray, () -> {
			NbConfig c = NbConfig.get(); c.trackedPlace = tracked ? "" : selected; NbConfig.save(); Compat.soundToggle(); s.rebuild();
		}, true);
		s.pill(x + w - 66, y + 5, 42, 15, "Edit", p.secondary, () -> { PagePlaces.open(selected); NotebookScreen.tab = NotebookScreen.PLACES; s.rebuild(); }, true);
		s.pill(x + w - 20, y + 5, 15, 15, "\u2715", p.secondary, () -> { selected = ""; s.rebuild(); }, true);
	}

	/** A small arrowhead just outside a player's face, pointing the way they're looking. */
	private static void pointer(GuiGraphicsExtractor g, int px, int pz, float yawDeg, int col) {
		double yaw = Math.toRadians(yawDeg), dx = -Math.sin(yaw), dz = Math.cos(yaw), nx = -dz, nz = dx;
		for (int r = 8; r <= 11; r++) {
			int half = 11 - r;   // wide at the base, one pixel at the tip
			for (int w = -half; w <= half; w++) { int x = px + (int) Math.round(dx * r + nx * w), z = pz + (int) Math.round(dz * r + nz * w); g.fill(x, z, x + 1, z + 1, col); }
		}
	}

	private static int sx(double x) { return (int) Math.round(ax + aw / 2.0 + (x - cx) * scale); }
	private static int sz(double z) { return (int) Math.round(ay + ah / 2.0 + (z - cz) * scale); }

	// ---- right-click adds a place (left-click picks one and drag moves the map, below)
	static volatile boolean rebuildSoon;   // picked up by the screen's tick, so the page never rebuilds in the middle of handling a click
	private static boolean rightArmed;
	private static double rightX, rightY;
	static boolean rightPress(double x, double y) { if (!owns(x, y)) return false; rightArmed = true; rightX = x; rightY = y; return true; }
	static boolean rightRelease(double x, double y) {
		if (!rightArmed) return false;
		rightArmed = false;
		if (Math.hypot(x - rightX, y - rightY) < 4) addPlaceAt(x, y);
		return true;
	}

	/** Right-click on the map: a new place there, opened in the Places editor to name it. */
	private static void addPlaceAt(double x, double y) {
		if (!Notebook.canEdit()) return;
		int wx = (int) Math.floor(cx + (x - ax - aw / 2.0) / scale), wz = (int) Math.floor(cz + (y - ay - ah / 2.0) / scale);
		Minecraft mc = Minecraft.getInstance();
		Names.Spot here = Names.here();
		int wy = 64;
		if (mc.player != null && here != null && here.dim().equals(dim)) {
			wy = (int) Math.floor(mc.player.getY());
			if (!dim.equals("nether") && mc.level != null && mc.level.hasChunk(wx >> 4, wz >> 4))   // the ground there, if it's loaded (the Nether's roof would mislead)
				wy = mc.level.getHeight(net.minecraft.world.level.levelgen.Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, wx, wz);
		}
		PagePlaces.openNew();
		for (String d : DIMS) PagePlaces.draft.addProperty(d, "");
		PagePlaces.draft.addProperty(dim, wx + " " + wy + " " + wz);
		NotebookScreen.tab = NotebookScreen.PLACES;
		Compat.soundToggle();
		rebuildSoon = true;
	}

	/** Whether a click at this point belongs to the map (the screen then leaves it alone). */
	static boolean owns(double x, double y) { return inside(x, y) && !onPanel(x, y); }

	private static void draw(NotebookScreen s, GuiGraphicsExtractor g, int mx, int my, boolean sharing) {
		Ui.Pal p = Ui.pal();
		var font = s.font();
		g.fill(ax, ay, ax + aw, ay + ah, p.panel2);
		g.outline(ax - 1, ay - 1, aw + 2, ah + 2, p.edge);
		g.enableScissor(ax, ay, ax + aw, ay + ah);
		// A faint grid (chunks, and every 128 blocks a map tile) that moves with the map, so dragging shows even where nothing is mapped yet.
		for (int step : new int[] {16, 128}) {
			if (step * scale < 6) continue;
			int col = step == 128 ? 0x30FFFFFF : 0x14FFFFFF;
			double wx0 = cx - aw / 2.0 / scale, wz0 = cz - ah / 2.0 / scale;
			for (double wx = Math.floor(wx0 / step) * step; wx <= cx + aw / 2.0 / scale; wx += step) { int x = sx(wx); if (x >= ax && x < ax + aw) g.fill(x, ay, x + 1, ay + ah, col); }
			for (double wz = Math.floor(wz0 / step) * step; wz <= cz + ah / 2.0 / scale; wz += step) { int z = sz(wz); if (z >= ay && z < ay + ah) g.fill(ax, z, ax + aw, z + 1, col); }
		}
		List<int[]> tiles = MapTiles.tilesIn(dim);
		for (int[] t : tiles) {
			int x0 = sx(t[0] * 128.0), z0 = sz(t[1] * 128.0), x1 = sx(t[0] * 128.0 + 128), z1 = sz(t[1] * 128.0 + 128);
			if (x1 < ax || z1 < ay || x0 > ax + aw || z0 > ay + ah) continue;
			var id = MapTiles.texture(dim + "/" + t[0] + "/" + t[1]);
			if (id != null) Compat.blitTile(g, id, x0, z0, x1, z1);
		}
		String tracked = NbConfig.get().trackedPlace;
		JsonObject hover = pinAt(mx, my);
		for (JsonObject o : Notebook.rows("coords")) {   // places: the same icon as their category on the Places tab
			double[] at = xyz(Notebook.str(o, dim));
			if (at == null) continue;
			int px = sx(at[0]), pz = sz(at[2]);
			boolean on = Notebook.str(o, "id").equals(tracked), hov = o == hover;
			if (on || hov) { g.fill(px - 8, pz - 8, px + 8, pz + 8, on ? p.gold : p.ink); g.fill(px - 7, pz - 7, px + 7, pz + 7, 0xCC000000); }
			g.pose().pushMatrix(); g.pose().translate(px - 6, pz - 6); g.pose().scale(0.75f, 0.75f);
			Compat.drawItem(g, PagePlaces.CAT_ICON.getOrDefault(Notebook.str(o, "cat"), "paper"), 0, 0);
			g.pose().popMatrix();
			if (scale >= 0.5 || hov || on) {
				String name = Notebook.str(o, "name").isBlank() ? "Unnamed place" : Notebook.str(o, "name");
				g.text(font, (on ? "> " : "") + name, px + 9, pz - 4, on ? p.gold : 0xFFFFFFFF, true);
			}
		}
		for (Players.Pos o : Players.all()) {   // your team: their face in their colour, a pointer the way they face; dimmed where they logged off
			if (!o.dim().equals(dim) || o.uid().equals(Notebook.userId)) continue;
			int px = sx(o.x()), pz = sz(o.z()), col = Players.colour(o.uid());
			boolean live = o.live();
			if (live) pointer(g, px, pz, o.yaw(), col);
			Players.face(g, o.mcUuid(), px - 5, pz - 5, 10, live ? col : 0xFF6B6F78, !live);
			String label = live ? o.name() : o.name() + " · " + Ui.ago(o.seen());
			g.text(font, label, px - font.width(label) / 2, pz - 19, live ? col : p.mut, true);   // above, so it never sits on a place name
		}
		var pl = Minecraft.getInstance().player;
		Names.Spot here = Names.here();
		if (pl != null && here != null && here.dim().equals(dim)) {   // you: your face in a white frame, pointing the way you're facing
			int px = sx(pl.getX()), pz = sz(pl.getZ());
			pointer(g, px, pz, pl.getYRot(), 0xFFFFFFFF);
			Players.face(g, pl.getUUID().toString(), px - 5, pz - 5, 10, 0xFFFFFFFF, false);
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
		double bd = 8;
		for (JsonObject o : Notebook.rows("coords")) {
			double[] at = xyz(Notebook.str(o, dim));
			if (at == null) continue;
			int px = sx(at[0]), pz = sz(at[2]);
			double d = Math.hypot(px - mx, pz - my);
			if (d >= bd && screen != null && scale >= 0.5) {   // the name beside the pin counts too
				String name = Notebook.str(o, "name").isBlank() ? "Unnamed place" : Notebook.str(o, "name");
				if (mx >= px + 4 && mx <= px + 10 + screen.font().width(name) && my >= pz - 6 && my <= pz + 6) d = bd - 0.01;
			}
			if (d < bd) { bd = d; best = o; }
		}
		return best;
	}

	private static boolean inside(double x, double y) { return x >= ax && x < ax + aw && y >= ay && y < ay + ah; }

	static void zoom(double f) { scale = Math.max(1 / 16.0, Math.min(16, scale * f)); }

	// ---- mouse (called by NotebookScreen while this tab is open)

	private static boolean onPanel(double x, double y) { return x >= px0 && x < px1 && y >= py0 && y < py1; }

	static boolean press(double x, double y) {
		if (!inside(x, y) || onPanel(x, y)) return false;   // the details panel has its own buttons
		dragging = true; moved = false; pressX = x; pressY = y;
		return true;
	}

	/** Moves the map with the mouse. It only counts as a drag once the mouse has gone a few pixels, so a slightly shaky click still picks a place. */
	static boolean drag(double x, double y, double dx, double dy) {
		if (!dragging) return false;
		if (!moved && Math.hypot(x - pressX, y - pressY) < 3) return true;
		moved = true;
		cx -= dx / scale; cz -= dy / scale;
		return true;
	}

	static boolean release(double x, double y) {
		if (!dragging) return false;
		dragging = false;
		if (moved) return true;
		JsonObject pin = pinAt(x, y);
		if (pin != null) {   // click a place: track it and show what's there
			selected = Notebook.str(pin, "id");
			NbConfig c = NbConfig.get();
			if (!selected.equals(c.trackedPlace)) { c.trackedPlace = selected; NbConfig.save(); Compat.soundToggle(); }
		} else selected = "";
		rebuildSoon = true;
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
