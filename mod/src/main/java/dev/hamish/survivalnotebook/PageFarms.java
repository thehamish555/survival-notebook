package dev.hamish.survivalnotebook;

import com.google.gson.JsonObject;
import net.fabricmc.loader.api.FabricLoader;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import java.util.ArrayList;
import java.util.List;

/** Farms: list with built toggle, and an editor (name, YouTube link, built, assignee). Litematica files are managed on the website. */
final class PageFarms {
	private PageFarms() { }

	static JsonObject draft;
	static boolean isNew, confirmDel, picking, confirmFile;
	static List<Path> found = new ArrayList<>();
	static String filter = "All";
	static boolean mineOnly = false, editingLink = false;
	private static final String[] FILTERS = {"All", "To build", "Building", "Built"};

	static String query = "";
	static boolean pickingIcon;

	static void reset() { editingLink = false; pickingIcon = false; discardDraft(); draft = null; confirmDel = false; picking = false; confirmFile = false; }

	static Path schematics() { return FabricLoader.getInstance().getGameDir().resolve("schematics"); }

	static long sizeOf(Path p) { try { return Files.size(p); } catch (IOException e) { return -1; } }

	static void open(String id) {
		JsonObject o = Notebook.find("farms", id);
		if (o == null) return;
		draft = o.deepCopy(); isNew = false; confirmDel = false; NotebookScreen.scroll = 0;
	}

	static void build(NotebookScreen s) { if (draft != null && pickingIcon) IconPicker.build(s, draft, () -> { pickingIcon = false; s.rebuild(); }); else if (draft != null && picking) picker(s); else if (draft != null) editor(s); else list(s); }

	/** Lists the .litematic files in your schematics folder (Litematica's default); files over 100 KB are greyed out. */
	private static void picker(NotebookScreen s) {
		Ui.Pal p = Ui.pal();
		int y = s.top;
		s.text("Attach a Litematica file", s.cx, y - 1, p.gold);
		s.text("Files from your schematics folder, up to 100 KB.", s.cx, y + 11, p.mut);
		int listTop = y + 26, rowH = 20, vis = Math.max(1, (s.bottom - 26 - listTop) / rowH), rowW = s.cw - 10;
		s.setScroll(found.size(), vis);
		if (found.isEmpty()) s.text("No .litematic files found there.", s.cx + 4, listTop + 6, p.mut);
		for (int i = 0; i < vis && NotebookScreen.scroll + i < found.size(); i++) {
			final Path f = found.get(NotebookScreen.scroll + i);
			final int ry = listTop + i * rowH;
			final long size = sizeOf(f);
			final boolean fits = size > 0 && size <= 100 * 1024;
			final String farmId = Notebook.str(draft, "id");
			s.row(s.cx, ry, rowW, rowH - 1, rowW, i, fits ? () -> {
				picking = false;
				Notebook.attachFile(farmId, f, rec -> { if (draft != null && farmId.equals(Notebook.str(draft, "id"))) draft.add("file", rec); else Notebook.discardFile(Notebook.str(rec, "id")); uploadedHere.add(Notebook.str(rec, "id")); Notebook.touch(); });
				s.rebuild();
			} : null);
			s.paint((g, mx, my) -> {
				g.text(s.font(), Ui.clip(s.font(), f.getFileName().toString(), rowW - 90), s.cx + 8, ry + 6, fits ? p.ink : p.mut, false);
				String t = size < 0 ? "?" : fits ? Math.max(1, size / 1024) + " KB" : "too big";
				g.text(s.font(), t, s.cx + rowW - 8 - s.font().width(t), ry + 6, fits ? p.mut : 0xFFFF9B8E, false);
			});
		}
		s.btn(s.cx + s.cw - 70, s.bottom - 20, 64, "Back", 1, () -> { picking = false; s.rebuild(); }, true);
	}

	private static void list(NotebookScreen s) {
		Ui.Pal p = Ui.pal();
		int y = s.top;
		s.btn(s.cx, y, 90, "+ Add farm", 0, () -> {
			JsonObject d = new JsonObject();
			d.addProperty("id", Names.newId()); d.addProperty("name", ""); d.addProperty("tutorial", ""); d.addProperty("ttl", "");
			d.addProperty("assignee", ""); d.addProperty("built", false);
			draft = d; isNew = true; confirmDel = false; NotebookScreen.scroll = 0; s.rebuild();
		}, Notebook.canEdit());
		s.dropdown("farms-filter", s.cx + 96, y, 150, "Show", List.of(FILTERS), filter, filter.equals("All") ? p.gray : p.green, v -> { filter = v; NotebookScreen.scroll = 0; });
		s.dropdown("farms-who", s.cx + 252, y, 116, "Show", List.of("Everyone", "Mine"), mineOnly ? "Mine" : "Everyone", p.gray, v -> { mineOnly = v.equals("Mine"); NotebookScreen.scroll = 0; });

		List<JsonObject> all = new ArrayList<>();
		for (JsonObject o : Notebook.rows("farms")) {
			if (!filter.equals("All") && !status(o).equals(filter)) continue;
			String as = Notebook.str(o, "assignee");
			if (mineOnly && !(as.equals(Notebook.userId) || Notebook.memberName(as).isEmpty())) continue;
			if (!NotebookScreen.has(query, Notebook.str(o, "name"), Notebook.str(o, "ttl"), Notebook.memberName(as), placeName(Notebook.str(o, "place")))) continue;
			all.add(o);
		}
		int sx = s.searchRight("farms-q", y, 130, query, v -> { query = v; NotebookScreen.scroll = 0; });
		s.textRight(all.size() + (all.size() == 1 ? " farm" : " farms"), sx - 6, y + 6, p.mut);
		int listTop = y + 26, vis = Math.max(1, (s.bottom - listTop) / 24);
		s.setScroll(all.size(), vis);
		if (all.isEmpty()) s.text("No farms yet. Paste a YouTube link to name one automatically.", s.cx + 4, listTop + 6, p.mut);
		int rowW = s.cw - 10;
		for (int i = 0; i < vis && NotebookScreen.scroll + i < all.size(); i++) {
			JsonObject o = all.get(NotebookScreen.scroll + i);
			final int ry = listTop + i * 24;
			final String id = Notebook.str(o, "id"), icon = Notebook.str(o, "icon"), name = Notebook.str(o, "name"), ttl = Notebook.str(o, "ttl"), who = Notebook.memberName(Notebook.str(o, "assignee")), place = placeName(Notebook.str(o, "place"));
			final String st = status(o);
			final boolean built = st.equals("Built"), hasVideo = Names.ytId(Notebook.str(o, "tutorial")) != null, hasFile = o.has("file") && o.get("file").isJsonObject();
			{ int at = NotebookScreen.scroll + i; s.reorder("farms", id, at > 0 ? Notebook.str(all.get(at - 1), "id") : "", at + 1 < all.size() ? Notebook.str(all.get(at + 1), "id") : "", ry, 23); }
			s.row(s.cx, ry, rowW, 23, rowW - 100, i, () -> { open(id); s.rebuild(); });
			s.paint((g, mx, my) -> {
				g.fill(s.cx + 4, ry + 4, s.cx + 7, ry + 19, built ? p.green.fg() : p.mut);
				Compat.drawItem(g, icon.isBlank() ? "wheat" : icon, s.cx + 10, ry + 4);
				g.text(s.font(), Ui.clip(s.font(), name.isBlank() ? "Unnamed farm" : name, rowW - 140), s.cx + 30, ry + 3, p.ink, false);
				String sub = (hasVideo ? "video" : "no video") + (hasFile ? " · Litematica" : "") + (who.isEmpty() ? "" : " · " + who) + (place.isEmpty() ? "" : " · at " + place);
				g.text(s.font(), Ui.clip(s.font(), sub, rowW - 140), s.cx + 30, ry + 13, p.mut, false);
			});
			if (Notebook.canEdit()) s.dropdown("farm-row-" + id, s.cx + rowW - 96, ry + 3, 94, 17, "", List.of("To build", "Building", "Built"), st, tone(st), v -> Notebook.patchRow("farms", id, f -> setStatus(f, v)));
			else s.pill(s.cx + rowW - 76, ry + 3, 74, 17, st, tone(st), () -> { }, false);
		}
	}

	private static void editor(NotebookScreen s) {
		Ui.Pal p = Ui.pal();
		final String id = Notebook.str(draft, "id");
		int lw = 66, bx = s.cx + lw, bw = s.cw - lw - 6, y = s.top;
		s.card(s.cx - 6, y + 10, s.cw + 2, 214);
		s.text(isNew ? "New farm" : "Edit farm", s.cx, y - 1, p.gold);
		y += 14;
		s.text("Name", s.cx, y + 6, p.mut);
		s.box(bx, y, bw, "Farm name (blank = use the video title)", Notebook.str(draft, "name"), v -> draft.addProperty("name", v));
		y += 26;
		final String ic = Notebook.str(draft, "icon");
		s.text("Icon", s.cx, y + 6, p.mut);
		final int iy = y;
		s.paint((g, mx, my) -> { g.fill(bx, iy, bx + 22, iy + 22, p.row); Compat.drawItem(g, ic.isBlank() ? "wheat" : ic, bx + 3, iy + 3); });
		s.btn(bx + 28, y, 100, ic.isBlank() ? "Choose icon…" : "Change icon…", 1, () -> { pickingIcon = true; IconPicker.reset(); NotebookScreen.scroll = 0; s.rebuild(); }, Notebook.canEdit());
		y += 26;
		final String stNow = status(draft);
		s.text("Status", s.cx, y + 6, p.mut);
		s.dropdown("farm-status", bx, y, 130, "Status", List.of("To build", "Building", "Built"), stNow, tone(stNow), v -> setStatus(draft, v));
		y += 26;
		final String cur = Notebook.str(draft, "assignee");
		s.text("Assigned", s.cx, y + 6, p.mut);
		s.dropdown("farm-who", bx, y, 220, "For", PageTodo.assigneeLabels(), PageTodo.assigneeLabel(cur), cur.isBlank() ? p.gray : p.blue, v -> draft.addProperty("assignee", PageTodo.assigneeId(v)));
		y += 26;
		final String tut = Notebook.str(draft, "tutorial");
		s.text("Tutorial", s.cx, y + 6, p.mut);
		if (Names.ytId(tut) != null && !editingLink) {   // a valid link shows as its title on one line; press it to watch or edit
			String shown = Notebook.str(draft, "ttl").isBlank() ? "YouTube video" : Notebook.str(draft, "ttl");
			s.pill(bx, y, bw - 46, 20, Ui.clip(s.font(), shown, bw - 60), p.red, () -> Compat.openUrl(s, tut), true);
			s.pill(bx + bw - 42, y, 42, 20, "Edit", p.gray, () -> { editingLink = true; s.rebuild(); }, true);
		} else {
			final int vy = y;
			s.box(bx, y, bw, "Paste a YouTube link", tut, v -> { draft.addProperty("tutorial", v); draft.addProperty("ttl", ""); });
			s.paint((g, mx, my) -> {
				String v = Notebook.str(draft, "tutorial");
				if (!v.isBlank() && Names.ytId(v) == null) { g.outline(bx - 1, vy - 1, bw + 2, 22, 0xFFE0584A); g.text(s.font(), "Not a YouTube link", bx, vy + 23, 0xFFFF9B8E, false); }
			});
		}
		y += 28;
		final String placeId = Notebook.str(draft, "place");
		s.text("Location", s.cx, y + 6, p.mut);
		List<String> placeOpts = new ArrayList<>(List.of("No place"));
		for (JsonObject pl : Notebook.rows("coords")) placeOpts.add(placeLabel(pl));
		s.dropdown("farm-place", bx, y, 200, "Place", placeOpts, placeId.isBlank() || placeName(placeId).isEmpty() ? "No place" : placeName(placeId), placeId.isBlank() ? p.gray : p.teal,
			v -> { draft.addProperty("place", ""); for (JsonObject pl : Notebook.rows("coords")) if (placeLabel(pl).equals(v)) draft.addProperty("place", Notebook.str(pl, "id")); });
		if (!placeId.isBlank() && placeName(placeId).length() > 0) s.pill(bx + 206, y, 64, 20, placeId.equals(NbConfig.get().trackedPlace) ? "Tracking" : "Track", p.gray, () -> { NbConfig cf = NbConfig.get(); cf.trackedPlace = placeId; NbConfig.save(); s.rebuild(); }, true);
		else { Names.Spot here = Names.here(); s.pill(bx + 206, y, 130, 20, "New place here", p.gray, () -> {
			String nm = Notebook.str(draft, "name").isBlank() ? "New farm" : Notebook.str(draft, "name");
			JsonObject row = Notebook.placeRow(nm, "Farms", here);
			draft.addProperty("place", Notebook.str(row, "id")); Notebook.saveRow("coords", row); s.rebuild();
		}, here != null && Notebook.canEdit()); }
		y += 28;
		if (draft.has("file") && draft.get("file").isJsonObject()) {
			JsonObject f = draft.getAsJsonObject("file");
			final int fy = y;
			s.text("Litematica", s.cx, y + 6, p.mut);
			s.paint((g, mx, my) -> g.text(s.font(), Ui.clip(s.font(), Notebook.str(f, "name") + " (" + Math.max(1, f.get("size").getAsInt() / 1024) + " KB)", s.cw - 270), bx, fy + 6, p.ink, false));
			s.btn(s.cx + s.cw - 196, y, 90, "Download", 1, () -> Notebook.downloadFile(f, schematics()), Notebook.ok);
			s.btn(s.cx + s.cw - 100, y, 94, confirmFile ? "Really remove?" : "Remove file", 2, () -> {
				if (!confirmFile) { confirmFile = true; s.rebuild(); return; }
				if (isNew || uploadedHere.contains(Notebook.str(f, "id"))) Notebook.discardFile(Notebook.str(f, "id"));   // nothing else uses it yet
				draft.add("file", com.google.gson.JsonNull.INSTANCE);
				if (!isNew) Notebook.patchRow("farms", id, o -> o.add("file", com.google.gson.JsonNull.INSTANCE));
				confirmFile = false; s.rebuild();
			}, Notebook.canEdit());
		} else {
			s.text("Litematica", s.cx, y + 6, p.mut);
			s.btn(bx, y, 140, "Attach .litematic…", 1, () -> {
				try (var st = Files.isDirectory(schematics()) ? Files.list(schematics()) : java.util.stream.Stream.<Path>empty()) {
					found = st.filter(f -> f.getFileName().toString().toLowerCase().endsWith(".litematic")).sorted().toList();
				} catch (IOException e) { found = new ArrayList<>(); }
				picking = true; NotebookScreen.scroll = 0; s.rebuild();
			}, Notebook.canEdit());
			if (isNew) s.text("Removed if you cancel.", bx + 148, y + 6, p.mut);
		}

		int by = s.bottom - 20;
		s.btn(s.cx, by, 64, "Save", 0, () -> {
			String url = Notebook.str(draft, "tutorial");
			if (!url.isBlank() && Names.ytId(url) == null) { Notebook.msg("The tutorial link needs to be a YouTube link"); return; }
			if (Notebook.str(draft, "name").isBlank() && url.isBlank()) { Notebook.msg("Give the farm a name or a YouTube link"); return; }
			Notebook.autoLink(draft);
			uploadedHere.clear();   // the file now belongs to the saved farm
			Notebook.saveRow("farms", draft);   // fills in the video title (and the name, if blank) in the background
			draft = null; s.rebuild();
		}, Notebook.canEdit());
		if (!isNew) s.btn(s.cx + 70, by, 96, confirmDel ? "Really delete?" : "Delete", 2, () -> {
			if (!confirmDel) { confirmDel = true; s.rebuild(); return; }
			Notebook.deleteRow("farms", id);
			draft = null; confirmDel = false; s.rebuild();
		}, Notebook.canEdit());
		s.btn(s.cx + s.cw - 70, by, 64, "Back", 1, () -> { discardDraft(); draft = null; confirmDel = false; s.rebuild(); }, true);
	}

	/** Files uploaded while editing but not saved with the farm yet: deleted again if you back out (the server also sweeps leftovers after a crash). */
	static final java.util.Set<String> uploadedHere = new java.util.HashSet<>();

	static void discardDraft() {
		if (draft != null && draft.has("file") && draft.get("file").isJsonObject()) {
			String fid = Notebook.str(draft.getAsJsonObject("file"), "id");
			JsonObject saved = isNew ? null : Notebook.find("farms", Notebook.str(draft, "id"));
			boolean keep = saved != null && saved.has("file") && saved.get("file").isJsonObject() && Notebook.str(saved.getAsJsonObject("file"), "id").equals(fid);
			if (!keep && (isNew || uploadedHere.contains(fid))) Notebook.discardFile(fid);
		}
		uploadedHere.clear();
	}

	static String status(JsonObject f) { return Notebook.bool(f, "built") ? "Built" : Notebook.bool(f, "building") ? "Building" : "To build"; }
	static String nextStatus(String s) { return s.equals("To build") ? "Building" : s.equals("Building") ? "Built" : "To build"; }
	static void setStatus(JsonObject f, String s) { f.addProperty("built", s.equals("Built")); f.addProperty("building", s.equals("Building")); }
	static Ui.Tone tone(String st) { Ui.Pal p = Ui.pal(); return st.equals("Built") ? p.green : st.equals("Building") ? p.blue : p.gray; }
	static String placeName(String id) { JsonObject o = id.isBlank() ? null : Notebook.find("coords", id); return o == null ? "" : Notebook.str(o, "name").isBlank() ? "Unnamed place" : Notebook.str(o, "name"); }
	static String placeLabel(JsonObject o) { return Notebook.str(o, "name").isBlank() ? "Unnamed place" : Notebook.str(o, "name"); }
}