package dev.hamish.survivalnotebook;

import com.google.gson.JsonObject;
import net.fabricmc.loader.api.FabricLoader;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** Places: list with filters, and a full editor (name, category, coordinates per dimension, portal, track, delete). */
final class PagePlaces {
	private PagePlaces() { }

	static final java.util.Map<String, String> CAT_ICON = java.util.Map.of("Important", "nether_star", "Farms", "wheat", "Biomes", "spyglass", "Structures", "bricks", "Other", "paper");
	static final String[] CATS = {"Important", "Farms", "Biomes", "Structures", "Other"};
	static JsonObject draft;
	static boolean isNew, confirmDel, nearest, importing;
	static String query = "";
	static List<Minimap.Source> sources = new ArrayList<>();
	static int importPick = -1;
	static String cat = "All";

	static String confirmHere = "", confirmValue = "", confirmLabel = "";

	/** "Replace these coordinates?" — shown in place of the coordinate rows after pressing Here or Paste on a filled-in dimension. */
	private static void confirmHere(NotebookScreen s, int y) {
		Ui.Pal p = Ui.pal();
		final String key = confirmHere, old = Notebook.str(draft, key), now = confirmValue;
		final String dim = Names.dimName(key);
		s.text("Replace the coordinates in " + dim + "?", s.cx, y + 4, p.gold);
		s.text("Currently:  " + old, s.cx, y + 22, p.mut);
		s.text(confirmLabel + ":  " + now, s.cx, y + 34, p.ink);
		s.btn(s.cx, y + 52, 110, "Replace", 0, () -> { draft.addProperty(key, now); confirmHere = ""; s.rebuild(); }, !now.isEmpty());
		s.btn(s.cx + 116, y + 52, 90, "Keep old", 1, () -> { confirmHere = ""; s.rebuild(); }, true);
		s.btn(s.cx + 212, y + 52, 90, "Copy old", 1, () -> Notebook.msg(Compat.copy(old) ? "Copied " + old : "Couldn't copy"), true);
	}

	/** Asks before replacing coordinates that are already filled in; fills an empty dimension straight away. */
	private static void offer(NotebookScreen s, String key, String xyz, String label) {
		String old = Notebook.str(draft, key);
		if (!old.isBlank() && !old.trim().equals(xyz)) { confirmHere = key; confirmValue = xyz; confirmLabel = label; }
		else draft.addProperty(key, xyz);
		s.rebuild();
	}

	/** The Paste button: reads F3+C (or /tp, or x y z) from the clipboard. Without a dimension in it, it's for the dimension you're in. */
	private static void pasteClipboard(NotebookScreen s) {
		Names.Pasted p;
		try { p = Names.parsePaste(Compat.clipboard()); } catch (IllegalArgumentException e) { Notebook.msg(e.getMessage()); return; }
		if (p == null) { Notebook.msg("Nothing to paste. Press F3 + C to copy where you are."); return; }
		String dim = p.dim();
		if (dim == null) { Names.Spot h = Names.here(); if (h == null) { Notebook.msg("That has no dimension and you're not in one the notebook knows"); return; } dim = h.dim(); }
		offer(s, dim, p.xyz(), "Pasted");
	}

	/** Typing or pasting into a coordinate box: game text is turned into "x y z" and put in the dimension it names. */
	private static void typed(NotebookScreen s, String key, String v) {
		if (!Names.looksPasted(v)) { draft.addProperty(key, v); return; }
		Names.Pasted p;
		try { p = Names.parsePaste(v); } catch (IllegalArgumentException e) { Notebook.msg(e.getMessage()); return; }
		if (p == null) { draft.addProperty(key, v); return; }
		String dim = p.dim() == null ? key : p.dim();
		if (!dim.equals(key)) Notebook.msg("That's a position in " + Names.dimName(dim) + ", so it goes in that row");
		net.minecraft.client.Minecraft.getInstance().execute(() -> offer(s, dim, p.xyz(), "Pasted"));
	}

	static void reset() { confirmHere = ""; draft = null; confirmDel = false; importing = false; importPick = -1; }

	static void open(String id) {
		JsonObject o = Notebook.find("coords", id);
		if (o == null) return;
		draft = o.deepCopy(); isNew = false; confirmDel = false; NotebookScreen.scroll = 0;
	}

	static void openNew() {
		JsonObject d = new JsonObject();
		d.addProperty("id", Names.newId()); d.addProperty("name", ""); d.addProperty("cat", "Important");
		d.addProperty("ow", ""); d.addProperty("nether", ""); d.addProperty("end", ""); d.addProperty("portal", "No Portal");
		Names.Spot here = Names.here();
		if (here != null) d.addProperty(here.dim(), here.xyz());   // prefilled with where you're standing
		draft = d; isNew = true; confirmDel = false; NotebookScreen.scroll = 0;
	}

	/** The B key: jump to Places with a new place prefilled with where you're standing. */
	static void addHere() {
		NotebookScreen.tab = NotebookScreen.PLACES; NotebookScreen.scroll = 0;
		importing = false;
		openNew();
	}

	static void build(NotebookScreen s) { if (draft != null) editor(s); else if (importing) importView(s); else list(s); }

	private static void importView(NotebookScreen s) {
		Ui.Pal p = Ui.pal();
		int y = s.top;
		s.text("Sync with a minimap mod", s.cx, y - 1, p.gold);
		int th = s.wrap("Keeps your places in step with Xaero's Minimap or JourneyMap automatically. Adding, moving or deleting a waypoint updates here too. "
			+ (NbConfig.get().mmDir.isBlank() ? "Pick one below. Nothing is ever changed in the minimap mod." : "Syncing now. Places you added yourself are never removed."), s.cx, y + 11, s.cw - 12, p.mut);
		int listTop = y + 18 + th, rowH = 24, vis = Math.max(1, (s.bottom - 26 - listTop) / rowH), rowW = s.cw - 10;
		s.setScroll(sources.size(), vis);
		if (sources.isEmpty()) s.text("No Xaero's or JourneyMap waypoints found.", s.cx + 4, listTop + 6, p.mut);
		for (int i = 0; i < vis && NotebookScreen.scroll + i < sources.size(); i++) {
			final int idx = NotebookScreen.scroll + i, ry = listTop + i * rowH;
			final Minimap.Source src = sources.get(idx);
			final boolean armed = importPick == idx;
			s.row(s.cx, ry, rowW, rowH - 1, rowW, i, () -> {
				if (!armed) { importPick = idx; s.rebuild(); return; }
				Notebook.startMinimapSync(src);
				importing = false; importPick = -1; s.rebuild();
			});
			s.paint((g, mx, my) -> {
				g.text(s.font(), Ui.clip(s.font(), src.app() + " · " + src.world(), rowW - 150), s.cx + 8, ry + 4, p.ink, false);
				g.text(s.font(), src.count() + " waypoint" + (src.count() == 1 ? "" : "s"), s.cx + 8, ry + 14, p.mut, false);
				String act = armed ? "Click again to start syncing" : "Click to sync";
				g.text(s.font(), act, s.cx + rowW - 8 - s.font().width(act), ry + 9, armed ? p.amber.fg() : p.mut, false);
			});
		}
		if (!NbConfig.get().mmDir.isBlank()) s.btn(s.cx, s.bottom - 20, 110, "Stop syncing", 1, () -> { Notebook.stopMinimapSync(); s.rebuild(); }, true);
		s.btn(s.cx + s.cw - 70, s.bottom - 20, 64, "Back", 1, () -> { importing = false; importPick = -1; s.rebuild(); }, true);
	}

	private static String coordLabel(JsonObject o) {
		Names.Spot here = Names.here();
		String[] order = here == null ? new String[] {"ow", "nether", "end"} : new String[] {here.dim(), "ow", "nether", "end"};
		for (String k : order) {
			String v = Notebook.str(o, k);
			if (!v.isBlank()) return (k.equals("nether") ? "Nether " : k.equals("end") ? "End " : "") + v;
		}
		return "no coordinates";
	}

	private static void list(NotebookScreen s) {
		Ui.Pal p = Ui.pal();
		int y = s.top;
		s.btn(s.cx, y, 88, "+ Add place", 0, () -> { openNew(); s.rebuild(); }, Notebook.canEdit());
		List<String> catOpts = new ArrayList<>(List.of("All")); catOpts.addAll(List.of(CATS));
		s.dropdown("places-cat", s.cx + 94, y, 130, "Category", catOpts, cat, cat.equals("All") ? p.gray : Ui.cat(cat), v -> { cat = v; NotebookScreen.scroll = 0; });
		s.pill(s.cx + 230, y, 86, 20, "Nearest: " + (nearest ? "on" : "off"), nearest ? p.green : p.gray, () -> { nearest = !nearest; NotebookScreen.scroll = 0; s.rebuild(); }, true);
		s.pill(s.cx + 322, y, 82, 20, NbConfig.get().mmDir.isBlank() ? "Sync map…" : "Syncing ✓", NbConfig.get().mmDir.isBlank() ? p.teal : p.green, () -> { sources = Minimap.scan(FabricLoader.getInstance().getGameDir()); importPick = -1; importing = true; NotebookScreen.scroll = 0; s.rebuild(); }, Notebook.canEdit());

		List<JsonObject> all = new ArrayList<>();
		List<JsonObject> src = Notebook.rows("coords");
		for (JsonObject o : src) if ((cat.equals("All") || cat.equals(Notebook.str(o, "cat"))) && NotebookScreen.has(query, Notebook.str(o, "name"), Notebook.str(o, "cat"), Notebook.str(o, "ow"), Notebook.str(o, "nether"), Notebook.str(o, "end"))) all.add(o);   // same order as the website; drag to rearrange
		Names.Spot here = Names.here();
		if (nearest && here != null)
			all.sort(Comparator.comparingDouble(o -> { Double d = Names.distance(Notebook.str(o, here.dim())); return d == null ? Double.MAX_VALUE : d; }));
		int sx = s.searchRight("places-q", y, 130, query, v -> { query = v; NotebookScreen.scroll = 0; });
		s.textRight(all.size() + (all.size() == 1 ? " place" : " places"), sx - 6, y + 6, p.mut);

		int listTop = y + 26, vis = Math.max(1, (s.bottom - listTop) / 26);
		s.setScroll(all.size(), vis);
		if (all.isEmpty()) s.text("No places yet. Press B in the world to save one.", s.cx + 4, listTop + 6, p.mut);
		for (int i = 0; i < vis && NotebookScreen.scroll + i < all.size(); i++) {
			JsonObject o = all.get(NotebookScreen.scroll + i);
			final int ry = listTop + i * 26;
			final String id = Notebook.str(o, "id"), name = Notebook.str(o, "name"), c = Notebook.str(o, "cat");
			final boolean hasOw = !Notebook.str(o, "ow").isBlank(), hasNe = !Notebook.str(o, "nether").isBlank(), hasEn = !Notebook.str(o, "end").isBlank();
			String right = coordLabel(o);
			String b = Names.bearing(o);   // distance + direction, converted from the other dimension if needed
			if (b != null) right = b + "  ·  " + right;
			final String rt = right;
			final boolean tracked = id.equals(NbConfig.get().trackedPlace);
			if (!(nearest && here != null)) { int at = NotebookScreen.scroll + i; s.reorder("coords", id, at > 0 ? Notebook.str(all.get(at - 1), "id") : "", at + 1 < all.size() ? Notebook.str(all.get(at + 1), "id") : "", ry, 25); }   // manual order only when not sorted by distance
			s.row(s.cx, ry, s.cw - 10, 25, s.cw - 72, i, () -> { open(id); s.rebuild(); });
			s.paint((g, mx, my) -> {
				Compat.drawItem(g, CAT_ICON.getOrDefault(c, "paper"), s.cx + 6, ry + 5);
				g.fill(s.cx + 1, ry + 3, s.cx + 4, ry + 22, Ui.cat(c).fg());
				String label = (tracked ? "> " : "") + (name.isBlank() ? "Unnamed place" : name);
				g.text(s.font(), Ui.clip(s.font(), label, s.cw - 250), s.cx + 28, ry + 5, tracked ? p.amber.fg() : p.ink, false);
				g.text(s.font(), Ui.clip(s.font(), rt, s.cw - 130), s.cx + 28, ry + 15, p.mut, false);
				int tx = s.cx + s.cw - 78;   // dimension tags, right-aligned, left of the Track button
				String[][] dims = {{"End", hasEn ? "y" : ""}, {"Nether", hasNe ? "y" : ""}, {"Overworld", hasOw ? "y" : ""}};
				for (String[] dm : dims) {
					if (dm[1].isEmpty()) continue;
					int w = s.font().width(dm[0]) + 10; tx -= w + 3;
					Ui.tag(g, s.font(), tx, ry + 6, w, 13, dm[0], dm[0].equals("Nether") ? p.red : dm[0].equals("End") ? p.purple : p.green, false);
				}
			});
			s.pill(s.cx + s.cw - 70, ry + 4, 58, 17, tracked ? "Tracking" : "Track", tracked ? p.amber : p.gray, () -> { NbConfig cf = NbConfig.get(); cf.trackedPlace = tracked ? "" : id; NbConfig.save(); s.rebuild(); }, true);
		}
	}

	private static void editor(NotebookScreen s) {
		Ui.Pal p = Ui.pal();
		final String id = Notebook.str(draft, "id");
		int lw = 66, bx = s.cx + lw, bw = s.cw - lw - 6, y = s.top;
		s.card(s.cx - 6, y + 10, s.cw + 2, 194);
		s.text(isNew ? "New place" : "Edit place", s.cx, y - 1, p.gold);
		y += 14;
		s.text("Name", s.cx, y + 6, p.mut);
		s.box(bx, y, bw, "Place name", Notebook.str(draft, "name"), v -> draft.addProperty("name", v));
		y += 26;

		s.text("Details", s.cx, y + 6, p.mut);
		final String curCat = Notebook.str(draft, "cat").isBlank() ? "Other" : Notebook.str(draft, "cat");
		final boolean portal = Notebook.str(draft, "portal").equals("Portal") || Notebook.str(draft, "portal").equals("Linked");
		final boolean tracked = id.equals(NbConfig.get().trackedPlace);
		s.dropdown("place-cat", bx, y, 150, "Category", List.of(CATS), curCat, Ui.cat(curCat), v -> draft.addProperty("cat", v));
		s.pill(bx + 156, y, 86, 20, portal ? "Portal" : "No portal", portal ? p.purple : p.gray, () -> { draft.addProperty("portal", portal ? "No Portal" : "Portal"); s.rebuild(); }, true);
		s.pill(bx + 248, y, 90, 20, tracked ? "Tracking" : "Track", tracked ? p.amber : p.gray, () -> { NbConfig c = NbConfig.get(); c.trackedPlace = tracked ? "" : id; NbConfig.save(); s.rebuild(); }, true);
		if (bw >= 420) s.pill(bx + 344, y, 70, 20, "Paste", p.teal, () -> pasteClipboard(s), confirmHere.isEmpty());
		y += 26;

		String[][] dims = {{"ow", "Overworld"}, {"nether", "Nether"}, {"end", "End"}};
		final boolean asking = !confirmHere.isEmpty();
		if (asking) confirmHere(s, y);
		int[] bars = {p.green.fg(), p.red.fg(), p.purple.fg()};
		for (int i = 0; !asking && i < dims.length; i++) {
			final String key = dims[i][0];
			final int yy = y, barColor = bars[i];
			s.text(dims[i][1], s.cx + 8, yy + 6, p.mut);
			s.paint((g, mx, my) -> g.fill(s.cx, yy + 1, s.cx + 4, yy + 19, barColor));
			s.box(bx, yy, bw - 112, "x y z, or paste F3 + C", Notebook.str(draft, key), v -> typed(s, key, v));
			s.paint((g, mx, my) -> {   // red outline while the text isn't a valid "x y z"
				String v = Notebook.str(draft, key);
				if (!v.isBlank() && !Names.isXyz(v)) g.outline(bx - 1, yy - 1, bw - 110, 22, 0xFFE0584A);
			});
			s.pill(bx + bw - 106, yy, 50, 20, "Copy", p.secondary, () -> { String v = Notebook.str(draft, key).trim(); Notebook.msg(Compat.copy(v) ? "Copied " + v : "Couldn't copy"); }, !Notebook.str(draft, key).isBlank());
			s.pill(bx + bw - 52, yy, 50, 20, "Here", p.secondary, () -> {
				Names.Spot h = Names.here();
				if (h == null || !h.dim().equals(key)) { Notebook.msg("You're not in that dimension right now"); return; }
				offer(s, key, h.xyz(), "Where you are");   // replacing existing coordinates: ask first
			}, true);
			y += 26;
			if (i == 0 && !asking) {   // between the Overworld and Nether rows: fills whichever of the two is empty
				s.btn(bx, y - 2, 120, "\u21C5 Convert", 1, () -> {
					String ow = Notebook.str(draft, "ow"), ne = Notebook.str(draft, "nether");
					if (Names.isXyz(ow) && ne.isBlank()) draft.addProperty("nether", Names.convert(ow, 1 / 8.0));
					else if (Names.isXyz(ne) && ow.isBlank()) draft.addProperty("ow", Names.convert(ne, 8));
					else { Notebook.msg("Leave the other side empty to convert."); return; }
					s.rebuild();
				}, true);
				y += 24;
			}
		}
		if (asking) y += 78;
		s.text("Enter coordinates like 120 64 -33, or press F3 + C and then Paste.", s.cx, y + 2, p.mut);

		int by = s.bottom - 20, x = s.cx;
		s.btn(x, by, 64, "Save", 0, () -> {
			for (String k : new String[] {"ow", "nether", "end"}) {
				String v = Notebook.str(draft, k);
				if (!v.isBlank() && !Names.isXyz(v)) { Notebook.msg("Use the format 120 64 -33"); return; }
			}
			if (Notebook.str(draft, "name").isBlank()) draft.addProperty("name", "Place");
			Notebook.saveRow("coords", draft);
			draft = null; s.rebuild();
		}, Notebook.canEdit());
		if (!isNew) s.btn(x + 70, by, 96, confirmDel ? "Really delete?" : "Delete", 2, () -> {
			if (!confirmDel) { confirmDel = true; s.rebuild(); return; }
			Notebook.deleteRow("coords", id);
			draft = null; confirmDel = false; s.rebuild();
		}, Notebook.canEdit());
		s.btn(s.cx + s.cw - 70, by, 64, "Back", 1, () -> { draft = null; confirmDel = false; s.rebuild(); }, true);
	}
}
