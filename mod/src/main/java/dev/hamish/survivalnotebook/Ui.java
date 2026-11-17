package dev.hamish.survivalnotebook;

import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;

/** Colours (dark and light, matching the website) and small drawing helpers for the in-game screens. */
final class Ui {
	private Ui() { }

	interface Painter { void paint(GuiGraphicsExtractor g, int mx, int my); }
	record Tone(int bg, int fg, int edge) { }

	static final class Pal {
		int panel, panel2, edge, hi, lo, ink, mut, row, rowAlt, hover, grass, grassHi, gold;
		Tone gray, green, yellow, red, blue, purple, amber, teal, primary, secondary, danger;
	}

	private static final Pal DARK = new Pal(), LIGHT = new Pal();
	static {
		Pal d = DARK;
		d.panel = 0xFF1C1F24; d.panel2 = 0xFF15171B; d.edge = 0xFF0B0C0E; d.hi = 0xFF3A3F48; d.lo = 0xFF121417; d.ink = 0xFFE9E6DC; d.mut = 0xFF9A9889;
		d.row = 0xFF23272D; d.rowAlt = 0xFF1F2227; d.hover = 0xFF2F353D; d.grass = 0xFF5DA83A; d.grassHi = 0xFF86D05A; d.gold = 0xFFF2C14E;
		d.gray = new Tone(0xFF2F333A, 0xFFB3B0A3, 0xFF454A53); d.green = new Tone(0xFF24421D, 0xFFA4E47A, 0xFF3F7A2E); d.yellow = new Tone(0xFF4A3F14, 0xFFF5D65A, 0xFF7D6A22);
		d.red = new Tone(0xFF4A1F1B, 0xFFFF9B8E, 0xFF86382F); d.blue = new Tone(0xFF1A3556, 0xFF8CC2FF, 0xFF2E5A94); d.purple = new Tone(0xFF3A2559, 0xFFCFA8FF, 0xFF63409A);
		d.amber = new Tone(0xFF4D3318, 0xFFFFBE66, 0xFF8A5B25); d.teal = new Tone(0xFF14393A, 0xFF6FE0D6, 0xFF25726F);
		d.primary = new Tone(0xFF5DA83A, 0xFF10200A, 0xFF1D3A12); d.secondary = new Tone(0xFF3B4048, 0xFFE9E6DC, 0xFF0B0C0E); d.danger = new Tone(0xFFB83B30, 0xFFFFFFFF, 0xFF4A1410);

		Pal l = LIGHT;
		l.panel = 0xFFF3F5F0; l.panel2 = 0xFFE2E6DC; l.edge = 0xFF8F968A; l.hi = 0xFFFFFFFF; l.lo = 0xFFC3C9BB; l.ink = 0xFF1B201C; l.mut = 0xFF454D45;
		l.row = 0xFFEAEDE5; l.rowAlt = 0xFFE0E4DA; l.hover = 0xFFCDD4C3; l.grass = 0xFF5DA83A; l.grassHi = 0xFF86D05A; l.gold = 0xFF9A6B00;
		l.gray = new Tone(0xFFE3E5E0, 0xFF4A514A, 0xFFB2B8AD); l.green = new Tone(0xFFD8EFCF, 0xFF1F5A10, 0xFF86C06F); l.yellow = new Tone(0xFFF6EDC0, 0xFF6B5A05, 0xFFD9C25A);
		l.red = new Tone(0xFFF6D6D1, 0xFF8A2418, 0xFFE0988F); l.blue = new Tone(0xFFD5E6FB, 0xFF1D4F8A, 0xFF8FB7E6); l.purple = new Tone(0xFFE6DBF7, 0xFF52308A, 0xFFB79BE0);
		l.amber = new Tone(0xFFF7E1C6, 0xFF7A4A10, 0xFFE0B074); l.teal = new Tone(0xFFD0EEEC, 0xFF116663, 0xFF7CC9C4);
		l.primary = new Tone(0xFF5DA83A, 0xFF10200A, 0xFF1D3A12); l.secondary = new Tone(0xFFDFE3D8, 0xFF1F2421, 0xFF8F968A); l.danger = new Tone(0xFFB83B30, 0xFFFFFFFF, 0xFF4A1410);
	}

	static Pal pal() { return NbConfig.get().lightTheme ? LIGHT : DARK; }

	static Tone priority(String p) { Pal c = pal(); return p.equals("High") ? c.red : p.equals("Low") ? c.blue : c.yellow; }
	static Tone progress(String p) { Pal c = pal(); return p.equals("Done") ? c.green : p.equals("In Progress") ? c.blue : c.gray; }
	static Tone role(String r) { Pal c = pal(); return r.equals("owner") ? c.green : r.equals("editor") ? c.blue : c.gray; }
	static Tone cat(String k) {
		Pal c = pal();
		return switch (k) { case "Important" -> c.red; case "Farms" -> c.green; case "Biomes" -> c.teal; case "Structures" -> c.amber; default -> c.gray; };
	}

	static int mix(int a, int b, float t) {
		int r = (int) (((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t), g = (int) (((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t), bl = (int) ((a & 255) * (1 - t) + (b & 255) * t);
		return 0xFF000000 | (r << 16) | (g << 8) | bl;
	}

	static boolean over(int mx, int my, int x, int y, int w, int h) { return mx >= x && mx < x + w && my >= y && my < y + h; }

	static int lighten(int argb) {
		int r = Math.min(255, ((argb >> 16) & 255) + 24), g = Math.min(255, ((argb >> 8) & 255) + 24), b = Math.min(255, (argb & 255) + 24);
		return 0xFF000000 | (r << 16) | (g << 8) | b;
	}

	/** A filled box with a 1px border and the four corner pixels cut off, so it reads as slightly rounded. */
	static void rounded(GuiGraphicsExtractor g, int x, int y, int w, int h, int fill, int edge) {
		g.fill(x + 1, y + 1, x + w - 1, y + h - 1, fill);
		g.fill(x + 1, y, x + w - 1, y + 1, edge); g.fill(x + 1, y + h - 1, x + w - 1, y + h, edge);
		g.fill(x, y + 1, x + 1, y + h - 1, edge); g.fill(x + w - 1, y + 1, x + w, y + h - 1, edge);
	}

	static void bevel(GuiGraphicsExtractor g, int x, int y, int w, int h, int fill, int hi, int lo, int edge) {
		// flat panel with softly rounded corners, a light line on top and a shadow line underneath
		rounded(g, x, y, w, h, fill, edge);
		g.fill(x + 2, y + 1, x + w - 2, y + 2, hi);
		g.fill(x + 2, y + h - 2, x + w - 2, y + h - 1, lo);
	}

	/** Translucent overlay card (for the in-world HUD): soft shadow, rounded body, coloured top accent. */
	static void card(GuiGraphicsExtractor g, int x, int y, int w, int h, int accent) {
		g.fill(x - 1, y - 1, x + w + 1, y + h + 2, 0x33000000);
		rounded(g, x, y, w, h, 0xCC101318, 0xCC000000);
		g.fill(x + 1, y + 1, x + w - 1, y + 2, accent);
	}

	/** A flat coloured tag with centred text. */
	static void tag(GuiGraphicsExtractor g, Font f, int x, int y, int w, int h, String label, Tone t, boolean hover) {
		rounded(g, x, y, w, h, hover ? lighten(t.bg()) : t.bg(), t.edge());
		g.text(f, clip(f, label, w - 6), x + (w - Math.min(f.width(label), w - 6)) / 2, y + (h - 8) / 2 + 1, t.fg(), false);
	}

	static String clip(Font f, String s, int px) {
		if (f.width(s) <= px) return s;
		while (s.length() > 1 && f.width(s + "…") > px) s = s.substring(0, s.length() - 1);
		return s + "…";
	}

	static String ago(long ts) {
		long s = Math.max(0, (System.currentTimeMillis() - ts) / 1000);
		if (s < 45) return "just now";
		long m = Math.round(s / 60.0); if (m < 60) return m + " min ago";
		long h = Math.round(m / 60.0); if (h < 24) return h + " h ago";
		return Math.round(h / 24.0) + " d ago";
	}
}
