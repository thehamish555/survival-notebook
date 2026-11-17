package dev.hamish.survivalnotebook;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** Where each death happened and what was lost, so you can go and get it back. Same data as the website's Deaths tab. */
final class PageDeaths {
	private PageDeaths() { }

	static String detail = "", filter = "All";
	static boolean confirmDel;
	private static final String[] FILTERS = {"All", "Lost", "Recovered"};

	static void reset() { detail = ""; confirmDel = false; }

	static long ts(JsonObject d) { return d.has("ts") ? d.get("ts").getAsLong() : 0; }

	/** "Overworld 120 64 -33" for the first dimension with coordinates. */
	static String spot(JsonObject d) {
		for (String k : new String[] {"ow", "nether", "end"}) {
			String v = Notebook.str(d, k);
			if (!v.isBlank()) return (k.equals("ow") ? "Overworld " : k.equals("nether") ? "Nether " : "End ") + v;
		}
		return "unknown spot";
	}

	static void build(NotebookScreen s) { if (!detail.isBlank()) detail(s); else list(s); }

	private static void list(NotebookScreen s) {
		Ui.Pal p = Ui.pal();
		int y = s.top;
		s.dropdown("deaths-filter", s.cx, y, 130, "Show", List.of(FILTERS), filter, filter.equals("All") ? p.gray : filter.equals("Lost") ? p.red : p.green, v -> { filter = v; NotebookScreen.scroll = 0; });
		List<JsonObject> all = new ArrayList<>();
		for (JsonObject d : Notebook.rows("deaths")) {
			boolean rec = Notebook.bool(d, "recovered");
			if (filter.equals("Lost") && rec || filter.equals("Recovered") && !rec) continue;
			all.add(d);
		}
		all.sort(Comparator.comparingLong(PageDeaths::ts).reversed());
		s.textRight(all.size() + (all.size() == 1 ? " death" : " deaths"), s.cx + s.cw - 8, y + 6, p.mut);

		int listTop = y + 26, rowH = 30, vis = Math.max(1, (s.bottom - listTop) / rowH), rowW = s.cw - 10;
		s.setScroll(all.size(), vis);
		if (all.isEmpty()) s.text("No deaths recorded yet.", s.cx + 4, listTop + 6, p.mut);
		for (int i = 0; i < vis && NotebookScreen.scroll + i < all.size(); i++) {
			JsonObject d = all.get(NotebookScreen.scroll + i);
			final int ry = listTop + i * rowH;
			final String id = Notebook.str(d, "id"), who = Notebook.memberName(Notebook.str(d, "uid")), cause = Notebook.str(d, "cause");
			final boolean rec = Notebook.bool(d, "recovered"), tracked = id.equals(NbConfig.get().trackedPlace);
			final String when = Ui.ago(ts(d)), where = spot(d), bearing = Names.bearing(d);
			s.row(s.cx, ry, rowW, rowH - 1, rowW - 66, i, () -> { detail = id; confirmDel = false; NotebookScreen.scroll = 0; s.rebuild(); });
			s.paint((g, mx, my) -> {
				g.fill(s.cx + 1, ry + 3, s.cx + 4, ry + rowH - 4, rec ? p.green.fg() : p.red.fg());
				Compat.drawItem(g, rec ? "totem_of_undying" : "skeleton_skull", s.cx + 9, ry + 6);
				Ui.tag(g, s.font(), s.cx + rowW - 128, ry + 6, 62, 15, rec ? "Recovered" : "Lost", rec ? p.green : p.red, false);
				String head = (tracked ? "> " : "") + (who.isBlank() ? "Someone" : who) + " · " + when;
				g.text(s.font(), Ui.clip(s.font(), head, rowW - 170), s.cx + 30, ry + 6, tracked ? p.amber.fg() : p.ink, false);
				String sub = (cause.isBlank() ? where : where + " · " + cause);
				g.text(s.font(), Ui.clip(s.font(), bearing == null ? sub : bearing + " · " + sub, rowW - 170), s.cx + 30, ry + 17, p.mut, false);
			});
			s.pill(s.cx + rowW - 62, ry + 6, 58, 17, tracked ? "Tracking" : "Track", tracked ? p.amber : p.gray, () -> { NbConfig c = NbConfig.get(); c.trackedPlace = tracked ? "" : id; NbConfig.save(); s.rebuild(); }, true);
		}
	}

	private static void detail(NotebookScreen s) {
		Ui.Pal p = Ui.pal();
		JsonObject d = Notebook.find("deaths", detail);
		if (d == null) { detail = ""; build(s); return; }
		final String id = detail, cause = Notebook.str(d, "cause"), who = Notebook.memberName(Notebook.str(d, "uid"));
		final boolean rec = Notebook.bool(d, "recovered"), tracked = id.equals(NbConfig.get().trackedPlace);
		final int items = d.has("items") ? d.get("items").getAsInt() : 0, xp = d.has("xp") ? d.get("xp").getAsInt() : 0;
		int y = s.top;
		final String head = (who.isBlank() ? "Someone" : who) + " died " + Ui.ago(ts(d)), where = spot(d), bearing = Names.bearing(d);
		s.paint((g, mx, my) -> {
			g.text(s.font(), head, s.cx, y, p.gold, true);
			Ui.tag(g, s.font(), s.cx + s.cw - 74, y - 2, 70, 13, rec ? "Recovered" : "Lost", rec ? p.green : p.red, false);
			g.text(s.font(), where + (bearing == null ? "" : "   ·   " + bearing + " from you"), s.cx, y + 14, p.ink, false);
			if (!cause.isBlank()) g.text(s.font(), Ui.clip(s.font(), cause, s.cw), s.cx, y + 27, p.mut, false);
			g.text(s.font(), items + " item stack" + (items == 1 ? "" : "s") + (xp > 0 ? "  ·  level " + xp : "") + "  ·  " + Deaths.HHMM.format(Instant.ofEpochMilli(ts(d))), s.cx, y + 40, p.mut, false);
		});
		int ey = y + 56;
		List<JsonObject> en = new ArrayList<>();
		if (d.has("enchanted") && d.get("enchanted").isJsonArray()) for (JsonElement e : d.getAsJsonArray("enchanted")) if (e.isJsonObject()) en.add(e.getAsJsonObject());
		int vis = Math.max(1, (s.bottom - 26 - ey) / 18);
		s.setScroll(en.size(), vis);
		if (en.isEmpty()) s.text("No enchanted items were lost.", s.cx, ey + 2, p.mut);
		for (int i = 0; i < vis && NotebookScreen.scroll + i < en.size(); i++) {
			JsonObject e = en.get(NotebookScreen.scroll + i);
			final int ry = ey + i * 18;
			final String item = Notebook.str(e, "item"), nm = Notebook.str(e, "name"), sum = Notebook.str(e, "summary");
			s.row(s.cx, ry, s.cw - 10, 17, s.cw - 10, i, null);
			s.paint((g, mx, my) -> {
				Compat.drawItem(g, item, s.cx + 2, ry);
				g.text(s.font(), Ui.clip(s.font(), nm, 150), s.cx + 22, ry + 5, p.ink, false);
				g.text(s.font(), Ui.clip(s.font(), sum, s.cw - 200), s.cx + 178, ry + 5, p.purple.fg(), false);
			});
		}
		int by = s.bottom - 20;
		s.btn(s.cx, by, 84, tracked ? "Stop tracking" : "Track it", tracked ? 1 : 0, () -> { NbConfig c = NbConfig.get(); c.trackedPlace = tracked ? "" : id; NbConfig.save(); s.rebuild(); }, true);
		s.btn(s.cx + 90, by, 96, rec ? "Mark as lost" : "Recovered", 1, () -> {
			Notebook.patchRow("deaths", id, o -> o.addProperty("recovered", !rec));
			if (!rec && tracked) { NbConfig c = NbConfig.get(); c.trackedPlace = ""; NbConfig.save(); }
		}, Notebook.canEdit());
		s.btn(s.cx + 192, by, 96, confirmDel ? "Really delete?" : "Delete", 2, () -> {
			if (!confirmDel) { confirmDel = true; s.rebuild(); return; }
			Notebook.deleteRow("deaths", id);
			detail = ""; confirmDel = false; s.rebuild();
		}, Notebook.canEdit());
		s.btn(s.cx + s.cw - 70, by, 64, "Back", 1, () -> { detail = ""; confirmDel = false; s.rebuild(); }, true);
	}
}
