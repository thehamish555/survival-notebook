package dev.hamish.survivalnotebook;

import com.google.gson.JsonObject;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Everyone's enchanted gear, per item. Each item shows what it has, what you want on it (purple), what it could still get (outlined +)
 * and what you switched off for it (red, click to bring back). Planned items are things you're working towards: they merge into the
 * real item when it shows up in your inventory.
 */
final class PageGear {
	private PageGear() { }

	static String uid = "", detail = "", pick = "";
	static String pGroup = "Weapons", pKind = "", pVar = "", aliasText = "";
	static int mode;   // 0 items, 1 book list
	static boolean needsOnly, confirmDel, creating;

	static void reset() { bulkKey = ""; detail = ""; pick = ""; confirmDel = false; creating = false; aliasText = ""; }

	static String roman(int n) { String[] r = {"", "I", "II", "III", "IV", "V"}; return n >= 0 && n < r.length ? r[n] : String.valueOf(n); }

	/** "Sharpness V"; just "Mending" when the enchant tops out at I. */
	static String disp(String name, int level) {
		String key = Enchants.KEY_BY_NAME.get(name);
		var d = key == null ? null : Enchants.ENCH.get(key);
		return Enchants.lvl(name, level, d == null ? level : d.max());
	}

	static String itemName(JsonObject o) {
		String a = Notebook.str(o, "alias");
		if (!a.isBlank()) return a;
		String n = Notebook.str(o, "name");
		return n.isBlank() ? Names.pretty(Enchants.itemPath(o)) : n;
	}

	static Enchants.Result analyse(JsonObject o) { return Enchants.analyseItem(o); }

	// ---- chips

	/** kind: own | goal | missing | off | more */
	record Chip(String label, Ui.Tone tone, int x, int y, int w, String key, String kind) { }

	private static boolean selectable(Chip c) { return c.key() != null && !c.kind().equals("more"); }

	/** Lays enchant chips out in rows. Anything that doesn't fit in maxLines collapses into one tidy "+N more" tag at the end of the last row. */
	static List<Chip> layout(Font f, int x, int y, int maxW, JsonObject item, Enchants.Result r, int maxLines) {
		Ui.Pal p = Ui.pal();
		Map<String, Integer> goal = Enchants.levelMap(item, "goal");
		List<Object[]> all = new ArrayList<>();   // label, tone, key, kind
		for (Enchants.Owned o : r.owned()) {
			Ui.Tone t = switch (o.state()) { case "max" -> p.green; case "low" -> p.yellow; case "curse" -> p.red; default -> p.gray; };
			boolean wanted = goal.containsKey(o.name());
			all.add(new Object[] {disp(o.name(), o.level()) + (o.state().equals("low") ? " - " + roman(o.max()) : ""), t, wanted ? o.name() : null, wanted ? "goal" : "own"});
		}
		for (Enchants.Missing m : r.goals()) all.add(new Object[] {"\u2605 " + disp(m.name(), m.max()), p.purple, m.name(), "goal"});
		for (Enchants.Missing m : r.missing()) all.add(new Object[] {"+ " + disp(m.name(), m.max()), null, m.key(), "missing"});
		for (Enchants.Missing m : r.off()) all.add(new Object[] {"   " + m.name(), p.red, m.key(), "off"});

		List<Chip> out = new ArrayList<>();
		int px = x, line = 0;
		for (Object[] c : all) {
			int w = f.width((String) c[0]) + 8;
			if (px + w > x + maxW && px > x) { line++; px = x; }
			out.add(new Chip((String) c[0], (Ui.Tone) c[1], px, y + line * 14, w, (String) c[2], (String) c[3]));
			px += w + 4;
		}
		int lastLine = out.isEmpty() ? 0 : (out.get(out.size() - 1).y() - y) / 14;
		if (lastLine < maxLines) return out;

		List<Chip> kept = new ArrayList<>();
		for (Chip c : out) if ((c.y() - y) / 14 < maxLines) kept.add(c);
		while (!kept.isEmpty()) {
			Chip last = kept.get(kept.size() - 1);
			String label = "+" + (out.size() - kept.size()) + " more";
			int w = f.width(label) + 8;
			boolean sameLine = (last.y() - y) / 14 == maxLines - 1;
			if (sameLine && last.x() + last.w() + 4 + w <= x + maxW) { kept.add(new Chip(label, p.gray, last.x() + last.w() + 4, last.y(), w, null, "more")); return kept; }
			if (!sameLine) { kept.add(new Chip(label, p.gray, x, y + (maxLines - 1) * 14, w, null, "more")); return kept; }
			kept.remove(kept.size() - 1);
		}
		String label = "+" + out.size() + " more";
		kept.add(new Chip(label, p.gray, x, y, f.width(label) + 8, null, "more"));
		return kept;
	}

	static int lines(List<Chip> chips, int y) { return chips.isEmpty() ? 1 : (chips.get(chips.size() - 1).y() - y) / 14 + 1; }

	static void draw(GuiGraphicsExtractor g, Font f, List<Chip> chips, String selected, int mx, int my) {
		Ui.Pal p = Ui.pal();
		for (Chip c : chips) {
			boolean sel = c.key() != null && c.key().equals(selected);
			if (c.tone() != null) {
				Ui.tag(g, f, c.x(), c.y(), c.w(), 12, c.label(), c.tone(), sel || (selectable(c) && !selected.isEmpty() && Ui.over(mx, my, c.x(), c.y(), c.w(), 12)));
				if (c.kind().equals("off")) noIcon(g, c.x() + 4, c.y() + 2, c.tone().fg());
				if (sel) g.outline(c.x() - 1, c.y() - 1, c.w() + 2, 14, p.gold);
				continue;
			}
			boolean hov = selectable(c) && !selected.isEmpty() && Ui.over(mx, my, c.x(), c.y(), c.w(), 12);
			if (sel || hov) g.fill(c.x(), c.y(), c.x() + c.w(), c.y() + 12, p.hover);
			g.outline(c.x(), c.y(), c.w(), 12, sel ? p.gold : p.hi);
			g.text(f, c.label(), c.x() + 4, c.y() + 3, sel ? p.ink : p.mut, false);
		}
	}

	private static final String[] NO = {"..XXXX..", ".X....X.", "X....X.X", "X...X..X", "X..X...X", "X.X....X", ".X....X.", "..XXXX.."};

	/** An 8x8 "forbidden" sign (circle with a slash), drawn from pixels so it scales with the text instead of being a tiny glyph. */
	static void noIcon(GuiGraphicsExtractor g, int x, int y, int color) {
		for (int r = 0; r < 8; r++) for (int c = 0; c < 8; c++) if (NO[r].charAt(c) == 'X') g.fill(x + c, y + r, x + c + 1, y + r + 1, color);
	}

	/** The key under the chips: what each colour means. */
	static void legend(NotebookScreen s, int x, int y) {
		s.paint((g, mx, my) -> {
			Ui.Pal p = Ui.pal();
			Font f = s.font();
			Object[][] items = {{"Max", p.green}, {"Below max", p.yellow}, {"Curse", p.red}, {"+ Needed", null}, {"   Off", p.red}};
			int px = x;
			for (Object[] it : items) {
				String label = (String) it[0];
				int w = f.width(label) + 10;
				if (it[1] != null) { Ui.tag(g, f, px, y, w, 12, label, (Ui.Tone) it[1], false); if (label.startsWith("   ")) noIcon(g, px + 4, y + 2, ((Ui.Tone) it[1]).fg()); }
				else { g.outline(px, y, w, 12, p.hi); g.text(f, label, px + 5, y + 3, p.mut, false); }
				px += w + 5;
			}
		});
	}

	private static Ui.Tone statusTone(Enchants.Result r) { Ui.Pal p = Ui.pal(); return !r.known() ? p.gray : r.done() ? p.green : p.amber; }
	private static String statusLabel(Enchants.Result r) { return !r.known() ? "?" : r.done() ? "Maxed" : r.remaining() + " to go"; }

	/** "planned" / "stored" tag text for an item, or "". */
	private static String tagOf(JsonObject o) { return Notebook.bool(o, "plan") ? "planned" : Notebook.bool(o, "away") ? "stored" : ""; }

	// ---- screens

	static String query = "";

	static void build(NotebookScreen s) {
		Ui.Pal p = Ui.pal();
		if (uid.isBlank() || Notebook.memberName(uid).isBlank()) uid = Notebook.userId;
		if (!detail.isBlank()) { detail(s); return; }
		if (creating) { planner(s); return; }
		int y = s.top, x = s.cx;
		List<String> names = new ArrayList<>();
		for (JsonObject m : Notebook.memberList()) names.add(Notebook.str(m, "name") + (Notebook.str(m, "id").equals(Notebook.userId) ? " (you)" : ""));
		String curName = Notebook.memberName(uid) + (uid.equals(Notebook.userId) ? " (you)" : "");
		s.dropdown("gear-player", x, y, 150, "Player", names, curName, p.amber, pickName -> {
			for (JsonObject m : Notebook.memberList()) if ((Notebook.str(m, "name") + (Notebook.str(m, "id").equals(Notebook.userId) ? " (you)" : "")).equals(pickName)) uid = Notebook.str(m, "id");
			NotebookScreen.scroll = 0;
		});
		x += 156;
		s.dropdown("gear-show", x, y, 112, "Show", List.of("All items", "Needs work"), needsOnly ? "Needs work" : "All items", p.gray, v -> { needsOnly = v.equals("Needs work"); NotebookScreen.scroll = 0; });
		x += 118;
		s.dropdown("gear-mode", x, y, 112, "View", List.of("Items", "Book list"), mode == 0 ? "Items" : "Book list", p.gray, v -> { mode = v.equals("Items") ? 0 : 1; NotebookScreen.scroll = 0; });
		boolean mine = uid.equals(Notebook.userId);
		if (mine) {
			s.btn(s.cx + s.cw - 84, y, 78, "Sync now", 1, () -> Notebook.syncGear(GearScanner.scan(), true), Notebook.canEdit());
			s.btn(s.cx + s.cw - 168, y, 78, "+ Add item", 0, () -> { creating = true; pKind = ""; pVar = ""; s.rebuild(); }, Notebook.canEdit());
		}
		y += 26;
		s.searchBox("gear-q", s.cx, y, 200, "Search items or enchants", query, v -> { query = v; NotebookScreen.scroll = 0; });
		y += 26;

		List<JsonObject> all = Notebook.gear(uid), items = new ArrayList<>();
		for (JsonObject o : all) if ((!needsOnly || !analyse(o).done()) && NotebookScreen.has(query, itemName(o), String.join(" ", Enchants.levelMap(o, "enchants").keySet()), String.join(" ", Enchants.levelMap(o, "goal").keySet()))) items.add(o);
		if (mode == 1) bookList(s, all, y); else itemList(s, items, y);
	}

	private static void itemList(NotebookScreen s, List<JsonObject> items, int listTop) {
		Ui.Pal p = Ui.pal();
		int rowH = 34, vis = Math.max(1, (s.bottom - listTop) / rowH), rowW = s.cw - 10;
		s.setScroll(items.size(), vis);
		if (items.isEmpty()) s.text(uid.equals(Notebook.userId) ? "No enchanted gear yet." : "No gear here yet.", s.cx + 4, listTop + 6, p.mut);
		for (int i = 0; i < vis && NotebookScreen.scroll + i < items.size(); i++) {
			JsonObject o = items.get(NotebookScreen.scroll + i);
			final int ry = listTop + i * rowH;
			final String id = Notebook.str(o, "id"), name = itemName(o), path = Enchants.itemPath(o), tg = tagOf(o);
			final Enchants.Result r = analyse(o);
			final String kind = Enchants.kindOf(path);
			s.row(s.cx, ry, rowW, rowH - 1, rowW, i, () -> { detail = id; pick = ""; confirmDel = false; aliasText = Notebook.str(o, "alias"); NotebookScreen.scroll = 0; s.rebuild(); });
			s.paint((g, mx, my) -> {
				Compat.drawItem(g, path, s.cx + 5, ry + 9);
				int tx = s.cx + 26;
				int nameW = Math.min(s.font().width(name), rowW - 150);
				g.text(s.font(), Ui.clip(s.font(), name, rowW - 150), tx, ry + 4, p.ink, false);
				int ex = tx + 6 + nameW;
				if (kind != null && !name.equalsIgnoreCase(Enchants.KINDS.get(kind).label())) { g.text(s.font(), Ui.clip(s.font(), Enchants.KINDS.get(kind).label(), 70), ex, ry + 4, p.mut, false); ex += 6 + Math.min(70, s.font().width(Enchants.KINDS.get(kind).label())); }
				if (!tg.isEmpty()) Ui.tag(g, s.font(), ex, ry + 3, s.font().width(tg) + 8, 11, tg, p.purple, false);
				Ui.tag(g, s.font(), s.cx + rowW - 62, ry + 3, 58, 12, statusLabel(r), statusTone(r), false);
				draw(g, s.font(), layout(s.font(), tx, ry + 17, rowW - 32, o, r, 1), "", mx, my);
			});
		}
	}

	private static void bookList(NotebookScreen s, List<JsonObject> items, int listTop) {
		Ui.Pal p = Ui.pal();
		Map<String, int[]> need = new LinkedHashMap<>();   // name -> {level, count}
		for (JsonObject o : items) {
			Enchants.Result r = analyse(o);
			for (Enchants.Owned ow : r.owned()) if (ow.state().equals("low")) need.computeIfAbsent(ow.name(), k -> new int[] {ow.max(), 0})[1]++;
			for (Enchants.Missing m : r.goals()) need.computeIfAbsent(m.name(), k -> new int[] {m.max(), 0})[1]++;
			for (Enchants.Missing m : r.missing()) if (!m.alt()) need.computeIfAbsent(m.name(), k -> new int[] {m.max(), 0})[1]++;
		}
		List<Map.Entry<String, int[]>> rows = new ArrayList<>(need.entrySet());
		rows.sort((a, b) -> b.getValue()[1] - a.getValue()[1] != 0 ? b.getValue()[1] - a.getValue()[1] : a.getKey().compareTo(b.getKey()));
		int vis = Math.max(1, (s.bottom - listTop - 14) / 16);
		s.setScroll(rows.size(), vis);
		s.text(rows.isEmpty() ? "Nothing needed right now." : "Enchanted books you still need:", s.cx + 2, listTop, p.mut);
		for (int i = 0; i < vis && NotebookScreen.scroll + i < rows.size(); i++) {
			Map.Entry<String, int[]> e = rows.get(NotebookScreen.scroll + i);
			final int ry = listTop + 14 + i * 16;
			final String label = disp(e.getKey(), e.getValue()[0]), count = "x" + e.getValue()[1];
			s.row(s.cx, ry, s.cw - 10, 15, s.cw - 10, i, null);
			s.paint((g, mx, my) -> {
				g.text(s.font(), label, s.cx + 6, ry + 4, p.purple.fg(), false);
				g.text(s.font(), count, s.cx + s.cw - 16 - s.font().width(count), ry + 4, p.mut, false);
			});
		}
	}

	// ---- plan a new item

	private static void planner(NotebookScreen s) {
		Ui.Pal p = Ui.pal();
		int y = s.top;
		s.text("Pick an item you plan to make.", s.cx, y - 1, p.mut);
		y += 16;
		List<String> kinds = new ArrayList<>();
		for (var k : Enchants.KINDS.values()) if (k.group().equals(pGroup)) kinds.add(k.label());
		if (pKind.isEmpty() || !kinds.contains(pKind)) pKind = kinds.isEmpty() ? "" : kinds.get(0);
		Enchants.Kind kind = null;
		for (var k : Enchants.KINDS.values()) if (k.label().equals(pKind)) kind = k;
		s.dropdown("plan-group", s.cx, y, 130, "Group", List.of("Weapons", "Tools", "Armor", "Other"), pGroup, p.gray, v -> { pGroup = v; pKind = ""; pVar = ""; });
		s.dropdown("plan-kind", s.cx + 136, y, 150, "Type", kinds, pKind, p.gray, v -> { pKind = v; pVar = ""; });
		List<String> vars = new ArrayList<>();
		if (kind != null) for (String[] v : kind.variants()) vars.add(v[0]);
		if (pVar.isEmpty() || !vars.contains(pVar)) pVar = vars.isEmpty() ? "" : vars.get(0);
		if (vars.size() > 1) s.dropdown("plan-var", s.cx + 292, y, 140, "Material", vars, pVar, p.gray, v -> pVar = v);
		final Enchants.Kind fk = kind;
		final String fvar = pVar;
		s.btn(s.cx, s.bottom - 20, 90, "Create", 0, () -> {
			if (fk == null) return;
			String path = null;
			for (String[] v : fk.variants()) if (v[0].equals(fvar)) path = v[1];
			if (path == null) return;
			Notebook.planItem(path, vars.size() > 1 ? fvar + " " + fk.label() : fk.label());
			creating = false; s.rebuild();
		}, kind != null && Notebook.canEdit());
		s.btn(s.cx + s.cw - 70, s.bottom - 20, 64, "Back", 1, () -> { creating = false; s.rebuild(); }, true);
	}

	// ---- one item

	private static void detail(NotebookScreen s) {
		Ui.Pal p = Ui.pal();
		JsonObject o = null;
		for (JsonObject g : Notebook.gear(uid)) if (Notebook.str(g, "id").equals(detail)) o = g;
		if (o == null) { detail = ""; build(s); return; }
		final JsonObject item = o;
		final Enchants.Result r = analyse(o);
		final String path = Enchants.itemPath(o), name = itemName(o), kind = Enchants.kindOf(path), tg = tagOf(o);
		final boolean mine = uid.equals(Notebook.userId) && Notebook.canEdit();
		final boolean synced = Notebook.bool(o, "mod") || Notebook.bool(o, "away"), plan = Notebook.bool(o, "plan");
		final String id = Notebook.str(o, "id");
		int y = s.top;
		s.paint((g, mx, my) -> {
			Compat.drawItem(g, path, s.cx, y - 4);
			g.text(s.font(), name, s.cx + 22, y, p.gold, true);
			int ex = s.cx + 28 + s.font().width(name);
			if (kind != null) { g.text(s.font(), Enchants.KINDS.get(kind).label(), ex, y, p.mut, false); ex += 6 + s.font().width(Enchants.KINDS.get(kind).label()); }
			if (!tg.isEmpty()) Ui.tag(g, s.font(), ex, y - 1, s.font().width(tg) + 8, 11, tg, p.purple, false);
			Ui.tag(g, s.font(), s.cx + s.cw - 64, y - 2, 60, 13, statusLabel(r), statusTone(r), false);
		});
		final int cy = y + 20;
		final List<Chip> chips = layout(s.font(), s.cx, cy, s.cw - 6, item, r, 6);
		s.card(s.cx - 6, cy - 6, s.cw + 2, lines(chips, cy) * 14 + 12);
		if (mine) for (Chip c : chips) if (selectable(c)) {
			final String key = c.key(), kd = c.kind();
			s.hit(c.x(), c.y(), c.w(), 12, () -> {
				if (kd.equals("missing") || kd.equals("off")) {   // simple on/off switch; nothing to select first
					final boolean nowOff = kd.equals("missing");
					Notebook.toggleOff(id, key);
					bulkKey = key; bulkOff = nowOff; bulkItem = id; pick = "";
				} else { pick = pick.equals(key) ? "" : key; bulkKey = ""; }
				s.rebuild();
			}, true);
		}
		s.paint((g, mx, my) -> draw(g, s.font(), chips, pick, mx, my));
		int ly = cy + lines(chips, cy) * 14 + 12;
		if (mine) { s.text("Click an enchant to switch it on or off for this item.", s.cx, ly, p.mut); ly += 14; }
		legend(s, s.cx, ly);
		ly += 20;

		if (mine && !bulkKey.isEmpty() && bulkItem.equals(id)) {   // after a toggle: offer to do the same on your other items
			final List<String> others = Notebook.othersWith(id, bulkKey, bulkOff);
			final String bk = bulkKey, bn = enchName(bulkKey);
			final boolean bo = bulkOff;
			if (others.isEmpty()) bulkKey = "";
			else {
				String label = (bo ? "Switch off " : "Switch on ") + ellipsis(bn) + " for " + others.size() + " other item" + (others.size() == 1 ? "" : "s");
				int bw = Math.min(s.cw - 8, s.font().width(label) + 16);
				s.btn(s.cx, ly, bw, label, bo ? 2 : 0, () -> { Notebook.setOffMany(others, bk, bo); bulkKey = ""; s.rebuild(); }, true);
				s.text("Applies to the other items too.", s.cx + bw + 6, ly + 6, p.mut);
				ly += 24;
			}
		}
		if (mine && !pick.isEmpty()) {
			Chip sel = null;
			for (Chip c : chips) if (pick.equals(c.key())) sel = c;
			if (sel == null) pick = "";
			else {
				final String key = pick, kd = sel.kind();
				final String ename = kd.equals("missing") || kd.equals("off") ? enchName(key) : key;
				int bx = s.cx;
				switch (kd) {
					case "missing" -> {
						if (!synced && !plan) { s.btn(bx, ly, 110, "Add " + ellipsis(ename), 0, () -> { final int mx = maxOf(ename); Notebook.patchGear(id, g -> { var en = g.has("enchants") && g.get("enchants").isJsonObject() ? g.getAsJsonObject("enchants") : new JsonObject(); en.addProperty(ename, mx); g.add("enchants", en); }); pick = ""; }, true); bx += 116; }
						s.btn(bx, ly, 130, "Don't need it", 1, () -> { Notebook.toggleOff(id, key); pick = ""; }, true);
						bx += 136;
					}
					case "off" -> { s.btn(bx, ly, 130, "Track it again", 0, () -> { Notebook.toggleOff(id, key); pick = ""; }, true); bx += 136; }
					case "goal" -> { s.btn(bx, ly, 130, "Remove old goal", 2, () -> { Notebook.dropGoal(id, key); pick = ""; }, true); bx += 136; }
					default -> { }
				}
				s.text(kd.equals("off") ? "Switched off for this item." : kd.equals("missing") ? "Still needed." : "", bx, ly + 6, p.mut);
				ly += 24;
			}
		}
		if (mine && (synced || plan)) {
			s.box(s.cx, ly, 190, "Nickname (e.g. my good sword)", aliasText, v -> aliasText = v);
			s.btn(s.cx + 196, ly, 56, "Save", 1, () -> Notebook.setAlias(id, aliasText), true);
			ly += 26;
		}
		final int ny = ly;
		s.paint((g, mx, my) -> {
			if (Notebook.bool(item, "mod")) g.text(s.font(), "Synced from your inventory.", s.cx, ny, p.mut, false);
			else if (Notebook.bool(item, "away")) g.text(s.font(), "Not in your inventory right now.", s.cx, ny, p.mut, false);
			else if (plan) g.text(s.font(), "Planned item.", s.cx, ny, p.mut, false);
			else if (!r.known()) g.text(s.font(), "Set the item type on the website to see its enchants.", s.cx, ny, p.mut, false);
		});
		int by = s.bottom - 20;
		s.btn(s.cx + s.cw - 70, by, 64, "Back", 1, () -> { detail = ""; pick = ""; confirmDel = false; s.rebuild(); }, true);
		boolean own = uid.equals(Notebook.userId) && !Notebook.bool(o, "mod");
		if (own) s.btn(s.cx, by, 96, confirmDel ? "Really delete?" : "Delete", 2, () -> {
			if (!confirmDel) { confirmDel = true; s.rebuild(); return; }
			Notebook.deleteRow("gear:" + uid, detail);
			detail = ""; confirmDel = false; s.rebuild();
		}, Notebook.canEdit());
	}

	private static String bulkKey = "", bulkItem = "";
	private static boolean bulkOff;

	private static String ellipsis(String n) { return n.length() > 12 ? n.substring(0, 11) + "\u2026" : n; }
	private static String enchName(String key) { var d = Enchants.ENCH.get(key); return d == null ? Names.titleCase(key) : d.name(); }
	private static int maxOf(String name) { String k = Enchants.KEY_BY_NAME.get(name); var d = k == null ? null : Enchants.ENCH.get(k); return d == null ? 1 : d.max(); }
}
