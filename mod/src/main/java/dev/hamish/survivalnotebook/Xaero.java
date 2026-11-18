package dev.hamish.survivalnotebook;

import com.google.gson.JsonObject;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.level.Level;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;

/**
 * Talks to Xaero's Minimap while the game runs, by reflection (so there's no dependency and nothing breaks without it):
 * turns its waypoints in the world on or off, and shows the notebook's places on its minimap and world map as "third-party" waypoints.
 * Those aren't saved into your Xaero's waypoint files and go away by themselves, so the two never pile up copies of each other.
 * Xaero's can't show item icons, so each place gets its initials and the nearest Xaero's colour to its category.
 */
final class Xaero {
	private Xaero() { }

	static boolean present() {
		var fl = FabricLoader.getInstance();
		return fl.isModLoaded("xaerominimap") || fl.isModLoaded("xaerominimapfair");
	}

	private static Class<?> cls(String n) throws ClassNotFoundException { return Class.forName(n, false, Xaero.class.getClassLoader()); }
	private static Object staticField(String c, String f) throws ReflectiveOperationException { Field x = cls(c).getField(f); return x.get(null); }
	/** Calls the public method with this name whose parameters fit the arguments (so resolve(String) isn't mixed up with resolve(XaeroPath)). */
	private static Object call(Object o, String name, Object... args) throws ReflectiveOperationException {
		for (Method m : o.getClass().getMethods()) {
			if (!m.getName().equals(name) || m.getParameterCount() != args.length) continue;
			Class<?>[] t = m.getParameterTypes();
			boolean fits = true;
			for (int i = 0; i < t.length && fits; i++) fits = args[i] == null ? !t[i].isPrimitive() : box(t[i]).isInstance(args[i]);
			if (fits) return m.invoke(o, args);
		}
		throw new NoSuchMethodException(o.getClass().getName() + "." + name);
	}
	private static Class<?> box(Class<?> c) {
		if (!c.isPrimitive()) return c;
		return c == boolean.class ? Boolean.class : c == int.class ? Integer.class : c == long.class ? Long.class : c == double.class ? Double.class : c == float.class ? Float.class : c;
	}

	// ---- waypoints in the world (Xaero's "In-game waypoints" option)

	private static Object[] channelAndOption() throws ReflectiveOperationException {
		Object hud = staticField("xaero.common.HudMod", "INSTANCE");
		Object channel = call(hud, "getHudConfigs");
		Object option = staticField("xaero.hud.minimap.common.config.option.MinimapProfiledConfigOptions", "WAYPOINTS_IN_WORLD");
		return new Object[] {channel, option};
	}

	private static Boolean seen; private static long seenAt;
	/** Whether Xaero's draws its waypoints in the world, or null if that can't be read (another version, or not loaded yet). Checked at most once a second. */
	static Boolean inWorld() {
		if (!present()) return null;
		long now = System.currentTimeMillis();
		if (now - seenAt < 1000) return seen;
		seenAt = now;
		return seen = readInWorld();
	}
	private static Boolean readInWorld() {
		try {
			Object[] co = channelAndOption();
			Object v = call(call(co[0], "getClientConfigManager"), "getEffective", co[1]);
			return v instanceof Boolean b ? b : null;
		} catch (ReflectiveOperationException | RuntimeException | LinkageError e) { return null; }
	}

	/** Turns Xaero's waypoints in the world on or off and saves its settings. Its minimap keeps showing them either way. */
	static boolean setInWorld(boolean on) {
		if (!present()) return false;
		try {
			Object[] co = channelAndOption();
			Object profile = call(call(co[0], "getClientConfigManager"), "getCurrentProfile");
			call(profile, "set", co[1], on);
			call(call(co[0], "getClientConfigProfileIO"), "save", profile);
			seen = on; seenAt = System.currentTimeMillis();
			return true;
		} catch (ReflectiveOperationException | RuntimeException | LinkageError e) { return false; }
	}

	// ---- the notebook's places on Xaero's minimap and world map

	private static final Identifier ORIGIN = Identifier.fromNamespaceAndPath(SurvivalNotebookClient.ID, "places");
	private static String pushed = "";
	private static Object pushedRoot;
	// Minecraft's 16 chat colours, the ones Xaero's waypoints use, by index
	private static final int[] COLOURS = {0x000000, 0x0000AA, 0x00AA00, 0x00AAAA, 0xAA0000, 0xAA00AA, 0xFFAA00, 0xAAAAAA, 0x555555, 0x5555FF, 0x55FF55, 0x55FFFF, 0xFF5555, 0xFF55FF, 0xFFFF55, 0xFFFFFF};

	private static int nearest(int rgb) {
		int best = 0; long bestD = Long.MAX_VALUE;
		for (int i = 1; i < COLOURS.length; i++) {   // never black: it can't be seen on the map
			int c = COLOURS[i];
			long dr = ((rgb >> 16) & 255) - ((c >> 16) & 255), dg = ((rgb >> 8) & 255) - ((c >> 8) & 255), db = (rgb & 255) - (c & 255);
			long d = dr * dr * 3 + dg * dg * 4 + db * db * 2;
			if (d < bestD) { bestD = d; best = i; }
		}
		return best;
	}

	private static String initials(String name) {
		StringBuilder b = new StringBuilder();
		for (String w : name.trim().split("\\s+")) if (!w.isEmpty() && b.length() < 2) b.appendCodePoint(Character.toUpperCase(w.codePointAt(0)));
		return b.isEmpty() ? "P" : b.toString();
	}

	/**
	 * Called every few seconds. Puts your places into Xaero's, one dimension at a time, only when something changed. Places that came
	 * from Xaero's in the first place (synced from its waypoints) are left out, since Xaero's already has them.
	 */
	static void tick() {
		if (!present()) return;
		Minecraft mc = Minecraft.getInstance();
		if (mc.level == null) { pushed = ""; pushedRoot = null; return; }
		boolean on = NbConfig.get().xaeroPlaces && Notebook.ok;
		List<JsonObject> rows = on ? Notebook.rows("coords") : List.of();
		StringBuilder sig = new StringBuilder();
		for (JsonObject o : rows) sig.append(Notebook.str(o, "id")).append(Notebook.str(o, "name")).append(Notebook.str(o, "cat")).append(Notebook.str(o, "ow")).append('|').append(Notebook.str(o, "nether")).append('|').append(Notebook.str(o, "end")).append(Notebook.bool(o, "mm")).append(';');
		try {
			Object session = call(staticField("xaero.hud.minimap.BuiltInHudModules", "MINIMAP"), "getCurrentSession");
			if (session == null) return;
			Object root = call(call(session, "getWorldManager"), "getAutoRootContainer");
			if (root == null) return;
			String s = sig.toString();
			if (s.equals(pushed) && root == pushedRoot) return;
			Object dims = call(session, "getDimensionHelper");
			Class<?> wpClass = cls("xaero.common.minimap.waypoints.Waypoint"), colourClass = cls("xaero.hud.minimap.waypoint.WaypointColor"), purposeClass = cls("xaero.hud.minimap.waypoint.WaypointPurpose");
			Object normal = purposeClass.getField("NORMAL").get(null);
			var make = wpClass.getConstructor(int.class, int.class, int.class, String.class, String.class, colourClass, purposeClass);
			Method colour = colourClass.getMethod("fromIndex", int.class);
			String[][] DIMS = {{"ow", "overworld"}, {"nether", "the_nether"}, {"end", "the_end"}};
			for (String[] d : DIMS) {
				ResourceKey<Level> key = d[0].equals("ow") ? Level.OVERWORLD : d[0].equals("nether") ? Level.NETHER : Level.END;
				Object container = call(root, "addSubContainer", call(call(root, "getPath"), "resolve", call(dims, "getDimensionDirectoryName", key)));
				Object mine = call(call(container, "getThirdPartyWaypointManager"), "get", ORIGIN);
				call(mine, "clear");
				for (JsonObject o : rows) {
					if (Notebook.bool(o, "mm")) continue;
					double[] p = Names.parse(Notebook.str(o, d[0]));
					if (p == null) continue;
					String name = Notebook.str(o, "name").isBlank() ? "Place" : Notebook.str(o, "name");
					Object wp = make.newInstance((int) Math.floor(p[0]), (int) Math.floor(p[1]), (int) Math.floor(p[2]), name, initials(name), colour.invoke(null, nearest(Ui.cat(Notebook.str(o, "cat")).fg() & 0xFFFFFF)), normal);
					call(mine, "add", Notebook.str(o, "id") + ":" + d[0], wp);
				}
			}
			pushed = s; pushedRoot = root;
		} catch (ReflectiveOperationException | RuntimeException | LinkageError e) {
			pushed = sig.toString(); pushedRoot = null;   // this Xaero's version works differently: don't keep retrying every few seconds
		}
	}

	/** The ways to show waypoints in the world when Xaero's is installed. */
	static final List<String> MODES = new ArrayList<>(List.of("Ours", "Xaero's", "Off"));
}
