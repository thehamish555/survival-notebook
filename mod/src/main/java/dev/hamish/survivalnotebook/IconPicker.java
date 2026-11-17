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
		final int gy = y, first = NotebookScreen.scroll * cols, count = Math.max(0, Math.min(rowsVis * cols, shown.size() - first));
		final int box = cell - 2, pad = (box - 16) / 2;   // the 16px item sits in the middle of its box
		s.hit(s.cx, gy, cols * cell, rowsVis * cell, () -> {
			var mc = net.minecraft.client.Minecraft.getInstance();
			int i = at(mc.mouseHandler.getScaledXPos(mc.getWindow()) - s.cx, mc.mouseHandler.getScaledYPos(mc.getWindow()) - gy, cell, cols);
			if (i >= 0 && i < count) { draft.addProperty("icon", shown.get(first + i)); done.run(); }
		}, true);
		s.paint((g, mx, my) -> {
			int hov = at(mx - s.cx, my - gy, cell, cols);
			for (int i = 0; i < count; i++) {
				String n = shown.get(first + i);
				int ix = s.cx + (i % cols) * cell, iy = gy + (i / cols) * cell;
				boolean picked = n.equals(cur);
				Ui.rounded(g, ix, iy, box, box, picked ? p.gold : i == hov ? p.hover : p.row, picked ? p.gold : p.row);
				Compat.drawItem(g, n, ix + pad, iy + pad);
			}
		});
		// name of the item under the mouse + how many match
		final int by = s.bottom - 20;
		s.paint((g, mx, my) -> {
			String hint = shown.size() + (shown.size() == 1 ? " item" : " items");
			int i = at(mx - s.cx, my - gy, cell, cols);
			if (i >= 0 && i < count) hint = Names.titleCase(shown.get(first + i));
			g.text(s.font(), hint, s.cx + 100, by + 6, p.mut, false);
		});
		s.btn(s.cx, by, 90, "No icon", 1, () -> { draft.addProperty("icon", ""); done.run(); }, true);
		s.btn(s.cx + s.cw - 70, by, 64, "Back", 1, done, true);
	}

	/** Which cell of the grid a point falls in (-1 if it's in a gap or outside). */
	private static int at(double x, double y, int cell, int cols) {
		if (x < 0 || y < 0) return -1;
		int c = (int) (x / cell), r = (int) (y / cell);
		if (c >= cols || x - c * cell >= cell - 2 || y - r * cell >= cell - 2) return -1;
		return r * cols + c;
	}
}
