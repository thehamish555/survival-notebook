package dev.hamish.survivalnotebook;

import com.google.gson.JsonObject;
import net.minecraft.client.Camera;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.world.phys.Vec3;
import org.joml.Matrix4f;
import org.joml.Vector4f;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Your notebook's places shown in the world: a faint beam, the category icon and the distance, with the name when you look at it or get
 * close. Drawn on the HUD from the camera's own projection, so it lines up with the world without hooking the renderer. Places that a
 * synced minimap mod already draws are skipped, so nothing shows twice.
 */
final class Waypoints {
	private Waypoints() { }

	private record Mark(JsonObject place, double x, double y, double z, double dist, boolean tracked) { }
	private static final int MAX = 32;

	static void extract(GuiGraphicsExtractor g, DeltaTracker tick) {
		NbConfig c = NbConfig.get();
		Minecraft mc = Minecraft.getInstance();
		if (!c.waypoints || !Notebook.ok || mc.player == null || mc.level == null || mc.gui.hud.isHidden() || mc.gui.screen() instanceof NotebookScreen) return;
		Names.Spot here = Names.here();
		if (here == null) return;
		Camera cam = mc.gameRenderer.mainCamera();
		if (cam == null || !cam.isInitialized()) return;
		Vec3 eye = cam.position();

		List<Mark> marks = new ArrayList<>();
		for (JsonObject o : Notebook.rows("coords")) {
			String xyz = Notebook.str(o, here.dim());
			double[] p = Names.parse(xyz);
			if (p == null) continue;
			if (Notebook.bool(o, "mm") && Minimap.drawsInWorld(Notebook.str(o, "name"), here.dim(), xyz)) continue;   // the minimap already shows it
			double x = p[0] + 0.5, y = p[1], z = p[2] + 0.5;
			double d = Math.hypot(x - mc.player.getX(), z - mc.player.getZ());
			if (d < 2.5) continue;
			marks.add(new Mark(o, x, y, z, d, Notebook.str(o, "id").equals(c.trackedPlace)));
		}
		if (marks.isEmpty()) return;
		marks.sort(Comparator.comparingDouble(Mark::dist));
		if (marks.size() > MAX) marks = new ArrayList<>(marks.subList(0, MAX));
		marks.sort(Comparator.comparingDouble(Mark::dist).reversed());   // far ones first, so near ones draw on top

		Matrix4f m = cam.getViewRotationProjectionMatrix(new Matrix4f());
		int W = mc.getWindow().getGuiScaledWidth(), H = mc.getWindow().getGuiScaledHeight();
		Font font = mc.font;
		// Only one name at a time when you look around (the one nearest the crosshair), so labels never pile up
		Mark focus = null; double best = 56;
		for (Mark k : marks) {
			float[] at = project(m, eye, k.x(), k.y() + 1.2, k.z(), W, H);
			if (at == null) continue;
			double d = Math.hypot(at[0] - W / 2.0, at[1] - H / 2.0);
			if (d < best) { best = d; focus = k; }
		}
		for (Mark k : marks) {
			float[] base = project(m, eye, k.x(), k.y(), k.z(), W, H), top = project(m, eye, k.x(), k.y() + 48, k.z(), W, H);
			float[] at = project(m, eye, k.x(), k.y() + 1.2, k.z(), W, H);
			if (at == null) continue;
			String cat = Notebook.str(k.place(), "cat");
			int tone = Ui.cat(cat).fg() & 0xFFFFFF;
			float fade = (float) Math.max(0.45, 1 - k.dist() / 1500);
			if (base != null && top != null) beam(g, base, top, k.dist() < 200 ? 2 : 1, ((int) (0x58 * fade) << 24) | tone);

			int sx = Math.round(at[0]), sy = Math.round(at[1]);
			if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue;
			float scale = (float) Math.max(0.55, Math.min(0.85, 0.95 - k.dist() / 500));
			int edge = k.tracked() ? 0xFFFFBE66 : 0xFF000000 | tone;
			g.pose().pushMatrix();
			g.pose().translate(sx, sy);
			g.pose().scale(scale, scale);
			Ui.rounded(g, -11, -11, 22, 22, 0xC0141414, edge);
			Compat.drawItem(g, PagePlaces.CAT_ICON.getOrDefault(cat, "paper"), -8, -8);
			g.pose().popMatrix();

			String dist = Math.round(k.dist()) + " m";
			int ty = sy + Math.round(13 * scale);
			if (k == focus || k.dist() < 16) {
				String name = Notebook.str(k.place(), "name").isBlank() ? "Place" : Notebook.str(k.place(), "name");
				String label = Ui.clip(font, name, 150) + "  ·  " + dist;
				int lw = font.width(label) + 10;
				Ui.rounded(g, sx - lw / 2, ty, lw, 13, 0xC0141414, 0x80000000 | tone);
				g.text(font, label, sx - lw / 2 + 5, ty + 3, 0xFFFFFFFF, false);
			} else {
				g.text(font, dist, sx - font.width(dist) / 2, ty + 1, ((int) (0xFF * fade) << 24) | 0xE6E6E6, true);
			}
		}
	}

	/** World point to GUI pixels, or null when it's behind you. */
	private static float[] project(Matrix4f m, Vec3 eye, double x, double y, double z, int W, int H) {
		Vector4f v = m.transform(new Vector4f((float) (x - eye.x), (float) (y - eye.y), (float) (z - eye.z), 1f));
		if (v.w <= 0.05f) return null;
		return new float[] {(v.x / v.w + 1) / 2 * W, (1 - v.y / v.w) / 2 * H};
	}

	/** A soft line from the ground spot up into the sky, drawn as small steps so it works at any angle. */
	private static void beam(GuiGraphicsExtractor g, float[] a, float[] b, int w, int col) {
		float dx = b[0] - a[0], dy = b[1] - a[1];
		int steps = (int) Math.min(600, Math.max(Math.abs(dx), Math.abs(dy)) / 2) + 1;
		for (int i = 0; i < steps; i++) {
			float t = i / (float) steps;
			int x = Math.round(a[0] + dx * t), y = Math.round(a[1] + dy * t);
			int alpha = (int) (((col >>> 24) & 0xFF) * (1 - t * 0.85f));
			g.fill(x - w / 2, y, x - w / 2 + w, y + 2, (alpha << 24) | (col & 0xFFFFFF));
		}
	}
}
