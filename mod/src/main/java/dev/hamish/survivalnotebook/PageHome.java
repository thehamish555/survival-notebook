package dev.hamish.survivalnotebook;

import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.List;

/** Overview: counts, what's assigned to you, recent activity. */
final class PageHome {
	private PageHome() { }

	/** Which tab and icon an activity entry's section belongs to (the same as the website). */
	private static int tabFor(String section) {
		return switch (section) { case "coords" -> NotebookScreen.PLACES; case "todos" -> NotebookScreen.TODO; case "farms" -> NotebookScreen.FARMS; case "gear" -> NotebookScreen.GEAR;
			case "deaths" -> NotebookScreen.DEATHS; case "notes" -> NotebookScreen.NOTES; case "members" -> NotebookScreen.SETTINGS; default -> -1; };
	}
	private static String iconFor(String section) {
		return switch (section) { case "coords" -> "places"; case "todos" -> "todo"; case "farms" -> "farms"; case "gear" -> "gear"; case "deaths" -> "deaths"; case "members" -> "members"; default -> "notes"; };
	}

	static void build(NotebookScreen s) {
		Ui.Pal p = Ui.pal();
		int y = s.top;
		if (!Notebook.ok) {
			s.text(Notebook.status, s.cx, y + 4, 0xFFFF9B8E);
			s.text("Open Settings and paste a token to connect.", s.cx, y + 20, p.mut);
			s.text("You can make one on the website's Account page.", s.cx, y + 32, p.mut);
			return;
		}
		List<JsonObject> farms = Notebook.rows("farms"), todos = Notebook.rows("todos");
		long built = farms.stream().filter(o -> Notebook.bool(o, "built")).count(), done = todos.stream().filter(o -> Notebook.str(o, "progress").equals("Done")).count();
		List<JsonObject> mine = Notebook.gear(Notebook.userId), deaths = Notebook.rows("deaths");
		long planned = mine.stream().filter(o -> Notebook.bool(o, "plan")).count(), lost = deaths.stream().filter(o -> !Notebook.bool(o, "recovered")).count();
		int words = Notebook.notes().isBlank() ? 0 : Notebook.notes().trim().split("\\s+").length;
		int withStats = 0;
		for (JsonObject m : Notebook.memberList()) if (!Notebook.list("stats:" + Notebook.str(m, "id")).isEmpty()) withStats++;
		// label, value, icon, tab to open (-1 = none)
		Object[][] tiles = {
			{"Places", String.valueOf(Notebook.list("coords").size()), "places", NotebookScreen.PLACES}, {"Items tracked", String.valueOf(mine.size() - planned), "gear", NotebookScreen.GEAR}, {"Items planned", String.valueOf(planned), "gear", NotebookScreen.GEAR},
			{"Not recovered", String.valueOf(lost), "deaths", NotebookScreen.DEATHS}, {"To-dos done", done + "/" + todos.size(), "todo", NotebookScreen.TODO}, {"Farms built", built + "/" + farms.size(), "farms", NotebookScreen.FARMS},
			{"Notes", words == 0 ? "Empty" : words + " words", "notes", NotebookScreen.NOTES}, {"Players with stats", String.valueOf(withStats), "stats", NotebookScreen.STATS}, {"Members", String.valueOf(Notebook.members.size()), "members", NotebookScreen.SETTINGS}};
		int tw = (s.cw - 22) / 3;
		for (int i = 0; i < tiles.length; i++) {
			final int x = s.cx + (i % 3) * (tw + 6), yy = y + (i / 3) * 37, target = (Integer) tiles[i][3];
			final String label = (String) tiles[i][0], value = (String) tiles[i][1], icon = (String) tiles[i][2];
			if (target >= 0) s.hit(x, yy, tw, 34, () -> { PageSettings.cat = target == NotebookScreen.SETTINGS ? "Members" : PageSettings.cat; NotebookScreen.tab = target; NotebookScreen.resetEditors(); s.rebuild(); }, true);
			s.paint((g, mx, my) -> {
				boolean hov = target >= 0 && Ui.over(mx, my, x, yy, tw, 34);
				Ui.bevel(g, x, yy, tw, 34, hov ? p.hover : p.row, p.hi, p.lo, p.edge);
				g.fill(x + 2, yy + 2, x + 4, yy + 32, p.gold);
				g.text(s.font(), Ui.clip(s.font(), label, tw - 40), x + 9, yy + 7, p.mut, false);
				g.text(s.font(), value, x + 9, yy + 19, p.ink, false);
				TabIcons.draw(g, icon, x + tw - 26, yy + 7, 2);
			});
		}
		y += 3 * 37 + 5;

		s.text("Assigned to you", s.cx, y, p.gold);
		y += 12;
		int shown = 0;
		for (JsonObject t : todos) {
			if (shown >= 3 || y + 18 > s.bottom - 70) break;
			if (!(Notebook.userId.equals(Notebook.str(t, "assignee")) || Notebook.memberName(Notebook.str(t, "assignee")).isEmpty()) || Notebook.str(t, "progress").equals("Done")) continue;   // unassigned = for all users
			final String id = Notebook.str(t, "id"), name = Notebook.str(t, "project"), prog = Notebook.str(t, "progress"), pr = Notebook.str(t, "priority");
			final int yy = y;
			s.row(s.cx, y, s.cw, 17, s.cw, shown, () -> { PageTodo.open(id); NotebookScreen.tab = NotebookScreen.TODO; s.rebuild(); });
			s.paint((g, mx, my) -> {
				Ui.Tone pt = Ui.priority(pr);
				g.fill(s.cx + 4, yy + 3, s.cx + 7, yy + 14, pt.fg());
				g.text(s.font(), Ui.clip(s.font(), name.isBlank() ? "Untitled to-do" : name, s.cw - 120), s.cx + 12, yy + 5, p.ink, false);
				Ui.tag(g, s.font(), s.cx + s.cw - 78, yy + 2, 74, 13, prog, Ui.progress(prog), false);
			});
			y += 18; shown++;
		}
		for (JsonObject f : farms) {
			if (shown >= 4 || y + 18 > s.bottom - 70) break;
			if (!Notebook.userId.equals(Notebook.str(f, "assignee")) || Notebook.bool(f, "built")) continue;
			final String id = Notebook.str(f, "id"), name = Notebook.str(f, "name");
			final int yy = y;
			s.row(s.cx, y, s.cw, 17, s.cw, shown, () -> { PageFarms.open(id); NotebookScreen.tab = NotebookScreen.FARMS; s.rebuild(); });
			s.paint((g, mx, my) -> {
				g.fill(s.cx + 4, yy + 3, s.cx + 7, yy + 14, p.green.fg());
				g.text(s.font(), Ui.clip(s.font(), name.isBlank() ? "Unnamed farm" : name, s.cw - 120), s.cx + 12, yy + 5, p.ink, false);
				Ui.tag(g, s.font(), s.cx + s.cw - 78, yy + 2, 74, 13, "To build", p.gray, false);
			});
			y += 18; shown++;
		}
		if (shown == 0) { s.text("Nothing assigned to you right now.", s.cx + 4, y + 2, p.mut); y += 14; }

		y += 8;
		String track = TodoHud.trackLine();
		if (!track.isEmpty()) { s.text("Tracking: " + track, s.cx, y, p.amber.fg()); y += 14; }

		s.text("Recent activity", s.cx, y, p.gold);
		y += 12;
		List<JsonObject> acts = new ArrayList<>();
		for (var e : Notebook.activity) if (e.isJsonObject()) acts.add(e.getAsJsonObject());
		int n = 0;
		for (JsonObject a : acts) {
			if (y + 15 > s.bottom) break;
			String who = Notebook.str(a, "name"), what = Notebook.str(a, "text"), section = Notebook.str(a, "section");
			final boolean inGame = Notebook.str(a, "via").equals("mod");
			long ts = a.has("ts") ? a.get("ts").getAsLong() : 0;
			final int yy = y, target = tabFor(section);
			final String icon = iconFor(section);
			s.row(s.cx, yy, s.cw, 14, s.cw, n, target < 0 ? null : () -> { if (target == NotebookScreen.SETTINGS) PageSettings.cat = "Members"; NotebookScreen.tab = target; NotebookScreen.resetEditors(); s.rebuild(); });
			s.paint((g, mx, my) -> {
				String ago = Ui.ago(ts);
				TabIcons.draw(g, icon, s.cx + 4, yy + 2, 1);
				int tagW = inGame ? s.font().width("in game") + 8 : 0, room = s.cw - s.font().width(ago) - tagW - 30;
				String line = Ui.clip(s.font(), who + " " + what, room);
				int wx = s.cx + 18;
				g.text(s.font(), line, wx, yy + 3, p.mut, false);
				g.text(s.font(), Ui.clip(s.font(), who, room), wx, yy + 3, p.ink, false);   // the name stands out, like the website's bold
				if (inGame) { int tx = wx + Math.min(s.font().width(line), room) + 6; Ui.tag(g, s.font(), tx, yy + 1, tagW, 12, "in game", p.green, false); }
				g.text(s.font(), ago, s.cx + s.cw - s.font().width(ago) - 4, yy + 3, p.mut, false);
			});
			y += 15; n++;
		}
		if (n == 0) s.text("Nothing yet.", s.cx + 4, y, p.mut);
	}
}
