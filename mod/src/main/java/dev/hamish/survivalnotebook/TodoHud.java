package dev.hamish.survivalnotebook;

import com.google.gson.JsonObject;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;

import java.util.List;

/** Small always-on overlay: your open to-dos and the enchants you still need. Toggle with the "Toggle to-do overlay" key. */
final class TodoHud {
	private TodoHud() { }

	static String clip(Font font, String s, int px) { return Ui.clip(font, s, px); }
	static int priorityColor(String p) { return p.equals("High") ? 0xFFFF9B8E : p.equals("Low") ? 0xFF8CC2FF : 0xFFF5D65A; }

	/** "Base · 230 m NE" for the tracked place, or "" if none. */
	static String trackLine() {
		String id = NbConfig.get().trackedPlace;
		if (id.isBlank()) return "";
		JsonObject o = Notebook.find("coords", id);
		boolean death = false;
		if (o == null) { o = Notebook.find("deaths", id); death = o != null; }
		if (o == null) return "";
		String name = death ? Deaths.label(o) : Notebook.str(o, "name").isBlank() ? "Place" : Notebook.str(o, "name");
		String b = Names.bearing(o);
		if (b != null) return name + " · " + b;
		String where = Names.where(o);
		return Names.here() == null || where.isEmpty() ? name : name + " · in " + where;   // e.g. "Base · in the Nether"

	}

	private static int goalsVersion = -1;
	private static List<String[]> goalCache = List.of();

	/** {item icon path, "Diamond Sword: Sharpness V, Mending"} for each of your items that is planned or still missing enchants (planned first). Cached until something changes. */
	static List<String[]> goalLines() {
		if (goalsVersion == Notebook.version) return goalCache;
		java.util.ArrayList<String[]> planned = new java.util.ArrayList<>(), other = new java.util.ArrayList<>();
		for (JsonObject it : Notebook.gear(Notebook.userId)) {
			Enchants.Result r = Enchants.analyseItem(it);
			boolean plan = Notebook.bool(it, "plan");
			java.util.ArrayList<String> want = new java.util.ArrayList<>();
			for (Enchants.Missing m : r.missing()) if (!m.alt()) want.add(PageGear.disp(m.name(), m.max()));
			for (Enchants.Missing m : r.goals()) want.add(PageGear.disp(m.name(), m.max()));
			if (!plan && want.isEmpty()) continue;   // finished items don't need listing
			String list = want.size() <= 3 ? String.join(", ", want) : String.join(", ", want.subList(0, 3)) + " +" + (want.size() - 3);
			(plan ? planned : other).add(new String[] {Enchants.itemPath(it), PageGear.itemName(it) + (want.isEmpty() ? "" : ": " + list)});
		}
		planned.addAll(other);
		goalCache = planned; goalsVersion = Notebook.version;
		return planned;
	}

	static void extract(GuiGraphicsExtractor g, DeltaTracker tick) {
		NbConfig c = NbConfig.get();
		Minecraft mc = Minecraft.getInstance();
		if (!c.hud || !Notebook.ok || mc.gui.hud.isHidden() || mc.gui.screen() instanceof NotebookScreen) return;
		List<JsonObject> rows = new java.util.ArrayList<>();
		JsonObject farm = Notebook.farmSection(false);
		if (farm != null) rows.add(farm);
		rows.addAll(Notebook.todoList(c.hudMineOnly, false));
		List<String[]> goals = c.hudGoals ? goalLines() : List.of();
		int gShown = Math.min(goals.size(), 4);
		if (rows.isEmpty() && goals.isEmpty()) return;
		Font font = mc.font;
		final int P = 16;   // line pitch: room for an item icon
		int w = 190, x = 8, y = 8, shown = Math.min(rows.size(), 6);
		int h = (shown > 0 ? 14 + shown * P + (rows.size() > shown ? 11 : 0) : 0) + (gShown > 0 ? 14 + gShown * P + (goals.size() > gShown ? 11 : 0) : 0);
		Ui.card(g, x - 5, y - 5, w + 10, h + 9, 0xFF5DA83A);
		int cy = y;
		if (shown > 0) {
			g.text(font, c.hudMineOnly ? "MY TO-DOS" : "TO-DOS", x + 2, cy, 0xFFF2C14E, false);
			for (int i = 0; i < shown; i++) {
				JsonObject o = rows.get(i);
				int ly = cy + 12 + i * P;
				Compat.drawItem(g, Notebook.str(o, "icon"), x + 2, ly);
				g.text(font, clip(font, Notebook.str(o, "project"), w - 26), x + 22, ly + 4, priorityColor(Notebook.str(o, "priority")), false);
			}
			if (rows.size() > shown) g.text(font, "+" + (rows.size() - shown) + " more", x + 2, cy + 12 + shown * P, 0xFF8F9BA4, false);
			cy += 14 + shown * P + (rows.size() > shown ? 11 : 0);
		}
		if (gShown > 0) {
			g.text(font, "ENCHANTS NEEDED", x + 2, cy, 0xFFC49BFF, false);
			for (int i = 0; i < gShown; i++) {
				int ly = cy + 12 + i * P;
				Compat.drawItem(g, goals.get(i)[0], x + 2, ly);
				g.text(font, clip(font, goals.get(i)[1], w - 26), x + 22, ly + 4, 0xFFE3D0FF, false);
			}
			if (goals.size() > gShown) g.text(font, "+" + (goals.size() - gShown) + " more", x + 2, cy + 12 + gShown * P, 0xFF8F9BA4, false);
		}
	}
}
