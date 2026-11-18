package dev.hamish.survivalnotebook;

import com.google.gson.JsonObject;
import net.minecraft.client.Minecraft;

import java.util.Set;

/** Turns Minecraft ids into the names and groups the website uses. */
final class Names {
	private Names() { }

	record Spot(String dim, String xyz) { }

	/** "ResourceKey[minecraft:enchantment / minecraft:sharpness]" or "minecraft:diamond_pickaxe" -> the path part. Independent of class names. */
	static String pathOf(String s) {
		int slash = s.lastIndexOf('/');
		String t = (slash >= 0 ? s.substring(slash + 1) : s).replaceAll("[\\]\\s]", "");
		int colon = t.indexOf(':');
		return colon >= 0 ? t.substring(colon + 1) : t;
	}

	private static final Set<String> SMALL = Set.of("of", "the");

	/** Same names the website uses (from the shared rules); unknown/modded enchants get a tidy title-cased fallback. */
	static String enchant(String path) {
		Enchants.Def d = Enchants.ENCH.get(path);
		return d != null ? d.name() : titleCase(path);
	}

	static String titleCase(String path) {
		if (path.equals("binding_curse")) return "Curse of Binding";
		if (path.equals("vanishing_curse")) return "Curse of Vanishing";
		StringBuilder sb = new StringBuilder();
		for (String w : path.split("_")) {
			if (w.isEmpty()) continue;
			if (sb.length() > 0) sb.append(' ');
			sb.append(SMALL.contains(w) && sb.length() > 0 ? w : Character.toUpperCase(w.charAt(0)) + w.substring(1));
		}
		return sb.toString();
	}

	/** netherite_pickaxe -> Netherite Pickaxe; potion_fire_resistance -> Potion of Fire Resistance, tipped_arrow_poison -> Arrow of Poison (like the website) */
	static String pretty(String path) {
		java.util.regex.Matcher m = java.util.regex.Pattern.compile("^(potion|splash_potion|lingering_potion|tipped_arrow)_(.+)$").matcher(path == null ? "" : path);
		if (m.matches()) return (m.group(1).equals("tipped_arrow") ? "Arrow" : pretty(m.group(1))) + " of " + pretty(m.group(2));
		StringBuilder sb = new StringBuilder();
		for (String w : path.split("_")) if (!w.isEmpty()) sb.append(sb.length() > 0 ? " " : "").append(Character.toUpperCase(w.charAt(0))).append(w.substring(1));
		return sb.toString();
	}

	static boolean isXyz(String s) { return s != null && s.trim().matches("-?\\d+\\s+-?\\d+\\s+-?\\d+"); }

	/** "x y z" scaled for Overworld <-> Nether (÷8 / ×8); y is unchanged. */
	static String convert(String xyz, double factor) {
		String[] a = xyz.trim().split("\\s+");
		return (int) Math.floor(Double.parseDouble(a[0]) * factor) + " " + a[1] + " " + (int) Math.floor(Double.parseDouble(a[2]) * factor);
	}

	/** A position pasted from the game. dim is "ow", "nether" or "end", or null when the text doesn't say (plain /tp or x y z). */
	record Pasted(String xyz, String dim) { }

	private static final String NUM = "(-?\\d+(?:\\.\\d+)?)";
	private static final java.util.regex.Pattern EXEC = java.util.regex.Pattern.compile("^execute in (\\S+) run (.*)$", java.util.regex.Pattern.CASE_INSENSITIVE);
	private static final java.util.regex.Pattern TP = java.util.regex.Pattern.compile("^(?:tp|teleport) (?:(?:@[spaer](?:\\[[^\\]]*\\])?|(?!-?\\d)[\\w.-]{1,16}) )?(.*)$", java.util.regex.Pattern.CASE_INSENSITIVE);
	private static final java.util.regex.Pattern XYZ = java.util.regex.Pattern.compile("^" + NUM + "[\\s,]+" + NUM + "[\\s,]+" + NUM + "(?:\\s+-?\\d+(?:\\.\\d+)?){0,2}$");

	/**
	 * Reads F3+C ("/execute in minecraft:the_nether run tp @s 1.5 70.0 -3.2 0 0"), "/tp x y z" or "x y z". Decimals round down to the block.
	 * Null if it isn't a position. Throws for a dimension the notebook has no column for. Never converts between dimensions.
	 */
	static Pasted parsePaste(String text) {
		String s = (text == null ? "" : text).trim().replaceFirst("^/", "").replaceAll("\\s+", " ");
		String dim = null;
		java.util.regex.Matcher ex = EXEC.matcher(s);
		boolean exec = ex.matches();
		if (exec) {
			String id = ex.group(1).toLowerCase();
			dim = switch (id) { case "minecraft:overworld", "overworld" -> "ow"; case "minecraft:the_nether", "the_nether" -> "nether"; case "minecraft:the_end", "the_end" -> "end"; default -> null; };
			if (dim == null) throw new IllegalArgumentException("The notebook has no column for " + ex.group(1));
			s = ex.group(2);
		}
		java.util.regex.Matcher tp = TP.matcher(s);
		if (tp.matches()) s = tp.group(1);
		else if (exec) return null;
		java.util.regex.Matcher m = XYZ.matcher(s);
		if (!m.matches()) return null;
		return new Pasted((long) Math.floor(Double.parseDouble(m.group(1))) + " " + (long) Math.floor(Double.parseDouble(m.group(2))) + " " + (long) Math.floor(Double.parseDouble(m.group(3))), dim);
	}

	/** Text that came from the game rather than typed "x y z". */
	static boolean looksPasted(String t) { String s = t == null ? "" : t.trim(); return s.matches("(?i)^/?(execute|tp|teleport)\\b.*") || s.matches(".*\\d\\.\\d.*") || s.contains(","); }

	private static final java.util.regex.Pattern YT = java.util.regex.Pattern.compile("^(?:https?://)?(?:www\\.|m\\.)?(?:youtube\\.com/(?:watch\\?(?:.*&)?v=|shorts/|embed/|live/)|youtu\\.be/)([\\w-]{11})");
	/** The 11-character video id of a YouTube link, or null if it isn't one. */
	static String ytId(String url) {
		java.util.regex.Matcher m = YT.matcher(url == null ? "" : url.trim());
		return m.find() ? m.group(1) : null;
	}

	static String newId() { return java.util.UUID.randomUUID().toString().substring(0, 8); }

	/** Item id path -> one of the website's gear groups. */
	static String group(String p) {
		if (p.endsWith("_helmet") || p.endsWith("_chestplate") || p.endsWith("_leggings") || p.endsWith("_boots")) return "Armor";
		if (p.endsWith("_spear")) return "Spear";
		if (p.endsWith("_sword") || p.equals("mace")) return "Weapons";
		if (p.equals("trident")) return "Trident";
		if (p.equals("bow") || p.equals("crossbow")) return "Bow & Crossbow";
		if (p.equals("fishing_rod")) return "Fishing Rod";
		if (p.endsWith("_pickaxe") || p.endsWith("_axe") || p.endsWith("_shovel") || p.endsWith("_hoe") || p.equals("shears") || p.equals("flint_and_steel")) return "Tools";
		return "All Purpose";
	}

	static double[] parse(String s) {
		String[] a = s == null ? new String[0] : s.trim().split("\\s+");
		if (a.length != 3) return null;
		try { return new double[] {Double.parseDouble(a[0]), Double.parseDouble(a[1]), Double.parseDouble(a[2])}; } catch (NumberFormatException e) { return null; }
	}

	/** Horizontal distance in blocks from the player to "x y z" (same dimension assumed), or null. */
	static Double distance(String xyz) {
		Minecraft mc = Minecraft.getInstance();
		double[] p = parse(xyz);
		if (mc.player == null || p == null) return null;
		return Math.hypot(p[0] + 0.5 - mc.player.getX(), p[2] + 0.5 - mc.player.getZ());
	}

	/** N, NE, E… from the player to "x y z". North is -Z, east is +X. */
	static String compass(String xyz) {
		Minecraft mc = Minecraft.getInstance();
		double[] p = parse(xyz);
		if (mc.player == null || p == null) return "";
		double deg = Math.toDegrees(Math.atan2(p[0] + 0.5 - mc.player.getX(), -(p[2] + 0.5 - mc.player.getZ())));
		return new String[] {"N", "NE", "E", "SE", "S", "SW", "W", "NW"}[(int) Math.round(((deg % 360) + 360) % 360 / 45) % 8];
	}

	/** Degrees the player has to turn right (negative: left) to face "x y z", in -180..180. Null if unknown. */
	static Double turnTo(String xyz) {
		Minecraft mc = Minecraft.getInstance();
		double[] p = parse(xyz);
		if (mc.player == null || p == null) return null;
		double want = Math.toDegrees(Math.atan2(-(p[0] + 0.5 - mc.player.getX()), p[2] + 0.5 - mc.player.getZ()));   // Minecraft yaw: 0 = south, 90 = west
		double d = (want - mc.player.getYRot()) % 360;
		return d > 180 ? d - 360 : d < -180 ? d + 360 : d;
	}

	record Rel(String xyz, boolean approx) { }

	/** Where a place is relative to you: only if it has coordinates saved for the dimension you're in. Nothing is ever converted or guessed. */
	static Rel relTo(JsonObject o) {
		Spot h = here();
		if (h == null) return null;
		String v = Notebook.str(o, h.dim());
		if (isXyz(v)) return new Rel(v, false);
		return null;
	}

	static String dimName(String key) { return key.equals("nether") ? "the Nether" : key.equals("end") ? "the End" : "the Overworld"; }

	/** "the Nether" / "the Overworld or the End": the dimensions this place has coordinates in. */
	static String where(JsonObject o) {
		java.util.List<String> l = new java.util.ArrayList<>();
		for (String k : new String[] {"ow", "nether", "end"}) if (isXyz(Notebook.str(o, k))) l.add(dimName(k));
		return String.join(" or ", l);
	}

	/** "230 m NE" or "here". Null if the place has no coordinates in your current dimension. */
	static String bearing(JsonObject o) {
		Rel r = relTo(o);
		if (r == null) return null;
		Double d = distance(r.xyz());
		if (d == null) return null;
		return d < 3 ? "here" : (r.approx() ? "~" : "") + Math.round(d) + " m " + compass(r.xyz());
	}

	/** The player's current block position and which website column it belongs in. Null if unknown. */
	static Spot here() {
		Minecraft mc = Minecraft.getInstance();
		if (mc.player == null || mc.level == null) return null;
		String d = mc.level.dimension().toString();
		String dim = d.contains("the_nether") ? "nether" : d.contains("the_end") ? "end" : d.contains("overworld") ? "ow" : null;
		if (dim == null) return null;
		return new Spot(dim, (int) Math.floor(mc.player.getX()) + " " + (int) Math.floor(mc.player.getY()) + " " + (int) Math.floor(mc.player.getZ()));
	}
}
