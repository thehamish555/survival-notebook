package dev.hamish.survivalnotebook;

import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

/**
 * The in-game notebook. This class is the shell (panel, tab bar, widgets, scrolling); each tab is built by a Page* class.
 * Vanilla buttons do the clicking, and we paint over them, so everything looks like one consistent UI.
 */
final class NotebookScreen extends Screen {
	static final String[] TABS = {"Home", "Places", "Map", "Enchants", "Deaths", "Stats", "To-Do", "Farms", "Shopping", "Notes", "Settings"};
	static final int HOME = 0, PLACES = 1, MAP = 2, GEAR = 3, DEATHS = 4, STATS = 5, TODO = 6, FARMS = 7, SHOPPING = 8, NOTES = 9, SETTINGS = 10;
	static int tab = -1, scroll, scrollMax;

	int x0, y0, pw, ph, sw, cx, cw, top, bottom;   // panel and content-area geometry
	private int seen;
	private boolean stale;
	private final List<EditBox> boxes = new ArrayList<>();
	private final List<Button> hits = new ArrayList<>();
	private final List<net.minecraft.client.gui.components.AbstractWidget> typing = new ArrayList<>();   // other text widgets (the big notes box)

	// dropdowns: one open at a time. Its options are drawn last, every other widget goes inactive, and a click anywhere else closes it.
	static String ddKey = "";
	static int ddScroll;
	private record Dd(String title, int x, int y, int w, List<String> opts, String cur, Consumer<String> pick, Button opener) { }
	private Dd openDd;

	private final Screen parent;   // e.g. Mod Menu, so Esc returns there

	NotebookScreen() { this(null); }

	NotebookScreen(Screen parent) {
		super(Component.literal("Survival Notebook"));
		this.parent = parent;
		NbConfig c = NbConfig.get();
		if (tab < 0) tab = c.connected() && !c.notebookId.isBlank() ? 0 : SETTINGS;   // first run -> Settings
	}

	@Override
	public void onClose() { if (!ddKey.isEmpty()) { ddKey = ""; this.rebuildWidgets(); return; } PageNotes.flush(); PageFarms.discardDraft(); if (parent != null) Compat.setScreen(parent); else super.onClose(); }

	Font font() { return this.font; }
	void rebuild() { this.rebuildWidgets(); }
	boolean dropdownOpen() { return openDd != null; }

	static void resetEditors() { PagePlaces.reset(); PageTodo.reset(); PageFarms.reset(); PageGear.reset(); PageDeaths.reset(); PageNotes.reset(); PageShopping.reset(); PageMap.reset(); PageStats.reset(); ddKey = ""; ddScroll = 0; PagePlaces.importing = false; PageFarms.picking = false; scroll = 0; }
	static String next(String cur, String[] opts) {
		for (int i = 0; i < opts.length; i++) if (opts[i].equals(cur)) return opts[(i + 1) % opts.length];
		return opts[0];
	}

	@Override
	protected void init() {
		pw = Math.min(this.width - 12, 760);
		ph = Math.min(this.height - 12, 420);
		x0 = (this.width - pw) / 2;
		y0 = (this.height - ph) / 2;
		sw = pw >= 540 ? 112 : 26;   // wide: icon + label sidebar; narrow: icons only (label shows on hover)
		cx = x0 + sw + 12; cw = pw - sw - 22; top = y0 + 38; bottom = y0 + ph - 22;
		seen = Notebook.version; stale = false; scrollMax = 0;
		boxes.clear(); hits.clear(); typing.clear(); zones.clear(); openDd = null;
		paint((g, mx, my) -> chrome(g));
		header();
		tabBar();
		switch (tab) {
			case HOME -> PageHome.build(this);
			case PLACES -> PagePlaces.build(this);
			case MAP -> PageMap.build(this);
			case GEAR -> PageGear.build(this);
			case DEATHS -> PageDeaths.build(this);
			case STATS -> PageStats.build(this);
			case TODO -> PageTodo.build(this);
			case FARMS -> PageFarms.build(this);
			case SHOPPING -> PageShopping.build(this);
			case NOTES -> PageNotes.build(this);
			default -> PageSettings.build(this);
		}
		scroll = Math.max(0, Math.min(scroll, scrollMax));
		dragPaint();
		bottomBar();
		if (openDd != null) overlay(openDd);
	}

	@Override
	public void tick() {
		if (PageMap.rebuildSoon) { PageMap.rebuildSoon = false; this.rebuildWidgets(); return; }
		if (seen != Notebook.version) stale = true;
		if (stale && boxes.stream().noneMatch(EditBox::isFocused) && typing.stream().noneMatch(w -> w.isFocused())) {   // fresh data arrived; don't rebuild while you're typing
			stale = false;
			seen = Notebook.version;
			this.rebuildWidgets();
		}
	}

	@Override
	public void extractBackground(GuiGraphicsExtractor g, int mouseX, int mouseY, float a) {
		super.extractBackground(g, mouseX, mouseY, a);
	}

	/** The panel, header and sidebar fills. Drawn as the first renderable (not in extractBackground) so item icons always land on top. */
	private void chrome(GuiGraphicsExtractor g) {
		Ui.Pal p = Ui.pal();
		g.fill(x0 - 2, y0 - 1, x0 + pw + 2, y0 + ph + 3, 0x22000000);          // soft shadow (two layers)
		g.fill(x0 - 1, y0 - 1, x0 + pw + 1, y0 + ph + 2, 0x44000000);
		Ui.bevel(g, x0, y0, pw, ph, p.panel, p.hi, p.lo, p.edge);
		for (int i = 0; i < 24; i++) g.fill(x0 + 1, y0 + 1 + i, x0 + pw - 1, y0 + 2 + i, Ui.mix(p.panel2, p.panel, i / 23f));   // header gradient
		g.fill(x0 + 1, y0 + 25, x0 + pw - 1, y0 + 26, p.edge);
		g.fill(x0 + 1, y0 + 1, x0 + pw - 1, y0 + 3, p.gold);                    // accent line
		g.fill(x0 + 1, y0 + 3, x0 + pw - 1, y0 + 4, (p.gold & 0x00FFFFFF) | 0x40000000);
		g.fill(x0 + 1, y0 + 26, x0 + sw + 1, y0 + ph - 17, p.panel2);           // sidebar
		g.fill(x0 + sw + 1, y0 + 26, x0 + sw + 2, y0 + ph - 17, p.edge);
		g.fill(x0 + sw + 2, y0 + 26, x0 + sw + 3, y0 + ph - 17, (p.hi & 0x00FFFFFF) | 0x30000000);
	}

	@Override
	public boolean mouseScrolled(double mouseX, double mouseY, double scrollX, double scrollY) {
		if (tab == MAP && openDd == null && PageMap.scroll(mouseX, mouseY, scrollY)) return true;
		if (openDd != null) {
			int max = Math.max(0, openDd.opts().size() - DD_ROWS);
			int n = Math.max(0, Math.min(max, ddScroll - (int) Math.signum(scrollY)));
			if (n != ddScroll) { ddScroll = n; this.rebuildWidgets(); }
			return true;
		}
		if (scrollMax > 0) {
			int n = Math.max(0, Math.min(scrollMax, scroll - (int) Math.signum(scrollY)));
			if (n != scroll) { scroll = n; this.rebuildWidgets(); }
			return true;
		}
		return super.mouseScrolled(mouseX, mouseY, scrollX, scrollY);
	}

	// The Map tab handles its own dragging and clicking inside the map area.
	@Override
	public boolean mouseClicked(net.minecraft.client.input.MouseButtonEvent e, boolean doubleClick) {
		if (tab == MAP && openDd == null && PageMap.owns(e.x(), e.y())) {   // 26.x numbers mouse buttons from 1 (SDL): left is 1, right is 3
			if (e.button() == com.mojang.blaze3d.platform.InputConstants.MOUSE_BUTTON_LEFT) PageMap.press(e.x(), e.y());
			else if (e.button() == com.mojang.blaze3d.platform.InputConstants.MOUSE_BUTTON_RIGHT) PageMap.rightPress(e.x(), e.y());
			return true;
		}
		return super.mouseClicked(e, doubleClick);
	}

	@Override
	public boolean mouseDragged(net.minecraft.client.input.MouseButtonEvent e, double dx, double dy) {
		if (tab == MAP && PageMap.drag(e.x(), e.y(), dx, dy)) return true;
		return super.mouseDragged(e, dx, dy);
	}

	@Override
	public boolean mouseReleased(net.minecraft.client.input.MouseButtonEvent e) {
		if (tab == MAP && (e.button() == com.mojang.blaze3d.platform.InputConstants.MOUSE_BUTTON_RIGHT ? PageMap.rightRelease(e.x(), e.y()) : PageMap.release(e.x(), e.y()))) return true;
		return super.mouseReleased(e);
	}

	// ---- chrome

	private static final String[] TAB_ICONS = {"home", "places", "map", "gear", "deaths", "stats", "todo", "farms", "shopping", "notes", "settings"};

	private void header() {
		paint((g, mx, my) -> {
			Ui.Pal p = Ui.pal();
			Compat.drawItem(g, "writable_book", x0 + 8, y0 + 6);
			g.text(font, "Survival Notebook", x0 + 28, y0 + 9, p.gold, false);
			int tx = x0 + 28 + font.width("Survival Notebook") + 6;
			g.text(font, "\u203A " + TABS[Math.min(tab, TABS.length - 1)], tx, y0 + 9, p.mut, false);
			String right = Ui.clip(font, Notebook.title, pw / 3);
			int rw = font.width(right) + 22, rx = x0 + pw - 8 - rw;
			Ui.rounded(g, rx, y0 + 6, rw, 15, p.panel, p.edge);
			g.fill(rx + 6, y0 + 11, rx + 11, y0 + 16, Notebook.live ? p.grassHi : 0xFFD9473A);   // live-sync light
			g.text(font, right, rx + 16, y0 + 10, p.ink, false);
		});
	}

	private void tabBar() {
		int n = TABS.length, rowH = Math.max(15, Math.min(22, (ph - 30 - 22) / n)), top = n - 1;   // Settings sits at the bottom
		final int[] ys = new int[n];
		for (int i = 0; i < n; i++) ys[i] = i < top ? y0 + 30 + i * rowH : y0 + ph - 17 - 6 - (n - i) * rowH;
		for (int i = 0; i < n; i++) {
			final int t = i, y = ys[i], h = rowH - 1, w = sw - 6, x = x0 + 4;
			hit(x, y, w, h, () -> { if (tab != t) { PageNotes.flush(); tab = t; resetEditors(); this.rebuildWidgets(); } }, true);
			paint((g, mx, my) -> {
				Ui.Pal p = Ui.pal();
				boolean on = tab == t, hov = Ui.over(mx, my, x, y, w, h);
				if (t == top) g.fill(x + 2, y - 4, x + w - 2, y - 3, p.edge);
				// raised button; the active one is pressed in with a gold edge
				if (on) { Ui.rounded(g, x, y, w, h, p.panel, p.gold); g.fill(x + 3, y + 1, x + w - 3, y + 2, p.lo); }
				else Ui.bevel(g, x, y, w, h, hov ? p.hover : p.row, p.hi, p.lo, p.edge);
				if (sw > 40) {
					g.text(font, TABS[t], x + 26, y + (h - 8) / 2 + 1, on ? p.gold : p.ink, false);
					String bd = badge(t);
					if (!bd.isEmpty()) { int bw = font.width(bd) + 8; Ui.rounded(g, x + w - bw - 4, y + (h - 11) / 2, bw, 11, on ? p.panel2 : p.panel, p.edge); g.text(font, bd, x + w - bw, y + (h - 8) / 2 + 1, on ? p.gold : p.mut, false); }
				}
				else if (hov) { int lw = font.width(TABS[t]) + 8; g.fill(x + w + 3, y, x + w + 3 + lw, y + h, p.panel2); g.outline(x + w + 3, y, lw, h, p.edge); g.text(font, TABS[t], x + w + 7, y + (h - 8) / 2 + 1, p.ink, false); }
			});
		}
		paint((g, mx, my) -> { for (int i = 0; i < n; i++) drawIcon(g, i, x0 + 12, ys[i] + (rowH - 1 - 10) / 2); });
	}

	private static void drawIcon(GuiGraphicsExtractor g, int i, int x, int y) {
		TabIcons.draw(g, TAB_ICONS[i], x, y);
	}

	/** Small count shown next to a sidebar entry. */
	static String badge(int t) {
		try {
			switch (t) {
				case PLACES: { int n = Notebook.list("coords").size(); return n > 0 ? String.valueOf(n) : ""; }
				case DEATHS: { int n = 0; for (var d : Notebook.rows("deaths")) if (!Notebook.bool(d, "recovered")) n++; return n > 0 ? String.valueOf(n) : ""; }
				case TODO: { int n = Notebook.todoList(true, false).size(); return n > 0 ? String.valueOf(n) : ""; }
				case FARMS: { int n = Notebook.list("farms").size(); return n > 0 ? String.valueOf(n) : ""; }
				case GEAR: { int n = Notebook.gear(Notebook.userId).size(); return n > 0 ? String.valueOf(n) : ""; }
				default: return "";
			}
		} catch (RuntimeException e) { return ""; }
	}

	/** Where the same view lives on the website: the matching tab of this notebook (or the account page for Settings). */
	String webUrl() {
		NbConfig c = NbConfig.get();
		if (tab == SETTINGS || c.notebookId.isBlank()) return c.web() + "/account";
		String[] slug = {"home", "coordinates", "map", "enchantments", "deaths", "stats", "todo", "farms", "shopping", "notes", "members"};
		String extra = tab == GEAR && !PageGear.uid.isBlank() ? "/" + PageGear.uid : "";
		return c.web() + "/n/" + c.notebookId + "#" + slug[Math.min(tab, slug.length - 1)] + extra;
	}

	private void bottomBar() {
		int linkW = font.width("Open on website \u2197") + 10;
		hit(x0 + pw - 12 - linkW, y0 + ph - 16, linkW, 13, () -> Compat.openUrl(this, webUrl()), true);
		paint((g, mx, my) -> {
			Ui.Pal p = Ui.pal();
			g.fill(x0 + 1, y0 + ph - 17, x0 + pw - 1, y0 + ph - 1, p.panel2);
			g.fill(x0 + 1, y0 + ph - 17, x0 + pw - 1, y0 + ph - 16, p.edge);
			boolean good = Notebook.ok;
			g.fill(x0 + 8, y0 + ph - 11, x0 + 13, y0 + ph - 6, good ? p.grassHi : 0xFFD9473A);
			g.text(font, Ui.clip(font, Notebook.status + (Notebook.live ? " · live" : ""), pw - 190), x0 + 18, y0 + ph - 13, good ? p.grassHi : 0xFFFF9B8E, false);
			String link = "Open on website \u2197";
			int lw = font.width(link) + 10, lx = x0 + pw - 12 - lw;
			boolean hov = Ui.over(mx, my, lx, y0 + ph - 16, lw, 13);
			g.text(font, link, lx + 5, y0 + ph - 13, hov ? p.gold : p.mut, false);
			if (hov) g.fill(lx + 5, y0 + ph - 4, lx + 5 + font.width(link), y0 + ph - 3, p.gold);
			if (scrollMax > 0) {   // scroll bar
				int trackH = bottom - top, thumb = Math.max(14, trackH * 4 / (scrollMax + 4)), ty = top + (trackH - thumb) * scroll / scrollMax;
				g.fill(x0 + pw - 6, top, x0 + pw - 3, bottom, p.panel2);
				g.fill(x0 + pw - 6, ty, x0 + pw - 3, ty + thumb, p.hi);
			}
		});
	}

	// ---- widget helpers used by the pages

	Button hit(int x, int y, int w, int h, Runnable r, boolean active) {
		Button b = Button.builder(Component.empty(), btn -> r.run()).bounds(x, y, w, h).build();
		b.active = active;
		Compat.invisible(b);
		hits.add(b);
		return this.addRenderableWidget(b);   // the vanilla look is painted over by whoever calls this
	}

	// ---- reorder: little up/down arrows in the left margin of a row (the order is shared with the website)

	private record Zone(String section, String id, int y, int h, boolean up, boolean down) { }
	private final List<Zone> zones = new ArrayList<>();

	/** Adds move-up / move-down arrows for the row at height y. prevId / nextId are the neighbouring rows ("" = none). Call BEFORE adding the row. */
	void reorder(String section, String id, String prevId, String nextId, int y, int h) {
		if (!Notebook.canEdit()) return;
		int half = h / 2;
		if (!prevId.isEmpty()) this.addRenderableWidget(arrowButton(y, half, () -> Notebook.moveRow(section, id, prevId)));
		if (!nextId.isEmpty()) this.addRenderableWidget(arrowButton(y + half, h - half, () -> Notebook.moveRow(section, id, nextId)));
		zones.add(new Zone(section, id, y, h, !prevId.isEmpty(), !nextId.isEmpty()));
	}

	private Button arrowButton(int y, int h, Runnable r) {
		Button b = Button.builder(Component.empty(), btn -> r.run()).bounds(cx - 10, y, 10, h).build();
		Compat.invisible(b);
		hits.add(b);
		return b;
	}

	private void dragPaint() {
		if (zones.isEmpty()) return;
		paint((g, mx, my) -> {
			Ui.Pal p = Ui.pal();
			for (Zone z : zones) {
				int half = z.h() / 2, mid = cx - 5;
				if (z.up()) { boolean hov = Ui.over(mx, my, cx - 10, z.y(), 10, half); int c = hov ? p.gold : p.mut, ty = z.y() + half / 2 - 2; for (int i = 0; i < 4; i++) g.fill(mid - i, ty + i, mid + i + 1, ty + i + 1, c); }
				if (z.down()) { boolean hov = Ui.over(mx, my, cx - 10, z.y() + half, 10, z.h() - half); int c = hov ? p.gold : p.mut, ty = z.y() + half + (z.h() - half) / 2 - 2; for (int i = 0; i < 4; i++) g.fill(mid - 3 + i, ty + i, mid + 4 - i, ty + i + 1, c); }
			}
		});
	}

	/** A softly rounded panel behind a group of fields (paint it BEFORE adding the fields so they sit on top). */
	void card(int x, int y, int w, int h) { paint((g, mx, my) -> { Ui.Pal p = Ui.pal(); Ui.rounded(g, x, y, w, h, p.rowAlt, p.edge); g.fill(x + 2, y + 1, x + w - 2, y + 2, p.hi); }); }

	void paint(Ui.Painter p) { this.addRenderableOnly((g, mx, my, a) -> p.paint(g, mx, my)); }

	void text(String s, int x, int y, int color) { paint((g, mx, my) -> g.text(font, s, x, y, color, false)); }
	void textRight(String s, int right, int y, int color) { paint((g, mx, my) -> g.text(font, s, right - font.width(s), y, color, false)); }

	void pill(int x, int y, int w, int h, String label, Ui.Tone tone, Runnable r, boolean active) {
		hit(x, y, w, h, r, active);
		paint((g, mx, my) -> Ui.tag(g, font, x, y, w, h, label, active ? tone : Ui.pal().gray, active && Ui.over(mx, my, x, y, w, h)));
	}

	private static final int DD_ROWS = 9, DD_ROW_H = 14;

	/** A labelled dropdown, e.g. "Category: Farms ▾". Opens a list of options instead of making you click through them. With exactly two options it becomes a swap button. */
	void dropdown(String id, int x, int y, int w, String label, List<String> opts, String cur, Ui.Tone tone, Consumer<String> pick) { dropdown(id, x, y, w, 20, label, opts, cur, tone, pick); }

	/** Same, with a custom height and no label when {@code label} is empty (for use inside list rows). */
	void dropdown(String id, int x, int y, int w, int h, String label, List<String> opts, String cur, Ui.Tone tone, Consumer<String> pick) {
		if (opts.size() == 2 && opts.contains(cur)) {   // two choices: one press swaps them, no list needed
			final String other = opts.get(0).equals(cur) ? opts.get(1) : opts.get(0), shown = (label.isEmpty() ? "" : label + ": ") + cur;
			hit(x, y, w, h, () -> { pick.accept(other); this.rebuildWidgets(); }, true);
			paint((g, mx, my) -> Ui.tag(g, font, x, y, w, h, Ui.clip(font, shown, w - 6), tone, Ui.over(mx, my, x, y, w, h)));
			return;
		}
		boolean open = ddKey.equals(id);
		String text = (label.isEmpty() ? "" : label + ": ") + cur + " \u25BE";
		Button opener = hit(x, y, w, h, () -> { ddKey = open ? "" : id; ddScroll = 0; this.rebuildWidgets(); }, true);
		paint((g, mx, my) -> Ui.tag(g, font, x, y, w, h, Ui.clip(font, text, w - 6), open ? Ui.pal().primary : tone, Ui.over(mx, my, x, y, w, h)));
		if (open) openDd = new Dd(label.isEmpty() ? "Choose" : label, x, y + h + 1, w, opts, cur, pick, opener);
	}

	private void overlay(Dd d) {
		for (Button b : hits) b.active = false;
		for (EditBox e : boxes) e.active = false;
		for (var w : typing) w.active = false;
		final int RH = 18, rows = Math.min(DD_ROWS, d.opts().size());
		int longest = 0;
		for (String o : d.opts()) longest = Math.max(longest, font.width(o));
		final int w = Math.max(170, Math.min(pw - 60, longest + 50)), h = 26 + rows * RH + (d.opts().size() > DD_ROWS ? 12 : 4) + 6;
		final int fx = x0 + (pw - w) / 2, fy = y0 + Math.max(8, (ph - h) / 2);
		for (int i = 0; i < rows; i++) {
			final int idx = ddScroll + i, ry = fy + 24 + i * RH;
			if (idx >= d.opts().size()) break;
			final String opt = d.opts().get(idx);
			this.addRenderableWidget(Button.builder(Component.empty(), btn -> { ddKey = ""; d.pick().accept(opt); this.rebuildWidgets(); }).bounds(fx + 4, ry, w - 8, RH).build());
		}
		Button scrim = Button.builder(Component.empty(), btn -> { ddKey = ""; this.rebuildWidgets(); }).bounds(0, 0, this.width, this.height).build();   // click outside = close
		Compat.invisible(scrim);
		this.addRenderableWidget(scrim);
		final String title = d.title().isEmpty() ? "Choose" : d.title();
		this.addRenderableOnly((g, mx, my, a) -> {
			Ui.Pal p = Ui.pal();
			g.fill(0, 0, this.width, this.height, 0xA0000000);   // dim everything behind the menu
			g.fill(fx - 1, fy + 2, fx + w + 3, fy + h + 3, 0x66000000);
			Ui.bevel(g, fx, fy, w, h, p.panel, p.hi, p.lo, p.edge);
			g.fill(fx + 1, fy + 1, fx + w - 1, fy + 3, p.gold);
			g.text(font, title, fx + 8, fy + 9, p.gold, false);
			g.fill(fx + 4, fy + 21, fx + w - 4, fy + 22, p.edge);
			for (int i = 0; i < rows && ddScroll + i < d.opts().size(); i++) {
				String opt = d.opts().get(ddScroll + i);
				int ry = fy + 24 + i * RH;
				boolean on = opt.equals(d.cur()), hov = Ui.over(mx, my, fx + 4, ry, w - 8, RH);
				Ui.rounded(g, fx + 4, ry, w - 8, RH - 1, hov ? p.hover : on ? p.panel2 : p.row, on ? p.gold : hov ? p.hover : p.rowAlt);
				g.text(font, Ui.clip(font, opt, w - 36), fx + 12, ry + 5, on ? p.gold : p.ink, false);
				if (on) g.text(font, "\u2713", fx + w - 18, ry + 5, p.gold, false);
			}
			if (d.opts().size() > DD_ROWS) g.text(font, "Scroll for more. Click outside to close.", fx + 8, fy + 26 + rows * RH, p.mut, false);
		});
	}

	/** kind: 0 primary (green), 1 secondary, 2 danger */
	void btn(int x, int y, int w, String label, int kind, Runnable r, boolean active) {
		Ui.Pal p = Ui.pal();
		pill(x, y, w, 20, label, kind == 0 ? p.primary : kind == 2 ? p.danger : p.secondary, r, active);
	}

	/** A striped list row; only the first hitW pixels are clickable so a button at the right edge still gets its clicks. */
	void row(int x, int y, int w, int h, int hitW, int index, Runnable onClick) {
		if (onClick != null) hit(x, y, hitW, h, onClick, true);
		paint((g, mx, my) -> {
			Ui.Pal p = Ui.pal();
			boolean hov = onClick != null && Ui.over(mx, my, x, y, hitW, h);
			Ui.rounded(g, x, y, w, h, hov ? p.hover : p.row, hov ? p.hover : p.rowAlt);
			if (hov) g.fill(x + 1, y + 2, x + 3, y + h - 2, p.gold);   // accent bar on hover
		});
	}

	/** Draws word-wrapped text inside a width; returns how many pixels tall it ended up. */
	int wrap(String text, int x, int y, int w, int color) {
		List<String> lines = new ArrayList<>();
		StringBuilder cur = new StringBuilder();
		for (String word : text.split(" ")) {
			String next = cur.length() == 0 ? word : cur + " " + word;
			if (font.width(next) > w && cur.length() > 0) { lines.add(cur.toString()); cur = new StringBuilder(word); } else { cur = new StringBuilder(next); }
		}
		if (cur.length() > 0) lines.add(cur.toString());
		for (int i = 0; i < lines.size(); i++) { final String l = lines.get(i); text(l, x, y + i * 10, color); }
		return lines.size() * 10;
	}

	private static String refocus = "";

	/** A text box that re-filters as you type: the page rebuilds after every change and the box keeps its focus. */
	EditBox searchBox(String id, int x, int y, int w, String hint, String value, Consumer<String> onChange) {
		EditBox e = box(x, y, w, hint, value, v -> { onChange.accept(v); refocus = id; net.minecraft.client.Minecraft.getInstance().execute(this::rebuildWidgets); });
		if (id.equals(refocus)) { Compat.focus(this, e); refocus = ""; }
		return e;
	}

	/** A search box at the right edge of the controls row; returns its x so a count can sit to its left. */
	int searchRight(String id, int y, int w, String value, Consumer<String> onChange) {
		int x = cx + cw - 8 - w;
		searchBox(id, x, y, w, "Search", value, onChange);
		return x;
	}

	static boolean has(String query, String... fields) {
		if (query == null || query.isBlank()) return true;
		String q = query.trim().toLowerCase();
		for (String f : fields) if (f != null && f.toLowerCase().contains(q)) return true;
		return false;
	}

	EditBox box(int x, int y, int w, String hint, String value, Consumer<String> onChange) {
		EditBox e = new EditBox(this.font, x, y, w, 20, Component.literal(hint));
		e.setHint(Component.literal(hint));
		e.setMaxLength(200);
		e.setValue(value);
		e.setResponder(onChange);
		boxes.add(e);
		return this.addRenderableWidget(e);
	}

	/** Adds a big multi-line text box; null if this Minecraft version doesn't offer one. */
	net.minecraft.client.gui.components.AbstractWidget bigText(int x, int y, int w, int h, String hint, String value, Consumer<String> onChange) {
		var b = Compat.multiLine(this.font, x, y, w, h, hint, value, onChange);
		if (b == null) return null;
		typing.add(b);
		return this.addRenderableWidget(b);
	}

	void setScroll(int total, int visible) { scrollMax = Math.max(0, total - visible); scroll = Math.max(0, Math.min(scroll, scrollMax)); }
}