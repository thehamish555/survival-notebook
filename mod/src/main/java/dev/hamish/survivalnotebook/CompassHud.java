package dev.hamish.survivalnotebook;

import com.google.gson.JsonObject;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;

/**
 * A heading strip at the top of the screen (N, NE, E… scrolling as you turn) with a marker for the place or death spot you're tracking, and
 * its name and distance underneath. Only points when the place has coordinates in the dimension you're in.
 */
final class CompassHud {
	private CompassHud() { }

	static void extract(GuiGraphicsExtractor g, DeltaTracker tick) {
		NbConfig c = NbConfig.get();
		Minecraft mc = Minecraft.getInstance();
		if (!c.compass || !Notebook.ok || c.trackedPlace.isBlank() || mc.player == null || mc.gui.hud.isHidden() || mc.gui.screen() instanceof NotebookScreen) return;
		JsonObject o = Notebook.find("coords", c.trackedPlace);
		boolean death = false;
		if (o == null) { o = Notebook.find("deaths", c.trackedPlace); death = o != null; }
		if (o == null) return;
		Font font = mc.font;
		final String name = death ? Deaths.label(o) : Notebook.str(o, "name").isBlank() ? "Place" : Notebook.str(o, "name");
		final int cx = mc.getWindow().getGuiScaledWidth() / 2, w = 200, x = cx - w / 2, y = 12;
		Names.Spot here = Names.here();
		String exact = here == null ? "" : Notebook.str(o, here.dim());
		if (!Names.isXyz(exact)) {   // nothing to point at in this dimension: say so instead of guessing a direction
			String where = Names.where(o);
			String msg = Ui.clip(font, where.isEmpty() ? name : name + " · in " + where, w + 40);
			int lw = font.width(msg) + 14;
			Ui.card(g, cx - lw / 2, y, lw, 16, 0xFF8F9BA4);
			g.text(font, msg, cx - lw / 2 + 7, y + 4, 0xFFB9C0C6, false);
			return;
		}
		Double dist = Names.distance(exact), turn = Names.turnTo(exact);
		if (dist == null || turn == null) return;
		boolean near = dist < 3;
		int accent = near ? 0xFF5DA83A : death ? 0xFFFF9B8E : 0xFFFFBE66;

		Ui.card(g, x, y, w, 24, accent);
		double bearing = ((mc.player.getYRot() + 180) % 360 + 360) % 360;   // 0 = north, 90 = east
		int half = w / 2 - 8;
		for (int deg = 0; deg < 360; deg += 15) {   // the scale: a tick every 15°, a letter every 45°
			double d = ((deg - bearing + 540) % 360) - 180;
			if (Math.abs(d) > 90) continue;
			int tx = cx + (int) Math.round(d / 90.0 * half);
			boolean letter = deg % 45 == 0;
			int fade = Math.max(0x40, (int) (0xFF * (1 - Math.abs(d) / 110.0)) & 0xFF);
			int col = (fade << 24) | 0xFFFFFF;
			if (letter) {
				String l = switch (deg) { case 0 -> "N"; case 45 -> "NE"; case 90 -> "E"; case 135 -> "SE"; case 180 -> "S"; case 225 -> "SW"; case 270 -> "W"; default -> "NW"; };
				g.text(font, l, tx - font.width(l) / 2, y + 5, deg == 0 ? ((fade << 24) | 0xFF6B5E) : col, false);
			} else g.fill(tx, y + 8, tx + 1, y + 11, (Math.max(0x30, fade / 2) << 24) | 0xFFFFFF);
		}
		g.fill(cx - 1, y + 17, cx + 1, y + 20, 0xFFFFFFFF);                                     // you're facing this way
		double t = Math.max(-1, Math.min(1, turn / 90.0));
		int mx = cx + (int) Math.round(t * half);
		if (Math.abs(turn) > 90) g.text(font, turn > 0 ? "\u203A" : "\u2039", turn > 0 ? x + w - 8 : x + 3, y + 12, accent, false);   // behind you: just the arrow
		else for (int i = 0; i < 3; i++) g.fill(mx - 2 + i, y + 14 + i, mx + 3 - i, y + 15 + i, accent);   // pointer to the target

		String label = name + "  \u00B7  " + (near ? "here" : Math.round(dist) + " m");
		label = Ui.clip(font, label, w + 40);
		int lw = font.width(label) + 14;
		Ui.card(g, cx - lw / 2, y + 28, lw, 14, accent);
		g.text(font, label, cx - lw / 2 + 7, y + 31, 0xFFFFFFFF, false);
	}
}
