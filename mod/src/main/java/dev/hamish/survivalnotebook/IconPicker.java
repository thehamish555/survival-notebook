package dev.hamish.survivalnotebook;

import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.List;

/** Full-page icon chooser shared by to-dos and farms: every item in the game, alphabetical, filtered live as you type. */
final class IconPicker {
	private IconPicker() { }

	static String query = "";

	static void reset() { query = ""; }

	/** Draws the picker for {@code draft}'s "icon" field. {@code done} is called when the person picks, clears or goes back. */
	static void build(NotebookScreen s, JsonObject draft, Runnable done) {
		Ui.Pal p = Ui.pal();
		int y = s.top;
		s.text("Pick an icon", s.cx, y + 2, p.gold);
		s.searchBox("icon-search", s.cx + 80, y - 5, s.cw - 160, "Search, e.g. pickaxe, chest, wheat", query, v -> { query = v; NotebookScreen.scroll = 0; });
		y += 22;
		final String q = query.trim().toLowerCase().replace(' ', '_');
		final List<String> shown = new ArrayList<>();
		for (String n : Compat.allItemIds()) if (q.isEmpty() || n.contains(q)) shown.add(n);   // already alphabetical
		final int cell = 24, cols = Math.max(4, (s.cw - 10) / cell), rowsVis = Math.max(1, (s.bottom - 26 - y) / cell);
		s.setScroll((shown.size() + cols - 1) / cols, rowsVis);
		final String cur = Notebook.str(draft, "icon");
		if (shown.isEmpty()) s.text("No matching items.", s.cx + 2, y + 4, p.mut);
		final int gy = y;
		for (int i = 0; i < rowsVis * cols; i++) {
			int idx = NotebookScreen.scroll * cols + i;
			if (idx >= shown.size()) break;
			final String n = shown.get(idx);
			final int ix = s.cx + (i % cols) * cell, iy = gy + (i / cols) * cell;
			s.hit(ix, iy, cell - 1, cell - 1, () -> { draft.addProperty("icon", n); done.run(); }, true);
			s.paint((g, mx, my) -> {
				Ui.rounded(g, ix, iy, cell - 1, cell - 1, n.equals(cur) ? p.gold : Ui.over(mx, my, ix, iy, cell - 1, cell - 1) ? p.hover : p.row, n.equals(cur) ? p.gold : p.row);
				Compat.drawItem(g, n, ix + 2, iy + 2);
			});
		}
		// name of the item under the mouse + how many match
		final int by = s.bottom - 20;
		s.paint((g, mx, my) -> {
			String hint = shown.size() + (shown.size() == 1 ? " item" : " items");
			for (int i = 0; i < rowsVis * cols; i++) {
				int idx = NotebookScreen.scroll * cols + i;
				if (idx >= shown.size()) break;
				if (Ui.over(mx, my, s.cx + (i % cols) * cell, gy + (i / cols) * cell, cell - 1, cell - 1)) { hint = Names.titleCase(shown.get(idx)); break; }
			}
			g.text(s.font(), hint, s.cx + 100, by + 6, p.mut, false);
		});
		s.btn(s.cx, by, 90, "No icon", 1, () -> { draft.addProperty("icon", ""); done.run(); }, true);
		s.btn(s.cx + s.cw - 70, by, 64, "Back", 1, done, true);
	}
}
