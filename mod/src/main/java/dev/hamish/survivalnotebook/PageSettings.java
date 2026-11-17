package dev.hamish.survivalnotebook;

import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.List;

/** Connection (token, server, notebook), in-game options and theme. Laid out in 24px rows so it scrolls on small screens. */
final class PageSettings {
	private PageSettings() { }

	static String tokenText = "";
	static String cat = "Connection";
	private static final String[] CATS = {"Connection", "Members", "Overlays", "Sync & privacy", "Appearance"};
	private static final int ROW = 26;

	private static String onOff(boolean b) { return b ? "on" : "off"; }

	/** One toggle row: a label with a short hint and an on/off button. */
	private static void toggle(NotebookScreen s, int y, String label, String hint, boolean on, Runnable flip) {
		Ui.Pal p = Ui.pal();
		s.row(s.cx, y - 1, s.cw - 8, ROW - 2, 0, 0, null);   // y-1 .. y+23: the text and the pill are centred on y+11
		s.paint((g, mx, my) -> {
			g.fill(s.cx + 1, y + 2, s.cx + 4, y + 20, on ? p.green.fg() : p.mut);
			g.text(s.font(), label, s.cx + 10, y + 2, p.ink, false);
			g.text(s.font(), Ui.clip(s.font(), hint, s.cw - 110), s.cx + 10, y + 13, p.mut, false);
		});
		s.pill(s.cx + s.cw - 84, y + 3, 66, 16, on ? "On" : "Off", on ? p.green : p.gray, () -> { flip.run(); NbConfig.save(); s.rebuild(); }, true);
	}

	static void build(NotebookScreen s) {
		NbConfig c = NbConfig.get();
		Ui.Pal p = Ui.pal();
		int y = s.top;
		s.dropdown("settings-cat", s.cx, y, 150, "Category", List.of(CATS), cat, p.amber, v -> { cat = v; NotebookScreen.scroll = 0; });
		y += 28;
		if (cat.equals("Members")) { PageMembers.build(s, y); return; }
		int visible = Math.max(1, (s.bottom - y) / ROW);
		int rows = switch (cat) { case "Connection" -> 5; case "Overlays" -> 4; case "Sync & privacy" -> 9; default -> 3; };
		s.setScroll(rows, visible);
		final int base = y - NotebookScreen.scroll * ROW, first = NotebookScreen.scroll;
		java.util.function.IntPredicate show = r -> r >= first && r < first + visible;

		if (cat.equals("Connection")) s.card(s.cx - 6, y - 6, s.cw + 2, Math.min(rows, visible) * ROW + 6);
		switch (cat) {
			case "Connection" -> {
				if (show.test(0)) {
					s.box(s.cx, base, s.cw - 112, c.connected() ? "Token saved (" + c.tokenHint() + "). Paste to replace" : "Paste your token (snp_…)", tokenText, v -> tokenText = v);
					s.btn(s.cx + s.cw - 104, base, 96, "Save & connect", 0, () -> {
						if (!tokenText.isBlank()) { c.token = tokenText.trim(); tokenText = ""; }
						NbConfig.save(); Notebook.connect(); s.rebuild();
					}, true);
				}
				if (show.test(1)) {
					List<String> nbNames = new ArrayList<>();
					for (var e : Notebook.notebooks) nbNames.add(Notebook.str(e.getAsJsonObject(), "title"));
					s.dropdown("settings-nb", s.cx, base + ROW, s.cw - 8, "Notebook", nbNames, c.notebookTitle.isBlank() ? "(none)" : c.notebookTitle, p.blue, v -> {
						for (var e : Notebook.notebooks) { JsonObject o = e.getAsJsonObject(); if (Notebook.str(o, "title").equals(v)) Notebook.pickNotebook(Notebook.str(o, "id"), v); }
					});
				}
				if (show.test(2)) s.btn(s.cx, base + 2 * ROW, 110, "Reconnect", 1, () -> { Notebook.connect(); s.rebuild(); }, c.connected());
				if (show.test(3)) {
					int t = (s.cw - 12) / 2;
					s.btn(s.cx, base + 3 * ROW, t, "Get a token ↗", 1, () -> Compat.openUrl(s, c.web() + "/account"), true);
					s.btn(s.cx + t + 4, base + 3 * ROW, t, "My notebook ↗", 1, () -> Compat.openUrl(s, c.notebookId.isBlank() ? c.web() : c.web() + "/n/" + c.notebookId), c.connected());
				}
				if (show.test(4)) s.text(c.connected() ? "Connected." : "Paste a token and press Save & connect.", s.cx + 2, base + 4 * ROW + 6, p.mut);
			}
			case "Overlays" -> {
				if (show.test(0)) toggle(s, base, "To-do overlay", "Shows your to-dos in a corner", c.hud, () -> c.hud = !c.hud);
				if (show.test(1)) toggle(s, base + ROW, "Overlay shows everyone's to-dos", "Off shows only yours", !c.hudMineOnly, () -> c.hudMineOnly = !c.hudMineOnly);
				if (show.test(2)) toggle(s, base + 2 * ROW, "Enchants needed list", "Items you're making and missing enchants", c.hudGoals, () -> c.hudGoals = !c.hudGoals);
				if (show.test(3)) toggle(s, base + 3 * ROW, "Compass arrow", "Points to the place you're tracking", c.compass, () -> c.compass = !c.compass);
			}
			case "Sync & privacy" -> {
				if (show.test(0)) toggle(s, base, "Auto-sync gear", "Keeps your gear list up to date", c.autoSyncGear, () -> c.autoSyncGear = !c.autoSyncGear);
				if (show.test(1)) toggle(s, base + ROW, "Save deaths", "Adds an entry when you die", c.autoSaveDeaths, () -> c.autoSaveDeaths = !c.autoSaveDeaths);
				if (show.test(2)) toggle(s, base + 2 * ROW, "Track death spot", "Points the compass at where you died", c.autoTrackDeath, () -> c.autoTrackDeath = !c.autoTrackDeath);
				if (show.test(3)) toggle(s, base + 3 * ROW, "Auto-recover", "Marks a death recovered when you return", c.autoRecover, () -> c.autoRecover = !c.autoRecover);
				if (show.test(4)) toggle(s, base + 4 * ROW, "Share stats", "Your vanilla statistics only", c.shareStats, () -> c.shareStats = !c.shareStats);
				if (show.test(5)) toggle(s, base + 5 * ROW, "Notebook per world", "Uses a notebook named after the world or server", c.worldNotebooks, () -> c.worldNotebooks = !c.worldNotebooks);
				if (show.test(6)) toggle(s, base + 6 * ROW, "Share inventory", "For the shopping list. Includes shulker boxes and bundles", c.shareInventory, () -> c.shareInventory = !c.shareInventory);
				if (show.test(7)) toggle(s, base + 7 * ROW, "Share map", "Draws a map of where you explore on the website", c.shareMap, () -> { c.shareMap = !c.shareMap; if (!c.shareMap) MapRecorder.reset(); });
				if (show.test(8)) toggle(s, base + 8 * ROW, "Share position", "Shows your team where you are on the map, live", c.sharePosition, () -> { c.sharePosition = !c.sharePosition; if (!c.sharePosition) Players.forget(); });
			}
			default -> {
				if (show.test(0)) s.dropdown("settings-theme", s.cx, base, 180, "Theme", List.of("Dark", "Light"), c.lightTheme ? "Light" : "Dark", p.gray, v -> { c.lightTheme = v.equals("Light"); NbConfig.save(); s.rebuild(); });
				if (show.test(1)) s.text("This only changes the mod.", s.cx + 2, base + ROW + 6, p.mut);
				if (show.test(2)) toggle(s, base + 2 * ROW, "Sounds", "Plays a sound when you save or delete", c.sounds, () -> c.sounds = !c.sounds);
			}
		}
	}
}
