package dev.hamish.survivalnotebook;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * The notebook's shared notes: a big text box, same text as the website's Notes tab. Typing is kept locally and saved with the Save button
 * (and automatically when you switch tab or close the screen), so it never saves on every keystroke. If this Minecraft version has no big
 * text box available, it falls back to editing line by line.
 */
final class PageNotes {
	private PageNotes() { }

	static String text;         // what's in the box right now (null = nothing loaded yet)
	static boolean dirty;
	static int editing = -1;    // line-by-line fallback
	static String newLine = "", editText = "";

	static void reset() { editing = -1; newLine = ""; editText = ""; }

	/** Saves unsaved typing; called when leaving the tab or closing the screen. */
	static void flush() { if (dirty && text != null && Notebook.canEdit()) { Notebook.saveNotes(text); } dirty = false; text = null; }

	static void build(NotebookScreen s) {
		Ui.Pal p = Ui.pal();
		boolean can = Notebook.canEdit();
		if (text == null || !dirty) text = Notebook.notes();   // follow changes from the website until you start typing
		int bh = s.bottom - s.top - 26;
		if (can) s.card(s.cx - 6, s.top - 6, s.cw + 2, bh + 12);
		var box = can ? s.bigText(s.cx, s.top, s.cw - 10, bh, "Anything about this world…", text, v -> { text = v; dirty = true; }) : null;
		if (can && box == null) { lines(s); return; }
		if (!can) {   // read-only view
			final List<String> all = Arrays.asList(Notebook.notes().split("\n", -1));
			int vis = Math.max(1, bh / 11);
			s.setScroll(all.size(), vis);
			s.paint((g, mx, my) -> {
				g.fill(s.cx, s.top, s.cx + s.cw - 8, s.top + bh, p.row);
				for (int i = 0; i < vis && NotebookScreen.scroll + i < all.size(); i++) g.text(s.font(), Ui.clip(s.font(), all.get(NotebookScreen.scroll + i), s.cw - 24), s.cx + 6, s.top + 6 + i * 11, p.ink, false);
			});
			return;
		}
		int by = s.bottom - 20;
		s.btn(s.cx, by, 70, "Save", 0, () -> { if (text != null) Notebook.saveNotes(text); dirty = false; Notebook.msg("Notes saved"); s.rebuild(); }, true);
		s.paint((g, mx, my) -> {
			String st = dirty ? "Unsaved. Saves when you leave this tab." : "Saved";
			g.text(s.font(), st, s.cx + 78, by + 6, dirty ? p.amber.fg() : p.mut, false);
			String cnt = (text == null ? 0 : text.length()) + " / 100000";
			g.text(s.font(), cnt, s.cx + s.cw - 12 - s.font().width(cnt), by + 6, p.mut, false);
		});
	}

	// ---- fallback: line by line

	private static List<String> lines() {
		String t = Notebook.notes();
		return t.isEmpty() ? new ArrayList<>() : new ArrayList<>(Arrays.asList(t.split("\n", -1)));
	}

	private static void save(List<String> l) { Notebook.saveNotes(String.join("\n", l)); }

	private static void lines(NotebookScreen s) {
		Ui.Pal p = Ui.pal();
		int y = s.top;
		final List<String> all = lines();
		boolean can = Notebook.canEdit();
		s.box(s.cx, y, s.cw - 56, "Add a note line", newLine, v -> newLine = v);
		s.btn(s.cx + s.cw - 50, y, 44, "Add", 0, () -> {
			if (newLine.isBlank()) return;
			List<String> l = lines(); l.add(newLine.trim()); newLine = ""; save(l); s.rebuild();
		}, can);
		y += 26;
		int rowH = 18, vis = Math.max(1, (s.bottom - y) / rowH), rowW = s.cw - 10;
		s.setScroll(all.size(), vis);
		for (int i = 0; i < vis && NotebookScreen.scroll + i < all.size(); i++) {
			final int idx = NotebookScreen.scroll + i, ry = y + i * rowH;
			final String line = all.get(idx);
			if (editing == idx) {
				s.box(s.cx, ry - 1, rowW - 94, "Edit line", editText, v -> editText = v);
				s.btn(s.cx + rowW - 90, ry - 1, 44, "Save", 0, () -> { List<String> l = lines(); if (idx < l.size()) { l.set(idx, editText.trim()); save(l); } editing = -1; s.rebuild(); }, can);
				s.btn(s.cx + rowW - 44, ry - 1, 44, "Cancel", 1, () -> { editing = -1; s.rebuild(); }, true);
				continue;
			}
			s.row(s.cx, ry, rowW, rowH - 1, rowW - 22, i, can ? () -> { editing = idx; editText = line; s.rebuild(); } : null);
			s.paint((g, mx, my) -> g.text(s.font(), Ui.clip(s.font(), line.isEmpty() ? " " : line, rowW - 34), s.cx + 6, ry + 5, p.ink, false));
			s.pill(s.cx + rowW - 18, ry + 1, 16, 15, "✕", p.danger, () -> { List<String> l = lines(); if (idx < l.size()) { l.remove(idx); save(l); } s.rebuild(); }, can);
		}
	}
}
